import { roomDestination, roomInteriorPoint } from './settlementRooms';
import { normalizePropertyCatalog } from './settlementProperties';
const text = value => Array.isArray(value) ? value.join(' ') : value == null ? '' : String(value);
const normalize = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();

const searchableText = location => normalize([
  location.title,location.kind,location.type,location.description,location.owner,
  location.affiliation,location.factions,location.tags,location.rooms,location.assetName,location.capabilities,location.propertyName,
].map(text).join(' '));

export function settlementSearchLocations({buildings=[],properties=[],points=[],businesses=[],assets=[],mapKey=null}={}) {
  const assetsByKey=new Map(assets.map(asset=>[asset.key,asset]));
  const businessesByName=new Map(businesses.map(business=>[normalize(business.name),business]));
  const catalog=normalizePropertyCatalog(buildings,properties);
  const propertyByBuilding=new Map(catalog.flatMap(property=>(property.structure_ids||[]).map(id=>[String(id),property])));
  const buildingNameCounts=new Map();
  buildings.forEach(building=>buildingNameCounts.set(normalize(building.name),(buildingNameCounts.get(normalize(building.name))||0)+1));
  const locations=buildings.map(building=>{
    const property=propertyByBuilding.get(String(building.id));
    const business=businesses.find(value=>value.id===building.business_id)||(buildingNameCounts.get(normalize(building.name))===1?businessesByName.get(normalize(building.name)):null),asset=assetsByKey.get(building.asset_key);
    return {id:`building:${building.id}`,kind:'building',source:building,sourceProperty:property,propertyName:property?.name||'',title:building.name||asset?.name||'Unnamed structure',type:building.business_type||business?.business_type||building.building_type||asset?.category||asset?.name||'structure',description:building.description||'',owner:building.owner_name||building.owner||'',affiliation:building.owner_affiliation||building.affiliation||'',factions:building.factions||building.faction||[],tags:building.tags||[],rooms:building.rooms||asset?.rooms||[],assetName:asset?.name||building.asset_key||'',point:{x:Number(building.x)||0,y:Number(building.y)||0,elevation:Number(building.elevation)||0}};
  });
  const buildingNames=new Set(buildings.map(building=>normalize(building.name)));
  catalog.forEach(property=>{
    const structures=buildings.filter(building=>(property.structure_ids||[]).some(id=>String(id)===String(building.id)));
    const vertices=property.boundary?.vertices||[];
    const points=vertices.length?vertices:(property.outdoor_areas||[]).flatMap(area=>area.polygon||[]);
    const point=roomInteriorPoint(points)|| (points.length?{x:points.reduce((sum,p)=>sum+Number(p.x),0)/points.length,y:points.reduce((sum,p)=>sum+Number(p.y),0)/points.length}:structures.length?{x:Number(structures[0].x)||0,y:Number(structures[0].y)||0}:null);
    locations.push({id:`property:${property.id}`,kind:'property',source:property,sourceProperty:property,title:property.name||'Unnamed property',type:'Property / Estate',description:`${structures.length} building${structures.length===1?'':'s'}`,owner:property.owner_name||property.owner||'',tags:property.tags||[],point});
  });
  buildings.forEach(building => (building.levels||[]).forEach(level => (level.rooms||[]).forEach(room => {
    const destination=roomDestination(building,level,room);
    if (!destination) return;
    const property=catalog.find(item=>(item.structure_ids||[]).some(id=>String(id)===String(building.id)));
    locations.push({id:`room:${room.id}`,kind:'room',source:room,sourceBuilding:building,title:room.name||'Unnamed room',type:room.purpose||'room',description:`${building.name||'Structure'} · ${level.name||'Floor'} · ${property?.name||'Property'}`,capabilities:room.activity_capabilities||[],point:{...destination.point,elevation:destination.elevation_feet}});
  })));
  catalog.forEach(property=>(property.outdoor_areas||[]).forEach(area=>{
    const point=roomInteriorPoint(area.polygon);
    if(point) locations.push({id:`outdoor:${area.id}`,kind:'outdoor_area',source:area,sourceProperty:property,title:area.name||area.area_type||'Outdoor area',type:area.area_type||'outdoor area',description:property.name||'',capabilities:area.activity_capabilities||[],point:{...point,elevation:Number(area.elevation)||0}});
  }));
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
