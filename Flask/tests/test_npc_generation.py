import random
import unittest

from module_npcs import module_npc_presets
from npc_generation import choose_occupation, generated_npc, smart_fill_npc, supported_generation_options


class NpcGenerationTest(unittest.TestCase):
    def test_seeded_generation_is_reproducible_and_complete(self):
        first = generated_npc(seed="campaign-7:npc-1")
        second = generated_npc(seed="campaign-7:npc-1")

        self.assertEqual(first, second)
        self.assertIn(first["generation"]["occupation"], {row["key"] for row in supported_generation_options()["occupations"]})
        for ability in ("strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"):
            self.assertGreaterEqual(first[ability], 3)
            self.assertLessEqual(first[ability], 18)

    def test_requested_ancestry_and_occupation_are_honored(self):
        npc = generated_npc(seed=22, ancestry="dwarf", gender="woman", occupation="porter")

        self.assertEqual(npc["creature_subtype"], "dwarf")
        self.assertEqual(npc["generation"]["occupation"], "porter")
        self.assertIn("porter", npc["description"].lower())

    def test_high_ability_jobs_are_preferred(self):
        scores = {
            "strength": 7, "dexterity": 12, "constitution": 7,
            "intelligence": 10, "wisdom": 10, "charisma": 18,
        }
        rng = random.Random(8)
        selections = [choose_occupation(scores, rng, ("laborer", "performer")) for _ in range(100)]

        self.assertGreater(selections.count("performer"), 90)

    def test_editor_options_expose_complete_canonical_lists(self):
        options = supported_generation_options()

        self.assertEqual(len(options["alignments"]), 9)
        self.assertEqual(len(options["creature_types"]), 14)
        self.assertEqual(len(options["sizes"]), 6)
        self.assertEqual(len(options["skills"]), 18)
        self.assertEqual(len(options["saving_throws"]), 6)
        self.assertIn("Common", options["languages"])
        self.assertIn("ancestries", options)  # legacy response contract
        occupations = {row["key"]: row["label"] for row in options["occupations"]}
        self.assertEqual(occupations["clergy"], "Clergy")
        self.assertEqual(occupations["adventurer"], "Adventurer")
        self.assertEqual(occupations["retired_adventurer"], "Adventurer, retired")
        self.assertEqual(occupations["researcher"], "Researcher")
        self.assertEqual(occupations["shopkeeper"], "Shopkeeper")
        self.assertEqual(occupations["government_official"], "Government Official")

    def test_custom_species_can_be_kept_during_smart_fill(self):
        result = smart_fill_npc(
            values={"creature_subtype": "glassborn"},
            locked={"creature_subtype"},
            seed="custom-species",
        )

        self.assertEqual(result["values"]["creature_subtype"], "glassborn")
        self.assertEqual(result["generation"]["ancestry"], "glassborn")

    def test_waterdeep_presets_cover_named_appendix_npcs(self):
        presets = module_npc_presets("waterdeep_dragon_heist")
        names = {preset["name"] for preset in presets}

        self.assertGreaterEqual(len(presets), 35)
        self.assertEqual(len(names), len(presets))
        self.assertIn("Laeral Silverhand", names)
        self.assertIn("Jarlaxle Baenre", names)
        self.assertIn("Xanathar", names)
        self.assertIn("Volothamp Geddarm", names)
        self.assertTrue(all(preset["description"] for preset in presets))


if __name__ == "__main__":
    unittest.main()
