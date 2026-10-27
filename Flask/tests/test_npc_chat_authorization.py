"""Exercise the actual existing socket handler's new NPC-author boundary."""
import ast
import logging
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


class NpcChatAuthorizationTests(unittest.TestCase):
    def handler(self, connected_id=1, dm_id=1):
        tree=ast.parse((Path(__file__).parents[1]/'app.py').read_text())
        function=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='handle_send_message')
        function.decorator_list=[]
        user=Mock();user.query.filter_by.return_value.first.return_value=SimpleNamespace(id=connected_id)
        npc=Mock();npc.query.filter_by.return_value.first.return_value=None
        campaign=SimpleNamespace(id=1,dm_id=dm_id,owner_id=dm_id)
        db=Mock();db.session.get.return_value=campaign
        scope={'app':SimpleNamespace(logger=logging.getLogger(__name__)),'User':user,'NPC':npc,'Campaign':object,'db':db,'request':SimpleNamespace(sid='connected')}
        exec(compile(ast.Module(body=[function],type_ignores=[]),'app.py','exec'),scope)
        return scope['handle_send_message']

    def test_sender_cannot_spoof_another_author(self):
        result=self.handler(connected_id=2)({'sender':1,'sender_npc_id':7,'campaignID':1,'type':'text_message','text':'Fake','recipients':[]})
        self.assertIn('Unauthorized',result['error'])

    def test_only_dm_may_send_npc_messages(self):
        result=self.handler(connected_id=2,dm_id=1)({'sender':2,'sender_npc_id':7,'campaignID':1,'type':'text_message','text':'Fake','recipients':[]})
        self.assertIn('Only the DM',result['error'])

    def test_nonexistent_or_cross_campaign_npc_is_rejected(self):
        result=self.handler()({'sender':1,'sender_npc_id':7,'campaignID':1,'type':'text_message','text':'Fake','recipients':[]})
        self.assertEqual(result['error'],'NPC not found')
