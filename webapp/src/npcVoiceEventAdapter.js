import { NpcVoiceTriggerResolver } from './npcVoiceTriggers';

// Receives only live events from the application's existing Socket.IO connection.
export class NpcVoiceEventAdapter {
  constructor({ campaignId, audio, loadLines, storage, enabled = false, resolver }) {
    Object.assign(this,{campaignId,audio,loadLines,enabled});
    this.resolver=resolver || new NpcVoiceTriggerResolver({storage});this.resolver.configure(campaignId);
    this.active=true;this.generation=0;this.pending=Promise.resolve();
  }
  setEnabled(enabled) { this.enabled=enabled;this.generation+=1; }
  dispose() { this.active=false;this.generation+=1; }
  receive(event) {
    if(!this.active || !this.enabled || !this.audio.owner || String(event?.campaignId)!==String(this.campaignId))return Promise.resolve(false);
    const generation=this.generation;
    const task=async()=>{
      if(!this.active || !this.enabled || generation!==this.generation || !this.audio.owner)return false;
      const lines=await this.loadLines(event.npcId);
      if(!this.active || !this.enabled || generation!==this.generation || !this.audio.owner)return false;
      const request=this.resolver.resolve(event,lines,{enabled:true});
      if(!request)return false;
      const accepted=await this.audio.playVoiceLine(request.line,request.options);
      if(accepted)request.accepted();
      return accepted;
    };
    const result=this.pending.then(task).catch(()=>false);this.pending=result;return result;
  }
}
