import { settlementLamps } from './settlementStreetLighting';

test('both views receive every route for their settlement, including broken lamps and legacy routes', () => {
  const simulation = { routes: [
    { settlement_id: 3, lamps: [{ id: 1, lit: true }] },
    { settlement_id: 3, generated: true, lamps: [{ id: 2, broken: true, lit: false }] },
    { settlement_id: 4, lamps: [{ id: 3 }] },
  ] };
  expect(settlementLamps(simulation, '3').map(lamp => lamp.id)).toEqual([1, 2]);
  expect(settlementLamps(simulation, 4).map(lamp => lamp.id)).toEqual([3]);
  expect(settlementLamps(simulation, null)).toEqual([]);
});
