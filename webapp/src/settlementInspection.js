const VIEW_PALETTE = [
  '#d9b44a', '#5fbf73', '#5d8fe8', '#bd6de3', '#e87c4a',
  '#48aaa7', '#d96078', '#90b84d', '#8b79d1', '#c8955b',
];

const TYPE_COLORS = {
  government: '#48545c', governance: '#48545c', civic: '#48545c',
  residence: '#5fbf73', residential: '#5fbf73',
  commercial: '#d9b44a', shop: '#d9b44a', market: '#b6cf4f',
  artisan: '#a690d9', cultural: '#bd6de3', educational: '#d960bb',
  farm: '#90a84b', industrial: '#c8955b', warehouse: '#969da5',
  hospitality: '#48aaa7', inn: '#48aaa7', tavern: '#cf69bc',
  service: '#5d8fe8', religious: '#e87c4a', faction: '#817c91',
  blacksmith: '#a66e45', smithy: '#a66e45', bakery: '#e4a16a',
  military: '#d96078', 'law enforcement': '#d96078',
};

const USEFUL_GROUPS = {
  'Civic & government': {
    color: '#d8c06a',
    terms: ['government', 'governance', 'civic', 'watch', 'guard', 'hall', 'court', 'law'],
  },
  'Shops & trade': {
    color: '#62bd6f',
    terms: ['shop', 'store', 'market', 'smith', 'bakery', 'carpenter', 'artisan', 'trade', 'guild', 'commercial', 'armourer', 'armorer', 'jeweler', 'tailor', 'fletcher', 'tanner'],
  },
  'Food & lodging': {
    color: '#4fb3ba',
    terms: ['tavern', 'inn', 'lodging', 'restaurant', 'food', 'drink', 'hospitality'],
  },
  'Religion & culture': {
    color: '#c879d8',
    terms: ['temple', 'shrine', 'religious', 'culture', 'school', 'library'],
  },
  'Services': {
    color: '#688fe3',
    terms: ['service', 'healer', 'hospital', 'stable', 'warehouse', 'industrial'],
  },
};

const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const displayLabel = value => String(value ?? '').trim().replace(/[_-]+/g, ' ');

const hashIndex = value => {
  let hash = 0;
  for (const character of normalize(value)) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % VIEW_PALETTE.length;
};

const parseTime = value => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? hour * 60 + minute
    : null;
};

export function buildingOpenStatus(building, time = {}) {
  const opensAt = parseTime(building?.opens_at);
  const closesAt = parseTime(building?.closes_at);
  if (opensAt == null || closesAt == null) return { key: 'unknown', label: 'Hours unknown' };

  const now = ((Number(time.hour) || 0) * 60 + (Number(time.minute) || 0)) % 1440;
  const isOpen = opensAt === closesAt
    || (opensAt < closesAt ? now >= opensAt && now < closesAt : now >= opensAt || now < closesAt);

  return {
    key: isOpen ? 'open' : 'closed',
    label: isOpen ? 'Open now' : 'Closed now',
    hours: `${building.opens_at}–${building.closes_at}`,
  };
}

export function linkedBusinessForBuilding(building, businesses = [], buildings = []) {
  if (!building) return null;
  const explicitId = building.economy_business_id;
  if (explicitId != null && explicitId !== '') {
    return businesses.find(business => String(business.id) === String(explicitId)) || null;
  }

  const name = normalize(building.name);
  if (!name) return null;
  if (buildings.filter(item => normalize(item.name) === name).length > 1) return null;
  const matches = businesses.filter(business => normalize(business.name) === name);
  return matches.length === 1 ? matches[0] : null;
}

export function usefulBuildingGroup(building, asset = {}, business = null) {
  const businessType = building?.business_type || business?.business_type;
  const sources = [
    businessType,
    building?.building_type,
    asset?.category,
    building?.asset_key,
    asset?.name,
  ].map(normalize).filter(Boolean);
  for (const source of sources) {
    const words = source.split(' ');
    const match = Object.entries(USEFUL_GROUPS).find(([, group]) =>
      group.terms.some(term => words.some(word => word === term || word.endsWith(term))));
    if (match) return match[0];
    if (source === normalize(businessType) || source === normalize(building?.building_type)) {
      return 'Other buildings';
    }
  }
  return sources.length ? 'Other buildings' : 'Unclassified';
}

export function buildingViewCategory(building, asset = {}, mode = 'satellite', businesses = [], buildings = []) {
  const business = linkedBusinessForBuilding(building, businesses, buildings);
  if (mode === 'building-type') {
    const value = building?.business_type || business?.business_type || building?.building_type || asset?.category;
    return value ? displayLabel(value) : 'Unclassified';
  }
  if (mode === 'useful') return usefulBuildingGroup(building, asset, business);
  if (mode === 'districts') return building?.district_key ? displayLabel(building.district_key) : 'Unclassified';
  return 'Natural materials';
}

export function buildingViewColor(building, asset = {}, mode = 'satellite', businesses = [], buildings = []) {
  if (mode === 'satellite') return asset?.color || '#a76d43';
  const category = buildingViewCategory(building, asset, mode, businesses, buildings);
  if (category === 'Unclassified') return '#47534d';
  if (mode === 'useful') {
    if (category === 'Other buildings') return '#68736d';
    return USEFUL_GROUPS[category]?.color || '#68736d';
  }
  if (mode === 'building-type' && TYPE_COLORS[normalize(category)]) return TYPE_COLORS[normalize(category)];
  return VIEW_PALETTE[hashIndex(category)];
}

export function buildingViewLegend(buildings = [], assets = [], mode = 'satellite', businesses = []) {
  if (mode === 'satellite') return [];
  const assetsByKey = new Map(assets.map(asset => [asset.key, asset]));
  const rows = new Map();
  buildings.forEach(building => {
    const asset = assetsByKey.get(building.asset_key) || {};
    if (building.visible === false) return;
    const label = buildingViewCategory(building, asset, mode, businesses, buildings);
    rows.set(label, buildingViewColor(building, asset, mode, businesses, buildings));
  });
  return [...rows.entries()]
    .map(([label, color]) => ({ label, color }))
    .sort((left, right) => {
      if (left.label === 'Unclassified') return 1;
      if (right.label === 'Unclassified') return -1;
      return left.label.localeCompare(right.label);
    });
}

