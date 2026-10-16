"""Actual workflow handlers/models with isolated SQLite fixture parents."""
import ast
from pathlib import Path
import unittest
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from flask_jwt_extended import JWTManager, create_access_token
from npc_workflow import register_npc_workflow
from test_npc_schedules import schedule


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.app=Flask(__name__); self.app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', JWT_SECRET_KEY='test-secret-key-longer-than-thirty-two-bytes')
        JWTManager(self.app); self.db=SQLAlchemy(self.app); db=self.db
        class Campaign(db.Model): id=db.Column(db.Integer,primary_key=True)
        class WorldAtlasLocation(db.Model):
            id=db.Column(db.Integer,primary_key=True); campaign_id=db.Column(db.Integer); name=db.Column(db.String); buildings=db.Column(db.JSON); properties=db.Column(db.JSON)
        class CampaignModuleInstallation(db.Model):
            id=db.Column(db.Integer,primary_key=True); campaign_id=db.Column(db.Integer); module_key=db.Column(db.String)
        class Calendar(db.Model):
            id=db.Column(db.Integer,primary_key=True); campaign_id=db.Column(db.Integer)
            def get_hours_in_day(self): return 24
            def get_minutes_in_hour(self): return 60
        tree=ast.parse((Path(__file__).parents[1]/'tables.py').read_text())
        scope=dict(db=db, datetime=datetime,timezone=timezone,UniqueConstraint=UniqueConstraint,JSONB=JSONB)
        selected=[node for node in tree.body if isinstance(node,ast.ClassDef) and node.name in ('NPC','NpcScheduleDefinition','NpcScheduleRule','NpcProfileHistory')]
        exec(compile(ast.Module(body=selected,type_ignores=[]),'tables.py','exec'),scope)
        self.NPC=scope['NPC']; self.Definition=scope['NpcScheduleDefinition']; self.History=scope['NpcProfileHistory']
        def context(require_editor=False):
            if request.headers.get('Role') != 'DM': return None,None,(jsonify({'message':'Forbidden'}),403)
            return db.session.get(Campaign,1),None,None
        self.app.add_url_rule('/api/npcs', 'create_npc', lambda:None, methods=['POST'])
        self.app.add_url_rule('/api/npcs', 'get_npcs', lambda:None, methods=['GET'])
        register_npc_workflow(self.app,db,(self.NPC,self.Definition,scope['NpcScheduleRule'],self.History,Calendar,WorldAtlasLocation,CampaignModuleInstallation),context,lambda c,y,m,d:d-1)
        self.context=self.app.app_context(); self.context.push(); db.create_all()
        db.session.add_all([Campaign(id=1),Campaign(id=2), WorldAtlasLocation(id=1,campaign_id=1,name='Town',buildings=[],properties=[{'id':'p','name':'Estate','structure_ids':[]}])]); db.session.commit()
        self.headers={'Role':'DM','Authorization':'Bearer '+create_access_token(identity='dm')}; self.client=self.app.test_client()
        self.profile={'name':'Test NPC','description':'A resident','size':'Medium','creature_type':'humanoid','creature_subtype':'human','alignment':'neutral','ac':'10','hp':'4','speed':30,**{key:10 for key in ('strength','dexterity','constitution','intelligence','wisdom','charisma')}}

    def tearDown(self): self.db.session.remove(); self.db.drop_all(); self.context.pop()

    def create(self, **extra): return self.client.post('/api/npcs',json=self.profile|extra,headers=self.headers)

    def test_atomic_create_schedule_reload_and_legacy_response(self):
        response=self.create(schedule=schedule()); self.assertEqual(response.status_code,201,response.json)
        record=response.json; self.assertEqual(record['schedule']['rules'][0]['id'],'sleep')
        read=self.client.get(f"/api/npcs/{record['id']}",headers=self.headers)
        self.assertEqual(read.json['schedule'],record['schedule'])
        self.assertIsInstance(self.client.get('/api/npcs',headers=self.headers).json,list)
        paged=self.client.get('/api/npcs?limit=1',headers=self.headers).json
        self.assertNotIn('schedule',paged['items'][0])

    def test_invalid_enabled_schedule_is_atomic_and_disabled_draft_retained(self):
        bad=schedule(); bad['rules'][0]['duration_minutes']=-1
        self.assertEqual(self.create(schedule=bad).status_code,400)
        self.assertEqual(self.NPC.query.count(),0)
        bad['enabled']=False
        result=self.create(schedule=bad); self.assertEqual(result.status_code,201,result.json)
        self.assertTrue(result.json['schedule_warnings'])
        self.assertIsNone(result.json['planned']['current'])

    def test_module_override_keeps_id_original_and_reset_history(self):
        record=self.create().json; npc=self.db.session.get(self.NPC,record['id'])
        npc.source='Example Module'; npc.module_key='example'; npc.source_key='resident'
        npc.origin_snapshot={key:getattr(npc,key) for key in self.profile}|{'source':'Example Module','profile_metadata':{},'schedule_definition_id':None}
        self.db.session.commit()
        patch=self.client.patch(f"/api/npcs/{npc.id}",json={'name':'Edited Name','expected_revision':npc.revision,'schedule':schedule()},headers=self.headers)
        self.assertEqual(patch.status_code,200,patch.json); self.assertEqual(patch.json['id'],npc.id); self.assertTrue(patch.json['is_override'])
        reset=self.client.post(f"/api/npcs/{npc.id}/reset-override",json={'expected_revision':patch.json['revision']},headers=self.headers)
        self.assertEqual(reset.status_code,200,reset.json); self.assertEqual(reset.json['name'],'Test NPC'); self.assertEqual(reset.json['source'],'Example Module')
        self.assertIsNone(reset.json['schedule']); self.assertEqual(self.History.query.count(),2)

    def test_stale_revision_and_campaign_isolation(self):
        record=self.create().json
        self.assertEqual(self.client.patch(f"/api/npcs/{record['id']}",json={'expected_revision':0,'name':'Bad'},headers=self.headers).status_code,409)
        npc=self.db.session.get(self.NPC,record['id']); npc.campaign_id=2; self.db.session.commit()
        self.assertEqual(self.client.get(f"/api/npcs/{npc.id}",headers=self.headers).status_code,404)
        headers=dict(self.headers);headers.pop('Role')
        self.assertEqual(self.client.post('/api/npcs',json=self.profile,headers=headers).status_code,403)

    def test_import_preview_apply_and_revision_retry(self):
        record=self.create().json
        payload={'records':[{'npc_id':record['id'],'schedule':schedule()}]}
        preview=self.client.post('/api/npcs/schedules/import',json=payload,headers=self.headers)
        self.assertEqual(preview.json['results'][0]['status'],'valid')
        self.assertEqual(self.Definition.query.count(),0)
        payload['apply']=True;payload['records'][0]['expected_revision']=preview.json['results'][0]['expected_revision']
        applied=self.client.post('/api/npcs/schedules/import',json=payload,headers=self.headers)
        self.assertEqual(applied.json['results'][0]['status'],'applied')
        retry=self.client.post('/api/npcs/schedules/import',json=payload,headers=self.headers)
        self.assertEqual(retry.json['results'][0]['status'],'rejected')
        self.assertEqual(self.Definition.query.count(),1)

    def test_location_mapping_and_smart_fill_preview(self):
        locations=self.client.get('/api/npcs/schedule-locations',headers=self.headers).json
        self.assertEqual(locations['locations'][0]['resolved']['property_id'],'p')
        output=self.client.post('/api/npcs/smart-fill',json={'values':{'name':'Kept'},'locked_fields':['name'],'seed':1},headers=self.headers)
        self.assertEqual(output.status_code,200,output.json);self.assertEqual(output.json['values']['name'],'Kept')
        self.assertEqual(self.NPC.query.count(),0)

    def test_missing_mapping_and_invalid_numeric_fields(self):
        value=schedule();value['bindings']['home']['resolved']['property_id']='deleted'
        result=self.create(schedule=value)
        self.assertEqual(result.status_code,201,result.json)
        self.assertFalse(result.json['schedule']['enabled'])
        self.assertTrue(result.json['schedule_warnings'])
        self.assertEqual(self.create(strength=31).status_code,400)

    def test_duplicate_names_keep_independent_ids_and_pagination(self):
        first=self.create().json;second=self.create().json
        self.assertNotEqual(first['id'],second['id'])
        page=self.client.get('/api/npcs?limit=1',headers=self.headers).json
        self.assertEqual(len(page['items']),1);self.assertEqual(page['next_cursor'],'1')
        following=self.client.get('/api/npcs?limit=1&cursor=1',headers=self.headers).json
        self.assertNotEqual(page['items'][0]['id'],following['items'][0]['id'])

    def test_disable_is_campaign_local_reversible_and_revision_checked(self):
        npc=self.create().json
        result=self.client.patch(f"/api/npcs/{npc['id']}",json={'expected_revision':npc['revision'],'disabled':True},headers=self.headers)
        self.assertEqual(result.status_code,200,result.json)
        self.assertEqual(self.client.get('/api/npcs',headers=self.headers).json,[])
        visible=self.client.get('/api/npcs?limit=50&include_disabled=true',headers=self.headers).json
        self.assertEqual(visible['items'][0]['id'],npc['id'])
        self.assertEqual(result.json['planned']['reason'],'NPC disabled in this campaign')
        enabled=self.client.patch(f"/api/npcs/{npc['id']}",json={'expected_revision':result.json['revision'],'disabled':False},headers=self.headers)
        self.assertEqual(enabled.status_code,200)
        self.assertEqual(len(self.client.get('/api/npcs',headers=self.headers).json),1)
