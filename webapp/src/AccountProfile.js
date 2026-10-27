import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Modal, Form } from 'react-bootstrap';
import CreateCharacterModal from './CreateCharacterModal';
import campaignFallback from './campaign.webp';
import './AccountProfile.css';

const PLAYER_PROMPTS = [
  'What is one question your character hopes to ask someone next session?',
  'What does your character want the party to understand about them?',
  'Which unfinished promise is on your character’s mind?',
  'What small comfort would your character seek after the last adventure?',
];

const DM_PROMPTS = [
  'What rumor will reach the party before they set out again?',
  'Which place has changed since the characters last saw it?',
  'What does an important NPC want but hesitate to ask for?',
  'What local celebration or tradition could complicate the next scene?',
];

const DM_DESTINATIONS = [
  ['/dmTools', 'DM tools'], ['/settlementManager', 'Settlement map'],
  ['/worldAtlas', 'World atlas'], ['/calendar', 'Calendar'], ['/library', 'Library'],
];

const PLAYER_DESTINATIONS = [
  ['/characterSheet', 'Character sheet'], ['/inventoryView', 'Inventory'],
  ['/journal', 'Journal'], ['/calendar', 'Calendar'], ['/library', 'Library'],
];

const characterName = (character) => character?.Name || character?.name || character?.character_name || '';
const dateKey = (item) => [item.year || 0, item.month_index || 0, item.day || 0, item.hour || 0, item.minute || 0];
const compareDate = (left, right) => {
  const a = dateKey(left);
  const b = dateKey(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
};

export default function AccountProfile({ headers, setAccountType, setSelectedCampaign, setCharacterName, dmLandingPath = '/dmTools', primaryOrigin = window.location.origin }) {
  const navigate = useNavigate();
  const authorization = headers?.Authorization;
  const userId = Number(headers?.userID);
  const apiHeaders = useMemo(() => ({ Authorization: authorization }), [authorization]);
  const [campaigns, setCampaigns] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState({});
  const [friends, setFriends] = useState({ friends: [], incoming_requests: [], outgoing_requests: [] });
  const [campaignInvitations, setCampaignInvitations] = useState([]);
  const [friendUsername, setFriendUsername] = useState('');
  const [selectedInvitation, setSelectedInvitation] = useState(null);
  const [invitationBuilderOpen, setInvitationBuilderOpen] = useState(false);
  const [activeId, setActiveId] = useState(() => Number(localStorage.getItem('dashboardCampaignId')) || null);
  const [notes, setNotes] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [promptAnswer, setPromptAnswer] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [createCharacterOpen, setCreateCharacterOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [inviteCampaign, setInviteCampaign] = useState(null);
  const [invitingUserId, setInvitingUserId] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedPassword, setAdvancedPassword] = useState('');
  const [advancedUnlocked, setAdvancedUnlocked] = useState(false);
  const [advancedBusy, setAdvancedBusy] = useState(false);
  const [advancedError, setAdvancedError] = useState('');
  const [campaignDraft, setCampaignDraft] = useState({ name: '', system: 'D&D', ruleset: '5e', module: '', description: '', calendar_enabled: true, calendar_format: 'harptos', calendar_year: 1, calendar_month: 1, calendar_day: 1 });

  useEffect(() => {
    if (!authorization) return;
    let alive = true;
    Promise.all([
      axios.get('/api/campaigns', { headers: apiHeaders }),
      axios.get('/api/characters', { headers: apiHeaders }),
      axios.get('/api/profile', { headers: apiHeaders }),
      axios.get('/api/dashboard/preferences', { headers: apiHeaders }),
      axios.get('/api/friends', { headers: apiHeaders }),
      axios.get('/api/campaign-invitations', { headers: apiHeaders }),
    ]).then(([campaignResponse, characterResponse, profileResponse, preferenceResponse, friendResponse, invitationResponse]) => {
      if (!alive) return;
      const loaded = campaignResponse.data || [];
      setCampaigns(loaded);
      setCharacters(characterResponse.data || []);
      setProfile(profileResponse.data);
      setPreferences(preferenceResponse.data || {});
      setFriends(friendResponse.data || { friends: [], incoming_requests: [], outgoing_requests: [] });
      setCampaignInvitations(invitationResponse.data || []);
      setActiveId(current => loaded.some(item => item.id === current) ? current : loaded[0]?.id || null);
    }).catch(() => { if (alive) setError('Unable to load your dashboard. Try refreshing the page.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [authorization, apiHeaders]);

  const refreshSocial = async () => {
    const [friendResponse, invitationResponse] = await Promise.all([
      axios.get('/api/friends', { headers: apiHeaders }),
      axios.get('/api/campaign-invitations', { headers: apiHeaders }),
    ]);
    setFriends(friendResponse.data || { friends: [], incoming_requests: [], outgoing_requests: [] });
    setCampaignInvitations(invitationResponse.data || []);
  };

  const refreshCampaignData = async () => {
    const [campaignResponse, characterResponse] = await Promise.all([
      axios.get('/api/campaigns', { headers: apiHeaders }),
      axios.get('/api/characters', { headers: apiHeaders }),
    ]);
    setCampaigns(campaignResponse.data || []);
    setCharacters(characterResponse.data || []);
  };

  const activeCampaign = campaigns.find(campaign => campaign.id === activeId) || null;
  const isDM = Boolean(activeCampaign && (Number(activeCampaign.dm_id) === userId || Number(activeCampaign.owner_id) === userId));
  const activeCharacter = characters.find(character => Number(character.campaignID) === Number(activeId)) || null;
  const characterHeaders = useMemo(() => ({
    ...headers,
    CampaignID: activeId,
    campaignID: activeId,
    ...(activeCampaign?.rules_system ? { System: activeCampaign.rules_system } : {}),
  }), [headers, activeId, activeCampaign?.rules_system]);
  const prompts = isDM ? DM_PROMPTS : PLAYER_PROMPTS;
  const prompt = prompts[promptIndex % prompts.length];

  useEffect(() => {
    if (!activeId || !authorization) { setNotes([]); setCalendar(null); return; }
    localStorage.setItem('dashboardCampaignId', String(activeId));
    setNotes([]);
    setCalendar(null);
    setDraft('');
    setEditingId(null);
    setPromptAnswer('');
    setPromptIndex(0);
    let alive = true;
    Promise.allSettled([
      axios.get(`/api/campaigns/${activeId}/quick-notes`, { headers: apiHeaders }),
      axios.get(`/api/calendar/${activeId}`, { headers: apiHeaders }),
    ]).then(([noteResult, calendarResult]) => {
      if (!alive) return;
      if (noteResult.status === 'fulfilled') setNotes(noteResult.value.data.notes || []);
      if (calendarResult.status === 'fulfilled' && calendarResult.value.data.configured !== false) setCalendar(calendarResult.value.data);
    });
    return () => { alive = false; };
  }, [activeId, authorization, apiHeaders]);

  const destinationsFor = campaign => {
    const dm = Number(campaign.dm_id) === userId || Number(campaign.owner_id) === userId;
    if (dm) return DM_DESTINATIONS;
    const hasCharacter = characters.some(character => Number(character.campaignID) === Number(campaign.id));
    return hasCharacter ? PLAYER_DESTINATIONS : PLAYER_DESTINATIONS.filter(([path]) => !['/characterSheet', '/inventoryView', '/journal'].includes(path));
  };

  const enterCampaign = (campaign, requestedPath) => {
    const dm = Number(campaign.dm_id) === userId || Number(campaign.owner_id) === userId;
    const character = characters.find(item => Number(item.campaignID) === Number(campaign.id));
    if (!dm && !character && !requestedPath) {
      setActiveId(campaign.id);
      setCreateCharacterOpen(true);
      return;
    }
    const allowed = destinationsFor(campaign).map(([path]) => path);
    const defaultPath = dm ? dmLandingPath : '/characterSheet';
    const path = requestedPath || preferences[String(campaign.id)] || defaultPath;
    setSelectedCampaign({ id: campaign.id, name: campaign.name, dmId: campaign.dm_id, ownerId: campaign.owner_id, ruleset: campaign.ruleset, rulesSystem: campaign.rules_system });
    setAccountType(dm ? 'DM' : 'Player');
    setCharacterName(dm ? 'DM' : characterName(character));
    navigate(allowed.includes(path) ? path : defaultPath);
  };

  const saveLanding = async (campaign, path) => {
    setError('');
    try {
      await axios.patch(`/api/campaigns/${campaign.id}/landing`, { landing_path: path }, { headers: apiHeaders });
      setPreferences(current => ({ ...current, [String(campaign.id)]: path }));
      setNotice(`${campaign.name} will open to ${destinationsFor(campaign).find(([key]) => key === path)?.[1] || 'your chosen page'}.`);
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to save the landing page.'); }
  };

  const saveNote = async (content = draft, resetPrompt = false) => {
    if (!activeCampaign || !content.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = editingId && !resetPrompt
        ? await axios.patch(`/api/quick-notes/${editingId}`, { content }, { headers: apiHeaders })
        : await axios.post(`/api/campaigns/${activeId}/quick-notes`, { content }, { headers: apiHeaders });
      const saved = response.data.note;
      setNotes(current => [saved, ...current.filter(note => note.id !== saved.id)]);
      if (resetPrompt) setPromptAnswer(''); else { setDraft(''); setEditingId(null); }
      setNotice(resetPrompt ? 'Your answer was saved as a private note.' : 'Note saved.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to save your note.'); }
    finally { setBusy(false); }
  };

  const deleteNote = async () => {
    if (!editingId || !window.confirm('Delete this note?')) return;
    setBusy(true); setError('');
    try {
      await axios.delete(`/api/quick-notes/${editingId}`, { headers: apiHeaders });
      setNotes(current => current.filter(note => note.id !== editingId));
      setDraft(''); setEditingId(null); setNotice('Note deleted.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to delete your note.'); }
    finally { setBusy(false); }
  };

  const createCampaign = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await axios.post('/api/campaigns', campaignDraft, { headers: apiHeaders });
      const campaign = response.data;
      setCampaigns(current => [...current, campaign]);
      setActiveId(campaign.id);
      setCreateCampaignOpen(false);
      setNotice('Campaign created.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to create the campaign.'); }
    finally { setBusy(false); }
  };

  const finishCharacterCreation = async () => {
    setCreateCharacterOpen(false);
    try {
      const response = await axios.get('/api/characters', { headers: apiHeaders });
      setCharacters(response.data || []);
    } catch (_reason) {
      setError('Character created, but the list could not refresh. Reload the dashboard to see it.');
    }
  };

  const sendFriendRequest = async event => {
    event.preventDefault();
    if (!friendUsername.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await axios.post('/api/friend-requests', { username: friendUsername.trim() }, { headers: apiHeaders });
      setFriendUsername('');
      await refreshSocial();
      setNotice('Friend request sent.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to send the friend request.'); }
    finally { setBusy(false); }
  };

  const manageFriendRequest = async (requestId, action) => {
    setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'cancel') await axios.delete(`/api/friend-requests/${requestId}`, { headers: apiHeaders });
      else await axios.patch(`/api/friend-requests/${requestId}`, { action }, { headers: apiHeaders });
      await refreshSocial();
      setNotice(action === 'accept' ? 'Friend request accepted.' : action === 'decline' ? 'Friend request declined.' : 'Friend request canceled.');
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to update the friend request.'); }
    finally { setBusy(false); }
  };

  const inviteFriend = async friend => {
    if (!inviteCampaign) return;
    setInvitingUserId(friend.user.id); setError(''); setNotice('');
    try {
      await axios.post(`/api/campaigns/${inviteCampaign.id}/invitations`, {
        user_ids: [friend.user.id],
      }, { headers: apiHeaders });
      setNotice(`Invitation sent to @${friend.user.username} for ${inviteCampaign.name}.`);
    } catch (reason) {
      setError(reason.response?.data?.message || 'Unable to send the campaign invitation.');
    } finally { setInvitingUserId(null); }
  };

  const declineCampaignInvitation = async invitation => {
    setBusy(true); setError('');
    try {
      await axios.patch(`/api/campaign-invitations/${invitation.id}`, { action: 'decline' }, { headers: apiHeaders });
      setCampaignInvitations(current => current.filter(item => item.id !== invitation.id));
      setSelectedInvitation(null);
      setNotice(`Invitation to ${invitation.campaign.name} declined.`);
    } catch (reason) { setError(reason.response?.data?.message || 'Unable to decline the campaign invitation.'); }
    finally { setBusy(false); }
  };

  const acceptCampaignInvitation = async ({ characterId, character } = {}) => {
    if (!selectedInvitation) return null;
    setBusy(true); setError('');
    try {
      const response = await axios.patch(`/api/campaign-invitations/${selectedInvitation.id}`, {
        action: 'accept', ...(characterId ? { character_id: characterId } : { character }),
      }, { headers: apiHeaders });
      await Promise.all([refreshCampaignData(), refreshSocial()]);
      setSelectedInvitation(null);
      setInvitationBuilderOpen(false);
      setNotice(`You joined ${response.data.campaign.name}.`);
      return response;
    } catch (reason) {
      setError(reason.response?.data?.message || 'Unable to accept the campaign invitation.');
      throw reason;
    } finally { setBusy(false); }
  };

  const compatibleInvitationCharacters = selectedInvitation ? characters.filter(character =>
    character.campaignID == null && character.system === selectedInvitation.campaign.rules_system) : [];
  const invitationHeaders = selectedInvitation ? {
    ...headers,
    CampaignID: selectedInvitation.campaign.id,
    campaignID: selectedInvitation.campaign.id,
    System: selectedInvitation.campaign.rules_system,
  } : headers;

  const logOut = async () => {
    try {
      await axios.post('/api/logout', {}, { withCredentials: true });
    } catch (_reason) {
      // Local credentials still need clearing when the shared cookie is unavailable.
    } finally {
      localStorage.clear();
      window.location.assign('/login');
    }
  };

  const openAdvanced = () => {
    setAdvancedError('');
    setAdvancedPassword('');
    setAdvancedOpen(true);
  };

  const unlockAdvanced = async event => {
    event.preventDefault();
    setAdvancedBusy(true);
    setAdvancedError('');
    try {
      await axios.post('/api/profile/verify-password', { password: advancedPassword }, { headers: apiHeaders });
      setAdvancedUnlocked(true);
      setAdvancedPassword('');
    } catch (reason) {
      setAdvancedError(reason.response?.data?.message || 'Unable to verify your password.');
    } finally {
      setAdvancedBusy(false);
    }
  };

  const events = useMemo(() => {
    if (!calendar?.current_date) return [];
    return (calendar.events || []).filter(event => compareDate(event, calendar.current_date) >= 0)
      .sort(compareDate).slice(0, 4);
  }, [calendar]);
  const nextHolidays = useMemo(() => {
    if (!calendar?.current_date) return [];
    const date = calendar.current_date;
    return (calendar.holidays || []).filter(holiday => !holiday.leap_only || date.year % 4 === 0)
      .map(holiday => ({ ...holiday, year: date.year + (compareDate({ year: date.year, month_index: holiday.month_index, day: holiday.day }, date) < 0 ? 1 : 0) }))
      .sort(compareDate).slice(0, 2);
  }, [calendar]);
  const wikiUrl = campaign => `${primaryOrigin}/wiki/${encodeURIComponent(campaign.name)}/${encodeURIComponent('Main Page')}`;
  const mtgUrl = process.env.REACT_APP_MTG_SANDBOX_URL || `${primaryOrigin}/mtg/`;

  return <main className="dashboard-page">
    <header className="dashboard-hero">
      <div className="dashboard-hero-copy"><span className="dashboard-eyebrow">Kachhapa · your adventure desk</span>
        <h1>Welcome back{profile?.real_name ? `, ${profile.real_name.split(' ')[0]}` : ''}.</h1>
        <p>Pick up a campaign, capture a thought, or find your next thread.</p>
      </div>
      <div className="dashboard-hero-actions">
        <button type="button" className="dashboard-button dashboard-button-light" onClick={() => navigate('/profile')}>User profile</button>
        <button type="button" className="dashboard-button dashboard-button-outline" onClick={() => { setInviteCampaign(null); setFriendsOpen(true); }}>Friends</button>
        <button type="button" className="dashboard-button dashboard-button-outline" onClick={openAdvanced}>Advanced</button>
        <a className="dashboard-button dashboard-button-outline" href={mtgUrl} target="_blank" rel="noopener noreferrer">MTG Sandbox ↗</a>
        <button type="button" className="dashboard-button dashboard-button-logout" onClick={logOut}>Log out</button>
      </div>
    </header>

    {error && <div className="dashboard-alert dashboard-error" role="alert">{error}</div>}
    {notice && <div className="dashboard-alert" role="status">{notice}</div>}

    <section className="dashboard-section dashboard-campaign-section" aria-labelledby="campaign-heading">
      <div className="dashboard-section-heading"><div><span className="dashboard-kicker">01 / YOUR WORLDS</span><h2 id="campaign-heading">Campaigns</h2></div><button type="button" className="dashboard-text-action" onClick={() => setCreateCampaignOpen(true)}>+ Create campaign</button></div>
      {loading ? <p>Loading your campaigns…</p> : campaigns.length || campaignInvitations.length ? <div className="dashboard-campaign-grid" tabIndex={0} aria-label="Your campaigns">
        {campaigns.map(campaign => {
          const dm = Number(campaign.dm_id) === userId || Number(campaign.owner_id) === userId;
          const options = destinationsFor(campaign);
          const storedLanding = preferences[String(campaign.id)];
          const displayedLanding = options.some(([path]) => path === storedLanding) ? storedLanding : (dm ? dmLandingPath : options[0]?.[0]);
          const selected = activeId === campaign.id;
          return <article className={`dashboard-campaign-card${selected ? ' is-selected' : ''}`} key={campaign.id}>
            <button type="button" className="dashboard-campaign-selector" aria-label={`Select campaign ${campaign.name}`} aria-pressed={selected} onClick={() => setActiveId(campaign.id)} />
            <div className="dashboard-campaign-image" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,20,30,.12), rgba(10,20,30,.72)), url("${campaign.icon || campaignFallback}")` }} aria-hidden="true" />
            <div className="dashboard-campaign-content"><div className="dashboard-card-topline"><span>{dm ? 'Dungeon Master' : 'Player'}</span><span>{campaign.system === 'D&D' ? `D&D · ${campaign.ruleset || '5e'}` : campaign.system}</span></div>
              <h3>{campaign.name}</h3>
              <div className="dashboard-card-actions"><button type="button" className="dashboard-button dashboard-enter" aria-label={`Open campaign ${campaign.name}`} onClick={() => enterCampaign(campaign)}>Enter campaign <span aria-hidden="true">↗</span></button><a className="dashboard-button dashboard-button-secondary" href={wikiUrl(campaign)} target="_blank" rel="noopener noreferrer">Wiki ↗</a>{dm && <button type="button" className="dashboard-button dashboard-button-subtle" onClick={() => { setActiveId(campaign.id); setInviteCampaign(campaign); setFriendsOpen(true); }}>Invite to campaign</button>}</div>
              <div className="dashboard-card-links">{options.filter(([path]) => path !== '/settlementManager' && path !== '/worldAtlas').slice(0, 3).map(([path, label]) => <button type="button" key={path} onClick={() => enterCampaign(campaign, path)}>{label}</button>)}</div>
              <label className="dashboard-landing-label">Open to <select aria-label={`Landing page for ${campaign.name}`} value={displayedLanding} onChange={event => saveLanding(campaign, event.target.value)}>{options.map(([path, label]) => <option key={path} value={path}>{label}</option>)}</select></label>
            </div>
          </article>;
        })}
        {campaignInvitations.map(invitation => <article className="dashboard-campaign-card dashboard-campaign-invitation" key={`invitation-${invitation.id}`}>
          <div className="dashboard-campaign-image" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,20,30,.24), rgba(10,20,30,.84)), url("${invitation.campaign.icon || campaignFallback}")` }} aria-hidden="true" />
          <div className="dashboard-campaign-content"><div className="dashboard-card-topline"><span>Invitation pending</span><span>{invitation.campaign.rules_system}</span></div>
            <h3>{invitation.campaign.name}</h3>
            <p className="dashboard-invitation-from">Invited by @{invitation.inviter?.username || 'campaign DM'}</p>
            <div className="dashboard-card-actions"><button type="button" className="dashboard-button dashboard-enter" onClick={() => setSelectedInvitation(invitation)}>Accept invitation</button><button type="button" className="dashboard-button dashboard-button-subtle" onClick={() => declineCampaignInvitation(invitation)} disabled={busy}>Decline</button></div>
          </div>
        </article>)}
      </div> : <div className="dashboard-empty">Your first campaign starts here. Create one to bring characters, notes, and a world calendar together.</div>}
    </section>

    <div className="dashboard-context-bar"><div><span className="dashboard-kicker">02 / BETWEEN SESSIONS</span><h2>At your table</h2></div><span className="dashboard-scroll-cue">Scroll widgets for more ↓</span><label>Showing <select aria-label="Dashboard campaign" value={activeId || ''} onChange={event => setActiveId(Number(event.target.value))} disabled={!campaigns.length}>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label></div>
    <div className="dashboard-widget-grid" tabIndex={0} aria-label="Dashboard widgets">
      {activeCampaign ? <>
      <section className="dashboard-widget dashboard-notes" aria-labelledby="notes-heading"><div className="dashboard-widget-head"><div><span className="dashboard-widget-symbol">✎</span><h3 id="notes-heading">Quick notes</h3></div><span className="dashboard-widget-tag">Only you can see these</span></div>
        {!isDM && !activeCharacter ? <div className="dashboard-empty-inline">Create a character to keep private notes for this campaign. <button type="button" onClick={() => setCreateCharacterOpen(true)}>Create character</button></div> : <>
          <p className="dashboard-widget-intro">{isDM ? 'A private place for plans, hooks, and everything between sessions.' : `Thoughts and questions for ${characterName(activeCharacter)}.`}</p>
          <textarea aria-label="Quick note" placeholder={isDM ? 'What should happen next?' : 'What does your character want to remember?'} value={draft} onChange={event => setDraft(event.target.value)} maxLength={10000} rows={4} />
          <div className="dashboard-note-actions"><button type="button" className="dashboard-button dashboard-button-primary" disabled={!draft.trim() || busy} onClick={() => saveNote()}>{editingId ? 'Save changes' : 'Save note'}</button>{editingId && <><button type="button" onClick={() => { setEditingId(null); setDraft(''); }}>New note</button><button type="button" onClick={deleteNote} disabled={busy}>Delete</button></>}</div>
          <div className="dashboard-recent-notes"><h4>Recent notes</h4>{notes.length ? notes.slice(0, 5).map(note => <button type="button" key={note.id} className={editingId === note.id ? 'is-active' : ''} onClick={() => { setEditingId(note.id); setDraft(note.content); }}><span>{note.content.split('\n')[0].slice(0, 74)}</span><small>{new Date(note.updated_at).toLocaleDateString()}</small></button>) : <p>Nothing written yet. Start with a thought you want to bring to the next session.</p>}</div>
        </>}</section>
      <section className="dashboard-widget dashboard-calendar" aria-labelledby="calendar-heading"><div className="dashboard-widget-head"><div><span className="dashboard-widget-symbol">◷</span><h3 id="calendar-heading">In-world calendar</h3></div><button type="button" className="dashboard-text-action" onClick={() => enterCampaign(activeCampaign, '/calendar')}>Open calendar ↗</button></div>
        {calendar ? <><div className="dashboard-date"><span>Current day</span><strong>{calendar.current_date?.month_name || `Month ${(calendar.current_date?.month_index ?? 0) + 1}`} {calendar.current_date?.day}</strong><small>Year {calendar.current_date?.year}{calendar.time_period ? ` · ${calendar.time_period}` : ''}</small></div><h4>On the horizon</h4>{events.length ? <ul className="dashboard-event-list">{events.map(event => <li key={event.id}><span>{(calendar.months || [])[event.month_index]?.name || `Month ${event.month_index + 1}`} {event.day}</span><strong>{event.name}</strong></li>)}</ul> : <p className="dashboard-muted">No upcoming events are on the calendar.</p>}{nextHolidays.length > 0 && <div className="dashboard-holidays"><span>Seasonal markers</span>{nextHolidays.map(holiday => <small key={`${holiday.name}-${holiday.year}`}>{holiday.name} · {(calendar.months || [])[holiday.month_index]?.name || 'Month'} {holiday.day}</small>)}</div>}</> : <div className="dashboard-empty-inline">No calendar is configured for this campaign yet.{isDM ? ' Set one up to track in-world days and events.' : ''}</div>}
      </section>
      <section className="dashboard-widget dashboard-prompt" aria-labelledby="prompt-heading"><div className="dashboard-widget-head"><div><span className="dashboard-widget-symbol">✦</span><h3 id="prompt-heading">{isDM ? 'Worldbuilding prompt' : 'In-character prompt'}</h3></div><button type="button" className="dashboard-text-action" onClick={() => { setPromptIndex(index => index + 1); setPromptAnswer(''); }}>Another prompt ↻</button></div><blockquote>{prompt}</blockquote><textarea aria-label="Prompt answer" placeholder="Catch your first thought…" value={promptAnswer} onChange={event => setPromptAnswer(event.target.value)} rows={3} maxLength={9000} disabled={!isDM && !activeCharacter} /><button type="button" className="dashboard-button dashboard-button-subtle" disabled={!promptAnswer.trim() || busy || (!isDM && !activeCharacter)} onClick={() => saveNote(`${prompt}\n\n${promptAnswer}`, true)}>Save answer as note</button></section>
      <section className="dashboard-widget dashboard-characters" aria-labelledby="characters-heading"><div className="dashboard-widget-head"><div><span className="dashboard-widget-symbol">♟</span><h3 id="characters-heading">Your characters</h3></div><button type="button" className="dashboard-text-action" onClick={() => setCreateCharacterOpen(true)}>+ Create</button></div>{characters.length ? <div className="dashboard-character-list">{characters.map(character => { const relatedCampaign = campaigns.find(item => item.id === character.campaignID); return <button type="button" key={character.id} disabled={!relatedCampaign} onClick={() => relatedCampaign && enterCampaign(relatedCampaign, '/characterSheet')}><span className="dashboard-character-avatar">{character.avatar?.image_url || character.icon ? <img src={character.avatar?.image_url || character.icon} alt="" /> : characterName(character).slice(0, 2).toUpperCase()}</span><span><strong>{characterName(character)}</strong><small>{relatedCampaign?.name || 'Unassigned character'}</small></span><span aria-hidden="true">↗</span></button>; })}</div> : <p className="dashboard-muted">No characters yet. Create one when you’re ready to join a story.</p>}</section>
      </> : null}
    </div>
    <footer className="dashboard-footer"><span>Kachhapa</span><span>Every adventure begins between sessions.</span></footer>

    <Modal show={createCampaignOpen} onHide={() => setCreateCampaignOpen(false)}><Modal.Header closeButton><Modal.Title>Create campaign</Modal.Title></Modal.Header><Form onSubmit={createCampaign}><Modal.Body><Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={campaignDraft.name} onChange={event => setCampaignDraft(current => ({ ...current, name: event.target.value }))} /></Form.Group><Form.Group className="mb-3"><Form.Label>System</Form.Label><Form.Select value={campaignDraft.system} onChange={event => setCampaignDraft(current => ({ ...current, system: event.target.value }))}><option>D&D</option></Form.Select></Form.Group><Form.Group className="mb-3"><Form.Label>Ruleset</Form.Label><Form.Select value={campaignDraft.ruleset} onChange={event => setCampaignDraft(current => ({ ...current, ruleset: event.target.value }))}>{['3.5e', '4e', '5e', '5e (2024)'].map(value => <option key={value}>{value}</option>)}</Form.Select></Form.Group><Form.Group className="mb-3"><Form.Label>Module</Form.Label><Form.Select value={campaignDraft.module} onChange={event => setCampaignDraft(current => ({ ...current, module: event.target.value }))}><option value="">None</option><option>Lost Mine of Phandelver</option><option>Waterdeep Dragon Heist</option></Form.Select></Form.Group><Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={campaignDraft.description} onChange={event => setCampaignDraft(current => ({ ...current, description: event.target.value }))} /></Form.Group><Form.Check type="switch" label="Set up a calendar now" checked={campaignDraft.calendar_enabled} onChange={event => setCampaignDraft(current => ({ ...current, calendar_enabled: event.target.checked }))} disabled={Boolean(campaignDraft.module)} />{campaignDraft.calendar_enabled && !campaignDraft.module && <><Form.Select className="my-2" aria-label="Calendar system" value={campaignDraft.calendar_format} onChange={event => setCampaignDraft(current => ({ ...current, calendar_format: event.target.value }))}><option value="harptos">Calendar of Harptos</option><option value="gregorian">Gregorian calendar</option></Form.Select><div className="dashboard-date-inputs"><Form.Control aria-label="Starting year" type="number" value={campaignDraft.calendar_year} onChange={event => setCampaignDraft(current => ({ ...current, calendar_year: event.target.value }))} /><Form.Control aria-label="Starting month" type="number" min="1" max="12" value={campaignDraft.calendar_month} onChange={event => setCampaignDraft(current => ({ ...current, calendar_month: event.target.value }))} /><Form.Control aria-label="Starting day" type="number" min="1" max="31" value={campaignDraft.calendar_day} onChange={event => setCampaignDraft(current => ({ ...current, calendar_day: event.target.value }))} /></div></>}</Modal.Body><Modal.Footer><button type="button" className="btn btn-secondary" onClick={() => setCreateCampaignOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>Create campaign</button></Modal.Footer></Form></Modal>
    <Modal show={friendsOpen} onHide={() => { setFriendsOpen(false); setInviteCampaign(null); }} centered scrollable>
      <Modal.Header closeButton><Modal.Title>{inviteCampaign ? `Invite friends to ${inviteCampaign.name}` : 'Friends'}</Modal.Title></Modal.Header>
      <Modal.Body className="dashboard-friends-panel">
        {!isDM && !inviteCampaign && <form className="dashboard-friend-form" onSubmit={sendFriendRequest}><label htmlFor="friend-username">Add a friend</label><div><input id="friend-username" value={friendUsername} onChange={event => setFriendUsername(event.target.value)} placeholder="Exact username" autoComplete="off" /><button type="submit" className="dashboard-button dashboard-button-primary" disabled={busy || !friendUsername.trim()}>Send request</button></div></form>}
        {isDM && !inviteCampaign && <p className="dashboard-muted">To invite a friend, choose <strong>Invite to campaign</strong> on that campaign’s card.</p>}
        {!!friends.incoming_requests.length && <div className="dashboard-request-group"><h4>Requests for you</h4>{friends.incoming_requests.map(item => <div className="dashboard-friend-row" key={item.id}><span className="dashboard-friend-avatar">{item.user.username.slice(0, 2).toUpperCase()}</span><strong>@{item.user.username}</strong><div><button type="button" onClick={() => manageFriendRequest(item.id, 'accept')} disabled={busy}>Accept</button><button type="button" onClick={() => manageFriendRequest(item.id, 'decline')} disabled={busy}>Decline</button></div></div>)}</div>}
        {!!friends.outgoing_requests.length && <div className="dashboard-request-group"><h4>Sent requests</h4>{friends.outgoing_requests.map(item => <div className="dashboard-friend-row" key={item.id}><span className="dashboard-friend-avatar">{item.user.username.slice(0, 2).toUpperCase()}</span><strong>@{item.user.username}</strong><div><span className="dashboard-pending-label">Pending</span><button type="button" onClick={() => manageFriendRequest(item.id, 'cancel')} disabled={busy}>Cancel</button></div></div>)}</div>}
        <div className="dashboard-friend-list"><h4>Your friends</h4>{friends.friends.length ? friends.friends.map(item => <div className="dashboard-friend-row" key={item.id}><span className="dashboard-friend-avatar">{item.user.username.slice(0, 2).toUpperCase()}</span><strong>@{item.user.username}</strong><small>{item.user.is_online ? 'Online' : 'Offline'}</small>{inviteCampaign && <button type="button" onClick={() => inviteFriend(item)} disabled={invitingUserId !== null}>{invitingUserId === item.user.id ? 'Inviting…' : 'Invite'}</button>}</div>) : <p className="dashboard-muted">{inviteCampaign ? 'Add friends before inviting them to this campaign.' : 'No friends yet.'}</p>}</div>
      </Modal.Body>
    </Modal>
    <CreateCharacterModal show={createCharacterOpen} setShow={setCreateCharacterOpen} onHide={finishCharacterCreation} headers={characterHeaders} />
    <Modal show={!!selectedInvitation && !invitationBuilderOpen} onHide={() => setSelectedInvitation(null)} centered>
      <Modal.Header closeButton><Modal.Title>Join {selectedInvitation?.campaign.name}</Modal.Title></Modal.Header>
      <Modal.Body><p>Choose an unassigned {selectedInvitation?.campaign.rules_system} character, or create a new one for this campaign.</p>
        {compatibleInvitationCharacters.length ? <div className="dashboard-invitation-characters">{compatibleInvitationCharacters.map(character => <button type="button" key={character.id} onClick={() => acceptCampaignInvitation({ characterId: character.id })} disabled={busy}><strong>{characterName(character)}</strong><small>{character.Class || 'Adventurer'} · {character.system}</small></button>)}</div> : <div className="dashboard-empty-inline">You do not have an unassigned compatible character yet.</div>}
      </Modal.Body>
      <Modal.Footer><button type="button" className="btn btn-outline-danger" onClick={() => declineCampaignInvitation(selectedInvitation)} disabled={busy}>Decline invitation</button><button type="button" className="btn btn-primary" onClick={() => setInvitationBuilderOpen(true)} disabled={busy}>Create new character</button></Modal.Footer>
    </Modal>
    <CreateCharacterModal show={invitationBuilderOpen} setShow={setInvitationBuilderOpen} onHide={() => setInvitationBuilderOpen(false)} headers={invitationHeaders} onSubmitCharacter={character => acceptCampaignInvitation({ character })} />
    <Modal show={advancedOpen} onHide={() => setAdvancedOpen(false)} centered>
      <Modal.Header closeButton><Modal.Title>Advanced access</Modal.Title></Modal.Header>
      <Modal.Body>
        {advancedUnlocked ? (
          <div className="dashboard-advanced-links">
            <p>Administrative tools are opened separately so the regular navigation stays focused on play.</p>
            <a className="dashboard-button dashboard-button-primary" href={`${primaryOrigin}/dashboard/`} target="_blank" rel="noopener noreferrer">Open Flask Dashboard ↗</a>
            <a className="dashboard-button dashboard-button-subtle" href={`${primaryOrigin}/admin/`} target="_blank" rel="noopener noreferrer">Open Flask Admin ↗</a>
          </div>
        ) : (
          <form onSubmit={unlockAdvanced}>
            <p>Confirm your password to reveal the Flask Dashboard and Flask Admin links.</p>
            <Form.Group>
              <Form.Label>Your password</Form.Label>
              <Form.Control aria-label="Advanced access password" type="password" autoComplete="current-password" value={advancedPassword} onChange={event => setAdvancedPassword(event.target.value)} required autoFocus />
            </Form.Group>
            {advancedError && <div className="dashboard-alert dashboard-error mt-3 mb-0" role="alert">{advancedError}</div>}
            <div className="dashboard-advanced-actions"><button type="button" className="dashboard-button dashboard-button-subtle" onClick={() => setAdvancedOpen(false)}>Cancel</button><button type="submit" className="dashboard-button dashboard-button-primary" disabled={advancedBusy}>{advancedBusy ? 'Checking…' : 'Continue'}</button></div>
          </form>
        )}
      </Modal.Body>
    </Modal>
  </main>;
}
