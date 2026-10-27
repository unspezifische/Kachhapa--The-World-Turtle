"""Exercise revisioned NPC map placement endpoints with an isolated SQLite app."""
import ast
import math
from datetime import datetime, timezone
from pathlib import Path
import unittest

from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import UniqueConstraint


class NpcMapPlacementApiTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite://'
        self.db = SQLAlchemy(self.app)
        db = self.db

        class Campaign(db.Model):
            id = db.Column(db.Integer, primary_key=True)

        class NPC(db.Model):
            id = db.Column(db.Integer, primary_key=True)
            campaign_id = db.Column(db.Integer, nullable=False)
            name = db.Column(db.String, nullable=False)
            profile_metadata = db.Column(db.JSON, nullable=False, default=dict)
            def to_dict(self): return {'id': self.id, 'name': self.name}

        class WorldAtlasLocation(db.Model):
            id = db.Column(db.Integer, primary_key=True)
            campaign_id = db.Column(db.Integer, nullable=False)

        def catalog_campaign_context(require_editor=False):
            if request.headers.get('Role') != 'DM':
                return None, None, (jsonify({'message': 'Forbidden'}), 403)
            campaign_id = int(request.headers.get('CampaignID', 1))
            campaign = db.session.get(Campaign, campaign_id)
            return campaign, None, None if campaign else (jsonify({'message': 'Campaign not found'}), 404)

        scope = dict(app=self.app, db=db, Campaign=Campaign, NPC=NPC, WorldAtlasLocation=WorldAtlasLocation,
                     datetime=datetime, timezone=timezone, UniqueConstraint=UniqueConstraint, jsonify=jsonify,
                     request=request, math=math, catalog_campaign_context=catalog_campaign_context,
                     jwt_required=lambda: lambda function: function)
        model_tree = ast.parse((Path(__file__).parents[1] / 'tables.py').read_text())
        model = next(node for node in model_tree.body if isinstance(node, ast.ClassDef) and node.name == 'NpcMapPlacement')
        exec(compile(ast.Module(body=[model], type_ignores=[]), 'tables.py', 'exec'), scope)
        app_tree = ast.parse((Path(__file__).parents[1] / 'app.py').read_text())
        handlers = [node for node in app_tree.body if isinstance(node, ast.FunctionDef) and node.name in
                    ('npc_map_campaign', 'npc_map_placements', 'npc_map_placement')]
        scope['NpcMapPlacement'] = scope['NpcMapPlacement']
        exec(compile(ast.Module(body=handlers, type_ignores=[]), 'app.py', 'exec'), scope)
        self.Placement = scope['NpcMapPlacement']
        self.context = self.app.app_context(); self.context.push(); db.create_all()
        db.session.add_all([Campaign(id=1), Campaign(id=2), NPC(id=7, campaign_id=1, name='Snik'),
                            NPC(id=8, campaign_id=2, name='Other'), WorldAtlasLocation(id=3, campaign_id=1),
                            WorldAtlasLocation(id=4, campaign_id=2)])
        db.session.commit()
        self.client = self.app.test_client(); self.headers = {'Role': 'DM', 'CampaignID': '1'}

    def tearDown(self):
        self.db.session.remove(); self.db.drop_all(); self.context.pop()

    def test_create_move_hide_list_and_delete(self):
        created = self.client.put('/api/npcs/7/map-placement', headers=self.headers,
                                  json={'settlement_id': 3, 'x': 12.5, 'y': 18, 'visible': True})
        self.assertEqual(created.status_code, 201, created.json)
        self.assertEqual(created.json['revision'], 1)
        listed = self.client.get('/api/settlement-map/1/npc-placements?settlement_id=3', headers=self.headers).json
        self.assertEqual(listed['manual_npc_ids'], [7]); self.assertEqual(listed['placements'][0]['x'], 12.5)
        stale = self.client.put('/api/npcs/7/map-placement', headers=self.headers,
                                json={'settlement_id': 3, 'x': 20, 'y': 30, 'expected_revision': 0})
        self.assertEqual(stale.status_code, 409)
        hidden = self.client.put('/api/npcs/7/map-placement', headers=self.headers,
                                 json={'settlement_id': 3, 'visible': False, 'expected_revision': 1})
        self.assertEqual(hidden.status_code, 200); self.assertFalse(hidden.json['visible']); self.assertEqual(hidden.json['revision'], 2)
        self.assertEqual(self.client.delete('/api/npcs/7/map-placement', headers=self.headers).status_code, 204)
        self.assertEqual(self.Placement.query.count(), 0)

    def test_authorization_campaign_and_coordinate_validation(self):
        self.assertEqual(self.client.get('/api/settlement-map/1/npc-placements?settlement_id=3').status_code, 403)
        self.assertEqual(self.client.get('/api/settlement-map/2/npc-placements?settlement_id=4', headers=self.headers).status_code, 403)
        self.assertEqual(self.client.put('/api/npcs/8/map-placement', headers=self.headers, json={'settlement_id': 3, 'x': 1, 'y': 2}).status_code, 404)
        self.assertEqual(self.client.put('/api/npcs/7/map-placement', headers=self.headers, json={'settlement_id': 4, 'x': 1, 'y': 2}).status_code, 404)
        self.assertEqual(self.client.put('/api/npcs/7/map-placement', headers=self.headers, json={'settlement_id': 3, 'x': 'bad', 'y': 2}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
