"""HTTP/transaction coverage: no contrast gate, private themes and atomic replacement."""
import unittest
from copy import deepcopy
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager,create_access_token
from appearance import register_appearance,PRESETS

class AppearanceTests(unittest.TestCase):
    def setUp(self):
        app=Flask(__name__);app.config.update(TESTING=True,SQLALCHEMY_DATABASE_URI='sqlite://',JWT_SECRET_KEY='appearance-secret-at-least-thirty-two-characters')
        db=SQLAlchemy(app);JWTManager(app)
        class User(db.Model):
            id=db.Column(db.Integer,primary_key=True)
            username=db.Column(db.String)
        class UserAppearance(db.Model):
            user_id=db.Column(db.Integer,primary_key=True)
            revision=db.Column(db.Integer)
            preferences=db.Column(db.JSON)
        class UserColorTheme(db.Model):
            id=db.Column(db.String,primary_key=True)
            user_id=db.Column(db.Integer)
            name=db.Column(db.String)
            version=db.Column(db.Integer)
            revision=db.Column(db.Integer)
            palettes=db.Column(db.JSON)
        register_appearance(app,dict(db=db,User=User,UserAppearance=UserAppearance,UserColorTheme=UserColorTheme,SHARED_SESSION_COOKIE='kachhapa_session'))
        self.app=app;self.db=db;self.ctx=app.app_context();self.ctx.push();db.create_all();db.session.add_all([User(id=1,username='one'),User(id=2,username='two')]);db.session.commit()
        self.client=app.test_client();self.token=create_access_token(identity='one');self.headers={'Authorization':'Bearer '+self.token};self.other={'Authorization':'Bearer '+create_access_token(identity='two')}
    def tearDown(self):
        self.db.session.remove();self.db.drop_all();self.ctx.pop()
    def state(self,headers=None):return self.client.get('/api/appearance',headers=headers or self.headers).json
    def create(self,palettes=None):
        response=self.client.post('/api/appearance/themes',headers=self.headers,json=dict(revision=self.state()['revision'],name='Personal',palettes=palettes or deepcopy(PRESETS['themes'][0]['palettes'])))
        self.assertEqual(response.status_code,200,response.json);return response.json,next(t['id'] for t in response.json['themes'] if not t['builtin'])
    def test_auth_cookie_csrf_and_private_cache(self):
        self.assertEqual(self.client.get('/api/appearance').status_code,401)
        self.client.set_cookie('kachhapa_session',self.token)
        r=self.client.get('/api/appearance');self.assertEqual(r.status_code,200);self.assertEqual(r.json['username'],'one');self.assertIn('no-store',r.headers['Cache-Control'])
        self.assertEqual(self.client.patch('/api/appearance',json={'mode':'light'},headers={'Origin':'http://evil.example'}).status_code,403)
        self.assertEqual(self.client.patch('/api/appearance',data='mode=light').status_code,400)
        self.assertEqual(self.state()['mode'],'dark')
    def test_first_save_preserves_existing_local_mode(self):
        headers={**self.headers,'X-Appearance-Mode':'light'}
        self.assertEqual(self.client.get('/api/appearance',headers=headers).json['mode'],'light')
        r=self.client.post('/api/appearance/themes',headers=headers,json=dict(revision=0,name='Light user',palettes=PRESETS['themes'][0]['palettes']))
        self.assertEqual(r.status_code,200);self.assertEqual(self.state()['mode'],'light')
    def test_valid_solid_color_and_literal_only(self):
        palettes={m:{k:'#121212' for k in PRESETS['themes'][0]['palettes'][m]} for m in ['dark','light']}
        state,tid=self.create(palettes);self.assertEqual(state['assignments']['kachhapa'],'kachhapa')
        self.assertEqual(next(t for t in state['themes'] if t['id']==tid)['palettes'],palettes)
        palettes['dark']['accent']='url(javascript:alert(1))'
        self.assertEqual(self.client.patch('/api/appearance/themes/'+tid,headers=self.headers,json=dict(revision=state['revision'],name='Bad',palettes=palettes)).status_code,400)
        self.assertEqual(self.state()['revision'],state['revision'])
    def test_ownership_assignment_rename_conflict_delete(self):
        state,tid=self.create()
        self.assertFalse(any(t['id']==tid for t in self.state(self.other)['themes']))
        self.assertEqual(self.client.patch('/api/appearance/themes/'+tid,headers=self.other,json={}).status_code,404)
        self.assertEqual(self.client.patch('/api/appearance',headers=self.other,json=dict(revision=0,assignments={'mtg':tid})).status_code,400)
        self.assertEqual(self.client.patch('/api/appearance',headers=self.headers,json=dict(revision=state['revision'],assignments={'kachhapa':tid,'mtg':tid})).status_code,200)
        self.assertEqual(self.client.patch('/api/appearance',headers=self.headers,json=dict(revision=state['revision'],assignments={'wiki':tid})).status_code,409)
        state=self.state();r=self.client.patch('/api/appearance/themes/'+tid,headers=self.headers,json=dict(revision=state['revision'],name='Renamed',palettes=state['themes'][-1]['palettes']))
        self.assertEqual(r.status_code,200);self.assertEqual(r.json['assignments']['mtg'],tid)
        revision=r.json['revision']
        self.assertEqual(self.client.delete('/api/appearance/themes/'+tid,headers=self.headers,json=dict(revision=revision)).status_code,400)
        r=self.client.delete('/api/appearance/themes/'+tid,headers=self.headers,json=dict(revision=revision,replacement_id='settlement'));self.assertEqual(r.status_code,200);self.assertEqual(r.json['assignments']['mtg'],'settlement');self.assertEqual(r.json['assignments']['kachhapa'],'settlement')
        self.assertEqual(self.client.delete('/api/appearance/themes/kachhapa',headers=self.headers,json=dict(revision=r.json['revision'])).status_code,404)
    def test_bad_assignment_shapes_and_alpha(self):
        for value in [[],{},7,None]:
            self.assertEqual(self.client.patch('/api/appearance',headers=self.headers,json=dict(revision=0,assignments={'mtg':value})).status_code,400)
        palettes=deepcopy(PRESETS['themes'][0]['palettes']);palettes['light']['accent']='#12121200';self.create(palettes)
        r=self.client.patch('/api/appearance',headers=self.headers,json={'mode':'light'});self.assertEqual(r.status_code,200);self.assertEqual(r.json['mode'],'light')
