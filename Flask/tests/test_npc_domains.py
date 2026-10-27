import unittest
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_jwt_extended import JWTManager, create_access_token
from flask_sqlalchemy import SQLAlchemy

from npc_domains import register_npc_domains, resolve_combat_profile


class NpcDomainApiTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', JWT_SECRET_KEY='test-secret-key-longer-than-thirty-two-bytes')
        JWTManager(app)
        db = SQLAlchemy(app)

        class Campaign(db.Model):
            id = db.Column(db.Integer, primary_key=True)
            system = db.Column(db.String, default='D&D')
            ruleset = db.Column(db.String, default='5e')
            @property
            def rules_system(self): return 'D&D 5e'

        class NPC(db.Model):
            id = db.Column(db.Integer, primary_key=True); campaign_id = db.Column(db.Integer, nullable=False)
            name = db.Column(db.String); revision = db.Column(db.Integer, default=1); profile_metadata = db.Column(db.JSON, default=dict)
            size = db.Column(db.String, default='Medium'); creature_type = db.Column(db.String, default='humanoid'); creature_subtype = db.Column(db.String)
            alignment = db.Column(db.String, default='neutral'); ac = db.Column(db.String, default='10'); hp = db.Column(db.String, default='4'); speed = db.Column(db.Integer, default=30)
            strength = db.Column(db.Integer, default=10); dexterity = db.Column(db.Integer, default=10); constitution = db.Column(db.Integer, default=10)
            intelligence = db.Column(db.Integer, default=10); wisdom = db.Column(db.Integer, default=10); charisma = db.Column(db.Integer, default=10)
            saving_throws = db.Column(db.String, default=''); skills = db.Column(db.String, default=''); immunities = db.Column(db.String, default='')
            resistance = db.Column(db.String, default=''); senses = db.Column(db.String, default=''); languages = db.Column(db.String, default='')
            challenge = db.Column(db.String, default='0'); traits = db.Column(db.String, default=''); actions = db.Column(db.String, default='')
            def to_dict(self): return {'id':self.id,'campaign_id':self.campaign_id,'name':self.name,'revision':self.revision,'profile_metadata':self.profile_metadata or {}}

        class OccupationDefinition(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer);occupation_key=db.Column(db.String);name=db.Column(db.String)
            ability_weights=db.Column(db.JSON,default=dict);target_workers=db.Column(db.Integer,default=0);minimum_suitability=db.Column(db.Float,default=.42)
            base_wage_cp=db.Column(db.Integer,default=20);produces_commodity_key=db.Column(db.String);description=db.Column(db.Text);category=db.Column(db.String)
            schedule_archetype=db.Column(db.JSON,default=dict);activity_weights=db.Column(db.JSON,default=dict);is_custom=db.Column(db.Boolean,default=True);active=db.Column(db.Boolean,default=True)
            __table_args__=(db.UniqueConstraint('campaign_id','occupation_key'),)
            def to_dict(self): return {'id':self.id,'key':self.occupation_key,'name':self.name,'description':self.description,'category':self.category,'schedule_archetype':self.schedule_archetype or {},'activity_weights':self.activity_weights or {},'is_custom':self.is_custom,'active':self.active}

        class NpcOccupationAssociation(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer);npc_id=db.Column(db.Integer);occupation_id=db.Column(db.Integer)
            status=db.Column(db.String);is_primary=db.Column(db.Boolean);started_at_world_date=db.Column(db.JSON);ended_at_world_date=db.Column(db.JSON)
            notes=db.Column(db.Text);provenance=db.Column(db.JSON)
            def to_dict(self): return {key:getattr(self,key) for key in ('id','campaign_id','npc_id','occupation_id','status','is_primary','started_at_world_date','ended_at_world_date','notes','provenance')}

        class NpcRoleAssignment(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer);npc_id=db.Column(db.Integer);occupation_association_id=db.Column(db.Integer)
            position_title=db.Column(db.String);organization_name=db.Column(db.String);organization_element_id=db.Column(db.Integer);employer_business_id=db.Column(db.Integer)
            noble_family_id=db.Column(db.Integer);workplace_location_id=db.Column(db.Integer);workplace=db.Column(db.JSON);responsibilities=db.Column(db.JSON)
            schedule_override=db.Column(db.JSON);status=db.Column(db.String);is_primary=db.Column(db.Boolean);priority=db.Column(db.Integer);compensation_cp=db.Column(db.Integer)
            compensation_period=db.Column(db.String);started_at_world_date=db.Column(db.JSON);ended_at_world_date=db.Column(db.JSON);provenance=db.Column(db.JSON)
            def to_dict(self): return {key:getattr(self,key) for key in ('id','campaign_id','npc_id','occupation_association_id','position_title','organization_name','organization_element_id','employer_business_id','noble_family_id','workplace_location_id','workplace','responsibilities','schedule_override','status','is_primary','priority','compensation_cp','compensation_period','started_at_world_date','ended_at_world_date','provenance')}

        class NpcSocialPosition(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer);npc_id=db.Column(db.Integer);name=db.Column(db.String);category=db.Column(db.String)
            organization_name=db.Column(db.String);organization_element_id=db.Column(db.Integer);status=db.Column(db.String);is_primary=db.Column(db.Boolean)
            started_at_world_date=db.Column(db.JSON);ended_at_world_date=db.Column(db.JSON);notes=db.Column(db.Text);provenance=db.Column(db.JSON)
            def to_dict(self): return {key:getattr(self,key) for key in ('id','campaign_id','npc_id','name','category','organization_name','organization_element_id','status','is_primary','started_at_world_date','ended_at_world_date','notes','provenance')}

        class NpcCombatProfile(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer);npc_id=db.Column(db.Integer);name=db.Column(db.String)
            authoring_mode=db.Column(db.String);ruleset_id=db.Column(db.String);ruleset_version=db.Column(db.String);template_creature_id=db.Column(db.Integer)
            character_id=db.Column(db.Integer);custom_definition=db.Column(db.JSON);overrides=db.Column(db.JSON);spellcasting=db.Column(db.JSON)
            is_active=db.Column(db.Boolean);provenance=db.Column(db.JSON);created_at=db.Column(db.DateTime,default=lambda:datetime.now(timezone.utc));updated_at=db.Column(db.DateTime)
            def to_dict(self): return {key:getattr(self,key) for key in ('id','campaign_id','npc_id','name','authoring_mode','ruleset_id','ruleset_version','template_creature_id','character_id','custom_definition','overrides','spellcasting','is_active','provenance')}

        class NpcClassProgression(db.Model):
            id=db.Column(db.Integer,primary_key=True);combat_profile_id=db.Column(db.Integer);class_element_id=db.Column(db.Integer);subclass_element_id=db.Column(db.Integer)
            class_name=db.Column(db.String);subclass_name=db.Column(db.String);level=db.Column(db.Integer);choices=db.Column(db.JSON);source_ruleset=db.Column(db.String);display_order=db.Column(db.Integer)
            def to_dict(self): return {key:getattr(self,key) for key in ('id','combat_profile_id','class_element_id','subclass_element_id','class_name','subclass_name','level','choices','source_ruleset','display_order')}

        class CreatureCatalog(db.Model):
            id=db.Column(db.Integer,primary_key=True);source=db.Column(db.String);name=db.Column(db.String);data=db.Column(db.JSON)
        class Character(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaignID=db.Column(db.Integer);character_name=db.Column(db.String);Class=db.Column(db.String)
            def to_dict(self): return {'id':self.id,'Name':self.character_name,'Class':self.Class}
        class GameElement(db.Model):
            id=db.Column(db.Integer,primary_key=True);element_type=db.Column(db.String);system=db.Column(db.String);name=db.Column(db.String)
        class SettlementBusiness(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer)
        class NobleFamily(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer)
        class WorldAtlasLocation(db.Model):
            id=db.Column(db.Integer,primary_key=True);campaign_id=db.Column(db.Integer)
        class NpcProfileHistory(db.Model):
            id=db.Column(db.Integer,primary_key=True);npc_id=db.Column(db.Integer);revision=db.Column(db.Integer);snapshot=db.Column(db.JSON)
        class NpcScheduleDefinition(db.Model):
            id=db.Column(db.Integer,primary_key=True);npc_id=db.Column(db.Integer);revision=db.Column(db.Integer);document=db.Column(db.JSON);warnings=db.Column(db.JSON)

        def context(require_editor=False):
            if request.headers.get('Role') != 'DM': return None,None,(jsonify(message='Forbidden'),403)
            return db.session.get(Campaign,1),None,None

        models=locals()
        models['catalog_campaign_context']=context
        register_npc_domains(app,db,models)
        self.app,self.db,self.models=app,db,models
        self.ctx=app.app_context();self.ctx.push();db.create_all()
        db.session.add_all([Campaign(id=1),Campaign(id=2),NPC(id=1,campaign_id=1,name='Elion',revision=1,profile_metadata={'occupation':'Adventurer'}),
            OccupationDefinition(id=1,campaign_id=1,occupation_key='researcher',name='Researcher',active=True),
            OccupationDefinition(id=2,campaign_id=1,occupation_key='adventurer',name='Adventurer',active=True),
            OccupationDefinition(id=3,campaign_id=2,occupation_key='clergy',name='Clergy',active=True),
            GameElement(id=1,element_type='class',system='D&D 5e',name='Wizard'),
            GameElement(id=2,element_type='class',system='D&D 5e',name='Rogue'),
            GameElement(id=3,element_type='subclass',system='D&D 5e',name='Thief'),
            GameElement(id=4,element_type='subclass',system='Pathfinder',name='Wrong Ruleset'),
            CreatureCatalog(id=1,source='MM',name='Commoner',data={'name':'Commoner','size':['M'],'type':'humanoid','alignment':['N'],'ac':[10],'hp':{'average':4},'speed':{'walk':30},'str':10,'dex':10,'con':10,'int':10,'wis':10,'cha':10}),
            Character(id=1,campaignID=1,character_name='Elion PC',Class='Wizard')]);db.session.commit()
        self.client=app.test_client();self.headers={'Role':'DM','Authorization':'Bearer '+create_access_token(identity='dm')}

    def tearDown(self): self.db.session.remove();self.db.drop_all();self.ctx.pop()

    def put(self,payload): return self.client.put('/api/npcs/1/domains',json={'expected_revision':self.db.session.get(self.models['NPC'],1).revision,**payload},headers=self.headers)

    def test_unconfigured_npc_retains_legacy_combat_without_inference(self):
        result=self.client.get('/api/npcs/1/domains',headers=self.headers).json
        self.assertEqual(result['resolved_combat_profile']['authoring_mode'],'legacy')
        self.assertEqual(result['resolved_combat_profile']['resolved']['hp'],'4')
        self.assertNotIn('class_progression',result['resolved_combat_profile']['source'])

    def test_campaign_can_create_and_edit_a_custom_occupation_archetype(self):
        created=self.client.post('/api/npcs/occupation-definitions',json={'name':'Glassblower','category':'artisan','schedule_archetype':{'start':'07:00','activity':'work'}},headers=self.headers)
        self.assertEqual(created.status_code,201,created.json)
        updated=self.client.patch(f"/api/npcs/occupation-definitions/{created.json['id']}",json={'name':'Master Glassblower','activity_weights':{'craft':.8}},headers=self.headers)
        self.assertEqual(updated.status_code,200,updated.json)
        self.assertEqual(updated.json['name'],'Master Glassblower')
        self.assertEqual(updated.json['activity_weights'],{'craft':.8})

    def test_occupations_history_roles_and_social_position_are_independent(self):
        response=self.put({'occupations':[
            {'occupation_id':1,'status':'current','is_primary':True},
            {'occupation_id':2,'status':'former','is_primary':False,'ended_at_world_date':{'year':1491},'notes':'Retired from active expeditions'},
        ],'roles':[{'occupation_id':1,'position_title':'Independent Arcane Researcher','organization_name':'None','priority':20,'responsibilities':['Research']}],
        'social_positions':[{'name':'Tower proprietor','category':'property','status':'active'}]})
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(len(response.json['occupations']),2)
        self.assertEqual(response.json['roles'][0]['position_title'],'Independent Arcane Researcher')
        self.assertEqual(response.json['resolved_combat_profile']['authoring_mode'],'legacy')

    def test_class_profile_supports_levels_without_changing_occupation(self):
        response=self.put({'occupations':[{'occupation_id':1,'status':'current','is_primary':True}],
            'combat_profile':{'authoring_mode':'class','character_id':1,'class_progression':[{'class_element_id':1,'class_name':'Wizard','level':18}]}})
        self.assertEqual(response.status_code,200,response.json)
        resolved=response.json['resolved_combat_profile']
        self.assertEqual(resolved['resolved']['character_level'],18)
        self.assertEqual(response.json['occupations'][0]['occupation']['name'],'Researcher')

    def test_multiclass_progression_is_repeatable_and_subclasses_are_ruleset_scoped(self):
        response=self.put({'combat_profile':{'authoring_mode':'class','class_progression':[
            {'class_element_id':1,'class_name':'Wizard','level':7},
            {'class_element_id':2,'subclass_element_id':3,'class_name':'Rogue','subclass_name':'Thief','level':3},
        ]}})
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.json['resolved_combat_profile']['resolved']['character_level'],10)
        rejected=self.put({'combat_profile':{'id':response.json['combat_profiles'][0]['id'],'authoring_mode':'class','class_progression':[
            {'class_element_id':1,'subclass_element_id':4,'class_name':'Wizard','level':7},
        ]}})
        self.assertEqual(rejected.status_code,400)
        self.assertIn('Subclass is not available',rejected.json['message'])

    def test_template_is_not_converted_to_pc_class(self):
        response=self.put({'combat_profile':{'authoring_mode':'template','template_creature_id':1}})
        self.assertEqual(response.status_code,200,response.json)
        resolved=response.json['resolved_combat_profile']
        self.assertEqual(resolved['source']['kind'],'creature_template')
        self.assertEqual(resolved['resolved']['creature_type'],'humanoid')
        self.assertNotIn('classes',resolved['resolved'])

    def test_template_overrides_do_not_mutate_the_catalog_definition(self):
        response=self.put({'combat_profile':{'authoring_mode':'template','template_creature_id':1,'overrides':{'hp':'12'}}})
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.json['resolved_combat_profile']['resolved']['hp'],'12')
        self.assertEqual(self.db.session.get(self.models['CreatureCatalog'],1).data['hp']['average'],4)

    def test_spellcaster_level_does_not_create_wizard_levels(self):
        response=self.put({'combat_profile':{'authoring_mode':'custom','custom_definition':{'spellcaster_level':9},'spellcasting':{'ability':'charisma'}}})
        self.assertEqual(response.status_code,200,response.json)
        resolved=response.json['resolved_combat_profile']
        self.assertEqual(resolved['resolved']['spellcaster_level'],9)
        self.assertNotIn('classes',resolved['resolved'])

    def test_mode_change_requires_confirmation_and_retains_alternate(self):
        self.assertEqual(self.put({'combat_profile':{'authoring_mode':'custom','custom_definition':{'hp':'20'}}}).status_code,200)
        rejected=self.put({'combat_profile':{'authoring_mode':'none'}})
        self.assertEqual(rejected.status_code,400)
        accepted=self.put({'confirm_combat_mode_change':True,'combat_profile':{'authoring_mode':'none'}})
        self.assertEqual(accepted.status_code,200,accepted.json)
        self.assertEqual(len(accepted.json['combat_profiles']),2)
        self.assertEqual(accepted.json['resolved_combat_profile']['authoring_mode'],'none')

    def test_cross_campaign_and_conflicting_primary_occupations_are_rejected(self):
        cross=self.put({'occupations':[{'occupation_id':3,'status':'current','is_primary':True}]})
        self.assertEqual(cross.status_code,400)
        duplicate=self.put({'occupations':[{'occupation_id':1,'status':'current','is_primary':True},{'occupation_id':2,'status':'current','is_primary':True}]})
        self.assertEqual(duplicate.status_code,400)

    def test_schedule_suggestion_uses_life_domains_without_a_combat_profile(self):
        saved=self.put({'occupations':[{'occupation_id':1,'status':'current','is_primary':True}],
            'roles':[{'occupation_id':1,'position_title':'Independent researcher','priority':8,'schedule_override':{'start':'11:00','duration_minutes':180,'activity':'study','room_purposes':['laboratory']}}]})
        self.assertEqual(saved.status_code,200,saved.json)
        response=self.client.post('/api/npcs/1/schedule-suggestion',json={},headers=self.headers)
        self.assertEqual(response.status_code,200,response.json)
        self.assertEqual(response.json['schedule']['rules'][0]['activity'],'study')
        self.assertEqual(response.json['schedule']['bindings']['role-1-workplace']['room_purposes'],['laboratory'])
        self.assertNotIn('combat_profile',str(response.json))


class CombatResolverTests(unittest.TestCase):
    def test_none_mode_has_no_resolved_stat_block(self):
        class Npc: pass
        class Profile:
            id=1;authoring_mode='none';ruleset_id='D&D';ruleset_version='5e';overrides={};spellcasting={};provenance={};template_creature_id=None;character_id=None
        result=resolve_combat_profile(Npc(),Profile())
        self.assertIsNone(result['resolved'])


if __name__ == '__main__':
    unittest.main()
