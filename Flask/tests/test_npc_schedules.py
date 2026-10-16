import unittest
from types import SimpleNamespace
from npc_schedules import compile_schedule, planned_schedule
from npc_generation import smart_fill_npc


def schedule():
    return {'schema_version': 1, 'clock': 'campaign_calendar', 'visibility': 'dm_only', 'enabled': True, 'provenance': {'basis': 'dm_invention'}, 'bindings': {'home': {'resolved': {'settlement_id': 1, 'property_id': 'p'}}}, 'rules': [{'id': 'sleep', 'start': '22:00', 'duration_minutes': 480, 'priority': 10, 'activity': 'sleep', 'repeat': {'kind': 'daily'}, 'destination': {'binding': 'home', 'capability': 'sleep', 'fallbacks': []}, 'arrival_policy': 'require_arrival', 'on_unavailable': 'skip'}], 'exceptions': []}


class ScheduleTests(unittest.TestCase):
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
