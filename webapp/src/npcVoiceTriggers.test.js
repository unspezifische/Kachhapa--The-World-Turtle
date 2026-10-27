import { NpcVoiceTriggerResolver } from './npcVoiceTriggers';
import { NpcVoiceEventAdapter } from './npcVoiceEventAdapter';
import { NpcAudioManager } from './npcAudioManager';
const now=Date.parse('2026-10-21T20:00:00Z');
const cast=(id='cast1',npcId=7,campaignId=1)=>({eventId:id,type:'npc.spell.cast',campaignId,npcId,timestamp:new Date(now).toISOString(),payload:{spellId:'42',spellName:'Fireball',spellLevel:3}});
const rule=(id,conditions={},extra={})=>({id,event_type:'npc.spell.cast',conditions,priority:60,probability:1,cooldown_ms:0,enabled:true,...extra});
const line=(id,triggers,extra={})=>({id,npc_id:7,label:id,gain:1,enabled:true,asset:{url:'/audio/'+id,status:'ready'},triggers,...extra});
const generic=line('generic',[rule('g',{}, {priority:999})]);
const exact=line('Fireball',[rule('f',{spellId:'42'})]);
function resolver(extra={}){const r=new NpcVoiceTriggerResolver({now:()=>now,random:()=>.5,...extra});r.configure(1);return r;}
test('exact spell wins; unavailable or nonmatching exact falls back; NPCs and campaigns remain separate',()=>{
 expect(resolver().resolve(cast(),[generic,exact],{enabled:true}).line.id).toBe('Fireball');
 expect(resolver().resolve(cast(),[generic,{...exact,asset:null}],{enabled:true}).line.id).toBe('generic');
 expect(resolver().resolve({...cast(),payload:{spellId:'different'}},[generic,exact],{enabled:true}).line.id).toBe('generic');
 expect(resolver().resolve(cast('x',8),[generic,exact],{enabled:true})).toBeNull();
 expect(resolver().resolve(cast('x',7,2),[generic,exact],{enabled:true})).toBeNull();
});
test('duplicate suppression survives reload; disabled, replay and stale events never play',()=>{
 const saved=new Map(),storage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)};
 const r=resolver({storage});expect(r.resolve(cast(),[exact],{enabled:true})).toBeTruthy();
 expect(r.resolve(cast(),[exact],{enabled:true})).toBeNull();
 expect(resolver({storage}).resolve(cast(),[exact],{enabled:true})).toBeNull();
 for(const event of [{...cast(),replay:true},{...cast(),historical:true},{...cast(),timestamp:new Date(now-31000).toISOString()}])expect(resolver().resolve(event,[exact],{enabled:true})).toBeNull();
 expect(resolver().resolve(cast(),[exact])).toBeNull();
});
test('damage threshold, type, critical, cooldown and deterministic/random ties',()=>{
 let clock=now;const r=resolver({now:()=>clock});
 const damage=line('Pain',[rule('pain',{minDamage:10,damageType:'fire',critical:true},{event_type:'npc.damage.received',cooldown_ms:15000})]);
 const event={...cast(),type:'npc.damage.received',payload:{damage:12,damageType:'fire',critical:true}};
 expect(r.resolve({...event,eventId:'small',payload:{...event.payload,damage:3}},[damage],{enabled:true})).toBeNull();
 expect(r.resolve({...event,eventId:'wrong-type',payload:{...event.payload,damageType:'cold'}},[damage],{enabled:true})).toBeNull();
 const request=r.resolve(event,[damage],{enabled:true});expect(request.line.id).toBe('Pain');request.accepted();
 expect(r.resolve({...event,eventId:'again'},[damage],{enabled:true})).toBeNull();
 clock+=16000;expect(r.resolve({...event,eventId:'later'},[damage],{enabled:true})).toBeTruthy();
 const a=line('A',[rule('a')]),b=line('B',[rule('b',{}, {randomized:true})]);
 expect(resolver({random:()=>.99}).resolve(cast(),[a,b],{enabled:true}).line.id).toBe('B');
 expect(resolver().resolve(cast(),[line('no',[rule('no',{}, {probability:0})])],{enabled:true})).toBeNull();
});
test('live event adapter plays once, allows manual interruption and never plays during state hydration',async()=>{
 const audios=[];const audio=new NpcAudioManager({getBlob:async()=>({data:'bytes'}),makeUrl:()=>'/blob',revokeUrl:()=>{},createAudio:()=>{const value={play:jest.fn().mockResolvedValue(),pause:jest.fn()};audios.push(value);return value;}});
 audio.setOwner(true);
 const loadLines=jest.fn().mockResolvedValue([generic,exact]);
 const adapter=new NpcVoiceEventAdapter({campaignId:1,audio,loadLines,resolver:resolver()});
 expect(audios).toHaveLength(0);expect(loadLines).not.toHaveBeenCalled();
 expect(await adapter.receive(cast())).toBe(false);
 adapter.setEnabled(true);
 await Promise.all([adapter.receive(cast()),adapter.receive(cast())]);expect(audios).toHaveLength(1);expect(audio.current.line.id).toBe('Fireball');
 await audio.playVoiceLine(line('Manual',[]));expect(audios[0].pause).toHaveBeenCalled();
 expect(await adapter.receive(cast('cast2'))).toBe(false);expect(audio.current.line.id).toBe('Manual');
 expect(await adapter.receive(cast('other',8))).toBe(false);
 adapter.dispose();expect(await adapter.receive(cast('disposed'))).toBe(false);
});
