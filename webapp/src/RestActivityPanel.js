import NpcIdentity from './NpcIdentity';
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';

const stepName = { boundary_portal: 'Estate gate / opening', open_boundary: 'Open property edge', unbounded: 'Unbounded property', cross_property: 'Cross the estate', structure_portal: 'Building entrance', stairs: 'Stairs', room_portal: 'Room entrance', room: 'Rest in room', outdoor_area: 'Rest outdoors' };

export default function RestActivityPanel({ campaignId, settlementId, headers, onFocus }) {
  const [open, setOpen] = useState(false);
  const [npcs, setNpcs] = useState([]);
  const [activities, setActivities] = useState([]);
  const [npcId, setNpcId] = useState('');
  const [permissions, setPermissions] = useState({ resident: false, staff: false, authorized: false, can_open_doors: true });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/api/settlement-map/${campaignId}/rest-activities`;
  const refresh = useCallback(async () => {
    const { data } = await axios.get(base, { headers, params: { settlement_id: Number(settlementId) } });
    setNpcs(data.npcs); setActivities(data.activities);
    window.dispatchEvent(new Event('npc-rest-activities-changed'));
  }, [base, headers, settlementId]);
  useEffect(() => { setPreview(null); setNpcId(''); setActivities([]); setError(''); }, [campaignId, settlementId]);
  useEffect(() => {
    if (!open || !settlementId) return;
    let active = true;
    axios.get(base, { headers, params: { settlement_id: Number(settlementId) } }).then(({ data }) => {
      if (active) { setNpcs(data.npcs); setActivities(data.activities); }
    }).catch(err => { if (active) setError(err.response?.data?.message || 'Could not load NPC rest activities.'); });
    return () => { active = false; };
  }, [open, base, headers, settlementId]);
  const run = async action => {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err.response?.data?.message || 'Could not update the rest activity.'); }
    finally { setBusy(false); }
  };
  const choose = reserve => run(async () => {
    const { data } = await axios.post(base, { settlement_id: Number(settlementId), npc_id: Number(npcId), permissions, preview: !reserve, ...(reserve ? { expected_destination_key: preview?.destination_key } : {}) }, { headers });
    if (reserve && data.id) { setPreview(null); await refresh(); } else setPreview(data);
  });
  return <><Box sx={{ display: 'grid', gap: 1, mb: 2 }}>
    <Button size="small" aria-expanded={open} onClick={() => setOpen(value => !value)}>NPC Rest Activities</Button>
    {open && <>
      <Typography variant="caption">Choose an NPC and their access rights. Preview a rest destination, then reserve it. After moving the NPC there, confirm arrival to start resting.</Typography>
      <TextField select label="NPC seeking rest" size="small" value={npcId} onChange={event => { setNpcId(event.target.value); setPreview(null); }}>
        {npcs.map(npc => <MenuItem key={npc.id} value={npc.id}>{npc.name}</MenuItem>)}
      </TextField>
      {npcId && <NpcIdentity npcId={Number(npcId)} name={npcs.find(npc=>String(npc.id)===String(npcId))?.name} headers={headers} />}
      {!npcs.length && <Typography variant="caption">No campaign NPCs are available.</Typography>}
      {Object.entries({ resident: 'Resident', staff: 'Staff', authorized: 'Authorized private access', can_open_doors: 'Can open unlocked doors' }).map(([key, label]) =>
        <FormControlLabel key={key} label={label} control={<Checkbox size="small" checked={permissions[key]} onChange={event => { setPermissions(value => ({ ...value, [key]: event.target.checked })); setPreview(null); }} />} />)}
      <Button disabled={busy || !npcId} size="small" onClick={() => choose(false)}>Find Rest Destination</Button>
      {preview?.status === 'no_route' && <Typography role="status" variant="caption">{preview.reason}</Typography>}
      {preview?.destination && <Box sx={{ border: "1px solid var(--primary-border)", p: 1 }}>
        <Typography variant="subtitle2">{preview.destination.name || preview.destination.id}</Typography>
        <ol>{preview.steps.map((step, index) => <li key={index}>{stepName[step.kind] || step.kind}{step.kind === 'stairs' ? `: ${step.from_floor_id} → ${step.to_floor_id}` : ''}{step.action === 'open' ? ' (open first)' : ''}</li>)}</ol>
        <Typography variant="caption">A walking path still needs to be resolved. Room capabilities are used without checking furniture.</Typography>
        <Button size="small" onClick={() => onFocus?.(preview.destination.point)}>Show Destination</Button>
        <Button size="small" disabled={busy || activities.some(item => item.npc_id === Number(npcId))} onClick={() => choose(true)}>Reserve Rest Destination</Button>
      </Box>}
      {activities.map(activity => <Box key={activity.id} sx={{ border: "1px solid var(--border-main)", p: 1 }}>
        <Typography variant="subtitle2">{npcs.find(npc => npc.id === activity.npc_id)?.name || `NPC ${activity.npc_id}`} · {activity.route.destination.name || activity.route.destination.id}</Typography>
        <Typography variant="caption" role="status">{activity.state === 'resting' ? 'Resting — space occupied' : 'Reserved — awaiting arrival'}</Typography>
        <Box>
          <Button size="small" onClick={() => onFocus?.(activity.route.destination.point)}>Show Destination</Button>
          {activity.state !== 'resting' && <Button size="small" disabled={busy} onClick={() => run(async () => { await axios.patch(`${base}/${activity.id}`, { action: 'confirm_arrival' }, { headers }); await refresh(); })}>Confirm Arrival &amp; Rest</Button>}
          <Button size="small" disabled={busy} onClick={() => run(async () => { await axios.delete(`${base}/${activity.id}`, { headers }); await refresh(); })}>{activity.state === 'resting' ? 'Finish Rest & Release Space' : 'Cancel Reservation'}</Button>
        </Box>
      </Box>)}
      <Button size="small" disabled={busy} onClick={() => run(refresh)}>Refresh Activities</Button>
      {error && <Typography role="alert" color="error" variant="caption">{error}</Typography>}
    </>}
  </Box></>;
}
