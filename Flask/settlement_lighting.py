"""Deterministic road lighting layouts; no Flask or database dependencies."""
import hashlib
import json
import math
from functools import lru_cache
from types import SimpleNamespace

from settlement_simulation import calculate_lamplighter_state

DEFAULT_COVERAGE = dict(trail=0, alley=0, lane=50, street=100, avenue=100, highway=100)


def lighting_settings(value=None):
    value = value or {}
    coverage = {**DEFAULT_COVERAGE, **value.get('coverage_by_class', {})}
    return {
        'coverage_by_class': {key: float(coverage[key]) for key in DEFAULT_COVERAGE},
        'broken_percent': float(value.get('broken_percent', 0)),
        'spacing_feet': float(value.get('spacing_feet', 100)),
    }


def validate_region_lighting(regions):
    for region in regions:
        value = region.get('street_lighting')
        if value is None:
            continue
        if not isinstance(value, dict) or not isinstance(value.get('coverage_by_class', {}), dict):
            raise ValueError('Region street_lighting and coverage_by_class must be objects')
        for key, number in value.get('coverage_by_class', {}).items():
            if key not in DEFAULT_COVERAGE:
                raise ValueError('Unknown road class in street lighting')
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not 0 <= number <= 100:
                raise ValueError('Street lighting coverage must be between 0 and 100')
        for key, low, high in [('broken_percent', 0, 100), ('spacing_feet', 40, 1000)]:
            number = value.get(key, 0 if key == 'broken_percent' else 100)
            if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not low <= number <= high:
                raise ValueError(f'{key} must be between {low} and {high}')


def _score(identity, purpose):
    return int.from_bytes(hashlib.sha256(f'{identity}:{purpose}'.encode()).digest()[:8], 'big') / 2**64 * 100


def _polygon_area(points):
    return abs(sum(a['x'] * b['y'] - b['x'] * a['y']
                   for a, b in zip(points, points[1:] + points[:1]))) / 2


def _contains(points, x, y):
    inside = False
    for a, b in zip(points, points[1:] + points[:1]):
        cross = (x - a['x']) * (b['y'] - a['y']) - (y - a['y']) * (b['x'] - a['x'])
        if abs(cross) < 1e-7 and min(a['x'], b['x']) <= x <= max(a['x'], b['x']) and min(a['y'], b['y']) <= y <= max(a['y'], b['y']):
            return True
        if (a['y'] > y) != (b['y'] > y):
            if x < (b['x'] - a['x']) * (y - a['y']) / (b['y'] - a['y']) + a['x']:
                inside = not inside
    return inside


def road_centerline(road):
    """Match sampleRoadCenterline's uniform Catmull-Rom curve and sample count."""
    points = road.get('points', [])
    if len(points) < 2:
        return []
    samples = max(32, len(points) * 32)
    result = []
    for sample in range(samples + 1):
        amount = sample / samples
        scaled = amount * (len(points) - 1)
        index = min(len(points) - 2, int(scaled))
        t = scaled - index
        controls = [points[max(0, index - 1)], points[index], points[index + 1], points[min(len(points) - 1, index + 2)]]
        point = {'t': amount}
        for axis in ('x', 'y'):
            p0, p1, p2, p3 = [float(p[axis]) for p in controls]
            point[axis] = .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t*t + (-p0 + 3*p1 - 3*p2 + p3) * t*t*t)
        result.append(point)
    return result


def _road_width(road, amount):
    points = road['points']
    scaled = amount * (len(points) - 1)
    index = min(len(points) - 1, int(scaled))
    segments = road.get('segments') or []
    if index < len(segments) and segments[index].get('width_feet') is not None:
        return float(segments[index]['width_feet'])
    width = float(road.get('width_feet') or 30)
    a = float(points[index].get('width_feet') or width)
    b = float(points[min(len(points) - 1, index + 1)].get('width_feet') or width)
    return a + (b - a) * (scaled - index)


@lru_cache(maxsize=64)
def _cached_layout(settlement_id, configuration):
    data = json.loads(configuration)
    roads = data['roads']
    regions = sorted([r for r in data['regions'] if len(r.get('points', [])) >= 3],
                     key=lambda r: (_polygon_area(r['points']), str(r.get('id', ''))))
    spacings = {100.0, *(lighting_settings(r.get('street_lighting'))['spacing_feet'] for r in regions)}
    lamps = []
    occupied = {}
    for road in sorted(roads, key=lambda r: str(r.get('id', ''))):
        if road.get('visible') is False:
            continue
        curve = road_centerline(road)
        if not curve:
            continue
        lengths = [math.hypot(b['x']-a['x'], b['y']-a['y']) for a,b in zip(curve, curve[1:])]
        total = sum(lengths)
        candidates = []
        for spacing in sorted(spacings):
            distance = spacing / 2
            slot = 0
            while distance < total:
                candidates.append((distance, spacing, slot))
                slot += 1
                distance += spacing
        segment_index, segment_start = 0, 0
        for distance, spacing, slot in sorted(candidates):
            while segment_index < len(lengths)-1 and segment_start + lengths[segment_index] < distance:
                segment_start += lengths[segment_index]
                segment_index += 1
            a, b = curve[segment_index:segment_index+2]
            length = lengths[segment_index]
            if length <= 1e-8:
                continue
            fraction = (distance-segment_start)/length
            x, y = a['x']+(b['x']-a['x'])*fraction, a['y']+(b['y']-a['y'])*fraction
            region = next((r for r in regions if _contains(r['points'], x, y)), None)
            settings = lighting_settings(region.get('street_lighting') if region else None)
            if settings['spacing_feet'] != spacing:
                continue
            identity = f"lamp:{settlement_id}:{road['id']}:{spacing:g}:{slot}"
            road_class = road.get('road_class', 'street')
            if _score(identity, 'installed') >= settings['coverage_by_class'].get(road_class, 100):
                continue
            amount = a['t']+(b['t']-a['t'])*fraction
            offset = (_road_width(road, amount)/2 + 2) * (1 if slot % 2 == 0 else -1)
            lamp_x = x - (b['y']-a['y'])/length*offset
            lamp_y = y + (b['x']-a['x'])/length*offset
            cell = (math.floor(lamp_x/15), math.floor(lamp_y/15))
            nearby = [p for dx in (-1,0,1) for dy in (-1,0,1) for p in occupied.get((cell[0]+dx,cell[1]+dy), [])]
            if any(math.hypot(lamp_x-p['x'],lamp_y-p['y']) < 15 for p in nearby):
                continue
            lamp = dict(id=identity, name=f"{road.get('name') or 'Road'} lamp {slot+1}",
                        settlement_id=settlement_id, road_id=road['id'], region_id=region.get('id') if region else None,
                        x=lamp_x, y=lamp_y, elevation=0, broken=_score(identity,'broken') < settings['broken_percent'],
                        fuel_remaining=None, distance_feet=distance)
            lamps.append(lamp)
            occupied.setdefault(cell, []).append(lamp)
    return tuple(lamps)


def generated_lighting_routes(settlement_id, roads, regions, minute_of_day):
    # Only layout-affecting fields enter the cache key, so clock/terrain saves hit it.
    road_fields = ('id', 'name', 'points', 'segments', 'road_class', 'width_feet', 'visible')
    region_fields = ('id', 'points', 'street_lighting')
    configuration = json.dumps(dict(
        roads=[{key: r[key] for key in road_fields if key in r} for r in roads],
        regions=[{key: r[key] for key in region_fields if key in r} for r in regions]), sort_keys=True)
    layout = _cached_layout(settlement_id, configuration)
    groups = {}
    for lamp in layout:
        groups.setdefault(str(lamp['region_id']), []).append(lamp)
    routes = []
    for region_key, group in sorted(groups.items()):
        working = [lamp for lamp in group if not lamp['broken']]
        broken = [dict(lamp, lit=False, route_order=-1) for lamp in group if lamp['broken']]
        for start in range(0, len(working), 30):
            chunk = [SimpleNamespace(**lamp, route_order=index) for index,lamp in enumerate(working[start:start+30])]
            route = SimpleNamespace(evening_start_minute=1080, morning_start_minute=300, minutes_per_stop=2)
            state = calculate_lamplighter_state(route, chunk, minute_of_day)
            metadata = {lamp.id: vars(lamp) for lamp in chunk}
            routes.append(dict(id=f'lighting:{settlement_id}:{region_key}:{start//30}', generated=True,
                               settlement_id=settlement_id, name=f'Lamp crew {len(routes)+1}',
                               phase=state['phase'], lamplighter_position=state['position'],
                               next_lamp_id=state.get('next_lamp_id'),
                               lamps=[{**metadata[lamp['id']], **lamp} for lamp in state['lamps']]))
        if broken:
            routes.append(dict(id=f'broken:{settlement_id}:{region_key}', generated=True,
                               settlement_id=settlement_id, name='Unserviceable lamps', phase='off_duty',
                               lamplighter_position=None, next_lamp_id=None, lamps=broken))
    return routes
