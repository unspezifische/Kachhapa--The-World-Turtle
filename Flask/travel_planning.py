"""Pure travel estimates for local and regional Kachhapa maps."""
from math import ceil, hypot


TRAVEL_MODES = {
    'walking': {'label': 'Walking', 'speed_mph': 3, 'hours_per_day': 8, 'route_factor': 1.15, 'cost_cp_per_mile': 0},
    'riding': {'label': 'Riding', 'speed_mph': 6, 'hours_per_day': 8, 'route_factor': 1.1, 'cost_cp_per_mile': 5},
    'carriage': {'label': 'Carriage', 'speed_mph': 4, 'hours_per_day': 10, 'route_factor': 1.2, 'cost_cp_per_mile': 3},
    'sailing': {'label': 'Sailing', 'speed_mph': 4, 'hours_per_day': 24, 'route_factor': 1.05, 'cost_cp_per_mile': 10},
}


def calculate_distance_miles(origin, destination, route_distance_miles=None):
    if origin.get('map_key') != destination.get('map_key'):
        if route_distance_miles is None:
            raise ValueError('Inter-map travel requires a route distance.')
        return float(route_distance_miles)
    return hypot(destination['x'] - origin['x'], destination['y'] - origin['y']) / 5280


def estimate_travel_options(origin, destination, party_size=1, route_distance_miles=None):
    direct_miles = calculate_distance_miles(origin, destination, route_distance_miles)
    results = []
    for mode_key, mode in TRAVEL_MODES.items():
        unavailable_reason = None
        if mode_key == 'sailing' and not (origin.get('water_access') and destination.get('water_access')):
            unavailable_reason = 'Both endpoints must have water access.'
        elif mode_key == 'carriage' and not (origin.get('road_access', True) and destination.get('road_access', True)):
            unavailable_reason = 'A carriage-accessible road is required.'

        route_miles = direct_miles * mode['route_factor']
        moving_hours = route_miles / mode['speed_mph'] if route_miles else 0
        travel_days = max(1, ceil(moving_hours / mode['hours_per_day']))
        rest_hours = 0 if mode['hours_per_day'] == 24 else max(0, travel_days - 1) * (24 - mode['hours_per_day'])
        elapsed_minutes = ceil((moving_hours + rest_hours) * 60)
        results.append({
            'mode': mode_key,
            'label': mode['label'],
            'available': unavailable_reason is None,
            'unavailable_reason': unavailable_reason,
            'distance_miles': round(route_miles, 2),
            'moving_hours': round(moving_hours, 2),
            'elapsed_minutes': elapsed_minutes,
            'travel_days': travel_days,
            'cost_cp': ceil(route_miles * mode['cost_cp_per_mile'] * max(1, party_size)),
            'party_size': max(1, party_size),
        })
    return {'direct_distance_miles': round(direct_miles, 2), 'options': results}
