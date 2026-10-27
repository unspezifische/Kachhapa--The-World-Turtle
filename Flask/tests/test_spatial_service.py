import unittest

from flask import Flask
from sqlalchemy import text

from tables import db, SpatialConnection, SpatialEndpoint, SpatialGraphLayout, SpatialSpace, WorldAtlasLocation
from spatial_service import (
    SpatialConflictError, SpatialValidationError, connection_ready, create_configured_connection,
    create_connected_space, create_connection, create_endpoint, create_space, delete_endpoint,
    delete_space, physical_space_id, save_graph_layout, spatial_graph,
    sync_physical_spaces, update_space,
)


class SpatialServiceTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(SQLALCHEMY_DATABASE_URI='sqlite://', TESTING=True)
        db.init_app(self.app)
        self.context = self.app.app_context()
        self.context.push()
        db.session.execute(text('CREATE TABLE campaign (id INTEGER PRIMARY KEY)'))
        db.session.execute(text('INSERT INTO campaign (id) VALUES (1), (2)'))
        WorldAtlasLocation.__table__.create(db.engine)
        SpatialSpace.__table__.create(db.engine)
        SpatialEndpoint.__table__.create(db.engine)
        SpatialConnection.__table__.create(db.engine)
        SpatialGraphLayout.__table__.create(db.engine)
        self.location = WorldAtlasLocation(
            id=10, campaign_id=1, name='Waterdeep', map_key='waterdeep',
            buildings=[{'id': 'tower', 'name': 'Kolat Towers', 'width_feet': 30,
                        'levels': [{'id': 'third', 'rooms': [{'id': 'stairs', 'name': 'Stair'}],
                                    'openings': [{'id': 'tower-door'}]}]}],
        )
        db.session.add(self.location)
        db.session.commit()

    def tearDown(self):
        db.session.remove()
        self.context.pop()

    def test_physical_space_backfill_is_idempotent_and_preserves_blueprint(self):
        original = self.location.buildings
        self.assertEqual(len(sync_physical_spaces(1, self.location)), 1)
        db.session.commit()
        self.assertEqual(sync_physical_spaces(1, self.location), [])
        space = SpatialSpace.query.one()
        self.assertEqual(space.id, physical_space_id(1, 10, 'tower'))
        self.assertEqual(space.space_type, 'physical')
        self.assertIsNone(space.independent_blueprint)
        self.assertEqual(self.location.buildings, original)

    def test_extradimensional_blueprint_can_exceed_building_and_hold_many_rooms(self):
        space = create_space(1, {
            'name': 'Extradimensional Library', 'space_type': 'extradimensional', 'status': 'draft',
            'building_id': 'tower', 'settlement_id': 10,
            'independent_blueprint': {'width_feet': 100, 'depth_feet': 70, 'levels': [{
                'id': 'library-ground', 'rooms': [
                    {'id': 'main-library', 'name': 'Main Library'},
                    {'id': 'archives', 'name': 'Archives'},
                ], 'openings': [{'id': 'library-door'}],
            }]},
        })
        db.session.commit()
        self.assertEqual(len(space.independent_blueprint['levels'][0]['rooms']), 2)
        self.assertEqual(self.location.buildings[0]['width_feet'], 30)

    def test_planned_physical_annex_does_not_replace_generated_building_root(self):
        generated = sync_physical_spaces(1, self.location)[0]
        annex = create_space(1, {
            'name': 'Physical Annex', 'space_type': 'physical', 'status': 'planned',
            'settlement_id': 10, 'building_id': 'tower',
            'independent_blueprint': {'levels': []},
        })
        db.session.commit()

        self.assertIsNone(annex.physical_key)
        self.assertEqual(annex.independent_blueprint, {'levels': []})
        graph = spatial_graph(1, 10, 'tower')
        self.assertEqual(graph['root_space_id'], generated.id)
        self.assertEqual({item['id'] for item in graph['spaces']}, {generated.id, annex.id})
        generated_summary = next(item for item in graph['spaces'] if item['id'] == generated.id)
        annex_summary = next(item for item in graph['spaces'] if item['id'] == annex.id)
        self.assertEqual(generated_summary['geometry_source'], 'settlement_building')
        self.assertEqual(generated_summary['openings'][0]['id'], 'tower-door')
        self.assertEqual(annex_summary['geometry_source'], 'space_blueprint')

    def test_planned_spaces_endpoints_and_draft_connection_need_no_geometry(self):
        source_space = create_space(1, {'name': 'A'})
        destination_space = create_space(1, {'name': 'B'})
        source = create_endpoint(1, {'space_id': source_space.id, 'name': 'Unplaced A'})
        destination = create_endpoint(1, {'space_id': destination_space.id, 'name': 'Unplaced B'})
        connection = create_connection(1, {
            'source_endpoint_id': source.id, 'destination_endpoint_id': destination.id,
            'connection_type': 'dimensional', 'enabled': True, 'status': 'draft',
        })
        db.session.commit()
        self.assertFalse(connection_ready(connection))

    def test_multiple_entrances_cross_floor_cycles_and_one_way_connections(self):
        spaces = [create_space(1, {'name': name}) for name in ('A', 'B', 'C')]
        endpoints = []
        for index, space in enumerate(spaces):
            endpoints.append(create_endpoint(1, {
                'space_id': space.id, 'name': f'In {index}', 'status': 'positioned',
                'local_position': {'x': index, 'y': index * 20, 'z': 0},
            }))
        extra = create_endpoint(1, {'space_id': spaces[0].id, 'status': 'positioned',
                                     'local_position': {'x': 5, 'y': 60, 'z': 0}})
        connections = [
            create_connection(1, {'source_endpoint_id': endpoints[0].id, 'destination_endpoint_id': endpoints[1].id,
                                  'connection_type': 'physical', 'status': 'ready'}),
            create_connection(1, {'source_endpoint_id': endpoints[1].id, 'destination_endpoint_id': endpoints[2].id,
                                  'connection_type': 'teleportation', 'status': 'ready', 'bidirectional': False}),
            create_connection(1, {'source_endpoint_id': endpoints[2].id, 'destination_endpoint_id': extra.id,
                                  'connection_type': 'dimensional', 'status': 'ready'}),
        ]
        db.session.commit()
        self.assertTrue(all(connection_ready(item) for item in connections))
        self.assertFalse(connections[1].bidirectional)

    def test_parent_cycles_cross_campaign_links_and_restricted_deletion_fail(self):
        first = create_space(1, {'name': 'First'})
        second = create_space(1, {'name': 'Second', 'parent_space_id': first.id})
        with self.assertRaises(SpatialValidationError):
            update_space(first, {'parent_space_id': second.id})

    def test_cross_campaign_connections_and_dependent_deletions_are_rejected(self):
        first = create_space(1, {'name': 'First'})
        other = create_space(2, {'name': 'Other'})
        endpoint = create_endpoint(1, {'space_id': first.id})
        other_endpoint = create_endpoint(2, {'space_id': other.id})
        with self.assertRaises(SpatialValidationError):
            create_connection(1, {'source_endpoint_id': endpoint.id,
                                  'destination_endpoint_id': other_endpoint.id})
        with self.assertRaises(SpatialConflictError):
            delete_space(first)
        connection_target = create_endpoint(1, {'space_id': first.id})
        connection = create_connection(1, {'source_endpoint_id': endpoint.id,
                                           'destination_endpoint_id': connection_target.id})
        with self.assertRaises(SpatialConflictError):
            delete_endpoint(endpoint)
        db.session.delete(connection)
        db.session.flush()
        delete_endpoint(endpoint)
        self.assertIsNotNone(db.session.get(SpatialSpace, first.id))

    def test_graph_returns_connected_spaces_rooms_and_readiness_without_blueprints(self):
        physical = sync_physical_spaces(1, self.location)[0]
        library = create_space(1, {'name': 'Library', 'building_id': 'tower',
            'independent_blueprint': {'levels': [{'id': 'ground', 'rooms': [{'id': 'reading', 'name': 'Reading Room'}],
                                                  'openings': []}]}})
        source = create_endpoint(1, {'space_id': physical.id, 'status': 'positioned',
            'geometry_reference': {'source': 'settlement_building', 'level_id': 'third',
                                   'element_kind': 'opening', 'element_id': 'tower-door'}})
        target = create_endpoint(1, {'space_id': library.id})
        create_connection(1, {'source_endpoint_id': source.id, 'destination_endpoint_id': target.id,
                              'connection_type': 'dimensional', 'status': 'ready'})
        db.session.commit()
        result = spatial_graph(1, 10, 'tower')
        self.assertEqual({item['name'] for item in result['spaces']}, {'Kolat Towers interior', 'Library'})
        self.assertNotIn('independent_blueprint', result['spaces'][0])
        self.assertEqual([room['id'] for space in result['spaces'] for room in space['rooms']], ['stairs', 'reading'])
        self.assertFalse(result['connections'][0]['ready_for_traversal'])

    def test_graph_includes_disconnected_planned_spaces_for_the_building(self):
        sync_physical_spaces(1, self.location)
        planned = create_space(1, {'name': 'Unconnected Laboratory', 'settlement_id': 10, 'building_id': 'tower'})
        other = create_space(1, {'name': 'Other Building Room', 'settlement_id': 10, 'building_id': 'other'})
        db.session.commit()
        ids = {item['id'] for item in spatial_graph(1, 10, 'tower')['spaces']}
        self.assertIn(planned.id, ids)
        self.assertNotIn(other.id, ids)

    def test_atomic_graph_first_helpers_and_layout_persistence(self):
        physical = sync_physical_spaces(1, self.location)[0]
        library, source, destination, connection = create_connected_space(1, {
            'source_space_id': physical.id,
            'space': {'name': 'Library'},
            'connection': {'connection_type': 'dimensional', 'bidirectional': False},
        })
        self.assertEqual((source.space_id, destination.space_id), (physical.id, library.id))
        self.assertEqual(connection.connection_type, 'dimensional')
        self.assertFalse(connection.bidirectional)
        other_source, other_destination, second = create_configured_connection(1, {
            'source_space_id': physical.id, 'destination_space_id': library.id,
            'destination_endpoint_id': destination.id,
            'connection': {'connection_type': 'teleportation'},
        })
        self.assertEqual(other_destination.id, destination.id)
        self.assertEqual(other_source.status, 'planned')
        self.assertEqual(second.connection_type, 'teleportation')
        layout = save_graph_layout(1, 10, 'tower', 'space', {
            'nodes': {physical.id: {'x': 12, 'y': 24}}, 'viewport': {'x': 1, 'y': 2, 'zoom': .75},
        })
        db.session.commit()
        self.assertEqual(layout.layout['nodes'][physical.id], {'x': 12, 'y': 24})
        self.assertEqual(SpatialGraphLayout.query.count(), 1)


if __name__ == '__main__':
    unittest.main()
