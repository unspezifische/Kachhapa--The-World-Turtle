import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

export default function useSessionManagement(headers, socket) {
  const campaignId = headers?.campaignID || headers?.CampaignID;
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(null);
  const [drafts, setDrafts] = useState({});
  const activeCampaign = useRef(campaignId);
  activeCampaign.current = campaignId;
  const locked = useRef(false);
  const base = `/api/campaigns/${campaignId}/sessions`;
  const refresh = useCallback(async () => {
    if (!campaignId) return;
    try {
      const response = await axios.get(base, { headers });
      if (activeCampaign.current === campaignId) setSnapshot(previous => !previous || response.data.revision >= previous.revision ? response.data : previous);
    } catch (e) { if (activeCampaign.current === campaignId) setError(e.response?.data?.message || 'Session Management could not be loaded.'); }
  }, [base, campaignId, headers]);
  useEffect(() => { setSnapshot(null); setError(''); setRetry(null); setDrafts({}); refresh(); }, [campaignId, refresh]);
  useEffect(() => {
    const changed = event => { if (!event || String(event.campaign_id) === String(campaignId)) refresh(); };
    socket?.on('session_state_updated', changed);
    socket?.on('connect', refresh);
    return () => { socket?.off('session_state_updated', changed); socket?.off('connect', refresh); };
  }, [socket, refresh, campaignId]);
  const send = async payload => {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError('');
    try {
      const response = await axios.post(`${base}/commands`, payload, { headers });
      if (activeCampaign.current === campaignId) { setSnapshot(previous => !previous || response.data.revision >= previous.revision ? response.data : previous); setRetry(null); }
      return true;
    } catch (e) {
      if (activeCampaign.current !== campaignId) return false;
      if (e.response?.status === 409) { setSnapshot(e.response.data); setRetry(null); }
      else if (!e.response) setRetry(payload);
      else setRetry(null);
      setError(e.response?.data?.message || 'Connection lost. Retry the same action safely before making another change.');
      return false;
    } finally { locked.current = false; setBusy(false); }
  };
  const command = (action, data = {}) => {
    if (retry) { setError('Retry the interrupted request first.'); return Promise.resolve(false); }
    return send({ action, data, revision: snapshot?.revision ?? 0, request_id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` });
  };
  return { snapshot, busy, error, command, refresh, drafts, setDrafts, retry: retry ? () => send(retry) : null };
}
