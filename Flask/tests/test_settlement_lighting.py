import unittest
from settlement_lighting import generated_lighting_routes, road_centerline, validate_region_lighting, _cached_layout


def road(length=1000, **changes):
    return dict(id='main', name='Main', points=[dict(x=0,y=0),dict(x=length,y=0)],
                road_class='street', width_feet=30, **changes)


def region(identity='ward', **settings):
    return dict(id=identity, points=[dict(x=-10,y=-100),dict(x=10010,y=-100),dict(x=10010,y=100),dict(x=-10,y=100)],
                street_lighting=settings)


def lamps(routes):
    return [lamp for route in routes for lamp in route['lamps']]


class RegionalLightingTest(unittest.TestCase):
    def test_full_coverage_alternates_edges_at_correct_spacing(self):
        result=lamps(generated_lighting_routes(3,[road()],[],0))
        self.assertEqual(len(result),10)
        self.assertEqual([round(l['x']) for l in result],list(range(50,1000,100)))
        self.assertEqual([l['y'] for l in result[:2]],[17,-17])
        self.assertTrue(all(l['lit'] for l in result))

    def test_zero_coverage_and_hidden_roads(self):
        self.assertEqual(generated_lighting_routes(3,[road()], [region(coverage_by_class={'street':0})],0),[])
        self.assertEqual(generated_lighting_routes(3,[road(visible=False)], [],0),[])

    def test_broken_lamps_remain_present_and_never_light(self):
        result=lamps(generated_lighting_routes(3,[road()], [region(broken_percent=100)],0))
        self.assertEqual(len(result),10)
        self.assertTrue(all(l['broken'] and not l['lit'] for l in result))

    def test_percentage_changes_are_nested_and_stable_across_time(self):
        def selected(percent,minute):
            return lamps(generated_lighting_routes(3,[road(10000)], [region(coverage_by_class={'street':percent},broken_percent=75)],minute))
        a=selected(25,0); b=selected(75,12*60)
        self.assertTrue({l['id'] for l in a} <= {l['id'] for l in b})
        self.assertEqual({l['id']:l['broken'] for l in a},{l['id']:l['broken'] for l in selected(25,720)})

    def test_region_crossing_smallest_overlap_and_outside_defaults(self):
        outer=region('outer',coverage_by_class={'street':0})
        outer['points']=[dict(x=0,y=-100),dict(x=500,y=-100),dict(x=500,y=100),dict(x=0,y=100)]
        inner=region('inner',coverage_by_class={'street':100})
        inner['points']=[dict(x=0,y=-50),dict(x=200,y=-50),dict(x=200,y=50),dict(x=0,y=50)]
        result=lamps(generated_lighting_routes(3,[road()], [outer,inner],0))
        self.assertEqual(sorted(round(l['x']) for l in result),[50,150,550,650,750,850,950])
        self.assertEqual(next(l for l in result if round(l['x']) == 50)['region_id'],'inner')

    def test_spacing_and_per_segment_width(self):
        result=lamps(generated_lighting_routes(3,[road(segments=[{'width_feet':50}])], [region(spacing_feet=200)],0))
        self.assertEqual(len(result),5)
        self.assertEqual(result[0]['y'],27)

    def test_duplicate_roads_do_not_stack_poles(self):
        other=road();other['id']='parallel-copy'
        self.assertEqual(len(lamps(generated_lighting_routes(3,[road(),other],[],0))),10)

    def test_curved_centerline_matches_catmull_rom_fixture(self):
        r=road();r['points']=[dict(x=0,y=0),dict(x=100,y=100),dict(x=200,y=0)]
        curve=road_centerline(r)
        self.assertEqual(len(curve),97)
        self.assertAlmostEqual(curve[24]['x'],43.75)
        self.assertAlmostEqual(curve[24]['y'],56.25)

    def test_crews_finish_within_hour_skip_broken_and_clock_jumps(self):
        regions=[region(broken_percent=20)]
        routes=generated_lighting_routes(3,[road(10000)],regions,19*60)
        crews=[r for r in routes if r['phase'] != 'off_duty' or not r['id'].startswith('broken:')]
        self.assertGreater(len(crews),1)
        self.assertTrue(all(len(r['lamps'])<=30 for r in crews))
        self.assertTrue(all(l['lit'] == (not l['broken']) for l in lamps(routes)))
        self.assertTrue(all(not l['lit'] for l in lamps(generated_lighting_routes(3,[road(10000)],regions,6*60))))
        self.assertTrue(any(l['lit'] for l in lamps(generated_lighting_routes(3,[road(10000)],regions,18*60))))

    def test_layout_cache_reused_when_clock_changes(self):
        _cached_layout.cache_clear()
        generated_lighting_routes(3,[road()],[],0)
        generated_lighting_routes(3,[road()],[],720)
        self.assertEqual(_cached_layout.cache_info().misses,1)
        self.assertEqual(_cached_layout.cache_info().hits,1)
        self.assertNotEqual(lamps(generated_lighting_routes(4,[road()],[],0))[0]['id'],lamps(generated_lighting_routes(3,[road()],[],0))[0]['id'])

    def test_validation_rejects_invalid_percentages_and_spacing(self):
        for setting in ({'broken_percent':101},{'spacing_feet':39},{'coverage_by_class':{'street':'high'}},{'coverage_by_class':{'unknown':20}}):
            with self.assertRaises(ValueError):validate_region_lighting([region(**setting)])
        validate_region_lighting([region(broken_percent=75,spacing_feet=100)])


if __name__=='__main__': unittest.main()
