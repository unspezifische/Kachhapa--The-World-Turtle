export const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
export const NPC_FIELDS = ['name', 'gender', 'creature_subtype', 'occupation', 'size', 'creature_type', 'alignment', ...ABILITIES, 'ac', 'hp', 'speed', 'saving_throws', 'skills', 'immunities', 'resistance', 'senses', 'languages', 'challenge', 'traits', 'actions', 'description'];
export const newNpcDraft = () => Object.fromEntries(NPC_FIELDS.map(key => [key, '']));
export const newSchedule = (npc = {}) => ({ schema_version: 1, schedule_key: npc?.id ? `npc-${npc.id}.routine` : `homebrew-${Date.now()}.routine`, module_key: npc?.module_key || null, npc_key: npc?.source_key || null, revision: 1, enabled: false, visibility: 'dm_only', clock: 'campaign_calendar', provenance: { basis: 'dm_invention', confidence: 'proposed', source_reference: null }, bindings: {}, rules: [], exceptions: [], default_behavior: 'idle_at_current_location' });
export function routineForOccupation(schedule, occupation, kept = []) {
  const activities = [
    ['sleep', '22:00', 480, 'sleep'], ['breakfast', '06:00', 60, 'eat'],
    ['work', '07:00', 480, occupation === 'scholar' ? 'study' : occupation === 'guard' ? 'guard' : occupation === 'merchant' ? 'trade' : 'work'],
    ['leisure', '15:00', 420, 'rest'],
  ];
  const original = schedule || newSchedule();
  const retained = (original.rules || []).filter(rule => kept.includes(rule.id));
  const generated = activities.filter(([id]) => !kept.includes(id)).map(([id, start, duration, activity]) => ({ id, start, duration_minutes: duration, activity, repeat: { kind: 'daily' }, priority: 10, destination: { binding: id === 'work' ? 'workplace' : 'home', capability: activity, fallbacks: [] }, arrival_policy: 'require_arrival', on_unavailable: 'wait_and_retry', retry_minutes: 15, provenance: { basis: 'dm_invention', confidence: 'proposed' } }));
  return { ...original, enabled: false, bindings: { home: {}, workplace: {}, ...original.bindings }, rules: [...retained, ...generated] };
}
export function mergeGeneration(draft, generated, locks, target) {
  return { ...draft, ...Object.fromEntries(Object.entries(generated).filter(([key]) => target ? key === target : !locks.includes(key))) };
}

export function isScheduleShape(value) {
  return value && value.schema_version === 1 && value.bindings && typeof value.bindings === 'object' && !Array.isArray(value.bindings) && ['rules', 'exceptions'].every(section => Array.isArray(value[section]) && value[section].every(rule => rule && typeof rule.id === 'string' && rule.destination && typeof rule.destination.binding === 'string' && rule.repeat && typeof rule.start === 'string'));
}
export function scheduleTimeline(schedule, dayMinutes = 1440, minutesPerHour = 60) {
  return (schedule.rules || []).filter(rule => rule.repeat?.kind === 'daily').flatMap(rule => {
    const [hour, minute] = rule.start.split(':').map(Number), start = hour * minutesPerHour + minute, duration = Number(rule.duration_minutes);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0 || start >= dayMinutes) return [];
    const end = start + duration;
    return [{ id: rule.id, start, end: Math.min(end, dayMinutes), label: rule.activity }, ...(end > dayMinutes ? [{ id: `${rule.id}-overnight`, start: 0, end: Math.min(dayMinutes, end - dayMinutes), label: rule.activity }] : [])];
  });
}
