"""Authoritative road routing for persisted settlement maps.

The router deliberately consumes the existing JSON road/building/property
records.  Missing routing fields receive compatibility defaults in memory; the
records are never rewritten merely because a route was requested.
"""
from collections import defaultdict
from copy import deepcopy
from heapq import heappop, heappush
from math import floor, hypot, isfinite


MAX_ACCESS_LEG_FEET = 200.0
MODE_SPEED_MPH = {'walking': 3.0, 'riding': 6.0, 'carriage': 4.0}
MODE_COST_CP_PER_MILE = {'walking': 0, 'riding': 5, 'carriage': 3}
ROAD_MODES = {
    'trail': ('walking', 'riding'),
    'alley': ('walking', 'riding'),
    'lane': ('walking', 'riding', 'carriage'),
    'street': ('walking', 'riding', 'carriage'),
    'avenue': ('walking', 'riding', 'carriage'),
    'highway': ('walking', 'riding', 'carriage'),
}


class RouteError(ValueError):
    pass


def validate_roads(roads):
    for road in roads or []:
        if not isinstance(road, dict):
            raise RouteError('Each road must be an object.')
        segments = road.get('segments') or []
        if not isinstance(segments, list):
            raise RouteError('Road segments must be an array.')
        for segment in segments:
            if not isinstance(segment, dict):
                raise RouteError('Each road segment must be an object.')
            modes = segment.get('allowed_modes')
            if modes is not None and (not isinstance(modes, list) or not modes or any(mode not in MODE_SPEED_MPH for mode in modes)):
                raise RouteError('Allowed road modes must use walking, riding, or carriage.')
            if segment.get('direction', 'both') not in ('both', 'forward', 'reverse'):
                raise RouteError('Road direction must be both, forward, or reverse.')
            if segment.get('status', 'open') not in ('open', 'closed'):
                raise RouteError('Road status must be open or closed.')
            if segment.get('crossing', 'connect') not in ('connect', 'grade_separated'):
                raise RouteError('Road crossings must connect or be grade separated.')
            try:
                speed = float(segment.get('speed_multiplier', 1))
            except (TypeError, ValueError):
                raise RouteError('Road speed multipliers must be positive numbers.')
            if not isfinite(speed) or speed <= 0 or speed > 5:
                raise RouteError('Road speed multipliers must be between 0 and 5.')


def _point(value):
    try:
        x, y = float(value['x']), float(value['y'])
    except (KeyError, TypeError, ValueError):
        return None
    return {'x': x, 'y': y} if isfinite(x) and isfinite(y) else None


def _catmull(p0, p1, p2, p3, amount):
    t2, t3 = amount * amount, amount * amount * amount
    return {
        axis: .5 * (2 * p1[axis] + (-p0[axis] + p2[axis]) * amount +
                    (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
                    (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3)
        for axis in ('x', 'y')
    }


def sample_road_centerline(road):
    """Match webapp/src/settlementBabylon.js sampleRoadCenterline."""
    points = [_point(value) for value in road.get('points') or []]
    points = [value for value in points if value]
    if len(points) < 2:
        return []
    samples = max(32, len(points) * 32)
    result = []
    for sample in range(samples + 1):
        t = sample / samples
        scaled = t * (len(points) - 1)
        index = min(len(points) - 2, floor(scaled))
        local = scaled - index
        value = _catmull(points[max(0, index - 1)], points[index], points[index + 1],
                         points[min(len(points) - 1, index + 2)], local)
        result.append({**value, 't': t, 'control_segment': index})
    return result


def _segment_settings(road, index):
    segment = (road.get('segments') or [])
    segment = segment[index] if index < len(segment) and isinstance(segment[index], dict) else {}
    road_class = road.get('road_class') or 'street'
    modes = segment.get('allowed_modes')
    if not isinstance(modes, list):
        modes = list(ROAD_MODES.get(road_class, ROAD_MODES['street']))
    multiplier = segment.get('speed_multiplier', 1)
    try:
        multiplier = float(multiplier)
    except (TypeError, ValueError):
        multiplier = 1
    return {
        'allowed_modes': tuple(mode for mode in modes if mode in MODE_SPEED_MPH),
        'direction': segment.get('direction') if segment.get('direction') in ('both', 'forward', 'reverse') else 'both',
        'status': segment.get('status') if segment.get('status') in ('open', 'closed') else 'open',
        'crossing': segment.get('crossing') if segment.get('crossing') in ('connect', 'grade_separated') else 'connect',
        'speed_multiplier': multiplier if isfinite(multiplier) and multiplier > 0 else 1,
        'surface_type': segment.get('surface_type') or road.get('surface_type') or 'dirt',
    }


def _intersection(a, b, c, d):
    dx, dy, ex, ey = b['x'] - a['x'], b['y'] - a['y'], d['x'] - c['x'], d['y'] - c['y']
    divisor = dx * ey - dy * ex
    if abs(divisor) < 1e-9:
        return None
    qx, qy = c['x'] - a['x'], c['y'] - a['y']
    u, v = (qx * ey - qy * ex) / divisor, (qx * dy - qy * dx) / divisor
    if -1e-7 <= u <= 1 + 1e-7 and -1e-7 <= v <= 1 + 1e-7:
        return {'x': a['x'] + u * dx, 'y': a['y'] + u * dy,
                'u': max(0, min(1, u)), 'v': max(0, min(1, v))}
    return None


def _node_key(point, road_id):
    # Roads may occupy the same x/y at a bridge.  Only an intersection that
    # survived the crossing policy receives a shared junction key.
    return point.get('_junction') or (road_id, round(point['x'], 4), round(point['y'], 4))


def _segment_cells(a, b, size=250):
    min_x, max_x = sorted((a['x'], b['x']))
    min_y, max_y = sorted((a['y'], b['y']))
    return [(x, y) for x in range(floor(min_x / size), floor(max_x / size) + 1)
            for y in range(floor(min_y / size), floor(max_y / size) + 1)]


def build_road_graph(roads):
    source_segments = []
    for road in roads or []:
        if not isinstance(road, dict) or road.get('visible') is False:
            continue
        path = sample_road_centerline(road)
        for index in range(len(path) - 1):
            a, b = path[index], path[index + 1]
            control_index = min(len(road.get('points') or []) - 2,
                                floor(((a['t'] + b['t']) / 2) * (len(road.get('points') or []) - 1)))
            source_segments.append({'road_id': road.get('id'), 'sample_index': index, 'a': a, 'b': b,
                                    'settings': _segment_settings(road, max(0, control_index)),
                                    'splits': [(0.0, a), (1.0, b)]})

    cells = defaultdict(list)
    checked = set()
    for index, segment in enumerate(source_segments):
        for cell in _segment_cells(segment['a'], segment['b']):
            for other_index in cells[cell]:
                pair = (other_index, index)
                if pair in checked:
                    continue
                checked.add(pair)
                other = source_segments[other_index]
                if other['road_id'] == segment['road_id']:
                    continue
                if (segment['settings']['crossing'] == 'grade_separated' or
                        other['settings']['crossing'] == 'grade_separated'):
                    continue
                hit = _intersection(other['a'], other['b'], segment['a'], segment['b'])
                if hit:
                    point = {'x': hit['x'], 'y': hit['y'],
                             '_junction': ('junction', round(hit['x'], 4), round(hit['y'], 4))}
                    other['splits'].append((hit['u'], point))
                    segment['splits'].append((hit['v'], point))
            cells[cell].append(index)

    nodes, adjacency, physical = {}, defaultdict(list), []
    for segment in source_segments:
        ordered = sorted(segment['splits'], key=lambda item: item[0])
        compact = []
        for amount, point in ordered:
            if not compact or hypot(point['x'] - compact[-1][1]['x'], point['y'] - compact[-1][1]['y']) > 1e-4:
                compact.append((amount, point))
            elif point.get('_junction'):
                compact[-1] = (compact[-1][0], point)
        for (_, start), (_, end) in zip(compact, compact[1:]):
            distance = hypot(end['x'] - start['x'], end['y'] - start['y'])
            if distance <= 1e-6:
                continue
            a, b = _node_key(start, segment['road_id']), _node_key(end, segment['road_id'])
            nodes[a], nodes[b] = {'x': start['x'], 'y': start['y']}, {'x': end['x'], 'y': end['y']}
            settings = segment['settings']
            edge = {'edge_id': len(physical), 'a': a, 'b': b, 'distance': distance,
                    'road_id': segment['road_id'], **settings}
            physical.append(edge)
            if settings['status'] != 'closed':
                if settings['direction'] in ('both', 'forward'):
                    adjacency[a].append({**edge, 'to': b})
                if settings['direction'] in ('both', 'reverse'):
                    adjacency[b].append({**edge, 'to': a})
    return {'nodes': nodes, 'adjacency': adjacency, 'physical': physical}


def _project(point, a, b):
    dx, dy = b['x'] - a['x'], b['y'] - a['y']
    length2 = dx * dx + dy * dy
    t = 0 if not length2 else max(0, min(1, ((point['x'] - a['x']) * dx + (point['y'] - a['y']) * dy) / length2))
    projected = {'x': a['x'] + t * dx, 'y': a['y'] + t * dy}
    return projected, t, hypot(point['x'] - projected['x'], point['y'] - projected['y'])


def _endpoint_attachment(graph, point, mode, name):
    best = None
    for edge in graph['physical']:
        if edge['status'] == 'closed' or mode not in edge['allowed_modes']:
            continue
        projected, amount, distance = _project(point, graph['nodes'][edge['a']], graph['nodes'][edge['b']])
        if best is None or distance < best[0]:
            best = (distance, projected, amount, edge)
    if best is None or best[0] > MAX_ACCESS_LEG_FEET:
        raise RouteError(f'{name} is more than {int(MAX_ACCESS_LEG_FEET)} feet from a compatible road.')
    access_distance, projected, amount, edge = best
    return {'name': name, 'point': point, 'distance': access_distance,
            'projected': projected, 'amount': amount, 'edge': edge}


def _attach_route_endpoints(graph, origin, destination, mode):
    """Split selected road edges at both projections before pathfinding."""
    attachments = [_endpoint_attachment(graph, origin, mode, 'Origin'),
                   _endpoint_attachment(graph, destination, mode, 'Destination')]
    splits = defaultdict(list)
    for attachment in attachments:
        edge, amount = attachment['edge'], attachment['amount']
        if amount <= 1e-7:
            projected_key = edge['a']
        elif amount >= 1 - 1e-7:
            projected_key = edge['b']
        else:
            projected_key = ('route-projection', edge['edge_id'], round(amount, 9))
            graph['nodes'][projected_key] = attachment['projected']
            splits[edge['edge_id']].append((amount, projected_key))
        attachment['projected_key'] = projected_key

    for edge_id, interior in splits.items():
        edge = next(value for value in graph['physical'] if value['edge_id'] == edge_id)
        for node in list(graph['adjacency']):
            graph['adjacency'][node] = [value for value in graph['adjacency'][node]
                                         if value.get('edge_id') != edge_id]
        ordered = [(0.0, edge['a']), *sorted(set(interior)), (1.0, edge['b'])]
        for (start_amount, start), (end_amount, end) in zip(ordered, ordered[1:]):
            distance = edge['distance'] * (end_amount - start_amount)
            piece = {**edge, 'a': start, 'b': end, 'distance': distance, 'access_leg': False}
            if edge['direction'] in ('both', 'forward'):
                graph['adjacency'][start].append({**piece, 'to': end})
            if edge['direction'] in ('both', 'reverse'):
                graph['adjacency'][end].append({**piece, 'to': start})

    result = []
    for attachment in attachments:
        endpoint_key = (attachment['name'], 'endpoint')
        graph['nodes'][endpoint_key] = dict(attachment['point'])
        access = {'distance': attachment['distance'], 'road_id': None,
                  'speed_multiplier': 1, 'access_leg': True}
        graph['adjacency'][endpoint_key].append({**access, 'to': attachment['projected_key']})
        graph['adjacency'][attachment['projected_key']].append({**access, 'to': endpoint_key})
        result.append((endpoint_key, {'from': dict(attachment['point']), 'to': attachment['projected'],
                                     'distance_feet': attachment['distance']}))
    return result


def _dijkstra(graph, start, end, mode, objective):
    queue, costs, previous = [(0, 0, start)], {start: 0}, {}
    serial = 1
    while queue:
        total, _, node = heappop(queue)
        if total != costs.get(node):
            continue
        if node == end:
            break
        for edge in graph['adjacency'].get(node, []):
            if not edge.get('access_leg') and mode not in edge.get('allowed_modes', ()):
                continue
            speed = MODE_SPEED_MPH['walking'] if edge.get('access_leg') else MODE_SPEED_MPH[mode] * edge.get('speed_multiplier', 1)
            seconds = edge['distance'] / (speed * 5280 / 3600)
            weight = edge['distance'] if objective == 'distance' else seconds
            next_total = total + weight
            if next_total + 1e-9 < costs.get(edge['to'], float('inf')):
                costs[edge['to']] = next_total
                previous[edge['to']] = (node, edge, seconds)
                heappush(queue, (next_total, serial, edge['to']))
                serial += 1
    if end not in costs:
        return None
    steps, node = [], end
    while node != start:
        prior, edge, seconds = previous[node]
        steps.append((prior, node, edge, seconds))
        node = prior
    steps.reverse()
    elapsed, distance, path, roads, edge_ids = 0.0, 0.0, [], [], []
    for prior, target, edge, seconds in steps:
        if not path:
            path.append({**graph['nodes'][prior], 'cumulative_seconds': 0})
        elapsed += seconds
        distance += edge['distance']
        path.append({**graph['nodes'][target], 'cumulative_seconds': round(elapsed, 3)})
        if edge.get('road_id') is not None and (not roads or roads[-1] != edge['road_id']):
            roads.append(edge['road_id'])
        if edge.get('edge_id') is not None and (not edge_ids or edge_ids[-1] != edge['edge_id']):
            edge_ids.append(edge['edge_id'])
    return {'path': path, 'distance_feet': round(distance, 3), 'elapsed_seconds': max(1, round(elapsed)),
            'source_road_ids': roads, 'source_edge_ids': edge_ids}


def plan_route(roads, origin, destination, mode):
    if mode not in MODE_SPEED_MPH:
        raise RouteError('Choose walking, riding, or carriage.')
    origin, destination = _point(origin), _point(destination)
    if not origin or not destination:
        raise RouteError('Mapped origin and destination coordinates are required.')
    graph = build_road_graph(roads)
    if not graph['physical']:
        raise RouteError('This settlement has no routable roads.')
    (start, origin_leg), (end, destination_leg) = _attach_route_endpoints(graph, origin, destination, mode)
    fastest = _dijkstra(graph, start, end, mode, 'time')
    if not fastest:
        raise RouteError('The origin and destination are on disconnected road networks.')
    shortest = _dijkstra(graph, start, end, mode, 'distance')
    alternatives = []
    if shortest and shortest['source_edge_ids'] != fastest['source_edge_ids']:
        alternatives.append({'objective': 'shortest', **shortest})
    return {'objective': 'fastest', **fastest, 'origin_access_leg': origin_leg,
            'destination_access_leg': destination_leg, 'alternatives': alternatives}


def plan_route_options(roads, origin, destination, party_size=1):
    options = []
    for mode in MODE_SPEED_MPH:
        try:
            route = plan_route(roads, origin, destination, mode)
            miles = route['distance_feet'] / 5280
            options.append({'mode': mode, 'label': mode.title(), 'available': True,
                            'unavailable_reason': None, 'distance_miles': round(miles, 2),
                            'moving_hours': round(route['elapsed_seconds'] / 3600, 2),
                            'elapsed_minutes': max(1, round(route['elapsed_seconds'] / 60)),
                            'elapsed_seconds': route['elapsed_seconds'], 'travel_days': 1,
                            'cost_cp': round(miles * MODE_COST_CP_PER_MILE[mode] * max(1, int(party_size))),
                            'party_size': max(1, int(party_size)), 'route': route})
        except RouteError as error:
            options.append({'mode': mode, 'label': mode.title(), 'available': False,
                            'unavailable_reason': str(error), 'party_size': max(1, int(party_size))})
    return {'direct_distance_miles': round(hypot(destination['x'] - origin['x'], destination['y'] - origin['y']) / 5280, 2),
            'options': options}


def _rotate(point, origin, angle):
    from math import cos, sin
    c, s = cos(angle), sin(angle)
    return {'x': origin['x'] + point['x'] * c - point['y'] * s,
            'y': origin['y'] + point['x'] * s + point['y'] * c}


def _building_polygon(building):
    origin = {'x': float(building.get('x') or 0), 'y': float(building.get('y') or 0)}
    levels = building.get('levels') or []
    ground = next((level for level in levels if level.get('level_number') == 0), levels[0] if levels else {})
    corners = ground.get('corners') or ground.get('points') or []
    local = [_point(value) for value in corners]
    local = [value for value in local if value]
    if len(local) < 3:
        width = float(building.get('width_feet') or 30)
        depth = float(building.get('depth_feet') or building.get('height_feet') or 30)
        local = [{'x': -width / 2, 'y': -depth / 2}, {'x': width / 2, 'y': -depth / 2},
                 {'x': width / 2, 'y': depth / 2}, {'x': -width / 2, 'y': depth / 2}]
        return [_rotate(point, origin, float(building.get('rotation') or 0)) for point in local]
    if building.get('coordinate_space') == 'local':
        return [_rotate(point, origin, float(building.get('rotation') or 0)) for point in local]
    # Historical blueprints persisted world-space corners. Keep those saves
    # readable without converting them merely because routing was requested.
    return local


def _building_openings(building):
    levels = building.get('levels') or []
    ground = next((level for level in levels if level.get('level_number') == 0), levels[0] if levels else {})
    walls = [*(ground.get('outline') or []), *(ground.get('walls') or [])]
    by_id = {wall.get('id'): wall for wall in walls}
    origin = {'x': float(building.get('x') or 0), 'y': float(building.get('y') or 0)}
    angle = float(building.get('rotation') or 0)
    result = []
    for opening in ground.get('openings') or ground.get('doors') or []:
        if opening.get('blocked') or opening.get('state') == 'locked' or (opening.get('kind') or opening.get('opening_kind')) == 'window':
            continue
        wall = by_id.get(opening.get('wall_id'))
        if not wall and isinstance(opening.get('wall_index'), int) and opening['wall_index'] < len(walls):
            wall = walls[opening['wall_index']]
        start, end = _point((wall or {}).get('start')), _point((wall or {}).get('end'))
        if not start or not end:
            continue
        length = hypot(end['x'] - start['x'], end['y'] - start['y']) or 1
        distance = float(opening.get('distance_from_start') or length / 2)
        local = {'x': start['x'] + (end['x'] - start['x']) * distance / length,
                 'y': start['y'] + (end['y'] - start['y']) * distance / length}
        result.append(_rotate(local, origin, angle) if building.get('coordinate_space') == 'local' else local)
    return result


def _property_openings(parcel):
    boundary = parcel.get('boundary') or {}
    vertices, segments = boundary.get('vertices') or [], boundary.get('segments') or []
    result = []
    for index, segment in enumerate(segments):
        if index >= len(vertices):
            continue
        start, end = _point(vertices[index]), _point(vertices[(index + 1) % len(vertices)])
        if not start or not end:
            continue
        length = hypot(end['x'] - start['x'], end['y'] - start['y']) or 1
        for opening in segment.get('openings') or []:
            if opening.get('blocked') or opening.get('state') == 'locked':
                continue
            offset = float(opening.get('offsetAlongSegment') or opening.get('offset_along_segment') or 0)
            width = float(opening.get('width') or opening.get('width_feet') or 0)
            amount = max(0, min(1, (offset + width / 2) / length))
            result.append({'x': start['x'] + (end['x'] - start['x']) * amount,
                           'y': start['y'] + (end['y'] - start['y']) * amount})
    return result


def _road_segments(roads):
    sampled_roads = []
    for road in roads or []:
        if road.get('visible') is False:
            continue
        path = sample_road_centerline(road)
        if len(path) < 2:
            continue
        xs = [point['x'] for point in path]
        ys = [point['y'] for point in path]
        sampled_roads.append((min(xs), min(ys), max(xs), max(ys), list(zip(path, path[1:]))))
    return sampled_roads


def _nearest_road_point(point, sampled_roads):
    best = None
    x, y = point['x'], point['y']
    ranked = sorted(sampled_roads, key=lambda road: (
        max(road[0] - x, 0, x - road[2]) ** 2
        + max(road[1] - y, 0, y - road[3]) ** 2))
    for min_x, min_y, max_x, max_y, segments in ranked:
        lower_bound = hypot(max(min_x - x, 0, x - max_x), max(min_y - y, 0, y - max_y))
        if best is not None and lower_bound > best[0]:
            break
        for a, b in segments:
            projected, _, distance = _project(point, a, b)
            if best is None or distance < best[0]:
                best = (distance, projected)
    return best


def _polygon_access(polygon, segments):
    candidates = list(polygon)
    candidates += [{'x': (a['x'] + b['x']) / 2, 'y': (a['y'] + b['y']) / 2}
                   for a, b in zip(polygon, polygon[1:] + polygon[:1])]
    ranked = [(hit[0], point, hit[1]) for point in candidates if (hit := _nearest_road_point(point, segments))]
    return min(ranked, key=lambda item: item[0]) if ranked else None


def settlement_exterior_destinations(settlement, points_of_interest=None):
    segments = _road_segments(settlement.roads or [])
    result = []
    properties = settlement.properties or []
    links = {str(structure): parcel for parcel in properties for structure in parcel.get('structure_ids', [])}

    def add(kind, item_id, label, arrival, source='inferred', **extra):
        if not arrival:
            return
        hit = _nearest_road_point(arrival, segments)
        key = f'poi:{item_id}' if kind == 'poi' else f'{settlement.id}:{"structure" if kind == "building" else kind}:{item_id}'
        result.append({'key': key, 'kind': kind, 'id': item_id,
                       'label': label, 'name': label, 'map_key': settlement.map_key,
                       'settlement_id': settlement.id, 'x': arrival['x'], 'y': arrival['y'],
                       'access_status': 'connected' if hit and hit[0] <= MAX_ACCESS_LEG_FEET else 'disconnected',
                       'access_distance_feet': round(hit[0], 1) if hit else None,
                       'access_source': source, **extra})

    for building in settlement.buildings or []:
        override = next((_point(value) for value in building.get('travel_access_points') or [] if _point(value)), None)
        opening_ranked = [(hit[0], point) for point in _building_openings(building)
                          if (hit := _nearest_road_point(point, segments))]
        ranked = _polygon_access(_building_polygon(building), segments)
        opening = min(opening_ranked, key=lambda item: item[0])[1] if opening_ranked else None
        arrival = override or opening or (ranked[1] if ranked else _point(building))
        parcel = links.get(str(building.get('id')))
        label = building.get('name') or 'Unnamed structure'
        add('building', building.get('id'), label, arrival,
            'manual' if override else 'opening' if opening else 'inferred',
            property_id=parcel.get('id') if parcel else None)
    for parcel in properties:
        override = next((_point(value) for value in parcel.get('travel_access_points') or [] if _point(value)), None)
        opening_ranked = [(hit[0], point) for point in _property_openings(parcel)
                          if (hit := _nearest_road_point(point, segments))]
        polygon = (parcel.get('boundary') or {}).get('vertices') or parcel.get('boundary') or []
        polygon = [_point(value) for value in polygon if _point(value)] if isinstance(polygon, list) else []
        ranked = _polygon_access(polygon, segments) if len(polygon) >= 3 else None
        opening = min(opening_ranked, key=lambda item: item[0])[1] if opening_ranked else None
        arrival = override or opening or (ranked[1] if ranked else None)
        add('property', parcel.get('id'), parcel.get('name') or 'Unnamed property', arrival,
            'manual' if override else 'opening' if opening else 'inferred')
    for poi in points_of_interest or []:
        value = poi.to_dict() if hasattr(poi, 'to_dict') else deepcopy(poi)
        if value.get('map_key') == settlement.map_key:
            add('poi', value.get('id'), value.get('name') or 'Point of interest', _point(value), 'point',
                point_type=value.get('point_type'))
    return result


def destination_by_key(settlement, key, points_of_interest=None):
    return next((value for value in settlement_exterior_destinations(settlement, points_of_interest)
                 if value['key'] == key), None)
