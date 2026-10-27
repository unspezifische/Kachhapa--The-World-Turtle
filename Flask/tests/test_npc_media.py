import ast
import io
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token
from PIL import Image
from npc_media import register_npc_media, MediaStore, process_image


class MediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = Flask(__name__)
        self.app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', JWT_SECRET_KEY='test-secret-with-at-least-thirty-two-characters', NPC_MEDIA_ROOT=self.temp.name)
        JWTManager(self.app); self.db = SQLAlchemy(self.app); db = self.db
        class Campaign(db.Model):
            id = db.Column(db.Integer, primary_key=True)
            dm_id = db.Column(db.Integer, default=1)
            owner_id = db.Column(db.Integer, default=1)
        class NPC(db.Model):
            id = db.Column(db.Integer, primary_key=True)
            campaign_id = db.Column(db.Integer)
            module_key = db.Column(db.String)
            source_key = db.Column(db.String)
            name = db.Column(db.String, default='Elion')
            profile_metadata = db.Column(db.JSON, default=dict)
            origin_snapshot = db.Column(db.JSON)
        scope = dict(db=db, datetime=datetime, timezone=timezone)
        tree = ast.parse((Path(__file__).parents[1] / 'tables.py').read_text())
        nodes = [n for n in tree.body if isinstance(n, ast.ClassDef) and n.name in ('NpcMediaAsset', 'NpcVoiceLine', 'NpcVoiceTrigger', 'NpcVoiceSettings')]
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'tables.py', 'exec'), scope)
        self.Asset, self.NPC, self.Campaign = scope['NpcMediaAsset'], NPC, Campaign
        def context(require_editor=False):
            if require_editor and request.headers.get('Role') != 'DM': return None, None, (jsonify(message='Forbidden'), 403)
            return db.session.get(Campaign, int(request.headers.get('CampaignID', 1))), SimpleNamespace(id=int(request.headers.get('UserID',1))), None
        self.ns = dict(NpcMediaAsset=self.Asset, NPC=NPC, catalog_campaign_context=context, installed_module_keys=lambda _: {'module'})
        self.ns['NpcVoiceLine'] = scope['NpcVoiceLine']
        register_npc_media(self.app, db, self.ns)
        from npc_voice import register_npc_voice
        register_npc_voice(self.app, db, self.ns)
        self.emitted=[]
        self.ns.update(NpcVoiceTrigger=scope['NpcVoiceTrigger'],NpcVoiceSettings=scope['NpcVoiceSettings'],Campaign=Campaign,socketio=SimpleNamespace(emit=lambda *a,**kw:self.emitted.append((a,kw))))
        from npc_voice_events import register_npc_voice_events
        register_npc_voice_events(self.app,db,self.ns)
        class Message(db.Model):
            id=db.Column(db.Integer,primary_key=True)
            campaign_id=db.Column(db.Integer)
            sender_id=db.Column(db.Integer)
            sender_npc_id=db.Column(db.Integer)
            recipient_ids=db.Column(db.String)
        self.Message=Message;self.ns['Message']=Message
        from npc_chat_media import register_npc_chat_media
        register_npc_chat_media(self.app,db,self.ns)
        self.ctx = self.app.app_context(); self.ctx.push(); db.create_all()
        db.session.add_all([Campaign(id=1), Campaign(id=2), NPC(id=1, campaign_id=1), NPC(id=2, campaign_id=2)]); db.session.commit()
        self.headers = {'Role':'DM', 'CampaignID':'1', 'Authorization':'Bearer '+create_access_token(identity='dm')}
        self.client = self.app.test_client()

    def tearDown(self):
        self.db.session.remove(); self.db.drop_all(); self.ctx.pop(); self.temp.cleanup()

    def upload(self, data=None, filename='portrait.png'):
        if data is None:
            output = io.BytesIO(); Image.new('RGB', (600, 300), 'red').save(output, 'PNG'); data = output.getvalue()
        return self.client.post('/api/npc-media/assets', data={'file':(io.BytesIO(data), filename)}, headers=self.headers)

    def test_upload_variants_authorization_and_persistence(self):
        result = self.upload(); self.assertEqual(result.status_code, 201, result.json)
        asset = result.json; self.assertEqual((asset['width'], asset['height']), (600,300))
        for size in (64,128,256,512):
            response = self.client.get(asset['url']+'?size='+str(size), headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertLessEqual(max(Image.open(io.BytesIO(response.data)).size), size)
            response.close()
        self.assertEqual(self.client.get(asset['url'], headers=self.headers|{'CampaignID':'2'}).status_code, 404)
        self.assertEqual(self.client.get(asset['url'], headers=self.headers|{'Role':'Player'}).status_code, 403)
        row = self.db.session.get(self.Asset, asset['id'])
        self.assertTrue(MediaStore(self.temp.name).path(row.storage_key).exists())

    def test_validation_crop_reference_reset_and_isolation(self):
        self.assertEqual(self.upload(b'fake', 'bad.png').status_code, 400)
        self.app.config['NPC_MEDIA_MAX_BYTES'] = 10
        self.assertEqual(self.upload().status_code, 413)
        self.app.config['NPC_MEDIA_MAX_BYTES'] = 32*1024*1024
        asset = self.upload().json
        cropped = self.client.post('/api/npc-media/assets/'+asset['id']+'/crop', json={'zoom':2,'x':.2,'y':.8,'shape':'circle','border':'#ff0000'}, headers=self.headers)
        self.assertEqual(cropped.status_code,201,cropped.json)
        path = '/api/npc-media/npcs/1'
        self.assertEqual(self.client.patch(path,json={'portrait':asset['id']},headers=self.headers).json['token']['id'],asset['id'])
        self.assertEqual(self.client.delete('/api/npc-media/assets/'+asset['id'],headers=self.headers).status_code,409)
        self.assertEqual(self.client.patch('/api/npc-media/npcs/2',json={'portrait':asset['id']},headers=self.headers).status_code,404)
        self.client.patch(path,json={'portrait':None},headers=self.headers)
        self.assertEqual(self.client.delete('/api/npc-media/assets/'+asset['id'],headers=self.headers).status_code,204)
        with self.assertRaises(ValueError): MediaStore(self.temp.name).path('../secret')

    def test_repeated_crop_uses_untouched_source_without_stacking_border(self):
        original = self.upload().json
        first = self.client.post('/api/npc-media/assets/' + original['id'] + '/crop',
                                 json={'zoom': 2, 'x': .5, 'y': .5, 'shape': 'square', 'border': '#00ff00'},
                                 headers=self.headers).json
        second = self.client.post('/api/npc-media/assets/' + first['id'] + '/crop',
                                  json={'zoom': 1, 'x': .5, 'y': .5, 'shape': 'square', 'border': ''},
                                  headers=self.headers)
        self.assertEqual(second.status_code, 201, second.json)
        content = self.client.get(second.json['url'] + '?size=512', headers=self.headers)
        pixel = Image.open(io.BytesIO(content.data)).convert('RGB').getpixel((6, 6))
        self.assertGreater(pixel[0], 200)
        self.assertLess(pixel[1], 80)
        derived = self.db.session.get(self.Asset, second.json['id'])
        self.assertEqual((derived.width, derived.height), (600, 300))

    def test_module_inheritance(self):
        asset = self.upload().json
        row = self.db.session.get(self.Asset,asset['id']); row.campaign_id=None; row.module_key='module'
        npc = self.db.session.get(self.NPC,1); npc.origin_snapshot={'profile_metadata':{'npc_media':{'portrait':row.id}}}
        self.db.session.commit()
        self.assertEqual(self.client.get('/api/npc-media/npcs/1',headers=self.headers).json['token']['id'],row.id)
        self.assertEqual(self.client.delete('/api/npc-media/assets/'+row.id,headers=self.headers).status_code,403)

    def test_audio_conversion_and_limits(self):
        import wave
        output=io.BytesIO()
        with wave.open(output,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0\0'*800)
        response=self.upload(output.getvalue(),'voice.wav')
        self.assertEqual(response.status_code,201,response.json)
        self.assertGreater(response.json['duration_ms'],0)
        self.assertEqual(response.json['mime_type'],'audio/mpeg')
        self.app.config['NPC_AUDIO_MAX_SECONDS']=.01
        self.assertEqual(self.upload(output.getvalue(),'voice.wav').status_code,400)

    def test_voice_crud_slots_and_asset_protection(self):
        import wave
        output=io.BytesIO()
        with wave.open(output,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(b'\0\0'*800)
        asset=self.upload(output.getvalue(),'greeting.wav').json
        base='/api/npc-media/npcs/1/voices'
        first=self.client.post(base,json={'label':'Greeting','media_asset_id':asset['id'],'quick_slot':0},headers=self.headers)
        self.assertEqual(first.status_code,201,first.json)
        second=self.client.post(base,json={'label':'Taunt','media_asset_id':asset['id'],'quick_slot':0},headers=self.headers)
        self.assertEqual(second.status_code,201,second.json)
        rows=self.client.get(base,headers=self.headers).json['lines']
        self.assertEqual(sum(row['quick_slot']==0 for row in rows),1)
        self.assertEqual(self.client.patch(base+'/'+first.json['id'],json={'gain':5},headers=self.headers).status_code,400)
        self.assertEqual(self.client.get(base.replace('/1/','/2/'),headers=self.headers).status_code,404)
        self.assertEqual(self.client.delete('/api/npc-media/assets/'+asset['id'],headers=self.headers).status_code,409)
        self.assertEqual(self.client.delete(base+'/'+first.json['id'],headers=self.headers).status_code,204)
        self.assertEqual(self.client.delete(base+'/'+second.json['id'],headers=self.headers).status_code,204)
        self.assertEqual(self.client.delete('/api/npc-media/assets/'+asset['id'],headers=self.headers).status_code,204)

    def voice_fixture(self):
        asset=self.Asset(id='audio',campaign_id=1,media_type='audio',storage_key='voice.mp3',original_filename='voice.mp3',mime_type='audio/mpeg',file_size=4,sha256='a'*64,status='ready')
        self.db.session.add(asset);self.db.session.commit()
        return self.client.post('/api/npc-media/npcs/1/voices',json={'label':'Fireball','media_asset_id':asset.id,'category':'Spellcasting'},headers=self.headers).json

    def test_rule_validation_settings_and_committed_event_contract(self):
        line=self.voice_fixture()
        path=f"/api/npc-media/npcs/1/voices/{line['id']}/triggers"
        self.assertFalse(self.client.get('/api/npc-media/settings',headers=self.headers).json['automatic_enabled'])
        rule={'event_type':'npc.spell.cast','conditions':{'spellId':'42'},'priority':60,'cooldown_ms':0,'probability':1,'enabled':True}
        created=self.client.post(path,json=rule,headers=self.headers)
        self.assertEqual(created.status_code,201,created.json)
        self.assertEqual(self.client.get('/api/npc-media/npcs/1/rules',headers=self.headers).json['lines'][0]['triggers'][0]['conditions'],{'spellId':'42'})
        for invalid in ({'conditions':{'execute':'evil'}},{'conditions':{'spellLevel':10}},{'probability':2},{'enabled':'yes'}):
            self.assertEqual(self.client.post(path,json=rule|invalid,headers=self.headers).status_code,400)
        self.assertEqual(self.client.get(path.replace('/1/','/2/'),headers=self.headers).status_code,404)
        enabled=self.client.patch('/api/npc-media/settings',json={'automatic_enabled':True},headers=self.headers)
        self.assertTrue(enabled.json['automatic_enabled'])
        event=self.app.emit_npc_gameplay_event(1,1,'npc.spell.cast',{'spellId':'42','spellLevel':3},'committed-cast-1')
        again=self.app.emit_npc_gameplay_event(1,1,'npc.spell.cast',{'spellId':'42'},'committed-cast-1')
        self.assertEqual(event['eventId'],again['eventId'])
        self.assertEqual(self.emitted[-1][1]['to'],'user:1')
        with self.assertRaises(ValueError):self.app.emit_npc_gameplay_event(1,2,'npc.spell.cast',{'spellId':'42'},'wrong-npc')
        with self.assertRaises(ValueError):self.app.emit_npc_gameplay_event(1,1,'npc.damage.received',{'damage':0},'no-damage')
        with self.assertRaises(ValueError):self.app.emit_npc_gameplay_event(1,1,'npc.spell.cast',{'spellName':'Fireball'},'no-id')

    def test_module_voice_and_trigger_overrides_reset(self):
        voice=self.voice_fixture();Line=self.ns['NpcVoiceLine'];Rule=self.ns['NpcVoiceTrigger']
        line=self.db.session.get(Line,voice['id']);line.campaign_id=None;line.npc_id=None;line.module_key='module';line.source_key='elion'
        npc=self.db.session.get(self.NPC,1);npc.module_key='module';npc.source_key='elion'
        self.db.session.add(Rule(id='default-rule',voice_line_id=line.id,event_type='npc.spell.cast',conditions={'spellId':'42'},campaign_id=None))
        self.db.session.commit()
        path=f"/api/npc-media/npcs/1/voices/{line.id}/triggers/default-rule"
        result=self.client.patch(path,json={'priority':99},headers=self.headers)
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.db.session.get(Rule,'default-rule').priority,0)
        local_id=result.json['effective_voice_line_id'];local_rule=result.json['id']
        rules=self.client.get('/api/npc-media/npcs/1/rules',headers=self.headers).json['lines']
        self.assertEqual(len(rules),1);self.assertEqual(rules[0]['npc_id'],1);self.assertEqual(rules[0]['triggers'][0]['priority'],99)
        self.assertEqual(self.client.delete(f'/api/npc-media/npcs/1/voices/{local_id}/triggers/{local_rule}?reset=1',headers=self.headers).status_code,204)
        self.assertEqual(self.client.get('/api/npc-media/npcs/1/rules',headers=self.headers).json['lines'][0]['triggers'][0]['id'],'default-rule')
        self.assertEqual(self.client.delete(f'/api/npc-media/npcs/1/voices/{local_id}?reset=1',headers=self.headers).status_code,204)
        self.assertEqual(self.client.get('/api/npc-media/npcs/1/voices',headers=self.headers).json['lines'][0]['id'],line.id)

    def test_chat_avatar_is_visible_only_to_explicit_recipients(self):
        asset=self.upload().json
        self.client.patch('/api/npc-media/npcs/1',json={'token':asset['id']},headers=self.headers)
        message=self.Message(id=1,campaign_id=1,sender_id=1,sender_npc_id=1,recipient_ids='2')
        self.db.session.add(message);self.db.session.commit()
        identity=self.app.npc_message_identity(message,self.db.session.get(self.Campaign,1))
        response=self.client.get(identity['sender_avatar']['image_url'],headers=self.headers|{'UserID':'2','Role':'Player'})
        self.assertEqual(response.status_code,200);response.close()
        self.assertEqual(self.client.get(identity['sender_avatar']['image_url'],headers=self.headers|{'UserID':'3'}).status_code,404)
        self.assertEqual(self.client.get(identity['sender_avatar']['image_url'],headers=self.headers|{'CampaignID':'2'}).status_code,404)
