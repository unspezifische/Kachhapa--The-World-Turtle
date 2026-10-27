import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Alert, Box, Button, FormControl, MenuItem, Select, Typography } from '@mui/material';
import NpcIdentity from './NpcIdentity';

export default function NpcTokenPanel({ settlementId, headers, mapState, selectedNpcId, onSelect, placing, onBeginPlace, placementError = '' }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedNpc = useMemo(() => mapState.npcs.find(npc => Number(npc.id) === Number(selectedNpcId)), [mapState.npcs, selectedNpcId]);
  const placement = useMemo(() => mapState.placements.find(item => Number(item.npc_id) === Number(selectedNpcId)), [mapState.placements, selectedNpcId]);

  useEffect(() => {
    if (!selectedNpcId && mapState.npcs.length) onSelect(mapState.npcs[0].id);
  }, [mapState.npcs, onSelect, selectedNpcId]);

  const run = async operation => {
    setBusy(true); setError('');
    try { await operation(); await mapState.refresh(); window.dispatchEvent(new Event('npc-map-placements-changed')); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Could not update this NPC token.'); }
    finally { setBusy(false); }
  };
  const setVisible = visible => run(() => axios.put(`/api/npcs/${selectedNpcId}/map-placement`, {
    settlement_id: Number(settlementId), visible, expected_revision: placement.revision,
  }, { headers }));

  return <aside className="editor-menu npc-token-panel" aria-label="NPC Tokens">
    <Typography variant="overline">NPC TOKENS</Typography>
    <Typography variant="body2" sx={{ color: 'var(--text-muted)', mb: 1.5 }}>Choose an NPC, then click the map to place or move its canonical token.</Typography>
    <FormControl size="small" fullWidth>
      <Select aria-label="NPC token" value={selectedNpcId || ''} onChange={event => onSelect(Number(event.target.value))} displayEmpty>
        <MenuItem value="" disabled>Choose an NPC</MenuItem>
        {mapState.npcs.map(npc => <MenuItem key={npc.id} value={npc.id}>{npc.name}</MenuItem>)}
      </Select>
    </FormControl>
    {selectedNpc && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 1.5 }}><NpcIdentity npcId={selectedNpc.id} name={selectedNpc.name} headers={headers} /><Box><Typography variant="subtitle2">{selectedNpc.name}</Typography><Typography variant="caption" sx={{ color: 'var(--text-muted)' }}>{placement ? `${placement.visible ? 'Visible' : 'Hidden'} · ${Math.round(placement.x)}, ${Math.round(placement.y)}` : 'Not manually placed'}</Typography></Box></Box>}
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Button variant="contained" disabled={!selectedNpcId || busy} onClick={() => onBeginPlace(Number(selectedNpcId))}>{placement ? 'Move Token' : 'Place Token'}</Button>
      {placement && <Button variant="outlined" disabled={busy} onClick={() => setVisible(!placement.visible)}>{placement.visible ? 'Hide from Map' : 'Show on Map'}</Button>}
      {placement && <Button color="error" variant="text" disabled={busy} onClick={() => run(() => axios.delete(`/api/npcs/${selectedNpcId}/map-placement`, { headers }))}>Remove Manual Placement</Button>}
    </Box>
    {placing && <Alert severity="info" sx={{ mt: 1.5 }}>Click the desired terrain position. Existing schedule and rest data will not be changed.</Alert>}
    {(error || placementError) && <Alert severity="error" sx={{ mt: 1.5 }}>{error || placementError}</Alert>}
    {!mapState.npcs.length && !mapState.loading && <Typography variant="caption">No enabled campaign NPCs are available.</Typography>}
  </aside>;
}
