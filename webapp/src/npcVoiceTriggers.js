// Declarative resolver: events/rules in, a playback request out. No browser audio dependency.
export const voiceEventTypes = new Map([
  ['npc.damage.received', (conditions, payload) => Number.isFinite(payload.damage) && payload.damage > 0 &&
    (conditions.minDamage == null || payload.damage >= conditions.minDamage) &&
    (conditions.damageType == null || payload.damageType?.toLowerCase() === conditions.damageType.toLowerCase()) &&
    (conditions.critical == null || payload.critical === conditions.critical)],
  ['npc.spell.cast', (conditions, payload) => typeof payload.spellId === 'string' && payload.spellId.length > 0 &&
    (conditions.spellId == null || String(payload.spellId) === String(conditions.spellId)) &&
    (conditions.spellLevel == null || payload.spellLevel === conditions.spellLevel)]
]);
export function registerVoiceEventType(type, matcher) { voiceEventTypes.set(type, matcher); }

export class NpcVoiceTriggerResolver {
  constructor({ now = () => Date.now(), random = () => Math.random(), storage = null } = {}) {
    this.now = now; this.random = random; this.storage = storage;
    this.seen = new Map(); this.cooldowns = new Map(); this.campaignId = null;
  }
  configure(campaignId) {
    if (String(campaignId) === String(this.campaignId)) return;
    this.campaignId=campaignId;this.seen.clear();this.cooldowns.clear();
    try { const saved=JSON.parse(this.storage?.getItem(this.key()) || '{}');this.seen=new Map(saved.seen || []);this.cooldowns=new Map(saved.cooldowns || []); } catch { /* Empty runtime state. */ }
  }
  key() { return `kachhapa-voice-events:${this.campaignId}`; }
  persist() { try { this.storage?.setItem(this.key(),JSON.stringify({seen:[...this.seen],cooldowns:[...this.cooldowns]})); } catch { /* Bounded in-memory protection remains available. */ } }
  resolve(event, lines, { enabled = false } = {}) {
    if (!enabled || !event?.eventId || !event.npcId || String(event.campaignId)!==String(this.campaignId) || event.historical || event.replay) return null;
    const matches=voiceEventTypes.get(event.type), timestamp=Date.parse(event.timestamp), now=this.now();
    if (!matches || !Number.isFinite(timestamp) || now-timestamp>30000 || timestamp-now>10000 || this.seen.has(event.eventId)) return null;
    this.seen.set(event.eventId,now);
    while(this.seen.size>512)this.seen.delete(this.seen.keys().next().value);
    this.persist();
    const candidates=[];
    for(const line of lines) {
      if(String(line.npc_id)!==String(event.npcId) || !line.enabled || !line.asset?.url || line.asset.status!=='ready')continue;
      for(const rule of line.triggers || []) {
        const conditions=rule.conditions || {}, key=`${event.npcId}:${rule.id}`;
        if(!rule.enabled || rule.event_type!==event.type || !matches(conditions,event.payload || {}))continue;
        if(this.cooldowns.has(key) && now-this.cooldowns.get(key)<rule.cooldown_ms)continue;
        if(rule.probability<=0 || (rule.probability<1 && this.random()>=rule.probability))continue;
        candidates.push({line,rule,key,specificity:Object.keys(conditions).length + (conditions.spellId != null ? 10 : 0)});
      }
    }
    candidates.sort((a,b)=>b.specificity-a.specificity || b.rule.priority-a.rule.priority || a.rule.id.localeCompare(b.rule.id));
    if(!candidates.length)return null;
    const first=candidates[0], ties=candidates.filter(item=>item.specificity===first.specificity && item.rule.priority===first.rule.priority);
    const selected=ties.some(item=>item.rule.randomized)?ties[Math.min(ties.length-1,Math.floor(this.random()*ties.length))]:first;
    return {line:selected.line,options:{automatic:true,priority:selected.rule.priority,interrupt:selected.rule.interrupt},
      accepted:()=>{this.cooldowns.set(selected.key,this.now());while(this.cooldowns.size>2048)this.cooldowns.delete(this.cooldowns.keys().next().value);this.persist();}};
  }
}
