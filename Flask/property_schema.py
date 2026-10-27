"""Validation for additive property metadata on settlement maps."""

import math


WALL_FINISHES = {'existing', 'stone', 'wood', 'brick', 'plaster', 'packed-earth'}
FLOOR_FINISHES = {'existing', 'stone', 'wood', 'brick', 'plaster', 'packed-earth'}


def _point(point):
    return isinstance(point, dict) and all(
        isinstance(point.get(axis), (int, float))
        and not isinstance(point.get(axis), bool)
        and math.isfinite(point[axis]) for axis in ('x', 'y')
    )


def _polygon(vertices, label):
    if not isinstance(vertices, list) or len(vertices) < 3 or len(vertices) > 2000:
        raise ValueError(f'{label} must have 3–2000 vertices')
    if not all(_point(point) for point in vertices):
        raise ValueError(f'{label} contains an invalid coordinate')
    if any(vertices[index] == vertices[(index + 1) % len(vertices)] for index in range(len(vertices))):
        raise ValueError(f'{label} has a zero-length edge')
    area = sum(
        vertices[index]['x'] * vertices[(index + 1) % len(vertices)]['y']
        - vertices[(index + 1) % len(vertices)]['x'] * vertices[index]['y']
        for index in range(len(vertices))
    )
    if abs(area) < 1e-6:
        raise ValueError(f'{label} has zero area')
    def intersects(a, b, c, d):
        def side(p, q, r):
            return (q['x'] - p['x']) * (r['y'] - p['y']) - (q['y'] - p['y']) * (r['x'] - p['x'])
        def on_segment(p, q, r):
            return (min(p['x'], q['x']) <= r['x'] <= max(p['x'], q['x'])
                    and min(p['y'], q['y']) <= r['y'] <= max(p['y'], q['y']))
        s1, s2, s3, s4 = side(a, b, c), side(a, b, d), side(c, d, a), side(c, d, b)
        return ((s1 == 0 and on_segment(a, b, c)) or (s2 == 0 and on_segment(a, b, d))
                or (s3 == 0 and on_segment(c, d, a)) or (s4 == 0 and on_segment(c, d, b))
                or (s1 * s2 < 0 and s3 * s4 < 0))
    for first in range(len(vertices)):
        for second in range(first + 2, len(vertices)):
            if first == 0 and second == len(vertices) - 1:
                continue
            if intersects(vertices[first], vertices[(first + 1) % len(vertices)],
                          vertices[second], vertices[(second + 1) % len(vertices)]):
                raise ValueError(f'{label} self-intersects')


def validate_properties(properties, buildings):
    """Reject broken references and malformed parcels before committing a save."""
    building_ids = {str(building.get('id')) for building in buildings if isinstance(building, dict)}
    property_ids = set()
    structure_ids = set()
    segment_ids_global = set()
    area_ids_global = set()
    portal_ids = set()
    for item in properties:
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not item['id']:
            raise ValueError('Each property needs a stable string ID')
        if item['id'] in property_ids:
            raise ValueError('Property IDs must be unique')
        property_ids.add(item['id'])
        access_points = item.get('travel_access_points', [])
        if not isinstance(access_points, list) or len(access_points) > 20 or not all(_point(point) for point in access_points):
            raise ValueError('Property travel access points must contain finite coordinates')
        refs = item.get('structure_ids', [])
        if not isinstance(refs, list):
            raise ValueError('property.structure_ids must be an array')
        for ref in refs:
            key = str(ref)
            if key not in building_ids:
                raise ValueError(f'Property {item["id"]} links a missing structure')
            if key in structure_ids:
                raise ValueError(f'Structure {key} belongs to multiple properties')
            structure_ids.add(key)
        boundary = item.get('boundary')
        if boundary is not None:
            if not isinstance(boundary, dict):
                raise ValueError('property.boundary must be an object')
            vertices = boundary.get('vertices')
            _polygon(vertices, 'Property boundary')
            segments = boundary.get('segments', [])
            if not isinstance(segments, list) or len(segments) != len(vertices):
                raise ValueError('Property boundary needs one segment per edge')
            segment_ids = set()
            for index, segment in enumerate(segments):
                if not isinstance(segment, dict) or not segment.get('id'):
                    raise ValueError('Boundary segment needs an ID')
                if segment['id'] in segment_ids or segment['id'] in segment_ids_global:
                    raise ValueError('Boundary segment IDs must be unique')
                segment_ids.add(segment['id'])
                segment_ids_global.add(segment['id'])
                if segment.get('treatment', 'none') not in {'none', 'wall', 'fence', 'hedge', 'linked_structure_wall'}:
                    raise ValueError('Unknown boundary treatment')
                if not isinstance(segment.get('openings', []), list):
                    raise ValueError('Boundary openings must be an array')
                start, end = vertices[index], vertices[(index + 1) % len(vertices)]
                length = math.hypot(end['x'] - start['x'], end['y'] - start['y'])
                intervals = []
                opening_ids = set()
                for opening in segment.get('openings', []):
                    if (not isinstance(opening, dict) or not opening.get('id')
                            or opening['id'] in opening_ids or opening['id'] in portal_ids):
                        raise ValueError('Boundary openings need unique IDs')
                    opening_ids.add(opening['id'])
                    portal_ids.add(opening['id'])
                    if segment.get('arc'):
                        raise ValueError('Openings on curved property segments are not supported yet')
                    offset, width = opening.get('offsetAlongSegment'), opening.get('width')
                    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in (offset, width)) \
                            or offset < 0 or width <= 0 or offset + width > length + 1e-6:
                        raise ValueError('Boundary opening must fit within its segment')
                    if any(offset < stop and offset + width > begin for begin, stop in intervals):
                        raise ValueError('Boundary openings overlap')
                    intervals.append((offset, offset + width))
        areas = item.get('outdoor_areas', [])
        if not isinstance(areas, list):
            raise ValueError('property.outdoor_areas must be an array')
        area_ids = set()
        for area in areas:
            if not isinstance(area, dict) or not area.get('id') or area['id'] in area_ids or area['id'] in area_ids_global:
                raise ValueError('Outdoor areas need unique IDs')
            area_ids.add(area['id'])
            area_ids_global.add(area['id'])
            _polygon(area.get('polygon'), 'Outdoor area')
    room_ids = set()
    for building in buildings:
        if not isinstance(building, dict):
            continue
        access_points = building.get('travel_access_points', [])
        if not isinstance(access_points, list) or len(access_points) > 20 or not all(_point(point) for point in access_points):
            raise ValueError('Building travel access points must contain finite coordinates')
        level_numbers = set()
        for level in building.get('levels') or []:
            if not isinstance(level, dict) or level.get('level_number') is None:
                continue
            level_number = level.get('level_number')
            if (not isinstance(level_number, int) or isinstance(level_number, bool)
                    or level_number in level_numbers):
                raise ValueError('Building level numbers must be unique integers')
            level_numbers.add(level_number)
        for level in building.get('levels') or []:
            for opening in level.get('openings') or []:
                if isinstance(opening, dict) and opening.get('id'):
                    portal_ids.add(opening['id'])
    for building in buildings:
        if not isinstance(building, dict):
            continue
        for level in building.get('levels') or []:
            if level.get('interior_material') is not None and level.get('interior_material') not in WALL_FINISHES:
                raise ValueError('Unknown interior wall material')
            for wall in [*(level.get('outline') or []), *(level.get('walls') or [])]:
                if isinstance(wall, dict) and wall.get('material') is not None and wall.get('material') not in WALL_FINISHES:
                    raise ValueError('Unknown wall segment material')
            for stair in level.get('stairs') or []:
                if not isinstance(stair, dict) or stair.get('flight_shares') is None:
                    continue
                shares = stair.get('flight_shares')
                expected = max(1, int(stair.get('landing_count') or 1)) + 1
                if (not isinstance(shares, list) or len(shares) != expected
                        or not all(isinstance(value, (int, float)) and not isinstance(value, bool)
                                   and math.isfinite(value) and 0 <= value <= 100 for value in shares)
                        or abs(sum(shares) - 100) > 0.051):
                    raise ValueError('Stair flight shares must match its flights and total 100%')
            for room in level.get('rooms') or []:
                if not isinstance(room, dict):
                    continue  # historical room-name lists remain readable
                room_id = room.get('id')
                if not room_id or room_id in room_ids:
                    raise ValueError('Rooms need unique stable IDs')
                room_ids.add(room_id)
                if room.get('structure_id') not in (None, building.get('id')) or room.get('floor_id') not in (None, level.get('id')):
                    raise ValueError('Room parent IDs do not match their structure and floor')
                _polygon(room.get('region'), 'Room')
                if room.get('floor_material') is not None and room.get('floor_material') not in FLOOR_FINISHES:
                    raise ValueError('Unknown room floor material')
                if room.get('boundary_locked') not in (None, True, False):
                    raise ValueError('Room boundary lock must be a boolean')
                if not isinstance(room.get('activity_capabilities', []), list):
                    raise ValueError('Room capabilities must be an array')
                if any(portal_id not in portal_ids for portal_id in room.get('linked_portal_ids') or []):
                    raise ValueError('Room links a missing portal')
