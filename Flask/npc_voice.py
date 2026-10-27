"""Voice recordings and campaign overrides, independent from playback and event rules."""
import math
from uuid import uuid4
from flask import request, jsonify
from flask_jwt_extended import jwt_required

CATEGORIES = ('Greeting', 'Farewell', 'Taunt', 'Combat', 'Spellcasting', 'Damage Reaction', 'Quote', 'Custom')
FIELDS = ('media_asset_id', 'label', 'category', 'transcript', 'description', 'quick_slot', 'display_order', 'gain', 'enabled')


def register_npc_voice(app, db, ns):
    Line, NPC, Asset = ns['NpcVoiceLine'], ns['NPC'], ns['NpcMediaAsset']
    def effective(npc):
        local = Line.query.filter_by(campaign_id=npc.campaign_id, npc_id=npc.id).all()
        replaced = {line.inherited_from for line in local}
        defaults = Line.query.filter_by(campaign_id=None, module_key=npc.module_key, source_key=npc.source_key).all() if npc.module_key and npc.source_key else []
        return sorted(local + [line for line in defaults if line.id not in replaced], key=lambda line: (line.display_order, line.label, line.id))

    def serialize(line):
        asset = db.session.get(Asset, line.media_asset_id)
        return {key:getattr(line,key) for key in ('id','npc_id','inherited_from', *FIELDS)} | {'module_default':line.campaign_id is None, 'asset':app.npc_media_metadata(asset) if asset else None}

    def editable(line, npc):
        if line.campaign_id is not None: return line
        clone = Line(id=str(uuid4()), npc_id=npc.id, campaign_id=npc.campaign_id, inherited_from=line.id,
                     **{key:getattr(line,key) for key in FIELDS})
        db.session.add(clone); db.session.flush()
        return clone

    def validate(values, campaign):
        if not isinstance(values,dict) or set(values)-set(FIELDS): raise ValueError('Unknown voice line field')
        if 'label' in values and (not isinstance(values['label'],str) or not values['label'].strip() or len(values['label'])>160): raise ValueError('Enter a label under 160 characters')
        if 'category' in values and values['category'] not in CATEGORIES: raise ValueError('Unknown category')
        for key in ('quick_slot','display_order'):
            v=values.get(key)
            if key in values and not (key=='quick_slot' and v is None) and (type(v) is not int or v<0 or v>100000): raise ValueError('Position must be a nonnegative integer')
        if 'gain' in values and (type(values['gain']) not in (int,float) or not math.isfinite(values['gain']) or not 0<=values['gain']<=4): raise ValueError('Gain must be between 0 and 4')
        if 'enabled' in values and type(values['enabled']) is not bool: raise ValueError('Enabled must be boolean')
        for key in ('transcript','description'):
            if key in values and (not isinstance(values[key],str) or len(values[key])>20000): raise ValueError('Text must be under 20000 characters')
        if 'media_asset_id' in values:
            asset=db.session.get(Asset,values['media_asset_id']) if isinstance(values['media_asset_id'],str) else None
            if not app.npc_media_allowed(asset,campaign) or asset.media_type!='audio': raise ValueError('Choose an authorized audio asset')

    app.npc_voice_effective=effective
    app.npc_voice_serialize=serialize
    app.npc_voice_editable=editable

    @app.route('/api/npc-media/npcs/<int:npc_id>/voices', methods=['GET','POST'])
    @app.route('/api/npc-media/npcs/<int:npc_id>/voices/<line_id>', methods=['PATCH','DELETE'])
    @jwt_required()
    def npc_voices(npc_id,line_id=None):
        campaign,_,error=ns['catalog_campaign_context'](require_editor=True)
        if error:return error
        npc=NPC.query.filter_by(id=npc_id,campaign_id=campaign.id).first()
        if not npc:return jsonify(message='NPC not found'),404
        lines=effective(npc)
        if request.method=='GET':return jsonify(lines=[serialize(line) for line in lines],categories=CATEGORIES)
        values=request.get_json(silent=True) or {}
        try:
            if request.method=='POST':
                validate(values,campaign)
                if not values.get('media_asset_id') or not values.get('label'):raise ValueError('Label and audio are required')
                line=Line(id=str(uuid4()),npc_id=npc.id,campaign_id=campaign.id,**values)
                db.session.add(line)
            else:
                line=next((line for line in lines if line.id==line_id),None)
                if not line:return jsonify(message='Voice line not found'),404
                if request.method=='DELETE':
                    if request.args.get('reset')=='1' and line.inherited_from:
                        db.session.delete(line)
                    elif line.campaign_id is None:
                        line=editable(line,npc);line.enabled=False
                    else:
                        db.session.delete(line)
                    db.session.commit();return '',204
                validate(values,campaign)
                line=editable(line,npc)
                for key,value in values.items():setattr(line,key,value)
            db.session.flush()
            # Assigning a slot displaces its old campaign assignment, including inherited defaults.
            if line.quick_slot is not None and line.enabled:
                for other in effective(npc):
                    if other.id!=line.id and other.quick_slot==line.quick_slot:
                        other=editable(other,npc);other.quick_slot=None
            db.session.commit();return jsonify(serialize(line)),201 if request.method=='POST' else 200
        except ValueError as exc:
            db.session.rollback();return jsonify(message=str(exc)),400
