"""Run the actual endpoint functions against SQLite without loading unrelated app plugins."""
import ast
import math
from pathlib import Path
import unittest
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint
from sqlalchemy.exc import IntegrityError
from property_navigation import resolve_rest_route, destination_key


class RestActivityApiTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
        self.db = SQLAlchemy(self.app)
        db = self.db
        class Campaign(db.Model):
            id = db.Column(db.Integer, primary_key=True)
        class NPC(db.Model):
            id = db.Column(db.Integer, primary_key=True)
            campaign_id = db.Column(db.Integer)
            name = db.Column(db.String)
            profile_metadata = db.Column(db.JSON, nullable=False, default=dict, server_default='{}')
        class WorldAtlasLocation(db.Model):
            id = db.Column(db.Integer, primary_key=True)
            campaign_id = db.Column(db.Integer)
            buildings = db.Column(db.JSON)
            properties = db.Column(db.JSON)
        scope = dict(app=self.app, db=db, Campaign=Campaign, NPC=NPC, WorldAtlasLocation=WorldAtlasLocation,
            datetime=datetime, timezone=timezone, UniqueConstraint=UniqueConstraint, IntegrityError=IntegrityError,
            jsonify=jsonify, request=request, math=math, resolve_rest_route=resolve_rest_route, destination_key=destination_key,
            jwt_required=lambda: lambda function: function, user_can_edit_campaign=lambda campaign: request.headers.get('Role') == 'DM')
        model_tree = ast.parse((Path(__file__).parents[1] / 'tables.py').read_text())
        model = next(node for node in model_tree.body if isinstance(node, ast.ClassDef) and node.name == 'SettlementRestActivity')
        exec(compile(ast.Module(body=[model], type_ignores=[]), 'tables.py', 'exec'), scope)
        tree = ast.parse((Path(__file__).parents[1] / 'app.py').read_text())
        handlers = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ('rest_activity_context', 'settlement_rest_activities', 'update_settlement_rest_activity')]
        exec(compile(ast.Module(body=handlers, type_ignores=[]), 'app.py', 'exec'), scope)
        self.Activity = scope['SettlementRestActivity']
        self.context = self.app.app_context()
        self.context.push()
        db.create_all()
        db.session.add_all([Campaign(id=1), Campaign(id=2), NPC(id=1, campaign_id=1, name='A'), NPC(id=2, campaign_id=1, name='B'), NPC(id=3, campaign_id=2, name='Other campaign')])
        area = {'id': 'garden', 'name': 'Garden', 'activity_capabilities': ['rest'], 'walkable': True, 'occupancy_limit': 1, 'polygon': [{'x': 0, 'y': 0}, {'x': 10, 'y': 0}, {'x': 0, 'y': 10}]}
        db.session.add(WorldAtlasLocation(id=3, campaign_id=1, buildings=[], properties=[{'id': 'estate', 'outdoor_areas': [area]}]))
        db.session.commit()
        self.client = self.app.test_client()
        self.base = '/api/settlement-map/1/rest-activities'
        self.headers = {'Role': 'DM'}

    def tearDown(self):
        self.db.session.remove()
        self.db.drop_all()
        self.context.pop()

    def choose(self, npc=1, reserve=False, **extra):
        data = dict(settlement_id=3, npc_id=npc, permissions={}, preview=not reserve, **extra)
        if reserve:
            data['expected_destination_key'] = self.choose(npc).json.get('destination_key')
        return self.client.post(self.base, json=data, headers=self.headers)

    def test_reservation_survives_read_and_arrival_then_releases_capacity(self):
        self.assertEqual(self.choose().json['status'], 'route_request')
        reserved = self.choose(reserve=True)
        self.assertEqual(reserved.status_code, 201)
        self.assertEqual(reserved.json['state'], 'awaiting_arrival')
        record_id = reserved.json['id']
        self.assertEqual(self.choose(2).json['status'], 'no_route')
        data = self.client.get(self.base + '?settlement_id=3', headers=self.headers).json
        self.assertEqual(data['activities'][0]['id'], record_id)
        arrival = self.client.patch(f'{self.base}/{record_id}', json={'action': 'confirm_arrival'}, headers=self.headers)
        self.assertEqual(arrival.status_code, 200)
        self.assertEqual(arrival.json['state'], 'resting')
        self.assertEqual(self.choose(2).json['status'], 'no_route')
        self.assertEqual(self.client.delete(f'{self.base}/{record_id}', headers=self.headers).status_code, 200)
        self.assertEqual(self.choose(2).json['status'], 'route_request')

    def test_route_changed_after_reservation_rejects_arrival(self):
        reserved = self.choose(reserve=True).json
        location = self.db.session.get(self.db.Model.registry._class_registry['WorldAtlasLocation'], 3)
        location.properties = []
        self.db.session.commit()
        result = self.client.patch(f"{self.base}/{reserved['id']}", json={'action': 'confirm_arrival'}, headers=self.headers)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(self.db.session.get(self.Activity, reserved['id']).state, 'awaiting_arrival')

    def test_disabled_npc_is_hidden_and_cannot_reserve_until_enabled(self):
        npc_class = self.db.Model.registry._class_registry['NPC']
        npc = self.db.session.get(npc_class, 1)
        npc.profile_metadata = {'disabled': True}
        self.db.session.commit()
        context = self.client.get(self.base + '?settlement_id=3', headers=self.headers)
        self.assertEqual([record['id'] for record in context.json['npcs']], [2])
        self.assertEqual(self.choose().status_code, 400)
        self.assertEqual(self.Activity.query.count(), 0)
        npc.profile_metadata = {}
        self.db.session.commit()
        self.assertEqual(self.choose().json['status'], 'route_request')
        self.assertEqual(self.choose(reserve=True).status_code, 201)

    def test_permission_campaign_scope_and_bad_data(self):
        self.assertEqual(self.client.get(self.base + '?settlement_id=3').status_code, 403)
        self.assertEqual(self.choose(3).status_code, 400)
        self.assertEqual(self.client.get('/api/settlement-map/2/rest-activities?settlement_id=3', headers=self.headers).status_code, 404)
        self.assertEqual(self.client.post(self.base, json=['invalid'], headers=self.headers).status_code, 400)
        self.assertEqual(self.choose(clearance_width_feet=-1).status_code, 400)

    def test_stale_preview_does_not_reserve_a_different_destination(self):
        result = self.client.post(self.base, json={'settlement_id': 3, 'npc_id': 1, 'expected_destination_key': 'old'}, headers=self.headers)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(self.Activity.query.count(), 0)

    def test_duplicate_npc_and_capacity_constraints(self):
        record = self.choose(reserve=True).json
        self.assertEqual(self.choose(reserve=True).status_code, 409)
        existing = self.db.session.get(self.Activity, record['id'])
        self.db.session.add(self.Activity(campaign_id=1, settlement_id=3, npc_id=2, destination_key=existing.destination_key,
            capacity_slot=existing.capacity_slot, state='awaiting_arrival', route=existing.route, actor={}))
        with self.assertRaises(IntegrityError):
            self.db.session.commit()
        self.db.session.rollback()
