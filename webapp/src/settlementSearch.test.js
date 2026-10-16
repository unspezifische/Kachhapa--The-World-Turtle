import { searchSettlementLocations, settlementSearchLocations } from './settlementSearch';

const locations=settlementSearchLocations({assets:[{key:'tavern',name:'Tavern shell',rooms:['Taproom']}],buildings:[{id:'b1',name:'The Bent Coin',asset_key:'tavern',x:20,y:40,business_type:'tavern',owner_name:'Mara Vale',owner_affiliation:'Dock Ward Guild',factions:['Red Sashes'],tags:['cheap ale']}],points:[{id:2,name:'Blackstaff Tower',point_type:'wizard tower',map_key:'waterdeep',x:10,y:12}],businesses:[{id:3,name:'Silent Anchor',business_type:'shipwright',x:8,y:9}],mapKey:'waterdeep'});

test('settlement search finds locations by title, type, owner, faction, and tags',()=>{
  expect(searchSettlementLocations(locations,'bent coin')[0].id).toBe('building:b1');
  expect(searchSettlementLocations(locations,'tavern')[0].id).toBe('building:b1');
  expect(searchSettlementLocations(locations,'Mara Vale')[0].id).toBe('building:b1');
  expect(searchSettlementLocations(locations,'red sashes')[0].id).toBe('building:b1');
  expect(searchSettlementLocations(locations,'cheap ale')[0].id).toBe('building:b1');
  expect(searchSettlementLocations(locations,'shipwright')[0].id).toBe('business:3');
});

test('settlement search supports point-of-interest names and types',()=>{
  expect(searchSettlementLocations(locations,'Blackstaff')[0].id).toBe('poi:2');
  expect(searchSettlementLocations(locations,'wizard tower')[0].id).toBe('poi:2');
});

test('room capabilities and outdoor areas are searchable destinations',()=>{
  const items=settlementSearchLocations({buildings:[{id:'house',name:'Estate House',x:10,y:20,levels:[{id:'ground',name:'Ground',elevation_feet:0,rooms:[{id:'bed',name:'North Bedroom',purpose:'Bedroom',activity_capabilities:['sleep'],region:[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}]}]}]}],properties:[{id:'estate',name:'Estate',structure_ids:['house'],outdoor_areas:[{id:'garden',name:'Rose Garden',area_type:'garden',polygon:[{x:0,y:0},{x:4,y:0},{x:0,y:4}]}]}]});
  expect(searchSettlementLocations(items,'sleep')[0].id).toBe('room:bed');
  expect(searchSettlementLocations(items,'rose garden')[0].id).toBe('outdoor:garden');
});

test('empty estates have their own search result and matching buildings retain independent IDs and property labels',()=>{
  const items=settlementSearchLocations({buildings:[{id:'a-house',name:'Main House',x:10,y:20},{id:'b-house',name:'Main House',x:200,y:300}],properties:[
    {id:'a',name:'Cassalenter Estate',structure_ids:['a-house']},
    {id:'b',name:'Rosznar Estate',structure_ids:['b-house']},
    {id:'empty',name:'Empty Estate',structure_ids:[],boundary:{vertices:[{x:0,y:0},{x:10,y:0},{x:0,y:10}]}},
    {id:'unmapped',name:'Unmapped Estate',structure_ids:[]},
  ]});
  expect(searchSettlementLocations(items,'Cassalenter Estate')[0]).toMatchObject({id:'property:a',kind:'property'});
  expect(searchSettlementLocations(items,'main house').map(item=>[item.id,item.propertyName])).toEqual([['building:a-house','Cassalenter Estate'],['building:b-house','Rosznar Estate']]);
  expect(searchSettlementLocations(items,'Cassalenter main house')[0].id).toBe('building:a-house');
  expect(searchSettlementLocations(items,'empty estate')[0].point).toBeTruthy();
  expect(searchSettlementLocations(items,'unmapped estate')[0].point).toBeNull();
});
