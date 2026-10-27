import unittest

from catalog_payloads import normalized_loot_box_items


class LootBoxPayloadTest(unittest.TestCase):
    def test_combines_duplicate_items_and_normalizes_quantities(self):
        self.assertEqual(normalized_loot_box_items([
            {'id': 4, 'quantity': '2'},
            {'id': 4, 'quantity': 3},
            {'id': 7, 'quantity': 0},
            {'id': 'bad', 'quantity': 1},
        ]), [
            {'id': 4, 'quantity': 5},
            {'id': 7, 'quantity': 1},
        ])

    def test_non_list_payload_is_empty(self):
        self.assertEqual(normalized_loot_box_items(None), [])


if __name__ == '__main__':
    unittest.main()
