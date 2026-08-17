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
