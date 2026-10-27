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
        class CreatureCatalog(db.Model):
            id=db.Column(db.Integer,primary_key=True); source=db.Column(db.String); name=db.Column(db.String); data=db.Column(db.JSON)
        self.CreatureCatalog=CreatureCatalog
        class Calendar(db.Model):
            id=db.Column(db.Integer,primary_key=True); campaign_id=db.Column(db.Integer); current_year=db.Column(db.Integer,default=1); current_month_index=db.Column(db.Integer,default=0); current_day=db.Column(db.Integer,default=1); current_hour=db.Column(db.Integer,default=0); current_minute=db.Column(db.Integer,default=0)
            def get_hours_in_day(self): return 24
            def get_minutes_in_hour(self): return 60
            def get_format_data(self): return {'months':[{'name':f'Month {index+1}','length':30} for index in range(12)],'seasons':[{'name':'Winter','months':[0,1,2]},{'name':'Spring','months':[3,4,5]},{'name':'Summer','months':[6,7,8]},{'name':'Autumn','months':[9,10,11]}]}
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
        def normalize_date(calendar, value):
            month=value.get('month_index'); season=value.get('season')
            if month not in (None, ''): season=['Winter','Spring','Summer','Autumn'][int(month)//3]
            if value.get('year') in (None, '') or not season: raise ValueError('Invalid birth date')
            return {'year':int(value['year']),'season':season,'month_index':None if month in (None,'') else int(month),'day':None if value.get('day') in (None,'') else int(value['day'])}
        register_npc_workflow(self.app,db,(self.NPC,self.Definition,scope['NpcScheduleRule'],self.History,Calendar,WorldAtlasLocation,CampaignModuleInstallation,CreatureCatalog),context,lambda c,y,m,d:d-1,normalize_date=normalize_date)
        self.context=self.app.app_context(); self.context.push(); db.create_all()
        db.session.add_all([Campaign(id=1),Campaign(id=2),Calendar(campaign_id=1), WorldAtlasLocation(id=1,campaign_id=1,name='Town',buildings=[],properties=[{'id':'p','name':'Estate','structure_ids':[]}])]); db.session.commit()
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

    def test_normalized_combat_is_exposed_without_breaking_legacy_fields(self):
        record=self.create().json
        self.app.resolve_npc_combat_profile=lambda npc:{
            'configured':True,'authoring_mode':'custom','source':{'kind':'custom_definition'},
            'resolved':{'hp':'99','ac':'18','actions':'Normalized action'},'provenance':{'test':True},
        }
        detail=self.client.get(f"/api/npcs/{record['id']}",headers=self.headers).json
        self.assertEqual(detail['id'],record['id'])
        self.assertEqual(detail['hp'],'99')
        self.assertEqual(detail['actions'],'Normalized action')
        self.assertTrue(detail['combat_enabled'])
        listed=self.client.get('/api/npcs',headers=self.headers).json[0]
        self.assertEqual(listed['hp'],'99')
        self.assertEqual(listed['combat_profile']['authoring_mode'],'custom')
        self.app.resolve_npc_combat_profile=lambda npc:{'configured':True,'authoring_mode':'none','source':{'kind':'none'},'resolved':None}
        no_combat=self.client.get(f"/api/npcs/{record['id']}",headers=self.headers).json
        self.assertFalse(no_combat['combat_enabled'])
        self.assertEqual(no_combat['id'],record['id'])

    def test_adventurer_class_is_saved_as_profile_metadata(self):
        created=self.create(occupation='adventurer',character_class='Wizard').json
        self.assertEqual(created['profile_metadata']['occupation'],'adventurer')
        self.assertEqual(created['profile_metadata']['character_class'],'Wizard')
        updated=self.client.patch(f"/api/npcs/{created['id']}",json={
            'expected_revision':created['revision'],'occupation':'retired_adventurer','character_class':'Fighter'
        },headers=self.headers)
        self.assertEqual(updated.status_code,200,updated.json)
        self.assertEqual(updated.json['profile_metadata']['character_class'],'Fighter')

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

    def test_named_npc_can_be_created_from_catalog_monster(self):
        creature=self.CreatureCatalog(source='MM',name='Goblin',data={'name':'Goblin','source':'MM','size':['S'],'type':{'type':'humanoid','tags':['goblinoid']},'alignment':['N','E'],'ac':[15],'hp':{'average':7},'speed':{'walk':30},'str':8,'dex':14,'con':10,'int':10,'wis':8,'cha':8,'cr':'1/4','languages':['Common','Goblin'],'action':[{'name':'Scimitar','entries':['Melee Weapon Attack.']}]})
        self.db.session.add(creature);self.db.session.commit()
        result=self.client.post('/api/npcs',json={'catalog_creature_id':creature.id,'name':'Snik'},headers=self.headers)
        self.assertEqual(result.status_code,201,result.json)
        self.assertEqual(result.json['name'],'Snik');self.assertEqual(result.json['creature_subtype'],'goblinoid')
        self.assertEqual(result.json['profile_metadata']['catalog_creature_id'],creature.id)

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

    def test_birth_precision_is_saved_updated_and_cleared_with_revision_history(self):
        created=self.create(birth_year=1460,birth_season='Autumn').json
        self.assertEqual(created['birth_year'],1460);self.assertEqual(created['birth_season'],'Autumn')
        updated=self.client.patch(f"/api/npcs/{created['id']}",json={'expected_revision':created['revision'],'birth_year':1460,'birth_month_index':6,'birth_day':12},headers=self.headers)
        self.assertEqual(updated.status_code,200,updated.json);self.assertEqual(updated.json['birth_season'],'Summer')
        cleared=self.client.patch(f"/api/npcs/{created['id']}",json={'expected_revision':updated.json['revision'],'birth_year':None,'birth_season':None,'birth_month_index':None,'birth_day':None},headers=self.headers)
        self.assertEqual(cleared.status_code,200,cleared.json);self.assertIsNone(cleared.json['birth_year'])
