export const DEFAULT_STREET_LIGHTING = {
  coverage_by_class: { trail: 0, alley: 0, lane: 50, street: 100, avenue: 100, highway: 100 },
  broken_percent: 0,
  spacing_feet: 100,
};

export function settlementLamps(simulation, settlementId) {
  if (settlementId == null) return [];
  return (simulation?.routes || [])
    .filter(route => String(route.settlement_id) === String(settlementId))
    .flatMap(route => route.lamps || []);
}
