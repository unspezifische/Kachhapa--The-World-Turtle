"""Pure settlement simulation rules, independent from Flask and persistence."""


def calculate_lamplighter_state(route, lamps, minute_of_day):
    lamps = sorted(lamps, key=lambda lamp: lamp.route_order)
    if not lamps:
        return {'phase': 'off_duty', 'position': None, 'lamps': []}

    interval = max(1, route.minutes_per_stop)
    route_duration = len(lamps) * interval
    phase = 'off_duty'
    route_lamps = lamps
    progress = None
    lit_ids = set()

    if route.evening_start_minute <= minute_of_day < route.evening_start_minute + route_duration:
        phase = 'lighting'
        progress = (minute_of_day - route.evening_start_minute) / interval
        lit_ids = {lamp.id for lamp in lamps[:int(progress) + 1]}
    elif minute_of_day >= route.evening_start_minute + route_duration or minute_of_day < route.morning_start_minute:
        lit_ids = {lamp.id for lamp in lamps}
    elif route.morning_start_minute <= minute_of_day < route.morning_start_minute + route_duration:
        phase = 'extinguishing'
        route_lamps = list(reversed(lamps))
        progress = (minute_of_day - route.morning_start_minute) / interval
        extinguished = {lamp.id for lamp in route_lamps[:int(progress) + 1]}
        lit_ids = {lamp.id for lamp in lamps if lamp.id not in extinguished}

    position = None
    next_lamp_id = None
    if progress is not None:
        start_index = min(int(progress), len(route_lamps) - 1)
        end_index = min(start_index + 1, len(route_lamps) - 1)
        segment_progress = progress - int(progress)
        start = route_lamps[start_index]
        end = route_lamps[end_index]
        position = {
            'x': start.x + (end.x - start.x) * segment_progress,
            'y': start.y + (end.y - start.y) * segment_progress,
            'elevation': start.elevation + (end.elevation - start.elevation) * segment_progress,
        }
        next_lamp_id = end.id

    return {
        'phase': phase,
        'position': position,
        'next_lamp_id': next_lamp_id,
        'lamps': [{
            'id': lamp.id,
            'name': lamp.name,
            'x': lamp.x,
            'y': lamp.y,
            'elevation': lamp.elevation,
            'route_order': lamp.route_order,
            'lit': lamp.id in lit_ids,
            'fuel_remaining': lamp.fuel_remaining,
        } for lamp in lamps],
    }
