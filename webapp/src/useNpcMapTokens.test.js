import {confirmedNpcPositions,mergeNpcMapTokens} from './useNpcMapTokens';
test('only confirmed positions become map tokens, never planned or reserved destinations',()=>{
 const route={destination:{point:{x:12,y:34}}};
 expect(confirmedNpcPositions([{npc_id:7,state:'resting',route},{npc_id:8,state:'awaiting_arrival',route},{npc_id:9,state:'resting',route:{destination:{point:{x:NaN,y:3}}}}])).toEqual([{npcId:7,x:12,y:34}]);
});
test('manual placements win over rest positions and hidden manual records suppress fallback tokens',()=>{
 const route={destination:{point:{x:12,y:34}}};
 const activities=[{npc_id:7,state:'resting',route},{npc_id:8,state:'resting',route}];
 const placements=[{id:1,npc_id:7,x:90,y:80,elevation:2,visible:true,revision:3},{id:2,npc_id:8,x:1,y:2,visible:false,revision:1}];
 expect(mergeNpcMapTokens(activities,placements,[7,8])).toEqual([{npcId:7,x:90,y:80,elevation:2,placementId:1,revision:3,source:'manual'}]);
});
