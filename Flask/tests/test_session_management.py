import unittest
from copy import deepcopy
from session_management import initial_state, apply_command, SessionError


class SessionManagementTests(unittest.TestCase):
    def setUp(self):
        self.roster = [{'id':1,'name':'One'},{'id':2,'name':'Two'}]
        self.state = initial_state(self.roster)
        self.now = 0
        self.run_command('create_session', {'title':'Session 1'})
        self.sid = self.state['sessions'][0]['id']

    def run_command(self, action, data=None, calendar=True):
        self.state, self.now = apply_command(self.state, action, data or {}, self.now, self.roster, calendar)

    def start(self):
        for c in self.roster:
            self.run_command('roster',dict(session_id=self.sid,character_id=c['id'],attendance='present',participation='player'))
        self.run_command('lifecycle',dict(session_id=self.sid,status='active',confirm_roster=True,continue_unresolved=True))

    def test_lifecycle_requires_confirmed_attendance_and_only_one_current_session(self):
        with self.assertRaises(SessionError):
            self.run_command('lifecycle',dict(session_id=self.sid,status='active',confirm_roster=True))
        self.start()
        self.run_command('create_session',{'title':'Other'})
        other = self.state['sessions'][-1]['id']
        with self.assertRaises(SessionError):
            self.run_command('lifecycle',dict(session_id=other,status='active',confirm_roster=True))
        self.run_command('lifecycle',dict(session_id=self.sid,status='paused'))
        self.assertEqual(self.now,0)
        with self.assertRaises(SessionError):
            self.run_command('advance',{'seconds':60})

    def test_split_groups_and_concurrent_ten_fifteen_minute_journeys(self):
        self.start()
        self.run_command('group',dict(name='Two',members=['2']))
        split = self.state['groups'][-1]
        self.assertEqual(split['location'],self.state['groups'][0]['location'])
        self.assertEqual(self.state['groups'][0]['members'],['1'])
        for group, seconds in zip(self.state['groups'],[600,900]):
            self.run_command('journey',dict(group_id=group['id'],seconds=seconds,destination={'label':'Inn'}))
        self.run_command('advance',{'seconds':3600})
        self.assertEqual(self.now,600)
        self.assertEqual(self.state['journeys'][0]['status'],'arrived')
        self.assertEqual(self.state['journeys'][1]['arrival']-self.now,300)
        with self.assertRaises(SessionError): self.run_command('next_event')
        self.run_command('acknowledge',{'ids':[p['id'] for p in self.state['pending']]})
        self.run_command('next_event')
        self.assertEqual(self.now,900)

    def test_simultaneous_arrivals_and_nonstopping_events(self):
        self.start()
        self.run_command('group',dict(name='Split',members=['2']))
        for group in self.state['groups']:
            self.run_command('journey',dict(group_id=group['id'],seconds=60,destination={'label':'Inn'}))
        self.run_command('event',dict(name='Bell',seconds=30,stop=False))
        self.run_command('next_event')
        self.assertEqual(self.now,60)
        self.assertEqual(len(self.state['pending']),2)
        self.assertEqual(self.state['events'][0]['status'],'due')

    def test_cannot_change_travelling_group_or_merge_different_locations(self):
        self.start()
        self.run_command('journey',dict(group_id='party',seconds=60,destination={'label':'Inn'}))
        with self.assertRaises(SessionError): self.run_command('group',dict(name='Split',members=['2']))
        self.run_command('stop_journey',dict(id=self.state['journeys'][0]['id'],location='Street'))
        self.run_command('group',dict(name='Split',members=['2']))
        split = self.state['groups'][-1]
        self.run_command('group',dict(id=split['id'],name='Split',members=['2'],location={'label':'Elsewhere'},relocate=True))
        with self.assertRaises(SessionError): self.run_command('group',dict(id='party',name='Party',members=['1','2']))
        self.run_command('group',dict(id='party',name='Party',members=['1','2'],location={'label':'Inn'},relocate=True))
        self.assertEqual(self.state['groups'][0]['members'],['1','2'])

    def prepare_combat(self):
        self.start()
        self.run_command('template',dict(name='Guard',notes='Private',participants=[{'name':'Guard','quantity':1}]))
        tid = self.state['templates'][0]['id']
        self.run_command('stage',dict(session_id=self.sid,template_id=tid))
        before = deepcopy(self.state['templates'][0])
        self.run_command('start_encounter',dict(template_id=tid,characters=['1']))
        self.assertEqual(before,self.state['templates'][0])
        e = self.state['encounters'][0]
        for i,c in enumerate(e['combatants']):
            self.run_command('initiative',dict(id=e['id'],combatant_id=c['id'],initiative=20-i))
        self.run_command('begin_encounter',{'id':e['id']})
        return e['id']

    def test_round_advances_six_seconds_once_and_event_retains_remainder(self):
        eid = self.prepare_combat()
        self.run_command('event',dict(name='Arrival',seconds=3))
        self.run_command('next_turn',{'id':eid})
        self.assertEqual(self.now,0)
        self.run_command('next_turn',{'id':eid})
        self.assertEqual(self.now,3)
        self.assertEqual(self.state['remainder'],3)
        self.assertEqual(self.state['encounters'][0]['round'],2)
        with self.assertRaises(SessionError): self.run_command('next_turn',{'id':eid})
        self.run_command('acknowledge',{'ids':[self.state['pending'][0]['id']]})
        self.run_command('continue_time')
        self.assertEqual(self.now,6)
        self.assertEqual(self.state['remainder'],0)
        with self.assertRaises(SessionError): self.run_command('begin_encounter',{'id':eid})

    def test_end_preserves_encounter_and_requires_explicit_continuation(self):
        eid = self.prepare_combat()
        self.run_command('lifecycle',dict(session_id=self.sid,status='ended',confirm_end=True))
        self.assertEqual(self.state['encounters'][0]['status'],'suspended')
        self.run_command('create_session',{'title':'Next'})
        self.sid = self.state['sessions'][-1]['id']
        for c in self.roster:
            self.run_command('roster',dict(session_id=self.sid,character_id=c['id'],attendance='absent',participation='accompanying'))
        with self.assertRaises(SessionError): self.run_command('lifecycle',dict(session_id=self.sid,status='active',confirm_roster=True))
        self.run_command('lifecycle',dict(session_id=self.sid,status='active',confirm_roster=True,continue_unresolved=True))
        self.run_command('encounter_status',dict(id=eid,status='running'))
        self.assertEqual(self.state['encounters'][0]['round'],1)

    def test_backward_correction_requires_suspended_combat(self):
        eid = self.prepare_combat()
        self.run_command('advance',{'seconds':60})
        with self.assertRaises(SessionError): self.run_command('set_time',{'target':0})
        self.run_command('encounter_status',dict(id=eid,status='suspended'))
        self.run_command('set_time',{'target':0})
        self.assertEqual(self.now,0)

    def test_future_events_require_explicit_continuation_and_can_be_cancelled(self):
        self.start()
        self.run_command('event',dict(name='Future interruption',seconds=600))
        event_id=self.state['events'][0]['id']
        self.run_command('lifecycle',dict(session_id=self.sid,status='ended',confirm_end=True))
        self.run_command('create_session',{'title':'Next'})
        self.sid=self.state['sessions'][-1]['id']
        for c in self.roster:
            self.run_command('roster',dict(session_id=self.sid,character_id=c['id'],attendance='present',participation='player'))
        with self.assertRaises(SessionError): self.run_command('lifecycle',dict(session_id=self.sid,status='active',confirm_roster=True))
        self.run_command('cancel_event',{'id':event_id})
        self.run_command('lifecycle',dict(session_id=self.sid,status='active',confirm_roster=True))
        self.assertEqual(self.state['events'][0]['status'],'cancelled')

    def test_renaming_a_mapped_place_does_not_change_group_location_identity(self):
        self.state['groups'][0]['location']={'key':'5:property:abc','label':'Old estate name'}
        self.run_command('group',dict(name='Split',members=['2']))
        split=self.state['groups'][-1]
        self.run_command('group',dict(id=split['id'],name='Split',members=['2'],location={'key':'5:property:abc','label':'Renamed estate'}))
        self.run_command('group',dict(id='party',name='Party',members=['1','2']))
        self.assertEqual(self.state['groups'][0]['members'],['1','2'])

    def test_errors_leave_original_document_unchanged(self):
        before = deepcopy(self.state)
        with self.assertRaises(SessionError): self.run_command('group',dict(name='Foreign',members=['999']))
        self.assertEqual(before,self.state)

    def test_no_calendar_still_allows_preparation_and_notes(self):
        self.run_command('update_session',dict(session_id=self.sid,prep='Prepare this'),calendar=False)
        self.start()
        with self.assertRaises(SessionError): self.run_command('event',dict(name='Bell',seconds=60),calendar=False)
        self.assertEqual(self.state['sessions'][0]['prep'],'Prepare this')


if __name__ == '__main__': unittest.main()
