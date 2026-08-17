"""Ability-aware workforce balancing and noble investment rules."""
from math import hypot


ABILITIES = ('strength','dexterity','constitution','intelligence','wisdom','charisma')


def occupation_suitability(agent, occupation):
    weights = occupation.get('ability_weights') or {}
    total_weight = sum(max(0, weights.get(ability, 0)) for ability in ABILITIES) or 1
    weighted = sum(max(0, min(20, agent.get(ability, 10))) * max(0, weights.get(ability, 0)) for ability in ABILITIES)
    return round(weighted / (20 * total_weight), 4)


def rebalance_workforce(agents, occupations, day_index, demand_multipliers=None, cooldown_days=30):
    demand_multipliers = demand_multipliers or {}
    occupation_by_key = {item['key']: item for item in occupations}
    targets = {item['key']: max(0, round(item['target_workers'] * demand_multipliers.get(item['key'], 1))) for item in occupations}
    counts = {key: 0 for key in targets}
    for agent in agents:
        if agent.get('occupation_key') in counts:
            counts[agent['occupation_key']] += 1

    changes = []
    eligible = [agent for agent in agents if agent.get('economic_autonomy') and not agent.get('story_locked')
                and agent.get('social_class') != 'noble' and agent.get('career_cooldown_until_day', 0) <= day_index]
    candidates = [agent for agent in eligible if not agent.get('occupation_key')]
    for occupation_key, count in counts.items():
        overage = max(0, count - targets[occupation_key])
        if not overage:
            continue
        occupation = occupation_by_key[occupation_key]
        incumbents = sorted(
            (agent for agent in eligible if agent.get('occupation_key') == occupation_key),
            key=lambda agent: (occupation_suitability(agent, occupation), agent['id']),
        )
        candidates.extend(incumbents[:overage])

    for agent in candidates:
        current_key = agent.get('occupation_key')
        vacancies = [occupation for occupation in occupations if counts[occupation['key']] < targets[occupation['key']]]
        if not vacancies:
            continue
        ranked = sorted(vacancies, key=lambda occupation: occupation_suitability(agent, occupation), reverse=True)
        best = ranked[0]
        best_score = occupation_suitability(agent, best)
        if best_score < best.get('minimum_suitability', .42):
            continue
        old_score = occupation_suitability(agent, occupation_by_key[current_key]) if current_key in occupation_by_key else 0
        if current_key: counts[current_key] -= 1
        counts[best['key']] += 1
        agent['occupation_key'] = best['key']
        agent['career_cooldown_until_day'] = day_index + cooldown_days
        changes.append({'agent_id':agent['id'],'from':current_key,'to':best['key'],'old_suitability':old_score,
                        'new_suitability':best_score,'reason':'overrepresented' if current_key else 'vacancy'})
    return {'changes':changes,'counts':counts,'targets':targets}


def choose_noble_investment(family, businesses, recent_profit_by_business, max_fraction=.12):
    candidates=[]
    for business in businesses:
        if business.get('closed'): continue
        recent_profit=recent_profit_by_business.get(business['id'],0)
        reserve_health=max(.1,min(2,business['cash_reserves_cp']/max(1,business.get('daily_overhead_cp',500)*30)))
        score=(recent_profit/max(1,business.get('daily_overhead_cp',500)*10))*.7+reserve_health*.3
        candidates.append((score,business))
    if not candidates or family['wealth_cp'] < 1000: return None
    score,business=max(candidates,key=lambda item:item[0])
    if score <= 0: return None
    amount=min(round(family['wealth_cp']*max_fraction),max(0,business.get('desired_investment_cp',10000)))
    if amount < 100: return None
    return {'business_id':business['id'],'amount_cp':amount,'score':round(score,3)}
