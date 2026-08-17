"""Deterministic, editor-native settlement generation.

The generator deliberately returns the same JSON primitives that the map editor
already authors: spline roads, terrain strokes, water shapes, and movable
building footprints.  It does not render or own simulation state.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import math
import random


SETTLEMENT_PRESETS = {
    "hamlet": {"population": 100, "radius": 330, "mapped_buildings": 24},
    "village": {"population": 500, "radius": 460, "mapped_buildings": 48},
    "town": {"population": 2500, "radius": 610, "mapped_buildings": 90},
    "city": {"population": 8000, "radius": 760, "mapped_buildings": 150},
    "fortress": {"population": 1200, "radius": 500, "mapped_buildings": 62},
    "port": {"population": 4000, "radius": 670, "mapped_buildings": 112},
    "ruin": {"population": 0, "radius": 390, "mapped_buildings": 34},
    "other": {"population": 500, "radius": 460, "mapped_buildings": 48},
}

GOVERNMENTS = [
    {"key": "feudal", "name": "Feudal court", "building": "Keep", "asset": "stone_townhouse"},
    {"key": "council", "name": "Community council", "building": "Council Hall", "asset": "coaching_inn"},
    {"key": "democracy", "name": "Representative democracy", "building": "Assembly Hall", "asset": "coaching_inn"},
    {"key": "guild_oligarchy", "name": "Guild oligarchy", "building": "Guildhall", "asset": "shop_house"},
    {"key": "theocracy", "name": "Theocracy", "building": "High Temple", "asset": "stone_townhouse"},
    {"key": "military", "name": "Military government", "building": "Garrison Headquarters", "asset": "storehouse"},
]

BIOMES = ["temperate grassland", "temperate forest", "coastal", "wetland", "desert", "tundra", "mountain", "hills"]
RESOURCES = ["grain", "hops", "grapes", "flax", "cotton", "sheep", "cattle", "bees", "timber", "fish", "ore", "stone", "gems"]

ASSETS = {
    "timber_cottage": (42, 32, ["Common room", "Kitchen", "Bedroom", "Pantry", "Loft"]),
    "stone_townhouse": (36, 46, ["Entry hall", "Parlor", "Kitchen", "Primary bedroom", "Bedroom", "Study", "Cellar"]),
    "shop_house": (52, 40, ["Shop floor", "Workshop", "Stockroom", "Kitchen", "Owner bedroom", "Cellar"]),
    "coaching_inn": (88, 62, ["Common room", "Taproom", "Kitchen", "Pantry", "Office", "Six guest rooms", "Stable", "Cellar"]),
    "storehouse": (64, 48, ["Receiving floor", "Main storage", "Secure cage", "Clerk office", "Loading bay"]),
}

ECONOMIC_BUILDINGS = [
    ("Residence", "timber_cottage", "residential", 5, None),
    ("Townhouse", "stone_townhouse", "residential", 8, None),
    ("General Store", "shop_house", "market", 3, None),
    ("Bakery", "shop_house", "market", 4, "grain"),
    ("Smithy", "shop_house", "industrial", 5, "ore"),
    ("Carpenter", "shop_house", "industrial", 4, "timber"),
    ("Tavern", "coaching_inn", "hospitality", 8, "grain"),
    ("Warehouse", "storehouse", "industrial", 5, None),
]


def _road(road_id, name, points, width=30, road_class="street", surface="dirt", district=None):
    return {
        "id": road_id, "name": name, "road_class": road_class,
        "surface_type": surface, "width_feet": width,
        "pedestrian_speed_modifier": .9 if surface == "dirt" else 1,
        "public_access": True, "closed": False, "points": points,
        "district_key": district,
    }


def _generate_roads(rng, radius, population, coastal):
    spoke_count = max(3, min(8, 3 + int(math.log10(max(10, population)) * 1.5)))
    roads = []
    surface = "cobblestone" if population >= 1000 else "dirt"
    for index in range(spoke_count):
        angle = (math.tau * index / spoke_count) + rng.uniform(-.13, .13)
        normal = (-math.sin(angle), math.cos(angle))
        points = []
        for fraction in (-1, -.45, 0, .45, 1):
            bend = rng.uniform(-radius * .06, radius * .06) if fraction else 0
            points.append({
                "x": round(math.cos(angle) * radius * fraction + normal[0] * bend, 2),
                "y": round(math.sin(angle) * radius * fraction + normal[1] * bend, 2),
            })
        roads.append(_road(f"generated-main-{index+1}", f"Main Road {index+1}", points, 38, "avenue", surface))

    ring_count = 1 if population < 1200 else 2
    for ring in range(ring_count):
        ring_radius = radius * (.43 + ring * .29)
        points = []
        for index in range(13):
            angle = math.tau * index / 12
            wobble = 1 + rng.uniform(-.055, .055)
            points.append({"x": round(math.cos(angle) * ring_radius * wobble, 2), "y": round(math.sin(angle) * ring_radius * wobble, 2)})
        roads.append(_road(f"generated-ring-{ring+1}", f"Ring Road {ring+1}", points, 28, "street", surface))

    # Short, individually editable district streets make the generated result useful immediately.
    cross_count = max(2, min(12, population // 500 + 2))
    for index in range(cross_count):
        y = -radius * .68 + (index + 1) * (radius * 1.36 / (cross_count + 1))
        half = radius * rng.uniform(.35, .62)
        if coastal:
            half *= .82
        roads.append(_road(
            f"generated-cross-{index+1}", f"District Street {index+1}",
            [{"x": round(-half, 2), "y": round(y, 2)}, {"x": round(0, 2), "y": round(y + rng.uniform(-25, 25), 2)}, {"x": round(half, 2), "y": round(y, 2)}],
            22, "street", surface,
        ))
    return roads


def _generate_water(environment, rng, radius):
    bodies = []
    if environment.get("river"):
        x = rng.uniform(-radius * .35, radius * .35)
        bodies.append({
            "id": "generated-river", "name": "Settlement River", "water_type": "river",
            "width_feet": 46, "depth_feet": 8,
            "points": [
                {"x": round(x - 80, 2), "y": -900}, {"x": round(x + 35, 2), "y": -radius * .35},
                {"x": round(x - 20, 2), "y": radius * .28}, {"x": round(x + 65, 2), "y": 900},
            ],
        })
    if environment.get("coastal"):
        edge = -radius * .73
        bodies.append({
            "id": "generated-coast", "name": "Coast", "water_type": "ocean",
            "width_feet": 300, "depth_feet": 30,
            "points": [
                {"x": -1000, "y": -1000}, {"x": edge, "y": -1000},
                {"x": round(edge + 35, 2), "y": -radius * .25}, {"x": round(edge - 25, 2), "y": radius * .35},
                {"x": edge, "y": 1000}, {"x": -1000, "y": 1000},
            ],
        })
    return bodies


def _terrain(environment, rng, radius):
    biome = environment.get("biome", "temperate grassland")
    hilly = biome in {"mountain", "hills"}
    count = 8 if hilly else 4
    strokes = []
    for index in range(count):
        strokes.append({
            "id": f"generated-terrain-{index+1}",
            "x": round(rng.uniform(-radius, radius), 2), "y": round(rng.uniform(-radius, radius), 2),
            "radius": round(rng.uniform(radius * .28, radius * .65), 2),
            "delta": round(rng.uniform(35, 115) if hilly else rng.uniform(-8, 22), 2),
        })
    return strokes


def _building_plan(population, government, factions, environment):
    resources = set(environment.get("resources") or [])
    plan = [(government["building"], government["asset"], "governance", 8, None)]
    plan.extend((f"{name} Hall", "shop_house", "faction", 5, None) for name in factions[:8])
    if population >= 100:
        plan.append(("Temple", "stone_townhouse", "religious", 5, None))
    if population >= 500:
        plan.append(("Watch House", "storehouse", "military", 12, None))
    for row in ECONOMIC_BUILDINGS:
        name, asset, district, jobs, required = row
        if required and required not in resources and name in {"Smithy", "Carpenter"}:
            # Keep a shop/importer possible, but reduce its prevalence later.
            continue
        plan.append(row)
    return plan


def _generate_buildings(rng, roads, population, target_count, government, factions, environment):
    plan = _building_plan(population, government, factions, environment)
    required_count = len(plan)
    buildings = []
    logical_counts = Counter()
    job_count = 0
    for index in range(target_count):
        if index < required_count:
            template = plan[index]
        else:
            residential_weight = .58 if population < 1000 else .48
            if rng.random() < residential_weight:
                template = rng.choice(ECONOMIC_BUILDINGS[:2])
            else:
                template = rng.choice(plan[max(1, required_count - len(ECONOMIC_BUILDINGS)):])
        name, asset_key, district, jobs, _required = template
        road = roads[index % len(roads)]
        points = road["points"]
        start, end = points[0], points[-1]
        fraction = .12 + ((index * .173) % .76)
        dx, dy = end["x"] - start["x"], end["y"] - start["y"]
        length = math.hypot(dx, dy) or 1
        tangent = (dx / length, dy / length)
        normal = (-tangent[1], tangent[0])
        side = -1 if (index // len(roads)) % 2 else 1
        width, depth, rooms = ASSETS[asset_key]
        setback = road["width_feet"] / 2 + depth / 2 + rng.uniform(3, 10)
        x = start["x"] + dx * fraction + normal[0] * side * setback
        y = start["y"] + dy * fraction + normal[1] * side * setback
        building_name = name if logical_counts[name] == 0 else f"{name} {logical_counts[name] + 1}"
        buildings.append({
            "id": f"generated-building-{index+1}", "asset_key": asset_key, "name": building_name,
            "x": round(x, 2), "y": round(y, 2), "elevation": 0,
            "rotation": round(math.atan2(tangent[1], tangent[0]) + (math.pi if side > 0 else 0), 5),
            "width_feet": width, "depth_feet": depth, "rooms": list(rooms),
            "front_road_id": road["id"], "district_key": district,
            "generated": True,
        })
        logical_counts[name] += 1
        job_count += jobs
    household_capacity = sum(5 if b["asset_key"] == "timber_cottage" else 8 for b in buildings if b["district_key"] == "residential")
    return buildings, logical_counts, job_count, household_capacity


def generate_settlement(config):
    """Return a complete generated map plus a reproducible generation record."""
    settlement_type = str(config.get("settlement_type") or "town").lower()
    preset = SETTLEMENT_PRESETS.get(settlement_type, SETTLEMENT_PRESETS["other"])
    population = max(0, min(250000, int(config.get("population", preset["population"]))))
    seed = str(config.get("seed") or f"{config.get('name', 'settlement')}:{population}")[:120]
    rng = random.Random(seed)
    environment = {
        "biome": str((config.get("environment") or {}).get("biome") or "temperate grassland")[:80],
        "coastal": bool((config.get("environment") or {}).get("coastal")),
        "river": bool((config.get("environment") or {}).get("river")),
        "forest": bool((config.get("environment") or {}).get("forest")),
        "resources": [str(item)[:50] for item in (config.get("environment") or {}).get("resources", [])][:30],
    }
    factions = [str(item).strip()[:100] for item in config.get("factions", []) if str(item).strip()][:12]
    government_key = str(config.get("government") or "council")
    government = next((item for item in GOVERNMENTS if item["key"] == government_key), GOVERNMENTS[1])
    radius = preset["radius"]
    target_count = max(len(factions) + 3, min(220, preset["mapped_buildings"] + population // 1200))
    roads = _generate_roads(rng, radius, population, environment["coastal"])
    buildings, counts, jobs, capacity = _generate_buildings(rng, roads, population, target_count, government, factions, environment)
    races = config.get("race_distribution") or [{"name": "Human", "percentage": 100}]
    total = sum(max(0, float(item.get("percentage", 0))) for item in races) or 1
    normalized_races = [{"name": str(item.get("name") or "Unknown")[:80], "percentage": round(max(0, float(item.get("percentage", 0))) * 100 / total, 2)} for item in races]
    generation_config = {
        "generator": "kachhapa-settlement-v1", "seed": seed,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "government": government_key, "government_name": government["name"],
        "race_distribution": normalized_races, "factions": factions,
        "map_radius_feet": radius,
        "districts": sorted({building["district_key"] for building in buildings}),
        "report": {
            "target_population": population, "mapped_buildings": len(buildings),
            "logical_building_counts": dict(counts), "mapped_jobs": jobs,
            "mapped_household_capacity": capacity,
            "representation_note": "Large settlements use representative editable buildings; population remains authoritative.",
            "phases": ["environment", "government and factions", "economic dependencies", "road network and districts", "building placement", "outer landscape"],
        },
    }
    return {
        "population": population, "environment": environment, "generation_config": generation_config,
        "terrain_strokes": _terrain(environment, rng, radius), "roads": roads,
        "water_bodies": _generate_water(environment, rng, radius), "buildings": buildings,
        "reference_layers": [],
    }
