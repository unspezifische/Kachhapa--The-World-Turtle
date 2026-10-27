import unittest
from types import SimpleNamespace
from npc_schedules import compile_schedule, planned_schedule, schedule_from_domains
from npc_generation import smart_fill_npc


def schedule():
    return {'schema_version': 1, 'clock': 'campaign_calendar', 'visibility': 'dm_only', 'enabled': True, 'provenance': {'basis': 'dm_invention'}, 'bindings': {'home': {'resolved': {'settlement_id': 1, 'property_id': 'p'}}}, 'rules': [{'id': 'sleep', 'start': '22:00', 'duration_minutes': 480, 'priority': 10, 'activity': 'sleep', 'repeat': {'kind': 'daily'}, 'destination': {'binding': 'home', 'capability': 'sleep', 'fallbacks': []}, 'arrival_policy': 'require_arrival', 'on_unavailable': 'skip'}], 'exceptions': []}


class ScheduleTests(unittest.TestCase):
    def test_domain_schedule_preserves_manual_rules_and_orders_roles_deterministically(self):
        existing=schedule()
        roles=[
            {'id':22,'status':'active','position_title':'Second duty','priority':5,'occupation_association_id':1,'workplace':{},'schedule_override':{'start':'14:00','duration_minutes':120,'activity':'guard'}},
            {'id':21,'status':'active','position_title':'Primary duty','priority':20,'occupation_association_id':1,'workplace':{'resolved':{'settlement_id':1,'property_id':'watch'}},'schedule_override':{'start':'08:00','duration_minutes':480,'activity':'guard'}},
        ]
        occupations=[({'id':1,'status':'current','is_primary':True},{'occupation_key':'guard','schedule_archetype':{}})]
        first=schedule_from_domains('guard-1',occupations,roles,existing)
        second=schedule_from_domains('guard-1',occupations,list(reversed(roles)),first)
        self.assertEqual(first,second)
        self.assertEqual(first['rules'][0]['id'],'sleep')
        generated=first['rules'][1:]
        self.assertEqual([rule['id'] for rule in generated],['role-21-work','role-22-work'])
        self.assertTrue(all(rule['priority'] < first['rules'][0]['priority'] for rule in generated))
        self.assertEqual(first['bindings']['role-21-workplace']['resolved']['property_id'],'watch')

    def test_former_occupation_does_not_generate_an_active_routine(self):
        occupations=[({'id':9,'status':'former','is_primary':False},{'occupation_key':'adventurer','schedule_archetype':{}})]
        result=schedule_from_domains('retired',occupations,[],None)
        self.assertEqual(result['rules'],[])
        self.assertEqual(result['generated_from_domains']['occupation_ids'],[])

    def test_occupation_archetypes_use_room_purposes_and_allow_individual_role_overrides(self):
        occupations=[({'id':3,'status':'current','is_primary':True},{'occupation_key':'clergy','schedule_archetype':{}})]
        routine=schedule_from_domains('priestess',occupations,[],None)
        self.assertEqual(routine['rules'][0]['activity'],'worship')
        self.assertIn('chapel',routine['bindings']['workplace']['room_purposes'])
        independent=schedule_from_domains('researcher',occupations,[{'id':7,'status':'active','priority':1,'position_title':'Researcher','occupation_association_id':3,'workplace':{},'schedule_override':{'start':'11:00','duration_minutes':180,'activity':'study','room_purposes':['laboratory']}}],None)
        self.assertEqual(independent['rules'][0]['start'],'11:00')
        self.assertEqual(independent['bindings']['role-7-workplace']['room_purposes'],['laboratory'])

    def test_activity_weights_add_a_reproducible_lower_priority_suggestion(self):
        occupations=[(
            {'id':9,'status':'current','is_primary':True},
            {'occupation_key':'scholar','activity_weights':{'study':3,'read':1,'invalid':99}},
        )]
        first=schedule_from_domains('scholar-9',occupations,[],None)
        second=schedule_from_domains('scholar-9',occupations,[],None)
        self.assertEqual(first,second)
        self.assertEqual(len(first['rules']),2)
        self.assertIn(first['rules'][1]['activity'],{'study','read'})
        self.assertLess(first['rules'][1]['priority'],first['rules'][0]['priority'])
        self.assertEqual(first['rules'][1]['provenance']['source']['kind'],'occupation_activity_weights')

    def test_overnight_and_custom_day(self):
        document, compiled, warnings = compile_schedule(schedule())
        calendar = SimpleNamespace(current_year=1, current_month_index=0, current_day=2, current_hour=2, current_minute=0, get_hours_in_day=lambda: 24, get_minutes_in_hour=lambda: 60)
        planned = planned_schedule(compiled, calendar, lambda c, y, m, d: d-1)
        self.assertEqual(planned['current']['activity'], 'sleep')
        self.assertEqual(planned['current']['start_game_minute'], 1320)
        self.assertEqual(warnings, [])
        custom = schedule(); custom['rules'][0]['start'] = '28:00'
        compile_schedule(custom, 30, 60)
        with self.assertRaises(ValueError): compile_schedule(custom, 24, 60)

    def test_unresolved_binding_disables_execution_but_preserves_authoring(self):
        original = schedule(); original['bindings']['home'] = {'property_key': 'estate'}
        document, _, warnings = compile_schedule(original)
        self.assertFalse(document['enabled']); self.assertTrue(warnings)
        self.assertEqual(document['bindings']['home']['property_key'], 'estate')
        self.assertTrue(original['enabled'])

    def test_overlap_and_exception_priority(self):
        value = schedule(); value['rules'].append(dict(value['rules'][0], id='other'))
        with self.assertRaisesRegex(ValueError, 'Overlapping'): compile_schedule(value)
        value = schedule(); value['exceptions'] = [dict(value['rules'][0], id='festival', priority=100, repeat={'kind': 'once', 'date': {'year': 1, 'month_index': 0, 'day': 2}})]
        compile_schedule(value)
        value['exceptions'][0]['priority'] = 10
        with self.assertRaises(ValueError): compile_schedule(value)

    def test_provenance_activity_and_cycle_validation(self):
        for patch in ({'activity': 'execute-script'}, {'repeat': {'kind': 'cycle', 'cycle_days': 10, 'day_indices': [10], 'anchor_date': {'year':1,'month_index':0,'day':1}}}, {'provenance': {'basis': 'module_explicit'}}):
            value=schedule(); value['rules'][0].update(patch)
            with self.assertRaises(ValueError): compile_schedule(value)

    def test_keep_fields_and_targeted_reroll(self):
        original = {'name': 'Kept Name', 'occupation': 'scholar', 'creature_subtype': 'elf', 'strength': 8, 'description': ''}
        result = smart_fill_npc(original, list(original), seed=123)
        for key, value in original.items(): self.assertEqual(result['values'][key], value)
        roll = smart_fill_npc(result['values'], list(result['values']), target='name', seed=234)
        for key, value in result['values'].items():
            if key != 'name': self.assertEqual(roll['values'][key], value)
        self.assertNotEqual(roll['values']['name'], original['name'])

    def test_seed_and_occupation_assignment(self):
        values = {'occupation':'laborer'}
        a = smart_fill_npc(values, ['occupation'], seed='test')
        b = smart_fill_npc(values, ['occupation'], seed='test')
        self.assertEqual(a,b)
        self.assertGreaterEqual(a['values']['strength'], a['values']['intelligence'])
        self.assertEqual(a['values']['occupation'], 'laborer')
        with self.assertRaises(ValueError): smart_fill_npc({'creature_type':'dragon'}, ['creature_type'])

    def test_supplied_wdh_bundle_compiles_as_disabled_drafts(self):
        import json
        from pathlib import Path
        rows=[json.loads(line) for line in (Path(__file__).parents[2]/'docs/npc-schedules/wdh-v1/character-schedules.jsonl').read_text().splitlines() if line.strip()]
        self.assertEqual(len(rows),144)
        self.assertEqual(len({row['schedule_key'] for row in rows}),144)
        for row in rows:
            with self.subTest(npc=row['npc_key']):
                document, compiled, warnings=compile_schedule(row)
                self.assertFalse(document['enabled'])
                self.assertTrue(compiled)
                self.assertTrue(warnings)
                self.assertEqual(document['provenance'],row['provenance'])
