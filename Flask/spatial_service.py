"""Campaign-scoped spatial spaces, endpoints, connections, and graph assembly."""

from datetime import datetime, timezone
import json
import math
from uuid import UUID, NAMESPACE_URL, uuid4, uuid5

from tables import db, SpatialConnection, SpatialEndpoint, SpatialGraphLayout, SpatialSpace, WorldAtlasLocation


SPACE_TYPES = {'physical', 'extradimensional'}
SPACE_STATUSES = {'planned', 'draft', 'complete'}
ENDPOINT_STATUSES = {'planned', 'positioned'}
ENDPOINT_TYPES = {'doorway', 'archway', 'portal', 'arrival_point', 'other'}
CONNECTION_TYPES = {'physical', 'dimensional', 'teleportation'}
CONNECTION_STATUSES = {'draft', 'ready'}
GEOMETRY_SOURCES = {'settlement_building', 'space_blueprint'}
GEOMETRY_KINDS = {'opening', 'door', 'archway', 'portal', 'arrival_point'}
MAX_BLUEPRINT_BYTES = 1_000_000
MAX_LAYOUT_BYTES = 500_000


class SpatialValidationError(ValueError):
    pass


class SpatialConflictError(RuntimeError):
    pass


def _now():
    return datetime.now(timezone.utc)


def _uuid(value=None):
    if value is None:
        return str(uuid4())
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as error:
        raise SpatialValidationError('id must be a UUID') from error


def physical_space_id(campaign_id, settlement_id, building_id):
    return str(uuid5(NAMESPACE_URL, f'kachhapa:physical-space:{campaign_id}:{settlement_id}:{building_id}'))


def physical_space_key(campaign_id, settlement_id, building_id):
    return f'{campaign_id}:{settlement_id}:{building_id}'


def _object(value, field, nullable=False):
    if value is None and nullable:
        return None
    if not isinstance(value, dict):
        raise SpatialValidationError(f'{field} must be an object')
    return value


def _finite_vector(value, field, nullable=True):
    if value is None and nullable:
        return None
    value = _object(value, field)
    required = ('x', 'y', 'z')
    if not all(isinstance(value.get(axis), (int, float)) and not isinstance(value.get(axis), bool)
               and math.isfinite(value[axis]) for axis in required):
        raise SpatialValidationError(f'{field} must contain finite x, y, and z coordinates')
    return {axis: float(value[axis]) for axis in required}


def _boolean(data, field, default):
    value = data.get(field, default)
    if not isinstance(value, bool):
        raise SpatialValidationError(f'{field} must be a boolean')
    return value


def validate_independent_blueprint(blueprint):
    if blueprint is None:
        return None
    blueprint = _object(blueprint, 'independent_blueprint')
    if len(json.dumps(blueprint, separators=(',', ':'))) > MAX_BLUEPRINT_BYTES:
        raise SpatialValidationError('independent_blueprint exceeds 1 MB')
    levels = blueprint.get('levels', [])
    if not isinstance(levels, list):
        raise SpatialValidationError('independent_blueprint.levels must be an array')
    seen = set()
    element_ids = {'rooms': set(), 'openings': set()}
    for level in levels:
        if not isinstance(level, dict) or not level.get('id'):
            raise SpatialValidationError('Each independent blueprint level needs a stable ID')
        key = str(level['id'])
        if key in seen:
            raise SpatialValidationError('Independent blueprint level IDs must be unique')
        seen.add(key)
        for collection in ('rooms', 'openings'):
            values = level.get(collection, [])
            if not isinstance(values, list):
                raise SpatialValidationError(f'level.{collection} must be an array')
            for item in values:
                if not isinstance(item, dict) or not item.get('id'):
                    raise SpatialValidationError(f'Each {collection[:-1]} needs a stable ID')
                item_id = str(item['id'])
                if item_id in element_ids[collection]:
                    raise SpatialValidationError(f'{collection.capitalize()} IDs must be unique within a space')
                element_ids[collection].add(item_id)
            for room in level.get('rooms', []):
                region = room.get('region', [])
                if region and (not isinstance(region, list) or not all(
                        isinstance(point, dict) and all(
                            isinstance(point.get(axis), (int, float)) and not isinstance(point.get(axis), bool)
                            and math.isfinite(point[axis]) for axis in ('x', 'y')) for point in region)):
                    raise SpatialValidationError('Room regions must contain finite x and y coordinates')
    return blueprint


def sync_physical_spaces(campaign_id, settlement=None):
    locations = [settlement] if settlement is not None else WorldAtlasLocation.query.filter_by(campaign_id=campaign_id).all()
    created = []
    seen_keys = set()
    for location in locations:
        if not location or location.campaign_id != campaign_id:
            continue
        for building in location.buildings or []:
            if not isinstance(building, dict) or building.get('id') in (None, ''):
                continue
            building_id = str(building['id'])
            key = physical_space_key(campaign_id, location.id, building_id)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            space = SpatialSpace.query.filter_by(physical_key=key).first()
            if space:
                continue
            name = str(building.get('name') or 'Building').strip()[:140]
            space = SpatialSpace(
                id=physical_space_id(campaign_id, location.id, building_id), campaign_id=campaign_id,
                settlement_id=location.id, building_id=building_id, physical_key=key,
                name=f'{name} interior', space_type='physical', status='complete',
                coordinate_system={'unit': 'feet', 'origin': 'building_local'},
                environment_settings={}, details={'generated_for_building': True},
            )
            db.session.add(space)
            created.append(space)
    db.session.flush()
    return created


def _space(campaign_id, space_id):
    return SpatialSpace.query.filter_by(id=space_id, campaign_id=campaign_id).first()


def _endpoint(campaign_id, endpoint_id):
    return SpatialEndpoint.query.filter_by(id=endpoint_id, campaign_id=campaign_id).first()


def _parent_valid(campaign_id, space_id, parent_id):
    if parent_id is None:
        return
    parent = _space(campaign_id, parent_id)
    if not parent:
        raise SpatialValidationError('parent_space_id must reference a space in this campaign')
    seen = {space_id}
    while parent:
        if parent.id in seen:
            raise SpatialValidationError('Spatial space parents cannot form a cycle')
        seen.add(parent.id)
        parent = _space(campaign_id, parent.parent_space_id) if parent.parent_space_id else None


def create_space(campaign_id, data):
    data = _object(data, 'space')
    space_type = str(data.get('space_type') or 'extradimensional')
    status = str(data.get('status') or 'planned')
    if space_type not in SPACE_TYPES or status not in SPACE_STATUSES:
        raise SpatialValidationError('Invalid spatial space type or status')
    name = str(data.get('name') or '').strip()
    if not name:
        raise SpatialValidationError('Spatial space name is required')
    space_id = _uuid(data.get('id'))
    if SpatialSpace.query.filter_by(id=space_id).first():
        raise SpatialConflictError('Spatial space ID already exists')
    parent_id = data.get('parent_space_id')
    _parent_valid(campaign_id, space_id, parent_id)
    settlement_id = data.get('settlement_id')
    if settlement_id is not None and not WorldAtlasLocation.query.filter_by(id=settlement_id, campaign_id=campaign_id).first():
        raise SpatialValidationError('settlement_id must belong to this campaign')
    space = SpatialSpace(
        id=space_id, campaign_id=campaign_id, settlement_id=settlement_id,
        building_id=str(data['building_id']) if data.get('building_id') not in (None, '') else None,
        parent_space_id=parent_id, name=name[:160], space_type=space_type, status=status,
        coordinate_system=_object(data.get('coordinate_system', {'unit': 'feet', 'origin': 'space_local'}), 'coordinate_system'),
        environment_settings=_object(data.get('environment_settings', {}), 'environment_settings'),
        details=_object(data.get('metadata', {}), 'metadata'),
        independent_blueprint=validate_independent_blueprint(data.get('independent_blueprint')),
    )
    db.session.add(space)
    db.session.flush()
    return space


def update_space(space, data):
    data = _object(data, 'space')
    if 'space_type' in data and data['space_type'] != space.space_type:
        raise SpatialValidationError('space_type cannot be changed')
    if 'name' in data:
        name = str(data['name']).strip()
        if not name:
            raise SpatialValidationError('Spatial space name is required')
        space.name = name[:160]
    if 'status' in data:
        if data['status'] not in SPACE_STATUSES:
            raise SpatialValidationError('Invalid spatial space status')
        space.status = data['status']
    if 'parent_space_id' in data:
        _parent_valid(space.campaign_id, space.id, data['parent_space_id'])
        space.parent_space_id = data['parent_space_id']
    if 'settlement_id' in data or 'building_id' in data:
        if space.space_type == 'physical':
            raise SpatialValidationError('A physical space building association cannot be changed')
        settlement_id = data.get('settlement_id', space.settlement_id)
        if settlement_id is not None and not WorldAtlasLocation.query.filter_by(
                id=settlement_id, campaign_id=space.campaign_id).first():
            raise SpatialValidationError('settlement_id must belong to this campaign')
        space.settlement_id = settlement_id
        space.building_id = (str(data.get('building_id')).strip()
                             if data.get('building_id') not in (None, '') else None)
    for field in ('coordinate_system', 'environment_settings'):
        if field in data:
            setattr(space, field, _object(data[field], field))
    if 'metadata' in data:
        space.details = _object(data['metadata'], 'metadata')
    if 'independent_blueprint' in data:
        if space.physical_key:
            raise SpatialValidationError('The generated physical space uses its settlement building blueprint')
        space.independent_blueprint = validate_independent_blueprint(data['independent_blueprint'])
    space.updated_at = _now()
    db.session.flush()
    return space


def _geometry_reference(value):
    if value is None:
        return None
    value = _object(value, 'geometry_reference')
    if value.get('source') not in GEOMETRY_SOURCES or value.get('element_kind') not in GEOMETRY_KINDS:
        raise SpatialValidationError('Invalid geometry reference source or element kind')
    if not value.get('level_id') or not value.get('element_id'):
        raise SpatialValidationError('Geometry references require level_id and element_id')
    return value


def _validate_reference_source(space, reference):
    if reference is None:
        return
    expected = 'settlement_building' if space.physical_key else 'space_blueprint'
    if reference.get('source') != expected:
        raise SpatialValidationError(f'Geometry reference source for this space must be {expected}')


def create_endpoint(campaign_id, data):
    data = _object(data, 'endpoint')
    space = _space(campaign_id, data.get('space_id'))
    if not space:
        raise SpatialValidationError('space_id must reference a space in this campaign')
    endpoint_type = str(data.get('endpoint_type') or 'doorway')
    status = str(data.get('status') or 'planned')
    if endpoint_type not in ENDPOINT_TYPES or status not in ENDPOINT_STATUSES:
        raise SpatialValidationError('Invalid endpoint type or status')
    reference = _geometry_reference(data.get('geometry_reference'))
    _validate_reference_source(space, reference)
    endpoint = SpatialEndpoint(
        id=_uuid(data.get('id')), campaign_id=campaign_id, space_id=space.id,
        name=(str(data.get('name')).strip()[:160] if data.get('name') is not None else None),
        endpoint_type=endpoint_type, status=status,
        local_position=_finite_vector(data.get('local_position'), 'local_position'),
        local_orientation=_finite_vector(data.get('local_orientation'), 'local_orientation'),
        geometry_reference=reference,
        details=_object(data.get('metadata', {}), 'metadata'),
    )
    if SpatialEndpoint.query.filter_by(id=endpoint.id).first():
        raise SpatialConflictError('Spatial endpoint ID already exists')
    db.session.add(endpoint)
    db.session.flush()
    return endpoint


def update_endpoint(endpoint, data):
    data = _object(data, 'endpoint')
    if 'space_id' in data:
        space = _space(endpoint.campaign_id, data['space_id'])
        if not space:
            raise SpatialValidationError('space_id must reference a space in this campaign')
        endpoint.space_id = space.id
    if 'name' in data:
        endpoint.name = str(data['name']).strip()[:160] if data['name'] is not None else None
    if 'endpoint_type' in data:
        if data['endpoint_type'] not in ENDPOINT_TYPES:
            raise SpatialValidationError('Invalid endpoint type')
        endpoint.endpoint_type = data['endpoint_type']
    if 'status' in data:
        if data['status'] not in ENDPOINT_STATUSES:
            raise SpatialValidationError('Invalid endpoint status')
        endpoint.status = data['status']
    if 'local_position' in data:
        endpoint.local_position = _finite_vector(data['local_position'], 'local_position')
    if 'local_orientation' in data:
        endpoint.local_orientation = _finite_vector(data['local_orientation'], 'local_orientation')
    if 'geometry_reference' in data:
        reference = _geometry_reference(data['geometry_reference'])
        _validate_reference_source(_space(endpoint.campaign_id, endpoint.space_id), reference)
        endpoint.geometry_reference = reference
    if 'metadata' in data:
        endpoint.details = _object(data['metadata'], 'metadata')
    _validate_reference_source(_space(endpoint.campaign_id, endpoint.space_id), endpoint.geometry_reference)
    endpoint.updated_at = _now()
    db.session.flush()
    return endpoint


def create_connection(campaign_id, data):
    data = _object(data, 'connection')
    source = _endpoint(campaign_id, data.get('source_endpoint_id'))
    destination = _endpoint(campaign_id, data.get('destination_endpoint_id'))
    if not source or not destination:
        raise SpatialValidationError('Connection endpoints must belong to this campaign')
    if source.id == destination.id:
        raise SpatialValidationError('Connection endpoints must be different')
    connection_type = str(data.get('connection_type') or 'dimensional')
    status = str(data.get('status') or 'draft')
    if connection_type not in CONNECTION_TYPES or status not in CONNECTION_STATUSES:
        raise SpatialValidationError('Invalid connection type or status')
    duration = data.get('traversal_duration_seconds')
    if duration is not None and (not isinstance(duration, (int, float)) or isinstance(duration, bool)
                                 or not math.isfinite(duration) or duration < 0):
        raise SpatialValidationError('Traversal duration must be a nonnegative finite number')
    connection = SpatialConnection(
        id=_uuid(data.get('id')), campaign_id=campaign_id,
        source_endpoint_id=source.id, destination_endpoint_id=destination.id,
        connection_type=connection_type, bidirectional=_boolean(data, 'bidirectional', True),
        enabled=_boolean(data, 'enabled', True), status=status,
        traversal_duration_seconds=float(duration) if duration is not None else None,
        visible_through_opening=_boolean(data, 'visible_through_opening', False),
        transition_effect=_object(data.get('transition_effect'), 'transition_effect', nullable=True),
        details=_object(data.get('metadata', {}), 'metadata'),
    )
    if SpatialConnection.query.filter_by(id=connection.id).first():
        raise SpatialConflictError('Spatial connection ID already exists')
    db.session.add(connection)
    db.session.flush()
    return connection


def create_connected_space(campaign_id, data):
    """Atomically stage a space, placeholder endpoints, and optional connection."""
    data = _object(data, 'connected space')
    source_space = _space(campaign_id, data.get('source_space_id'))
    if not source_space:
        raise SpatialValidationError('source_space_id must reference a space in this campaign')
    space_data = _object(data.get('space'), 'space')
    space_data = {
        **space_data,
        'building_id': space_data.get('building_id', source_space.building_id),
        'settlement_id': space_data.get('settlement_id', source_space.settlement_id),
        'parent_space_id': space_data.get('parent_space_id', source_space.id),
    }
    space = create_space(campaign_id, space_data)
    source_endpoint = create_endpoint(campaign_id, {
        'space_id': source_space.id, 'name': data.get('source_endpoint_name') or 'Planned exit',
        'endpoint_type': data.get('source_endpoint_type') or 'doorway', 'status': 'planned',
    })
    destination_endpoint = create_endpoint(campaign_id, {
        'space_id': space.id, 'name': data.get('destination_endpoint_name') or 'Planned entrance',
        'endpoint_type': data.get('destination_endpoint_type') or 'doorway', 'status': 'planned',
    })
    connection_data = _object(data.get('connection', {}), 'connection')
    connection = create_connection(campaign_id, {
        **connection_data,
        'source_endpoint_id': source_endpoint.id,
        'destination_endpoint_id': destination_endpoint.id,
        'status': connection_data.get('status', 'draft'),
    })
    return space, source_endpoint, destination_endpoint, connection


def create_configured_connection(campaign_id, data):
    """Create placeholder endpoints and their connection in one transaction when needed."""
    data = _object(data, 'configured connection')
    endpoints = []
    for side in ('source', 'destination'):
        endpoint_id = data.get(f'{side}_endpoint_id')
        if endpoint_id:
            endpoint = _endpoint(campaign_id, endpoint_id)
            if not endpoint:
                raise SpatialValidationError(f'{side}_endpoint_id must belong to this campaign')
        else:
            space = _space(campaign_id, data.get(f'{side}_space_id'))
            if not space:
                raise SpatialValidationError(f'{side}_space_id must belong to this campaign')
            endpoint = create_endpoint(campaign_id, {
                'space_id': space.id, 'name': data.get(f'{side}_endpoint_name') or f'Planned {side}',
                'endpoint_type': data.get(f'{side}_endpoint_type') or 'doorway', 'status': 'planned',
            })
        endpoints.append(endpoint)
    connection_data = _object(data.get('connection', {}), 'connection')
    connection = create_connection(campaign_id, {
        **connection_data,
        'source_endpoint_id': endpoints[0].id,
        'destination_endpoint_id': endpoints[1].id,
    })
    return endpoints[0], endpoints[1], connection


def update_connection(connection, data):
    merged = connection_dict(connection, include_readiness=False)
    merged.update(_object(data, 'connection'))
    source = _endpoint(connection.campaign_id, merged.get('source_endpoint_id'))
    destination = _endpoint(connection.campaign_id, merged.get('destination_endpoint_id'))
    if not source or not destination or source.id == destination.id:
        raise SpatialValidationError('Connection endpoints must be distinct and belong to this campaign')
    if merged.get('connection_type') not in CONNECTION_TYPES or merged.get('status') not in CONNECTION_STATUSES:
        raise SpatialValidationError('Invalid connection type or status')
    duration = merged.get('traversal_duration_seconds')
    if duration is not None and (not isinstance(duration, (int, float)) or isinstance(duration, bool)
                                 or not math.isfinite(duration) or duration < 0):
        raise SpatialValidationError('Traversal duration must be a nonnegative finite number')
    for field in ('source_endpoint_id', 'destination_endpoint_id', 'connection_type', 'status'):
        setattr(connection, field, merged[field])
    connection.bidirectional = _boolean(merged, 'bidirectional', True)
    connection.enabled = _boolean(merged, 'enabled', True)
    connection.traversal_duration_seconds = float(duration) if duration is not None else None
    connection.visible_through_opening = _boolean(merged, 'visible_through_opening', False)
    connection.transition_effect = _object(merged.get('transition_effect'), 'transition_effect', nullable=True)
    connection.details = _object(merged.get('metadata', {}), 'metadata')
    connection.updated_at = _now()
    db.session.flush()
    return connection


def _blueprint_for_space(space):
    if not space.physical_key:
        return space.independent_blueprint
    location = WorldAtlasLocation.query.filter_by(id=space.settlement_id, campaign_id=space.campaign_id).first()
    if not location:
        return None
    return next((item for item in location.buildings or []
                 if isinstance(item, dict) and str(item.get('id')) == str(space.building_id)), None)


def endpoint_resolved(endpoint):
    if endpoint is None:
        return False
    if endpoint.status != 'positioned':
        return False
    if endpoint.local_position is not None:
        return True
    reference = endpoint.geometry_reference
    if not reference:
        return False
    space = _space(endpoint.campaign_id, endpoint.space_id)
    blueprint = _blueprint_for_space(space) if space else None
    if not blueprint:
        return False
    level = next((item for item in blueprint.get('levels', [])
                  if isinstance(item, dict) and str(item.get('id')) == str(reference.get('level_id'))), None)
    if not level:
        return False
    kind = reference.get('element_kind')
    collections = ('openings', 'doors') if kind in {'opening', 'door', 'archway', 'portal'} else ()
    return any(str(item.get('id')) == str(reference.get('element_id'))
               for collection in collections for item in level.get(collection, []) if isinstance(item, dict))


def connection_ready(connection, endpoints=None):
    endpoints = endpoints or {
        item.id: item for item in SpatialEndpoint.query.filter(
            SpatialEndpoint.id.in_([connection.source_endpoint_id, connection.destination_endpoint_id])).all()
    }
    return bool(connection.enabled and connection.status == 'ready'
                and endpoint_resolved(endpoints.get(connection.source_endpoint_id))
                and endpoint_resolved(endpoints.get(connection.destination_endpoint_id)))


def space_dict(space, include_blueprint=True):
    value = {
        'id': space.id, 'campaign_id': space.campaign_id, 'settlement_id': space.settlement_id,
        'building_id': space.building_id, 'parent_space_id': space.parent_space_id,
        'name': space.name, 'space_type': space.space_type, 'status': space.status,
        'coordinate_system': space.coordinate_system or {},
        'environment_settings': space.environment_settings or {}, 'metadata': space.details or {},
        'created_at': space.created_at.isoformat() if space.created_at else None,
        'updated_at': space.updated_at.isoformat() if space.updated_at else None,
    }
    if include_blueprint:
        value['independent_blueprint'] = space.independent_blueprint
    return value


def endpoint_dict(endpoint):
    return {
        'id': endpoint.id, 'campaign_id': endpoint.campaign_id, 'space_id': endpoint.space_id,
        'name': endpoint.name, 'endpoint_type': endpoint.endpoint_type, 'status': endpoint.status,
        'local_position': endpoint.local_position, 'local_orientation': endpoint.local_orientation,
        'geometry_reference': endpoint.geometry_reference, 'metadata': endpoint.details or {},
        'resolved': endpoint_resolved(endpoint),
        'created_at': endpoint.created_at.isoformat() if endpoint.created_at else None,
        'updated_at': endpoint.updated_at.isoformat() if endpoint.updated_at else None,
    }


def connection_dict(connection, endpoints=None, include_readiness=True):
    value = {
        'id': connection.id, 'campaign_id': connection.campaign_id,
        'source_endpoint_id': connection.source_endpoint_id,
        'destination_endpoint_id': connection.destination_endpoint_id,
        'connection_type': connection.connection_type, 'bidirectional': connection.bidirectional,
        'enabled': connection.enabled, 'status': connection.status,
        'traversal_duration_seconds': connection.traversal_duration_seconds,
        'visible_through_opening': connection.visible_through_opening,
        'transition_effect': connection.transition_effect, 'metadata': connection.details or {},
        'created_at': connection.created_at.isoformat() if connection.created_at else None,
        'updated_at': connection.updated_at.isoformat() if connection.updated_at else None,
    }
    if include_readiness:
        value['ready_for_traversal'] = connection_ready(connection, endpoints)
    return value


def _room_summaries(space):
    blueprint = _blueprint_for_space(space) or {}
    return [
        {'id': room.get('id'), 'name': room.get('name') or room.get('purpose') or 'Room',
         'purpose': room.get('purpose'), 'level_id': level.get('id')}
        for level in blueprint.get('levels', []) if isinstance(level, dict)
        for room in level.get('rooms', []) if isinstance(room, dict) and room.get('id')
    ]


def _opening_summaries(space):
    blueprint = _blueprint_for_space(space) or {}
    summaries = []
    for level in blueprint.get('levels', []):
        if not isinstance(level, dict) or not level.get('id'):
            continue
        for opening in level.get('openings', []):
            if not isinstance(opening, dict) or not opening.get('id'):
                continue
            kind = str(opening.get('kind') or 'door')
            if kind in {'window', 'curtain'}:
                continue
            summaries.append({
                'id': str(opening['id']), 'level_id': str(level.get('id')),
                'level_name': level.get('name'), 'kind': kind,
                'element_kind': 'archway' if kind == 'archway' else ('portal' if kind == 'portal' else 'door'),
                'name': opening.get('name') or opening.get('label') or kind.replace('_', ' ').title(),
            })
    return summaries


def spatial_graph(campaign_id, settlement_id, building_id):
    location = WorldAtlasLocation.query.filter_by(id=settlement_id, campaign_id=campaign_id).first()
    if not location:
        raise SpatialValidationError('Settlement not found in this campaign')
    if not any(isinstance(item, dict) and str(item.get('id')) == str(building_id)
               for item in location.buildings or []):
        raise SpatialValidationError('Building not found in this settlement')
    sync_physical_spaces(campaign_id, location)
    root = SpatialSpace.query.filter_by(
        campaign_id=campaign_id, settlement_id=settlement_id, building_id=str(building_id),
        physical_key=physical_space_key(campaign_id, settlement_id, str(building_id))).first()
    if not root:
        raise SpatialValidationError('Building not found in this settlement')
    all_endpoints = SpatialEndpoint.query.filter_by(campaign_id=campaign_id).all()
    endpoint_by_id = {item.id: item for item in all_endpoints}
    all_connections = SpatialConnection.query.filter_by(campaign_id=campaign_id).all()
    space_ids = {
        item.id for item in SpatialSpace.query.filter_by(campaign_id=campaign_id, building_id=str(building_id)).all()
        if item.settlement_id in (None, settlement_id)
    }
    space_ids.add(root.id)
    changed = True
    while changed:
        changed = False
        endpoint_ids = {item.id for item in all_endpoints if item.space_id in space_ids}
        for connection in all_connections:
            if connection.source_endpoint_id in endpoint_ids or connection.destination_endpoint_id in endpoint_ids:
                for endpoint_id in (connection.source_endpoint_id, connection.destination_endpoint_id):
                    endpoint = endpoint_by_id.get(endpoint_id)
                    if endpoint and endpoint.space_id not in space_ids:
                        space_ids.add(endpoint.space_id)
                        changed = True
    spaces = SpatialSpace.query.filter(SpatialSpace.campaign_id == campaign_id, SpatialSpace.id.in_(space_ids)).all()
    endpoints = [item for item in all_endpoints if item.space_id in space_ids]
    endpoint_ids = {item.id for item in endpoints}
    connections = [item for item in all_connections
                   if item.source_endpoint_id in endpoint_ids and item.destination_endpoint_id in endpoint_ids]
    endpoint_map = {item.id: item for item in endpoints}
    return {
        'campaign_id': campaign_id, 'settlement_id': settlement_id, 'building_id': str(building_id),
        'root_space_id': root.id,
        'spaces': [{
            **space_dict(item, include_blueprint=False),
            'geometry_source': 'settlement_building' if item.physical_key else 'space_blueprint',
            'rooms': _room_summaries(item), 'openings': _opening_summaries(item),
        } for item in spaces],
        'endpoints': [endpoint_dict(item) for item in endpoints],
        'connections': [connection_dict(item, endpoint_map) for item in connections],
    }


def graph_layout(campaign_id, settlement_id, building_id, view_mode):
    if view_mode not in {'space', 'room'}:
        raise SpatialValidationError('view must be space or room')
    return SpatialGraphLayout.query.filter_by(
        campaign_id=campaign_id, settlement_id=settlement_id,
        building_id=str(building_id), view_mode=view_mode).first()


def save_graph_layout(campaign_id, settlement_id, building_id, view_mode, value):
    location = WorldAtlasLocation.query.filter_by(id=settlement_id, campaign_id=campaign_id).first()
    if not location or not any(isinstance(item, dict) and str(item.get('id')) == str(building_id)
                               for item in location.buildings or []):
        raise SpatialValidationError('Building not found in this settlement')
    value = _object(value, 'layout')
    if len(json.dumps(value, separators=(',', ':'))) > MAX_LAYOUT_BYTES:
        raise SpatialValidationError('Spatial graph layout exceeds 500 KB')
    nodes = value.get('nodes', {})
    viewport = value.get('viewport', {})
    if not isinstance(nodes, dict) or len(nodes) > 2000:
        raise SpatialValidationError('layout.nodes must be an object with at most 2000 entries')
    for node_id, position in nodes.items():
        if not isinstance(node_id, str) or not isinstance(position, dict) or not all(
                isinstance(position.get(axis), (int, float)) and not isinstance(position.get(axis), bool)
                and math.isfinite(position[axis]) for axis in ('x', 'y')):
            raise SpatialValidationError('Every graph node needs finite x and y coordinates')
    if viewport and (not isinstance(viewport, dict) or not all(
            isinstance(viewport.get(axis), (int, float)) and not isinstance(viewport.get(axis), bool)
            and math.isfinite(viewport[axis]) for axis in ('x', 'y', 'zoom'))):
        raise SpatialValidationError('layout.viewport must contain finite x, y, and zoom values')
    item = graph_layout(campaign_id, settlement_id, building_id, view_mode)
    if not item:
        item = SpatialGraphLayout(campaign_id=campaign_id, settlement_id=settlement_id,
                                  building_id=str(building_id), view_mode=view_mode)
        db.session.add(item)
    item.layout = value
    item.updated_at = _now()
    db.session.flush()
    return item


def delete_space(space):
    if SpatialEndpoint.query.filter_by(space_id=space.id).first() or SpatialSpace.query.filter_by(parent_space_id=space.id).first():
        raise SpatialConflictError('Remove dependent endpoints and child spaces before deleting this space')
    if space.physical_key:
        location = WorldAtlasLocation.query.filter_by(id=space.settlement_id, campaign_id=space.campaign_id).first()
        if location and any(isinstance(item, dict) and str(item.get('id')) == str(space.building_id)
                            for item in location.buildings or []):
            raise SpatialConflictError('Generated physical spaces cannot be deleted while their building exists')
    db.session.delete(space)


def delete_endpoint(endpoint):
    if SpatialConnection.query.filter(
            (SpatialConnection.source_endpoint_id == endpoint.id)
            | (SpatialConnection.destination_endpoint_id == endpoint.id)).first():
        raise SpatialConflictError('Remove dependent connections before deleting this endpoint')
    db.session.delete(endpoint)
