import {
  buildingOpenStatus,
  buildingViewCategory,
  buildingViewColor,
  buildingViewLegend,
  linkedBusinessForBuilding,
} from './settlementInspection';

test('daily hours report open, closed, overnight, and unknown states', () => {
  expect(buildingOpenStatus({ opens_at: '09:00', closes_at: '17:00' }, { hour: 12, minute: 0 }).key).toBe('open');
  expect(buildingOpenStatus({ opens_at: '09:00', closes_at: '17:00' }, { hour: 18, minute: 0 }).key).toBe('closed');
  expect(buildingOpenStatus({ opens_at: '20:00', closes_at: '02:00' }, { hour: 1, minute: 30 }).key).toBe('open');
  expect(buildingOpenStatus({ opens_at: '20:00', closes_at: '02:00' }, { hour: 12, minute: 0 }).key).toBe('closed');
  expect(buildingOpenStatus({}, { hour: 12, minute: 0 }).key).toBe('unknown');
  expect(buildingOpenStatus({ opens_at: '25:00', closes_at: '17:00' }, { hour: 12 }).key).toBe('unknown');
  expect(buildingOpenStatus({ opens_at: '09:00' }, { hour: 12 }).key).toBe('unknown');
  expect(buildingOpenStatus({ opens_at: '09:00', closes_at: '17:00' }, { hour: 9 }).key).toBe('open');
  expect(buildingOpenStatus({ opens_at: '09:00', closes_at: '17:00' }, { hour: 17 }).key).toBe('closed');
  expect(buildingOpenStatus({ opens_at: '20:00', closes_at: '02:00' }, { hour: 2 }).key).toBe('closed');
  expect(buildingOpenStatus({ opens_at: '00:00', closes_at: '00:00' }, { hour: 23 }).key).toBe('open');
});

test('business links prefer explicit ids and only accept unique name matches', () => {
  const businesses = [
    { id: 1, name: 'The Bent Coin', closed: false },
    { id: 2, name: 'The Bent Coin', closed: true },
    { id: 3, name: 'Copper Kettle', closed: false },
  ];
  expect(linkedBusinessForBuilding({ economy_business_id: 2, name: 'Other' }, businesses)?.id).toBe(2);
  expect(linkedBusinessForBuilding({ name: 'Copper Kettle' }, businesses)?.id).toBe(3);
  expect(linkedBusinessForBuilding({ name: 'The Bent Coin' }, businesses)).toBeNull();
  expect(linkedBusinessForBuilding({ economy_business_id: 99, name: 'Copper Kettle' }, businesses)).toBeNull();
  expect(linkedBusinessForBuilding({ name: '  COPPER   KETTLE  ' }, businesses)?.id).toBe(3);
  expect(linkedBusinessForBuilding({ name: 'Copper Kettle' }, businesses, [{ id: 1, name: 'Copper Kettle' }, { id: 2, name: 'Copper Kettle' }])).toBeNull();
});

test('map modes classify buildings consistently and include unclassified legend rows', () => {
  const assets = [{ key: 'shop', category: 'shop', color: '#123456' }];
  const buildings = [
    { id: 1, asset_key: 'shop', district_key: 'market', business_type: 'blacksmith' },
    { id: 2 },
  ];
  expect(buildingViewColor(buildings[0], assets[0], 'satellite')).toBe('#123456');
  expect(buildingViewCategory(buildings[0], assets[0], 'useful')).toBe('Shops & trade');
  expect(buildingViewColor(buildings[0], assets[0], 'districts')).toBe(
    buildingViewColor({ district_key: 'market' }, {}, 'districts')
  );
  expect(buildingViewLegend(buildings, assets, 'building-type').at(-1).label).toBe('Unclassified');
  expect(buildingViewLegend(buildings, assets, 'satellite')).toEqual([]);
  expect(buildingViewColor(buildings[0], assets[0], 'useful')).not.toBe(assets[0].color);
  expect(buildingViewColor({ business_type: 'blacksmith' }, {}, 'building-type')).not.toBe(
    buildingViewColor({ business_type: 'tavern' }, {}, 'building-type')
  );
  expect(buildingViewLegend(buildings, assets, 'districts').map(row => row.label)).toEqual(['market', 'Unclassified']);
  expect(buildingViewCategory({ business_type: 'inn', asset_key: 'shop' }, assets[0], 'useful')).toBe('Food & lodging');
  expect(buildingViewCategory({ building_type: 'residential' }, {}, 'useful')).toBe('Other buildings');
  expect(buildingViewCategory({ name: 'Bakery' }, {}, 'building-type', [{ id: 4, name: 'Bakery', business_type: 'baker' }])).toBe('baker');
});
