"""Deterministic aggregate economy rules for settlement-scale simulation."""
from math import ceil, exp, hypot
import random


def commodity_price(base_price_cp, stock, target_stock, elasticity=0.65):
    safe_stock = max(target_stock * 0.08, stock)
    pressure = (target_stock / safe_stock) ** elasticity
    return max(1, round(base_price_cp * min(4.0, max(0.55, pressure))))


def simulate_commodity_day(market, disruption_units=0):
    stock = max(0, market['stock'] - max(0, disruption_units))
    current_price = commodity_price(market['base_price_cp'], stock, market['target_stock'], market['elasticity'])
    demand_response = (market['base_price_cp'] / current_price) ** 0.45
    consumed = min(stock, market['daily_demand'] * demand_response)
    stock -= consumed
    production = market['daily_supply'] * min(1.8, max(.7, (current_price / market['base_price_cp']) ** .35))
    stock += production
    imported = 0
    if stock < market['target_stock'] * market['import_threshold']:
        imported = min(market['import_quantity'], market['target_stock'] * 1.25 - stock)
        stock += max(0, imported)
    price = commodity_price(market['base_price_cp'], stock, market['target_stock'], market['elasticity'])
    return {'stock': round(stock, 2), 'price_cp': price, 'consumed': round(consumed, 2),
            'produced': round(production, 2), 'imported': round(imported, 2)}


def business_competition_share(business, competitors, radius_feet=700):
    own_score = max(.05, business['foot_traffic'] * business['quality'] * business['accessibility'])
    pressure = 0
    for competitor in competitors:
        if competitor['id'] == business['id'] or competitor.get('closed'):
            continue
        distance = hypot(competitor['x'] - business['x'], competitor['y'] - business['y'])
        competitor_score = max(.05, competitor['foot_traffic'] * competitor['quality'] * competitor['accessibility'])
        pressure += competitor_score * exp(-distance / radius_feet)
    return own_score / (own_score + pressure)


def simulate_business_day(business, competitors, day_index, market_demand=90):
    if business.get('closed'):
        return {'customers': 0, 'revenue_cp': 0, 'costs_cp': 0, 'profit_cp': 0,
                'cash_reserves_cp': business['cash_reserves_cp'], 'closed': True, 'slump_days': business.get('slump_days', 0)}
    share = business_competition_share(business, competitors)
    variation = random.Random(f"{business['id']}:{day_index}").uniform(.88, 1.12)
    customers = max(0, round(market_demand * share * business['foot_traffic'] * variation))
    customers = min(customers, business['daily_capacity'])
    revenue = round(customers * business['average_sale_cp'])
    variable_cost = round(revenue * business['cost_of_goods_rate'])
    costs = variable_cost + business['daily_overhead_cp']
    profit = revenue - costs
    reserves = business['cash_reserves_cp'] + profit
    slump_days = business.get('slump_days', 0) + 1 if profit < 0 else max(0, business.get('slump_days', 0) - 1)
    closed = reserves <= 0 and slump_days >= business.get('closure_grace_days', 3)
    return {'customers': customers, 'revenue_cp': revenue, 'costs_cp': costs, 'profit_cp': profit,
            'cash_reserves_cp': reserves, 'closed': closed, 'slump_days': slump_days, 'market_share': round(share, 4)}
