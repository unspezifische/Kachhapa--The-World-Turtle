"""Campaign-authorized filesystem media. NPC identity stays in the existing NPC table."""
import hashlib
import io
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from uuid import uuid4
from flask import request, jsonify, send_file
from flask_jwt_extended import jwt_required
from PIL import Image, ImageOps, ImageDraw, UnidentifiedImageError


class MediaStore:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key):
        if not key or Path(key).name != key or key in ('.', '..'):
            raise ValueError('Invalid storage key')
        return self.root / key

    def delete(self, key):
        self.path(key).unlink(missing_ok=True)


def process_image(data, crop=None):
    with Image.open(io.BytesIO(data)) as original:
        if original.format not in ('PNG', 'JPEG', 'WEBP') or original.width * original.height > 40_000_000:
            raise ValueError('Choose a PNG, JPEG, or WebP image under 40 megapixels')
        original.load()
        image = ImageOps.exif_transpose(original).convert('RGBA')
    if crop is not None and not isinstance(crop, dict):
        raise ValueError('Crop must be an object')
    if crop:
        zoom = float(crop.get('zoom', 1))
        x, y = float(crop.get('x', .5)), float(crop.get('y', .5))
        if not all(math.isfinite(v) for v in (zoom, x, y)) or not 1 <= zoom <= 8 or not 0 <= x <= 1 or not 0 <= y <= 1:
            raise ValueError('Invalid crop coordinates')
        side = min(image.size) / zoom
        left, top = (image.width - side) * x, (image.height - side) * y
        image = image.crop((left, top, left + side, top + side))
        image = image.resize((512, 512), Image.Resampling.LANCZOS)
        if crop.get('shape') == 'circle':
            mask = Image.new('L', image.size)
            ImageDraw.Draw(mask).ellipse((0, 0, 511, 511), fill=255)
            image.putalpha(mask)
        if crop.get('border'):
            color = crop['border']
            if not isinstance(color, str) or len(color) != 7 or color[0] != '#' or any(c not in '0123456789abcdefABCDEF' for c in color[1:]):
                raise ValueError('Invalid border color')
            draw = ImageDraw.Draw(image)
            (draw.ellipse if crop.get('shape') == 'circle' else draw.rectangle)((4, 4, 507, 507), outline=color, width=8)
    result = {}
    for size in (64, 128, 256, 512):
        variant = image.copy()
        variant.thumbnail((size, size), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        variant.save(output, 'WEBP', quality=88)
        result[str(size)] = output.getvalue()
    return image.size, result


def register_npc_media(app, db, ns):
    Asset, NPC = ns['NpcMediaAsset'], ns['NPC']
    context = ns['catalog_campaign_context']
    root = os.environ.get('NPC_MEDIA_ROOT', str(Path(app.root_path) / 'private-media' / 'npc'))
    app.config.setdefault('NPC_MEDIA_ROOT', root)
    app.config.setdefault('NPC_MEDIA_MAX_BYTES', 32 * 1024 * 1024)
    app.config.setdefault('NPC_AUDIO_MAX_SECONDS', 300)

    def store():
        return MediaStore(app.config['NPC_MEDIA_ROOT'])

    def metadata(asset):
        result = {key: getattr(asset, key) for key in ('id', 'media_type', 'original_filename', 'mime_type', 'file_size', 'sha256', 'width', 'height', 'duration_ms', 'status')} | {'url': f'/api/npc-media/assets/{asset.id}/content'}
        key = (asset.variants or {}).get('512') if asset.media_type == 'image' else asset.storage_key
        if not key or not store().path(key).is_file(): result['status'] = 'missing'
        return result

    def allowed(asset, campaign):
        return asset and (asset.campaign_id == campaign.id or (asset.campaign_id is None and asset.module_key in ns['installed_module_keys'](campaign.id)))

    # Avoid adding a relationship/backref to the legacy NPC identity model.
    def resolve(npc, campaign):
        defaults = ((npc.origin_snapshot or {}).get('profile_metadata') or {}).get('npc_media', {})
        overrides = (npc.profile_metadata or {}).get('npc_media', {})
        result = {'overrides': overrides, 'defaults': defaults}
        for kind in ('portrait', 'token'):
            asset_id = overrides.get(kind) or defaults.get(kind)
            if kind == 'token' and not asset_id:
                asset_id = overrides.get('portrait') or defaults.get('portrait')
            asset = db.session.get(Asset, asset_id) if asset_id else None
            result[kind] = metadata(asset) if allowed(asset, campaign) else None
            if kind == 'token' and result[kind] and not (overrides.get('token') or defaults.get('token')):
                result[kind]['url'] += '?framing=token'
        return result

    app.npc_media_resolve = resolve
    app.npc_media_metadata = metadata
    app.npc_media_allowed = allowed

    @app.route('/api/npc-media/assets', methods=['POST'])
    @jwt_required()
    def upload_npc_media():
        campaign, _, error = context(require_editor=True)
        if error: return error
        maximum = app.config['NPC_MEDIA_MAX_BYTES']
        if request.content_length and request.content_length > maximum + 1024 * 1024:
            return jsonify(message='Media exceeds the upload limit'), 413
        uploaded = request.files.get('file')
        if not uploaded or not uploaded.filename:
            return jsonify(message='Choose an image or audio file'), 400
        data = uploaded.stream.read(maximum + 1)
        if not data or len(data) > maximum:
            return jsonify(message='Media is empty or exceeds the upload limit'), 413
        extension = Path(uploaded.filename).suffix.lower()
        asset_id = str(uuid4())
        written = []
        storage = store()
        try:
            variants, width, height, duration = {}, None, None, None
            if extension in ('.png', '.jpg', '.jpeg', '.webp'):
                (width, height), processed = process_image(data)
                _, token_processed = process_image(data, {'shape': 'square'})
                processed.update({'token-' + size: content for size, content in token_processed.items()})
                for size, content in processed.items():
                    key = f'{asset_id}-{size}.webp'
                    storage.path(key).write_bytes(content); written.append(key); variants[size] = key
                media_type, mime, key = 'image', 'image/webp', f'{asset_id}.original'
                storage.path(key).write_bytes(data); written.append(key)
            elif extension in ('.mp3', '.wav', '.m4a', '.aac'):
                ffmpeg, ffprobe = shutil.which('ffmpeg'), shutil.which('ffprobe')
                if not ffmpeg or not ffprobe:
                    return jsonify(message='FFmpeg and ffprobe are required for voice uploads'), 503
                with tempfile.TemporaryDirectory() as temp:
                    source = Path(temp) / ('source' + extension)
                    source.write_bytes(data)
                    probe = subprocess.run([ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(source)], capture_output=True, timeout=20, check=True)
                    seconds = float(probe.stdout)
                    if not math.isfinite(seconds) or not 0 < seconds <= app.config['NPC_AUDIO_MAX_SECONDS']:
                        raise ValueError('Audio exceeds the configured duration limit')
                    key = f'{asset_id}.mp3'
                    written.append(key)
                    subprocess.run([ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(source), '-vn', '-codec:a', 'libmp3lame', '-b:a', '192k', '-threads', '1', str(storage.path(key))], capture_output=True, timeout=90, check=True)
                duration = round(seconds * 1000)
                media_type, mime = 'audio', 'audio/mpeg'
            else:
                raise ValueError('Choose PNG, JPEG, WebP, MP3, WAV, M4A, or AAC')
            asset = Asset(id=asset_id, campaign_id=campaign.id, media_type=media_type, storage_key=key,
                          original_filename=Path(uploaded.filename).name[:255], mime_type=mime, file_size=len(data),
                          sha256=hashlib.sha256(data).hexdigest(), width=width, height=height, duration_ms=duration,
                          variants=variants, status='ready')
            db.session.add(asset); db.session.commit()
            return jsonify(metadata(asset)), 201
        except (ValueError, OSError, UnidentifiedImageError, subprocess.SubprocessError, Image.DecompressionBombError):
            db.session.rollback()
            for key in written: storage.delete(key)
            return jsonify(message='Invalid media, conversion failed, or configured limits exceeded'), 400
        except Exception:
            db.session.rollback()
            for key in written: storage.delete(key)
            raise

    @app.route('/api/npc-media/assets/<asset_id>', methods=['GET', 'DELETE'])
    @app.route('/api/npc-media/assets/<asset_id>/content', methods=['GET'])
    @jwt_required()
    def npc_media_asset(asset_id):
        campaign, _, error = context(require_editor=True)
        if error: return error
        asset = db.session.get(Asset, asset_id)
        if not allowed(asset, campaign): return jsonify(message='Media not found'), 404
        if request.method == 'DELETE':
            if asset.campaign_id != campaign.id: return jsonify(message='Module defaults are read-only'), 403
            # Include defaults, overrides, and voice references before removing bytes.
            for npc in NPC.query.all():
                if asset_id in str(npc.profile_metadata or {}) or asset_id in str(npc.origin_snapshot or {}):
                    return jsonify(message='Media is still referenced'), 409
            Voice = ns.get('NpcVoiceLine')
            if Voice and Voice.query.filter_by(media_asset_id=asset_id).first():
                return jsonify(message='Media is still referenced'), 409
            keys = [asset.storage_key, *(asset.variants or {}).values()]
            db.session.delete(asset); db.session.commit()
            for key in keys: store().delete(key)
            return '', 204
        if request.path.endswith('/content'):
            size = request.args.get('size', '512')
            variant = ('token-' if request.args.get('framing') == 'token' else '') + size
            key = ((asset.variants or {}).get(variant) or (asset.variants or {}).get(size)) if asset.media_type == 'image' else asset.storage_key
            if not key or not store().path(key).is_file(): return jsonify(message='Media file missing'), 404
            response = send_file(store().path(key), mimetype=asset.mime_type, conditional=True)
            response.headers['Cache-Control'] = 'private, max-age=3600'
            return response
        return jsonify(metadata(asset))

    @app.route('/api/npc-media/npcs/<int:npc_id>', methods=['GET', 'PATCH'])
    @jwt_required()
    def npc_media_profile(npc_id):
        campaign, _, error = context(require_editor=True)
        if error: return error
        npc = NPC.query.filter_by(id=npc_id, campaign_id=campaign.id).first()
        if not npc: return jsonify(message='NPC not found'), 404
        if request.method == 'PATCH':
            values = request.get_json(silent=True) or {}
            if not isinstance(values, dict): return jsonify(message='Media associations must be an object'), 400
            profile = dict(npc.profile_metadata or {})
            media = dict(profile.get('npc_media', {}))
            for kind, asset_id in values.items():
                if kind not in ('portrait', 'token'): return jsonify(message='Unknown media association'), 400
                if asset_id is None: media.pop(kind, None)
                else:
                    asset = db.session.get(Asset, asset_id) if isinstance(asset_id, str) else None
                    if not allowed(asset, campaign) or asset.media_type != 'image': return jsonify(message='Image not found'), 400
                    media[kind] = asset_id
            profile['npc_media'] = media; npc.profile_metadata = profile
            db.session.commit()
        return jsonify(resolve(npc, campaign))

    @app.route('/api/npc-media/assets/<asset_id>/crop', methods=['POST'])
    @jwt_required()
    def crop_npc_media(asset_id):
        campaign, _, error = context(require_editor=True)
        if error: return error
        asset = db.session.get(Asset, asset_id)
        if not allowed(asset, campaign) or asset.media_type != 'image': return jsonify(message='Image not found'), 404
        storage = store(); written = []
        try:
            # Always preserve and re-crop the untouched source. Derived assets therefore
            # never compound an earlier zoom, alpha mask, or decorative border.
            source_data = storage.path(asset.storage_key).read_bytes()
            dimensions, processed = process_image(source_data, request.get_json() or {})
            new_id = str(uuid4()); variants = {}
            for size, content in processed.items():
                key = f'{new_id}-{size}.webp'; storage.path(key).write_bytes(content); variants[size] = key; written.append(key)
            key = f'{new_id}.original'; storage.path(key).write_bytes(source_data); written.append(key)
            row = Asset(id=new_id, campaign_id=campaign.id, media_type='image', storage_key=key, variants=variants,
                        original_filename=asset.original_filename, mime_type=asset.mime_type, file_size=len(source_data),
                        sha256=hashlib.sha256(source_data).hexdigest(), width=asset.width or dimensions[0], height=asset.height or dimensions[1], status='ready')
            db.session.add(row); db.session.commit()
            return jsonify(metadata(row)), 201
        except (ValueError, OSError, TypeError):
            db.session.rollback()
            for key in written: storage.delete(key)
            return jsonify(message='Could not crop image'), 400
