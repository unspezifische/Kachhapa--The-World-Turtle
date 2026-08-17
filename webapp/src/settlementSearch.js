const text = value => Array.isArray(value) ? value.join(' ') : value == null ? '' : String(value);
const normalize = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();

const searchableText = location => normalize([
  location.title,location.kind,location.type,location.description,location.owner,
  location.affiliation,location.factions,location.tags,location.rooms,location.assetName,
].map(text).join(' '));

export function settlementSearchLocations({buildings=[],points=[],businesses=[],assets=[],mapKey=null}={}) {
  const assetsByKey=new Map(assets.map(asset=>[asset.key,asset]));
  const businessesByName=new Map(businesses.map(business=>[normalize(business.name),business]));
  const locations=buildings.map(building=>{
    const business=businessesByName.get(normalize(building.name)),asset=assetsByKey.get(building.asset_key);
    return {id:`building:${building.id}`,kind:'building',source:building,title:building.name||asset?.name||'Unnamed structure',type:building.business_type||business?.business_type||building.building_type||asset?.category||asset?.name||'structure',description:building.description||'',owner:building.owner_name||building.owner||'',affiliation:building.owner_affiliation||building.affiliation||'',factions:building.factions||building.faction||[],tags:building.tags||[],rooms:building.rooms||asset?.rooms||[],assetName:asset?.name||building.asset_key||'',point:{x:Number(building.x)||0,y:Number(building.y)||0,elevation:Number(building.elevation)||0}};
  });
  const buildingNames=new Set(buildings.map(building=>normalize(building.name)));
  points.filter(point=>!mapKey||!point.map_key||point.map_key===mapKey).forEach(point=>locations.push({id:`poi:${point.id}`,kind:'poi',source:point,title:point.name||'Unnamed point',type:point.point_type||'point of interest',description:point.description||'',owner:point.owner_name||point.owner||'',affiliation:point.owner_affiliation||point.affiliation||'',factions:point.factions||point.faction||[],tags:point.tags||[],point:{x:Number(point.x)||0,y:Number(point.y)||0,elevation:Number(point.elevation)||0}}));
  businesses.filter(business=>!buildingNames.has(normalize(business.name))).forEach(business=>locations.push({id:`business:${business.id}`,kind:'business',source:business,title:business.name||'Unnamed business',type:business.business_type||'business',description:business.description||'',owner:business.owner_name||business.owner||'',affiliation:business.owner_affiliation||business.affiliation||'',factions:business.factions||business.faction||[],tags:business.tags||[],point:{x:Number(business.x)||0,y:Number(business.y)||0,elevation:Number(business.elevation)||0}}));
  return locations.map(location=>({...location,searchText:searchableText(location)}));
}

export function searchSettlementLocations(locations,query,limit=30) {
  const normalized=normalize(query),tokens=normalized.split(' ').filter(Boolean);
  if(!tokens.length)return [];
  return locations.filter(location=>tokens.every(token=>location.searchText.includes(token))).sort((left,right)=>{
    const leftTitle=normalize(left.title),rightTitle=normalize(right.title);
    const leftRank=leftTitle===normalized?0:leftTitle.startsWith(normalized)?1:leftTitle.includes(normalized)?2:3;
    const rightRank=rightTitle===normalized?0:rightTitle.startsWith(normalized)?1:rightTitle.includes(normalized)?2:3;
    return leftRank-rightRank||left.title.localeCompare(right.title);
  }).slice(0,limit);
}
