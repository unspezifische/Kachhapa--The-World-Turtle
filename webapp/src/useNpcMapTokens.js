import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

// Only confirmed authoritative positions become schedule-derived fallback tokens.
export function confirmedNpcPositions(activities = []) {
  return activities.filter(activity => activity.state === 'resting' && activity.npc_id &&
    Number.isFinite(activity.route?.destination?.point?.x) && Number.isFinite(activity.route?.destination?.point?.y))
    .map(activity => ({ npcId: activity.npc_id, ...activity.route.destination.point }));
}

export function mergeNpcMapTokens(activities = [], placements = [], manualNpcIds = []) {
  const manual = new Set(manualNpcIds.map(Number));
  const explicit = placements.filter(placement => placement.visible).map(placement => ({
    npcId: placement.npc_id, x: placement.x, y: placement.y, elevation: placement.elevation,
    placementId: placement.id, revision: placement.revision, source: 'manual',
  }));
  const fallback = confirmedNpcPositions(activities).filter(token => !manual.has(Number(token.npcId)))
    .map(token => ({ ...token, source: 'schedule' }));
  return [...explicit, ...fallback];
}

export default function useNpcMapTokens({ headers, campaignId, settlementId }) {
  const [state, setState] = useState({ tokens: [], placements: [], npcs: [], loading: false });
  const urlsRef = useRef(new Map());

  const refresh = useCallback(async () => {
    if (!campaignId || !settlementId) { setState({ tokens: [], placements: [], npcs: [], loading: false }); return; }
    setState(current => ({ ...current, loading: true }));
    try {
      const [restResponse, placementResponse] = await Promise.all([
        axios.get(`/api/settlement-map/${campaignId}/rest-activities`, { headers, params: { settlement_id: Number(settlementId) } }),
        axios.get(`/api/settlement-map/${campaignId}/npc-placements`, { headers, params: { settlement_id: Number(settlementId) } }),
      ]);
      const placementData = placementResponse.data || {};
      const baseTokens = mergeNpcMapTokens(restResponse.data.activities, placementData.placements, placementData.manual_npc_ids);
      const tokens = await Promise.all(baseTokens.map(async token => {
        const { data: media } = await axios.get(`/api/npc-media/npcs/${token.npcId}`, { headers });
        const asset = media.token;
        let url = null;
        if (asset) {
          const key = asset.url;
          if (!urlsRef.current.has(key)) {
            const { data: blob } = await axios.get(key, { headers, params: { size: 128 }, responseType: 'blob' });
            urlsRef.current.set(key, URL.createObjectURL(blob));
          }
          url = urlsRef.current.get(key);
        }
        return { ...token, url };
      }));
      setState({ tokens, placements: placementData.placements || [], npcs: placementData.npcs || restResponse.data.npcs || [], loading: false });
    } catch {
      setState(current => ({ ...current, loading: false }));
    }
  }, [campaignId, headers, settlementId]);

  useEffect(() => {
    const objectUrls = urlsRef.current;
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener('npc-rest-activities-changed', refresh);
    window.addEventListener('npc-media-changed', refresh);
    window.addEventListener('npc-map-placements-changed', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('npc-rest-activities-changed', refresh);
      window.removeEventListener('npc-media-changed', refresh);
      window.removeEventListener('npc-map-placements-changed', refresh);
      objectUrls.forEach(url => URL.revokeObjectURL(url)); objectUrls.clear();
    };
  }, [refresh]);

  return { ...state, refresh };
}
