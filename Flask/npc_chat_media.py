"""Explicit NPC chat identity on existing messages; only recipients may fetch avatars."""
from flask import jsonify, request, send_file
from flask_jwt_extended import jwt_required
from npc_media import MediaStore


def register_npc_chat_media(app, db, ns):
    NPC, Message = ns['NPC'], ns['Message']

    def identity(message, campaign):
        npc=NPC.query.filter_by(id=message.sender_npc_id,campaign_id=campaign.id).first() if message.sender_npc_id else None
        if not npc:return {}
        token=app.npc_media_resolve(npc,campaign)['token']
        return {'sender_npc_id':npc.id,'sender_character_name':npc.name,
                'sender_avatar':{'mode':'image','image_url':f'/api/npc-media/messages/{message.id}/avatar','authorized_npc':True} if token else None}
    app.npc_message_identity=identity

    @app.route('/api/npc-media/messages/<int:message_id>/avatar')
    @jwt_required()
    def npc_chat_avatar(message_id):
        campaign,user,error=ns['catalog_campaign_context']()
        if error:return error
        message=Message.query.filter_by(id=message_id,campaign_id=campaign.id).first()
        if not message or str(user.id) not in [str(message.sender_id),*(message.recipient_ids or '').split(',')]:
            return jsonify(message='Avatar not found'),404
        npc=NPC.query.filter_by(id=message.sender_npc_id,campaign_id=campaign.id).first()
        token=app.npc_media_resolve(npc,campaign)['token'] if npc else None
        asset=db.session.get(ns['NpcMediaAsset'],token['id']) if token else None
        if not asset:return jsonify(message='Avatar not found'),404
        path=MediaStore(app.config['NPC_MEDIA_ROOT']).path((asset.variants.get('token-64') if '?framing=token' in token['url'] else None) or asset.variants['64'])
        if not path.is_file():return jsonify(message='Avatar not found'),404
        response=send_file(path,mimetype='image/webp',conditional=True)
        response.headers['Cache-Control']='private, max-age=300'
        return response
