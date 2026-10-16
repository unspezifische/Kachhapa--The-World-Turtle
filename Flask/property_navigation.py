"""Semantic route adapter. A route request is not proof of a collision-free path."""
from collections import deque
import math
from property_destinations import settlement_destinations, destination_key


def _passable(opening, actor):
    if opening.get('state') == 'locked' or opening.get('blocked'):
        return False
    policy = opening.get('access_policy') or 'public'
    if policy != 'public' and not (actor.get('authorized') or actor.get({'residents': 'resident', 'staff': 'staff'}.get(policy, 'authorized'))):
        return False
    width = opening.get('width', opening.get('width_feet'))
    height = opening.get('height', opening.get('height_feet'))
    if width is not None and float(width) < float(actor.get('clearance_width_feet') or 0):
        return False
    if height is not None and float(height) < float(actor.get('clearance_height_feet') or 0):
        return False
    kind = opening.get('opening_kind') or opening.get('kind')
    return kind in ('archway', 'open_passage') or opening.get('state') != 'closed' or actor.get('can_open_doors', False)


def _portal_step(opening, kind, **extra):
    return {'kind': kind, 'id': opening.get('id'),
            'action': 'open' if opening.get('state') == 'closed' and (opening.get('opening_kind') or opening.get('kind')) not in ('archway', 'open_passage') else 'pass', **extra}


def _property_entry(parcel, actor):
    boundary = parcel.get('boundary') or {}
    segments = boundary.get('segments') or []
    if not segments:
        return {'kind': 'unbounded', 'id': parcel.get('id')}
    for segment in segments:
        if segment.get('treatment', 'none') == 'none':
            return {'kind': 'open_boundary', 'id': segment.get('id')}
        for opening in segment.get('openings') or []:
            if _passable(opening, actor):
                return _portal_step(opening, 'boundary_portal', segment_id=segment.get('id'))
    return None


def _vertical(levels, ground, target, actor):
    if ground['id'] == target['id']:
        return []
    edges = {level['id']: [] for level in levels}
    for level in levels:
        for stair in level.get('stairs') or []:
            if stair.get('blocked') or (stair.get('width') is not None and float(stair['width']) < float(actor.get('clearance_width_feet') or 0)):
                continue
            target_id = stair.get('target_level_id') or stair.get('connects_to_level_id')
            rise = float(stair.get('total_rise_feet') or 0)
            next_level = next((candidate for candidate in levels if candidate['id'] == target_id), None) if target_id else next((candidate for candidate in levels if rise > 0 and abs(float(candidate.get('elevation_feet') or 0) - float(level.get('elevation_feet') or 0) - rise) < .5), None)
            if next_level and next_level['id'] != level['id']:
                for start, end in ((level, next_level), (next_level, level)):
                    edges[start['id']].append({'kind': 'stairs', 'id': stair.get('id'), 'from_floor_id': start['id'], 'to_floor_id': end['id']})
    queue = deque([(ground['id'], [])])
    seen = {ground['id']}
    while queue:
        floor, path = queue.popleft()
        for step in edges[floor]:
            if step['to_floor_id'] in seen:
                continue
            next_path = path + [step]
            if step['to_floor_id'] == target['id']:
                return next_path
            seen.add(step['to_floor_id'])
            queue.append((step['to_floor_id'], next_path))
    return None



def resolve_rest_route(buildings, properties, actor=None, reservations=None, preferred_id=None):
    actor = actor or {}
    reservations = reservations or []
    candidates = settlement_destinations(buildings, properties, 'rest', actor)
    by_building = {str(building.get('id')): building for building in buildings}
    by_property = {str(parcel.get('id')): parcel for parcel in properties}
    position = actor.get('position') or {}
    def rank(destination):
        point = destination['point']
        distance = math.hypot(point['x'] - float(position.get('x') or 0), point['y'] - float(position.get('y') or 0)) if position else 0
        return (destination['id'] != preferred_id, distance, destination_key(destination))
    for destination in sorted(candidates, key=rank):
        parcel = by_property.get(str(destination.get('property_id')), {'id': destination.get('property_id')})
        entry = _property_entry(parcel, actor)
        if entry is None:
            continue
        steps = [entry, {'kind': 'cross_property', 'id': parcel.get('id')}]
        if destination['kind'] == 'room':
            building = by_building[str(destination['structure_id'])]
            levels = building.get('levels') or []
            ground = next((level for level in levels if float(level.get('elevation_feet') or 0) == 0), levels[0] if levels else None)
            target = next((level for level in levels if level.get('id') == destination['floor_id']), None)
            if not ground or not target:
                continue
            openings = ground.get('openings') or ground.get('doors') or []
            entrance = next((opening for opening in openings if (opening.get('kind') or 'door') in ('door', 'double_door', 'archway', 'open_passage') and _passable(opening, actor)), None)
            if not entrance:
                continue
            vertical = _vertical(levels, ground, target, actor)
            if vertical is None:
                continue
            room = next(room for room in target.get('rooms') or [] if isinstance(room, dict) and room.get('id') == destination['id'])
            links = room.get('linked_portal_ids') or []
            portals = target.get('openings') or target.get('doors') or []
            if links:
                room_portal = next((opening for opening in portals if opening.get('id') in links and _passable(opening, actor)), None)
                if not room_portal:
                    continue
            else:
                room_portal = None
            steps.extend([_portal_step(entrance, 'structure_portal', floor_id=ground['id']), *vertical])
            if room_portal and room_portal.get('id') != entrance.get('id'):
                steps.append(_portal_step(room_portal, 'room_portal', floor_id=target['id']))
            limit, occupancy = room.get('occupancy_limit'), int(room.get('current_occupancy') or 0)
        else:
            area = next(area for area in parcel.get('outdoor_areas') or [] if area.get('id') == destination['id'])
            limit, occupancy = area.get('occupancy_limit'), int(area.get('current_occupancy') or 0)
        key = destination_key(destination)
        reserved = sum(1 for item in reservations if item.get('destination_key') == key)
        if limit is not None and occupancy + reserved >= int(limit):
            continue
        steps.append({'kind': destination['kind'], 'id': destination['id']})
        return {'status': 'route_request', 'destination': destination, 'destination_key': key,
                'steps': steps, 'capacity': limit, 'current_occupancy': occupancy,
                'path_status': 'requires_path_planner_or_dm_arrival',
                'room_semantics': 'Capabilities are provisional; furniture availability is not modeled.'}
    return {'status': 'no_route', 'reason': 'No permitted rest destination with available capacity and usable gates, doors and stairs.'}
