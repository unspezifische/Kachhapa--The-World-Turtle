import unittest
from types import SimpleNamespace
from unittest.mock import patch

from flask_jwt_extended import create_access_token

import app as app_module


class FriendCampaignInvitationApiTests(unittest.TestCase):
    def setUp(self):
        self.previous_testing = app_module.app.config.get('TESTING')
        app_module.app.config['TESTING'] = True
        self.context = app_module.app.app_context()
        self.context.push()
        self.client = app_module.app.test_client()
        self.headers = {'Authorization': f"Bearer {create_access_token(identity='tester')}"}
        self.user = SimpleNamespace(id=3, username='tester', is_online=True, profile_photo=None)

    def tearDown(self):
        self.context.pop()
        app_module.app.config['TESTING'] = self.previous_testing

    def test_friend_pairs_are_canonical_and_requests_use_exact_case_insensitive_username(self):
        recipient = SimpleNamespace(id=9, username='friend', is_online=False, profile_photo=None)
        with patch.object(app_module.User, 'query') as users, \
             patch.object(app_module.FriendConnection, 'query') as connections, \
             patch.object(app_module.db.session, 'add') as add, \
             patch.object(app_module.db.session, 'commit'):
            users.filter_by.return_value.first.return_value = self.user
            users.filter.return_value.first.return_value = recipient
            connections.filter_by.return_value.first.return_value = None
            response = self.client.post('/api/friend-requests', json={'username': 'FrIeNd'}, headers=self.headers)
            self.assertEqual(response.status_code, 201)
            created = add.call_args.args[0]
            self.assertEqual((created.user_low_id, created.user_high_id), (3, 9))
            self.assertEqual(created.requested_by_id, 3)
            users.filter.assert_called_once()

    def test_reverse_pending_friend_request_returns_a_stable_conflict(self):
        recipient = SimpleNamespace(id=9, username='friend', is_online=False, profile_photo=None)
        existing = SimpleNamespace(status='pending', requested_by_id=9)
        with patch.object(app_module.User, 'query') as users, \
             patch.object(app_module.FriendConnection, 'query') as connections:
            users.filter_by.return_value.first.return_value = self.user
            users.filter.return_value.first.return_value = recipient
            connections.filter_by.return_value.first.return_value = existing
            response = self.client.post('/api/friend-requests', json={'username': 'friend'}, headers=self.headers)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json['message'], 'This user already sent you a friend request.')

    def test_pending_campaign_invitation_accepts_only_owned_unassigned_exact_rules_character(self):
        invitation = SimpleNamespace(id=4, invitee_id=3, campaign_id=7, status='pending', responded_at=None)
        campaign = SimpleNamespace(id=7, dm_id=1, owner_id=1, rules_system='D&D 5e',
                                   to_dict=lambda: {'id': 7, 'name': 'Hollow', 'rules_system': 'D&D 5e'})
        character = SimpleNamespace(id=12, userID=3, campaignID=None, system='D&D 5e',
                                    to_dict=lambda: {'id': 12, 'campaignID': 7})
        with patch.object(app_module.User, 'query') as users, \
             patch.object(app_module.CampaignInvitation, 'query') as invitations, \
             patch.object(app_module.Campaign, 'query') as campaigns, \
             patch.object(app_module.Character, 'query') as characters, \
             patch.object(app_module.db.session, 'execute') as execute, \
             patch.object(app_module.db.session, 'commit'):
            users.filter_by.return_value.first.return_value = self.user
            invitations.filter_by.return_value.first.return_value = invitation
            campaigns.get.return_value = campaign
            characters.filter_by.return_value.first.return_value = character
            execute.return_value.first.return_value = None
            response = self.client.patch('/api/campaign-invitations/4', json={
                'action': 'accept', 'character_id': 12,
            }, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(character.campaignID, 7)
            self.assertEqual(invitation.status, 'accepted')
            self.assertEqual(response.json['character']['id'], 12)

            character.campaignID = 6
            invitation.status = 'pending'
            response = self.client.patch('/api/campaign-invitations/4', json={
                'action': 'accept', 'character_id': 12,
            }, headers=self.headers)
            self.assertEqual(response.status_code, 400)

    def test_pending_invitations_do_not_appear_in_active_campaigns(self):
        self.user.campaigns = []
        with patch.object(app_module.User, 'query') as users:
            users.filter_by.return_value.first.return_value = self.user
            response = self.client.get('/api/campaigns', headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, [])

    def test_registration_creates_only_the_account(self):
        def assign_id(value):
            if isinstance(value, app_module.User):
                value.id = 21

        with patch.object(app_module.User, 'query') as users, \
             patch.object(app_module.db.session, 'add', side_effect=assign_id) as add, \
             patch.object(app_module.db.session, 'execute') as execute, \
             patch.object(app_module.db.session, 'commit'):
            users.filter_by.return_value.first.return_value = None
            response = self.client.post('/api/register', json={
                'username': 'newfriend', 'password': 'a-valid-password',
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['user_id'], 21)
            self.assertIsNone(response.json['character'])
            self.assertIsInstance(add.call_args.args[0], app_module.User)
            execute.assert_not_called()

    def test_dm_can_set_campaign_wiki_permission(self):
        campaign = SimpleNamespace(id=7, dm_id=3, owner_id=3, wiki_permission='everyone')
        with patch.object(app_module.Campaign, 'query') as campaigns, \
             patch.object(app_module, 'user_can_edit_campaign', return_value=True), \
             patch.object(app_module.db.session, 'commit'):
            campaigns.get.return_value = campaign
            response = self.client.patch('/api/campaigns/7/wiki-permissions', json={
                'mode': 'scribes_only',
            }, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(campaign.wiki_permission, 'scribes_only')

    def test_wiki_write_mode_keeps_dm_access_and_distinguishes_approval_scribes(self):
        campaign = SimpleNamespace(id=7, dm_id=3, owner_id=3, wiki_permission='dm_only')
        self.assertEqual(app_module.wiki_write_mode(campaign, self.user), 'direct')

        player = SimpleNamespace(id=9)
        campaign.wiki_permission = 'scribes_only'
        membership_result = SimpleNamespace(first=lambda: SimpleNamespace(userID=9))
        assignment = SimpleNamespace(role='scribe_approval')
        with patch.object(app_module.db.session, 'execute', return_value=membership_result), \
             patch.object(app_module.CampaignWikiRole, 'query') as roles:
            roles.filter_by.return_value.first.return_value = assignment
            self.assertEqual(app_module.wiki_write_mode(campaign, player), 'proposal')
            assignment.role = 'scribe'
            self.assertEqual(app_module.wiki_write_mode(campaign, player), 'direct')
            assignment.role = 'read_only'
            self.assertIsNone(app_module.wiki_write_mode(campaign, player))

    def test_approval_scribe_submission_does_not_mutate_the_page(self):
        campaign = SimpleNamespace(id=7)
        page = SimpleNamespace(id=11, content='Published')
        with patch.object(app_module, 'wiki_write_mode', return_value='proposal'), \
             patch.object(app_module.db.session, 'add') as add, \
             patch.object(app_module.db.session, 'commit'):
            result, error = app_module.submit_wiki_content(
                campaign, 'History', 'Awaiting review', self.user, page=page)
            self.assertIsNone(error)
            self.assertTrue(result['pending_approval'])
            self.assertEqual(page.content, 'Published')
            proposal = add.call_args.args[0]
            self.assertEqual(proposal.content, 'Awaiting review')
            self.assertEqual(proposal.submitted_by_id, 3)


if __name__ == '__main__':
    unittest.main()
