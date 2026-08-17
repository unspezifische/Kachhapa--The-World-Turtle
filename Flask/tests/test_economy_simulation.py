import unittest

from economy_simulation import commodity_price, simulate_business_day, simulate_commodity_day


class EconomySimulationTest(unittest.TestCase):
    def test_player_shortage_raises_price(self):
        self.assertGreater(commodity_price(10, 10, 100), commodity_price(10, 100, 100))

    def test_imports_replenish_a_short_market(self):
        market = {'base_price_cp':10,'stock':15,'target_stock':100,'elasticity':.65,'daily_demand':10,
                  'daily_supply':4,'import_threshold':.35,'import_quantity':60}
        result = simulate_commodity_day(market)
        self.assertGreater(result['imported'], 0)
        self.assertGreater(result['stock'], 15)

    def test_market_recovers_after_a_large_player_purchase(self):
        market = {'base_price_cp':8,'stock':120,'target_stock':420,'elasticity':.65,'daily_demand':38,
                  'daily_supply':38,'import_threshold':.32,'import_quantity':140}
        prices = []
        for _ in range(80):
            result = simulate_commodity_day(market)
            market['stock'] = result['stock']
            prices.append(result['price_cp'])
        self.assertGreater(prices[0], market['base_price_cp'])
        self.assertLessEqual(prices[-1], market['base_price_cp'] + 1)

    def test_nearby_competitor_reduces_tavern_sales(self):
        tavern = {'id':1,'x':0,'y':0,'foot_traffic':1,'quality':1,'accessibility':1,'cash_reserves_cp':10000,
                  'daily_capacity':100,'average_sale_cp':40,'cost_of_goods_rate':.4,'daily_overhead_cp':500,'slump_days':0}
        rival = {**tavern,'id':2,'x':50,'cash_reserves_cp':10000}
        alone = simulate_business_day(tavern,[tavern],1)
        competing = simulate_business_day(tavern,[tavern,rival],1)
        self.assertLess(competing['customers'], alone['customers'])

    def test_reserves_cover_a_sales_slump(self):
        tavern = {'id':1,'x':0,'y':0,'foot_traffic':.05,'quality':.5,'accessibility':1,'cash_reserves_cp':10000,
                  'daily_capacity':100,'average_sale_cp':40,'cost_of_goods_rate':.4,'daily_overhead_cp':800,'slump_days':2}
        result = simulate_business_day(tavern,[tavern],3,market_demand=1)
        self.assertLess(result['profit_cp'], 0)
        self.assertFalse(result['closed'])


if __name__ == '__main__':
    unittest.main()
