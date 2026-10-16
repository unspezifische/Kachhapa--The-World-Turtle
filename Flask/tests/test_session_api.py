"""Real HTTP/SQL transaction tests using a minimal SQLite campaign fixture."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token, get_jwt_identity
from flask_sqlalchemy import SQLAlchemy
from session_api import register_session_api


def fixture():
    app = Flask(__name__)
    app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', JWT_SECRET_KEY='session-test-secret-with-at-least-32-characters', TESTING=True)
    db = SQLAlchemy(app)
    JWTManager(app)

    class Campaign(db.Model):
        id = db.Column(db.Integer, primary_key=True)
        name = db.Column(db.String)
    class Character(db.Model):
        id = db.Column(db.Integer, primary_key=True)
        userID = db.Column(db.Integer)
        campaignID = db.Column(db.Integer)
        character_name = db.Column(db.String)
    class PartyMapPosition(db.Model):
        campaign_id = db.Column(db.Integer, primary_key=True)
        x = db.Column(db.Float, default=0)
        y = db.Column(db.Float, default=0)
        map_key = db.Column(db.String, default='test')
        def to_dict(self): return dict(x=self.x,y=self.y,map_key=self.map_key)
    class CampaignSessionState(db.Model):
        campaign_id = db.Column(db.Integer, primary_key=True)
        revision = db.Column(db.Integer)
        document = db.Column(db.JSON)
    class SessionCommandReceipt(db.Model):
        campaign_id = db.Column(db.Integer, primary_key=True)
        request_id = db.Column(db.String, primary_key=True)
        fingerprint = db.Column(db.String)
        revision = db.Column(db.Integer)
    class Calendar(db.Model):
        campaign_id = db.Column(db.Integer, primary_key=True)
        current_year = db.Column(db.Integer, default=1)
        current_month_index = db.Column(db.Integer, default=0)
        current_day = db.Column(db.Integer, default=1)
        current_hour = db.Column(db.Integer, default=0)
        current_minute = db.Column(db.Integer, default=0)
        current_second = db.Column(db.Integer, default=0)
        def get_hours_in_day(self): return 24
        def get_minutes_in_hour(self): return 60
        def to_dict(self): return dict(current_date={key:getattr(self,'current_'+key) for key in ['year','month_index','day','hour','minute','second']})
    class QuickNote(db.Model):
        id = db.Column(db.Integer, primary_key=True)
        campaign_id = db.Column(db.Integer)
        user_id = db.Column(db.Integer)
        character_id = db.Column(db.Integer)
        content = db.Column(db.String)
    campaign_members = db.Table('campaign_members', db.Column('campaignID', db.Integer), db.Column('characterID', db.Integer), db.Column('userID', db.Integer))
    def context(cid):
        return (SimpleNamespace(id=1),Campaign.query.get(cid),get_jwt_identity()=='dm',None) if cid==1 else (None,None,None,None)
    ns = dict(locals(), dashboard_campaign_context=context, socketio=Mock(), emit_calendar_updated=Mock(),emit_settlement_simulation_updated=Mock(),
              date_to_ordinal=lambda cal,y,m,d:(y-1)*360+m*30+d-1,
              ordinal_to_date=lambda cal,n:(n//360+1,(n%360)//30,n%30+1),get_months=lambda cal:[{}]*12,days_in_month=lambda cal,y,m:30)
    register_session_api(app,ns)
    return app, db, ns


class SessionApiTests(unittest.TestCase):
    def setUp(self):
        self.app,self.db,self.ns=fixture()
        self.ctx=self.app.app_context(); self.ctx.push()
        self.db.create_all()
        self.db.session.add(self.ns['Campaign'](id=1,name='Test'))
        self.db.session.add(self.ns['Character'](id=1,userID=2,campaignID=1,character_name='Player'))
        self.db.session.add(self.ns['Calendar'](campaign_id=1))
        self.db.session.add(self.ns['QuickNote'](id=1,campaign_id=1,user_id=99,content='Other DM private note'))
        self.db.session.commit()
        self.client=self.app.test_client()
        self.headers={'Authorization':'Bearer '+create_access_token(identity='dm')}
        self.seq=0
    def tearDown(self):
        self.db.session.remove(); self.db.drop_all(); self.ctx.pop()
    def get(self): return self.client.get('/api/campaigns/1/sessions',headers=self.headers)
    def post(self,action,data=None,revision=None,key=None):
        self.seq+=1
        payload=dict(action=action,data=data or {},revision=self.get().json['revision'] if revision is None else revision,request_id=key or str(self.seq))
        return self.client.post('/api/campaigns/1/sessions/commands',headers=self.headers,json=payload)
    def start(self):
        r=self.post('create_session',{'title':'First'})
        sid=r.json['document']['sessions'][0]['id']
        self.post('roster',dict(session_id=sid,character_id=1,attendance='present',participation='player'))
        return self.post('lifecycle',dict(session_id=sid,status='active',confirm_roster=True))
    def test_authentication_and_campaign_isolation(self):
        self.assertEqual(self.client.get('/api/campaigns/1/sessions').status_code,401)
        player={'Authorization':'Bearer '+create_access_token(identity='player')}
        self.assertEqual(self.client.get('/api/campaigns/1/sessions',headers=player).status_code,403)
        self.assertEqual(self.client.get('/api/campaigns/2/sessions',headers=self.headers).status_code,403)
        self.assertEqual(self.client.post('/api/campaigns/2/sessions/commands',headers=self.headers,json={}).status_code,403)
    def test_persistence_dedup_and_revision_conflict(self):
        first=self.post('create_session',{'title':'First'},revision=0,key='same')
        replay=self.post('create_session',{'title':'First'},revision=0,key='same')
        self.assertEqual(first.status_code,200)
        self.assertTrue(replay.json['replayed'])
        self.assertEqual(len(self.get().json['document']['sessions']),1)
        self.assertEqual(self.post('create_session',{'title':'Different'},revision=0,key='same').status_code,400)
        conflict=self.post('create_session',{'title':'Stale'},revision=0)
        self.assertEqual(conflict.status_code,409)
        self.assertEqual(conflict.json['revision'],1)
        self.db.session.remove()
        self.assertEqual(self.get().json['document']['sessions'][0]['title'],'First')
    def test_roster_includes_legacy_membership_characters(self):
        self.db.session.add(self.ns['Character'](id=8,userID=3,campaignID=None,character_name='Legacy character'))
        self.db.session.execute(self.ns['campaign_members'].insert().values(campaignID=1,characterID=8,userID=3))
        self.db.session.commit()
        self.assertEqual({c['id'] for c in self.get().json['roster']},{1,8})

    def test_invalid_commands_rollback(self):
        self.post('create_session',{'title':'First'})
        before=self.get().json
        result=self.post('group',dict(name='Bad',members=['999']))
        self.assertEqual(result.status_code,400)
        self.assertEqual(before,self.get().json)
    def test_private_notes_and_external_wiki_links_rejected(self):
        sid=self.post('create_session',{'title':'First'}).json['document']['sessions'][0]['id']
        self.assertEqual(self.post('reference',dict(session_id=sid,reference={'kind':'note','note_id':1})).status_code,400)
        self.assertEqual(self.post('reference',dict(session_id=sid,reference={'kind':'wiki','label':'Bad','url':'https://example.com/'})).status_code,400)
        self.assertEqual(self.post('reference',dict(session_id=sid,reference={'kind':'wiki','label':'Good','url':'/wiki/Test/Main%20Page'})).status_code,200)
    def test_shared_calendar_seconds_rollover_and_snapshot(self):
        self.start()
        self.ns['shared_session_calendar_change'](1,{'year':1,'month_index':0,'day':30,'hour':23,'minute':59,'second':58},setting=True)
        self.ns['shared_session_calendar_change'](1,{'seconds':6})
        date=self.get().json['calendar']['current_date']
        self.assertEqual((date['month_index'],date['day'],date['minute'],date['second']),(1,1,0,4))
        self.assertEqual(self.post('set_time',{'date':{'hour':99}}).status_code,400)
    def test_notifications_do_not_leak_private_document(self):
        self.start()
        for call in self.ns['socketio'].emit.call_args_list:
            self.assertEqual(call.args[0],'session_state_updated')
            self.assertEqual(call.args[1],{'campaign_id':1})
    def test_public_encounter_excludes_private_prep_and_template_notes(self):
        self.start()
        saved=self.post('template',dict(name='Guard',notes='Secret plot',participants=[{'name':'Guard','quantity':1}]))
        tid=saved.json['document']['templates'][0]['id']
        start=self.post('start_encounter',dict(template_id=tid,characters=[]))
        self.assertEqual(start.status_code,200)
        public=self.client.get('/api/campaigns/1/encounter-state',headers={'Authorization':'Bearer '+create_access_token(identity='player')})
        self.assertEqual(public.status_code,200)
        self.assertNotIn('Secret plot',public.get_data(as_text=True))
        self.assertEqual(set(public.json['encounter']),{'combatants','turn','round','started'})
        self.assertEqual(public.json['encounter']['combatants'][0]['characterName'],'Guard')
        self.assertEqual(self.client.get('/api/campaigns/2/encounter-state',headers=self.headers).status_code,403)

    def test_legacy_position_does_not_collapse_groups(self):
        self.start()
        self.db.session.add(self.ns['Character'](id=2,userID=3,campaignID=1,character_name='Second')); self.db.session.commit()
        self.post('group',dict(name='Split',members=['2']))
        from session_management import SessionError
        with self.assertRaises(SessionError): self.ns['shared_session_legacy_position'](1,{'x':20,'y':30})
        self.db.session.rollback()


if __name__=='__main__': unittest.main()
