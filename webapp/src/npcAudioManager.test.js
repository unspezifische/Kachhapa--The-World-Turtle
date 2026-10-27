import { NpcAudioManager } from './npcAudioManager';
const line={id:'voice',label:'Fireball',gain:1,enabled:true,asset:{url:'/audio',status:'ready'}};
let manager,audios,fetchBlob,revoke;
beforeEach(()=>{
  audios=[];fetchBlob=jest.fn().mockResolvedValue({data:'bytes'});revoke=jest.fn();
  manager=new NpcAudioManager({getBlob:fetchBlob,makeUrl:()=>`blob:${audios.length}`,revokeUrl:revoke,createAudio:()=>{const audio={play:jest.fn().mockResolvedValue(),pause:jest.fn()};audios.push(audio);return audio;}});
  manager.configure({Authorization:'secret'},1);manager.setOwner(true);
});
test('manual playback interrupts automatic; automatic never interrupts manual',async()=>{
  expect(await manager.playVoiceLine(line,{automatic:true,priority:10})).toBe(true);
  expect(await manager.playVoiceLine(line,{automatic:true,priority:9,interrupt:true})).toBe(false);
  expect(await manager.playVoiceLine(line)).toBe(true);expect(audios[0].pause).toHaveBeenCalled();
  expect(await manager.playVoiceLine(line,{automatic:true,priority:100,interrupt:true})).toBe(false);
  manager.stopVoice();expect(audios[1].pause).toHaveBeenCalled();expect(revoke).toHaveBeenCalledTimes(2);
});
test('volume, mute, missing media, ownership and autoplay recovery',async()=>{
  manager.setVolume(.5);await manager.playVoiceLine(line);expect(audios[0].volume).toBe(.5);
  manager.setMuted(true);expect(audios[0].volume).toBe(0);
  expect(await manager.playVoiceLine(line,{automatic:true})).toBe(false);
  manager.setMuted(false);manager.stopVoice();manager.setOwner(false);
  expect(await manager.playVoiceLine(line)).toBe(false);manager.setOwner(true);
  expect(await manager.playVoiceLine({...line,asset:null})).toBe(false);
  expect(manager.status.error).toMatch(/unavailable/);
  manager.createAudio=()=>({play:()=>Promise.reject(Object.assign(new Error(),{name:'NotAllowedError'})),pause:jest.fn()});
  expect(await manager.playVoiceLine(line)).toBe(false);expect(manager.status.error).toMatch(/Browser blocked/);
});
test('late network response cannot restart a stopped or switched campaign recording',async()=>{
  let finish;fetchBlob.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const pending=manager.playVoiceLine(line);manager.configure({},2);finish({data:'bytes'});
  expect(await pending).toBe(false);expect(audios).toHaveLength(0);
});
