"""Typed event contracts and an adapter to existing Socket.IO user rooms.

Call emit_npc_gameplay_event only AFTER a committed gameplay action, once per
cast/damage action, using its stable action_id. No snapshot/reload hooks or
client-supplied event-injection endpoint exists.
"""
from datetime import datetime, timezone
import hashlib
import math
from uuid import uuid4
from flask import jsonify, request
from flask_jwt_extended import jwt_required

EVENT_CONDITIONS = {
    'npc.damage.received': {'minDamage': 'number', 'damageType': 'string', 'critical': 'boolean'},
    'npc.spell.cast': {'spellId': 'string', 'spellLevel': 'level'},
}
RULE_FIELDS = ('event_type','conditions','priority','probability','cooldown_ms','enabled','interrupt','randomized')


def validate_conditions(event_type, conditions):
    schema=EVENT_CONDITIONS.get(event_type)
    if schema is None or not isinstance(conditions,dict) or set(conditions)-set(schema or {}):
        raise ValueError('Unsupported event or conditions')
    for key,value in conditions.items():
        kind=schema[key]
        if kind=='number' and (type(value) not in (int,float) or not math.isfinite(value) or value<0):raise ValueError('Minimum damage must be a finite positive number')
        if kind=='string' and (not isinstance(value,str) or not value.strip() or len(value)>160):raise ValueError('Choose a stable identifier or damage type')
        if kind=='boolean' and type(value) is not bool:raise ValueError('Critical must be boolean')
        if kind=='level' and (type(value) is not int or not 0<=value<=9):raise ValueError('Spell level must be 0–9')


def normalize_npc_event(campaign_id,npc_id,event_type,payload,action_id):
    if not isinstance(action_id,str) or not action_id or len(action_id)>240:raise ValueError('A stable committed action ID is required')
    if event_type not in EVENT_CONDITIONS or not isinstance(payload,dict):raise ValueError('Unsupported event')
    if event_type=='npc.damage.received':
        damage=payload.get('damage')
        if type(damage) not in (int,float) or not math.isfinite(damage) or damage<=0:raise ValueError('Damage must be positive')
        for key in ('damageType',):
            if key in payload and not isinstance(payload[key],str):raise ValueError('Invalid damage type')
        if 'critical' in payload and type(payload['critical']) is not bool:raise ValueError('Invalid critical flag')
    else:
        if not isinstance(payload.get('spellId'),str) or not payload['spellId'].strip():raise ValueError('Stable spell ID is required')
        if 'spellLevel' in payload and (type(payload['spellLevel']) is not int or not 0<=payload['spellLevel']<=9):raise ValueError('Invalid spell level')
    identity=f'{campaign_id}:{npc_id}:{event_type}:{action_id}'
    return dict(eventId=hashlib.sha256(identity.encode()).hexdigest(),type=event_type,
                timestamp=datetime.now(timezone.utc).isoformat(),campaignId=campaign_id,npcId=npc_id,payload=payload)


def register_npc_voice_events(app,db,ns):
    Rule,Settings,NPC=ns['NpcVoiceTrigger'],ns['NpcVoiceSettings'],ns['NPC']
    def rules_for(line,campaign_id):
        local=Rule.query.filter_by(voice_line_id=line.id,campaign_id=campaign_id).all()
        replaced={rule.inherited_from for rule in local}
        original=line.inherited_from or (line.id if line.campaign_id is None else None)
        defaults=Rule.query.filter_by(voice_line_id=original,campaign_id=None).all() if original else []
        return sorted(local+[rule for rule in defaults if rule.id not in replaced],key=lambda rule:rule.id)
    def serialize(rule,line_id):
        return {key:getattr(rule,key) for key in ('id','inherited_from',*RULE_FIELDS)}|{'voice_line_id':line_id,'module_default':rule.campaign_id is None}
    def emit_event(campaign_id,npc_id,event_type,payload,action_id):
        npc=NPC.query.filter_by(id=npc_id,campaign_id=campaign_id).first()
        campaign=db.session.get(ns['Campaign'],campaign_id)
        if not npc or not campaign:raise ValueError('NPC does not belong to campaign')
        event=normalize_npc_event(campaign_id,npc_id,event_type,payload,action_id)
        for user_id in {campaign.dm_id,campaign.owner_id}:
            ns['socketio'].emit('npc_gameplay_event',event,to=f'user:{user_id}')
        return event
    app.emit_npc_gameplay_event=emit_event
    app.npc_voice_rules=rules_for

    @app.route('/api/npc-media/settings',methods=['GET','PATCH'])
    @jwt_required()
    def voice_settings():
        campaign,_,error=ns['catalog_campaign_context'](require_editor=True)
        if error:return error
        settings=db.session.get(Settings,campaign.id)
        if request.method=='PATCH':
            values=request.get_json(silent=True)
            if not isinstance(values,dict) or set(values)!={'automatic_enabled'} or type(values['automatic_enabled']) is not bool:return jsonify(message='Choose whether automatic voices are enabled'),400
            if not settings:settings=Settings(campaign_id=campaign.id);db.session.add(settings)
            settings.automatic_enabled=values['automatic_enabled'];db.session.commit()
            socket=ns.get('socketio')
            if socket:
                for user_id in {campaign.dm_id,campaign.owner_id}:
                    socket.emit('npc_voice_settings_changed',{'campaignId':campaign.id,'automatic_enabled':settings.automatic_enabled},to=f'user:{user_id}')
        return jsonify(automatic_enabled=bool(settings and settings.automatic_enabled))

    @app.route('/api/npc-media/npcs/<int:npc_id>/rules',methods=['GET'])
    @app.route('/api/npc-media/npcs/<int:npc_id>/voices/<line_id>/triggers',methods=['GET','POST'])
    @app.route('/api/npc-media/npcs/<int:npc_id>/voices/<line_id>/triggers/<rule_id>',methods=['PATCH','DELETE'])
    @jwt_required()
    def voice_rules(npc_id,line_id=None,rule_id=None):
        campaign,_,error=ns['catalog_campaign_context'](require_editor=True)
        if error:return error
        npc=NPC.query.filter_by(id=npc_id,campaign_id=campaign.id).first()
        if not npc:return jsonify(message='NPC not found'),404
        lines=app.npc_voice_effective(npc)
        if line_id is None:
            return jsonify(lines=[app.npc_voice_serialize(line)|{'npc_id':npc.id,'triggers':[serialize(rule,line.id) for rule in rules_for(line,campaign.id)]} for line in lines])
        line=next((line for line in lines if line.id==line_id),None)
        if not line:return jsonify(message='Voice line not found'),404
        rules=rules_for(line,campaign.id)
        if request.method=='GET':return jsonify(triggers=[serialize(rule,line.id) for rule in rules])
        values=request.get_json(silent=True) or {}
        try:
            rule=next((rule for rule in rules if rule.id==rule_id),None) if rule_id else None
            if rule_id and not rule:return jsonify(message='Trigger not found'),404
            if request.method=='DELETE' and request.args.get('reset')=='1' and rule.inherited_from:
                db.session.delete(rule);db.session.commit();return '',204
            if request.method!='DELETE':
                if not isinstance(values,dict) or set(values)-set(RULE_FIELDS):raise ValueError('Unsupported trigger field')
                candidate={key:getattr(rule,key) for key in RULE_FIELDS} if rule else dict(event_type='',conditions={},priority=0,probability=1,cooldown_ms=0,enabled=True,interrupt=False,randomized=False)
                candidate.update(values)
                validate_conditions(candidate['event_type'],candidate['conditions'])
                for key in ('priority','cooldown_ms'):
                    if type(candidate[key]) is not int or not 0<=candidate[key]<=86400000:raise ValueError('Priority and cooldown must be nonnegative integers')
                if type(candidate['probability']) not in (int,float) or not math.isfinite(candidate['probability']) or not 0<=candidate['probability']<=1:raise ValueError('Probability must be between 0 and 1')
                for key in ('enabled','interrupt','randomized'):
                    if type(candidate[key]) is not bool:raise ValueError('Flags must be boolean')
            # Trigger customization on a module line creates a linked campaign voice override.
            line=app.npc_voice_editable(line,npc)
            if request.method=='DELETE' and rule.campaign_id is not None:
                db.session.delete(rule);db.session.commit();return '',204
            if not rule or rule.campaign_id is None:
                inherited=rule
                rule=Rule(id=str(uuid4()),voice_line_id=line.id,campaign_id=campaign.id,inherited_from=inherited.id if inherited else None)
                db.session.add(rule)
                if inherited:
                    for key in RULE_FIELDS:setattr(rule,key,getattr(inherited,key))
            if request.method=='DELETE':rule.enabled=False
            else:
                for key,value in candidate.items():setattr(rule,key,value)
            db.session.commit()
            return jsonify(serialize(rule,line.id)|{'effective_voice_line_id':line.id}),201 if request.method=='POST' else 200
        except ValueError as exc:
            db.session.rollback();return jsonify(message=str(exc)),400
