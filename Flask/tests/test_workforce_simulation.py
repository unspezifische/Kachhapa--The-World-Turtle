import unittest
from workforce_simulation import occupation_suitability, rebalance_workforce, choose_noble_investment


class WorkforceSimulationTest(unittest.TestCase):
    def test_charismatic_agent_prefers_sales_vacancy(self):
        agent={'id':1,'strength':8,'dexterity':10,'constitution':10,'intelligence':12,'wisdom':12,'charisma':19,
               'occupation_key':'laborer','economic_autonomy':True,'story_locked':False,'social_class':'commoner','career_cooldown_until_day':0}
        jobs=[{'key':'laborer','target_workers':0,'ability_weights':{'strength':.7,'constitution':.3}},
              {'key':'sales','target_workers':1,'ability_weights':{'charisma':.7,'wisdom':.2,'intelligence':.1},'minimum_suitability':.4}]
        result=rebalance_workforce([agent],jobs,10)
        self.assertEqual(result['changes'][0]['to'],'sales')

    def test_story_locked_agent_never_switches(self):
        agent={'id':1,'strength':8,'dexterity':10,'constitution':10,'intelligence':12,'wisdom':12,'charisma':19,
               'occupation_key':'laborer','economic_autonomy':True,'story_locked':True,'social_class':'commoner','career_cooldown_until_day':0}
        jobs=[{'key':'laborer','target_workers':0,'ability_weights':{'strength':1}}, {'key':'sales','target_workers':1,'ability_weights':{'charisma':1}}]
        self.assertEqual(rebalance_workforce([agent],jobs,10)['changes'],[])

    def test_least_suitable_incumbent_switches_first(self):
        weak={'id':1,'strength':7,'constitution':8,'charisma':18,'occupation_key':'laborer','economic_autonomy':True,'story_locked':False,'social_class':'commoner','career_cooldown_until_day':0}
        strong={'id':2,'strength':19,'constitution':18,'charisma':8,'occupation_key':'laborer','economic_autonomy':True,'story_locked':False,'social_class':'commoner','career_cooldown_until_day':0}
        jobs=[{'key':'laborer','target_workers':1,'ability_weights':{'strength':.7,'constitution':.3}}, {'key':'sales','target_workers':1,'ability_weights':{'charisma':1},'minimum_suitability':.4}]
        result=rebalance_workforce([weak,strong],jobs,10)
        self.assertEqual(result['changes'][0]['agent_id'],weak['id'])
        self.assertEqual(strong['occupation_key'],'laborer')

    def test_strength_drives_hauling_suitability(self):
        strong={'strength':19,'constitution':17};weak={'strength':7,'constitution':9}
        hauling={'ability_weights':{'strength':.65,'constitution':.35}}
        self.assertGreater(occupation_suitability(strong,hauling),occupation_suitability(weak,hauling))

    def test_noble_invests_without_taking_job(self):
        family={'wealth_cp':100000}
        businesses=[{'id':4,'closed':False,'cash_reserves_cp':10000,'daily_overhead_cp':500,'desired_investment_cp':8000}]
        decision=choose_noble_investment(family,businesses,{4:3000})
        self.assertEqual(decision['business_id'],4);self.assertEqual(decision['amount_cp'],8000)


if __name__=='__main__': unittest.main()
