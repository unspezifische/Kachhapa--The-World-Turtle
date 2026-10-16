"""Read-only semantic destinations from stored settlement property JSON."""

import math


def _inside(point, polygon):
    x, y = point['x'], point['y']
    inside = False
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        if (start['y'] > y) != (end['y'] > y) and x < (end['x'] - start['x']) * (y - start['y']) / (end['y'] - start['y']) + start['x']:
            inside = not inside
    return inside


def _interior_point(polygon, holes=None):
    if not isinstance(polygon, list) or len(polygon) < 3:
        return None
    holes = [hole for hole in (holes or []) if isinstance(hole, list) and len(hole) >= 3]
    def walkable(point):
        return _inside(point, polygon) and not any(_inside(point, hole) for hole in holes)
    centroid = {'x': sum(point['x'] for point in polygon) / len(polygon),
                'y': sum(point['y'] for point in polygon) / len(polygon)}
    if walkable(centroid):
        return centroid
    for index, point in enumerate(polygon):
        next_point = polygon[(index + 1) % len(polygon)]
        candidate = {'x': (centroid['x'] + point['x'] + next_point['x']) / 3,
                     'y': (centroid['y'] + point['y'] + next_point['y']) / 3}
        if walkable(candidate):
            return candidate
    return None


def _allowed(policy, actor):
    return policy == 'public' or actor.get('authorized') or (policy == 'residents' and actor.get('resident')) or (policy == 'staff' and actor.get('staff'))


def destination_key(destination):
    # JSON IDs may themselves contain delimiters; use an unambiguous composite.
    import json
    return json.dumps([destination.get('kind'), destination.get('property_id'), destination.get('structure_id'), destination.get('floor_id'), destination.get('id')], separators=(',', ':'))



def settlement_destinations(buildings, properties, capability=None, actor=None, reservations=None):
    actor = actor or {}
    by_building = {str(building.get('id')): building for building in buildings if isinstance(building, dict)}
    links = {}
    for parcel in properties or []:
        for structure_id in parcel.get('structure_ids', []):
            links[str(structure_id)] = parcel.get('id')
    destinations = []
    limits = {}
    for building_id, building in by_building.items():
        rotation = float(building.get('rotation') or 0)
        cosine, sine = math.cos(rotation), math.sin(rotation)
        for level in building.get('levels') or []:
            for room in level.get('rooms') or []:
                if not isinstance(room, dict):
                    continue  # Legacy room-name entries have no destination geometry.
                capabilities = room.get('activity_capabilities') or []
                if capability and capability not in capabilities:
                    continue
                if not _allowed(room.get('access_policy') or 'public', actor):
                    continue
                if room.get('occupancy_limit') is not None and (room.get('current_occupancy') or 0) >= room['occupancy_limit']:
                    continue
                point = _interior_point(room.get('region'), [void.get('points') or void.get('polygon') for void in level.get('floor_voids') or []])
                if not point:
                    continue
                limits[destination_key({'kind': 'room', 'property_id': links.get(building_id, f'property-for-{building_id}'), 'structure_id': building_id, 'floor_id': level.get('id'), 'id': room.get('id')})] = (room.get('occupancy_limit'), room.get('current_occupancy') or 0)
                destinations.append({
                    'id': room.get('id'), 'kind': 'room', 'name': room.get('name'),
                    'property_id': links.get(building_id, f'property-for-{building_id}'),
                    'structure_id': building_id, 'floor_id': level.get('id'),
                    'capabilities': capabilities,
                    'point': {
                        'x': (building.get('x') or 0) + point['x'] * cosine - point['y'] * sine,
                        'y': (building.get('y') or 0) + point['x'] * sine + point['y'] * cosine,
                    },
                    'relative_elevation_feet': (building.get('elevation') or 0) + (level.get('elevation_feet') or 0),
                    'elevation_mode': building.get('elevation_mode') or 'relative_to_terrain',
                    'route_status': 'route_request_required',
                })
    for parcel in properties or []:
        for area in parcel.get('outdoor_areas') or []:
            capabilities = area.get('activity_capabilities') or []
            if capability and capability not in capabilities:
                continue
            if not _allowed(area.get('access_policy') or 'public', actor):
                continue
            if area.get('occupancy_limit') is not None and (area.get('current_occupancy') or 0) >= area['occupancy_limit']:
                continue
            if area.get('walkable') is False:
                continue
            point = _interior_point(area.get('polygon'), area.get('holes'))
            if not point:
                continue
            limits[destination_key({'kind': 'outdoor_area', 'property_id': parcel.get('id'), 'id': area.get('id')})] = (area.get('occupancy_limit'), area.get('current_occupancy') or 0)
            destinations.append({
                'id': area.get('id'), 'kind': 'outdoor_area', 'name': area.get('name'),
                'property_id': parcel.get('id'), 'capabilities': capabilities,
                'point': point, 'route_status': 'route_request_required',
            })
    counts = {}
    for reservation in reservations or []:
        key = reservation.get('destination_key')
        counts[key] = counts.get(key, 0) + 1
    return [destination for destination in destinations
            if limits[destination_key(destination)][0] is None or
            limits[destination_key(destination)][1] + counts.get(destination_key(destination), 0) < limits[destination_key(destination)][0]]
