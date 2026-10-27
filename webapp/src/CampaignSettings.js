import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Alert, Badge, Button, Card, Form, Modal, Spinner } from 'react-bootstrap';

import IconEditorModal from './IconEditorModal';
import './CampaignSettings.css';

const adventureText = (value, output = []) => {
  if (typeof value === 'string') {
    output.push(value.replace(/\{@(?:\w+)\s+([^}|]+)(?:\|[^}]*)?\}/g, '$1'));
  } else if (Array.isArray(value)) {
    value.forEach(item => adventureText(item, output));
  } else if (value && typeof value === 'object') {
    if (value.name) output.push(value.name);
    if (value.entries) adventureText(value.entries, output);
    if (value.items) adventureText(value.items, output);
  }
  return output;
};

export default function CampaignSettings({ campaignID, headers, embedded = false }) {
  const [settings,setSettings] = useState(null)
  const [members,setMembers] = useState({active:[],pending:[],friends:[]})
  const [wikiProposals,setWikiProposals] = useState([])
  const [wikiSaving,setWikiSaving] = useState('')
  const [selectedFriendIds,setSelectedFriendIds] = useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('');
  const [showAdd,setShowAdd] = useState(false)
  const [selectedKey,setSelectedKey]=useState('')
  const [preview,setPreview] = useState(null);
  const [settlementStrategy,setSettlementStrategy] = useState('merge')
  const [calendarStrategy,setCalendarStrategy] = useState('keep_current');
  const [installing,setInstalling] = useState(false)
  const [notice,setNotice] = useState('');
  const [iconSaving,setIconSaving] = useState(false)
  // const [iconInputKey,setIconInputKey] = useState(0);
  const [iconModalOpen,setIconModalOpen] = useState(false);
  const [rulesetSaving,setRulesetSaving] = useState(false);
  const [campaignName,setCampaignName] = useState('')
  const [nameSaving,setNameSaving]=useState(false);
  const [refreshingModule,setRefreshingModule] = useState('');
  const [adventureView,setAdventureView] = useState(null);
  const [adventureSection,setAdventureSection] = useState(null);
  const [adventureError,setAdventureError] = useState('');

  const openAdventure=async(module)=>{
    setAdventureError('');setAdventureSection(null);
    try{
      const response=await axios.get(`/api/campaigns/${campaignID}/modules/${module.module_key}/adventure`,{headers});
      setAdventureView({...response.data,moduleKey:module.module_key});
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to open adventure');}
  };
  const openAdventureSection=async(index)=>{
    try{
      const response=await axios.get(`/api/campaigns/${campaignID}/modules/${adventureView.moduleKey}/adventure`,{headers,params:{section:index}});
      setAdventureSection(response.data.section);
    }catch(requestError){setAdventureError(requestError.response?.data?.message||'Unable to open section');}
  };

  const loadSettings=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [settingsResponse,membersResponse,proposalsResponse]=await Promise.all([
        axios.get(`/api/campaigns/${campaignID}/modules`,{headers}),
        axios.get(`/api/campaigns/${campaignID}/members`,{headers}),
        axios.get(`/api/campaigns/${campaignID}/wiki-proposals`,{headers}),
      ]);
      setSettings(settingsResponse.data);
      setMembers({
        active:membersResponse.data?.active||[], pending:membersResponse.data?.pending||[],
        friends:membersResponse.data?.friends||[], wiki_permission:membersResponse.data?.wiki_permission||'everyone',
      });
      setWikiProposals(Array.isArray(proposalsResponse.data)?proposalsResponse.data:[]);
    }
    catch(requestError){setError(requestError.response?.data?.message||'Unable to load campaign settings');}
    finally{setLoading(false);}
  },[campaignID,headers]);

  useEffect(()=>{loadSettings();},[loadSettings]);
  useEffect(()=>{setCampaignName(settings?.campaign?.name||'');},[settings?.campaign?.name]);
  const installable=useMemo(()=>settings?.available_modules?.filter(module=>!module.installed)||[],[settings]);
  const unavailableFriendIds=useMemo(()=>new Set([...(members.active||[]),...(members.pending||[])].map(item=>item.id)),[members]);
  const eligibleFriends=useMemo(()=>(members.friends||[]).filter(friend=>!unavailableFriendIds.has(friend.id)),[members.friends,unavailableFriendIds]);

  const inviteFriends=async()=>{
    if(!selectedFriendIds.length)return;
    setError('');setNotice('');
    try{
      await axios.post(`/api/campaigns/${campaignID}/invitations`,{user_ids:selectedFriendIds},{headers});
      setSelectedFriendIds([]);setNotice('Campaign invitation sent.');await loadSettings();
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to invite those friends.');}
  };

  const revokeInvitation=async(invitation)=>{
    setError('');setNotice('');
    try{
      await axios.delete(`/api/campaigns/${campaignID}/invitations/${invitation.invitation_id}`,{headers});
      setNotice(`Invitation for @${invitation.username} revoked.`);await loadSettings();
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to revoke that invitation.');}
  };

  const saveWikiPermission=async(mode)=>{
    setWikiSaving('permission');setError('');setNotice('');
    try{
      await axios.patch(`/api/campaigns/${campaignID}/wiki-permissions`,{mode},{headers});
      setMembers(current=>({...current,wiki_permission:mode}));
      setNotice('Campaign wiki permissions updated.');
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to update wiki permissions.');}
    finally{setWikiSaving('');}
  };

  const saveWikiRole=async(member,role)=>{
    setWikiSaving(`member-${member.id}`);setError('');setNotice('');
    try{
      await axios.patch(`/api/campaigns/${campaignID}/members/${member.id}/wiki-role`,{role},{headers});
      setMembers(current=>({...current,active:current.active.map(item=>item.id===member.id?{...item,wiki_role:role}:item)}));
      setNotice(`Wiki role updated for @${member.username}.`);
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to update that wiki role.');}
    finally{setWikiSaving('');}
  };

  const reviewWikiProposal=async(proposal,action)=>{
    setWikiSaving(`proposal-${proposal.id}`);setError('');setNotice('');
    try{
      await axios.patch(`/api/campaigns/${campaignID}/wiki-proposals/${proposal.id}`,{action},{headers});
      setWikiProposals(current=>current.filter(item=>item.id!==proposal.id));
      setNotice(`Wiki change ${action==='approve'?'approved':'rejected'}.`);
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to review that wiki change.');}
    finally{setWikiSaving('');}
  };

  const previewModule=useCallback(async(moduleKey)=>{
    setSelectedKey(moduleKey);setPreview(null);setError('');
    if(!moduleKey)return;
    try{
      const response=await axios.post(`/api/campaigns/${campaignID}/modules/preview`,{module_key:moduleKey},{headers});
      setPreview(response.data);
      setSettlementStrategy('merge');
      setCalendarStrategy(response.data.calendar.exists||!response.data.module.calendar?'keep_current':'use_module');
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to preview module');}
  },[campaignID,headers]);

  const openAddModule=()=>{
    setNotice('');setError('');setShowAdd(true);
    const first=installable[0]?.key||'';
    if(first)previewModule(first);
  };

  const installModule=async()=>{
    if(!selectedKey)return;
    setInstalling(true);setError('');
    try{
      const response=await axios.post(`/api/campaigns/${campaignID}/modules`,{
        module_key:selectedKey,settlement_strategy:settlementStrategy,calendar_strategy:calendarStrategy,
      },{headers});
      setNotice(`${response.data.installation.module_name} installed${response.data.settlement_result!=='none'?`. Settlement: ${response.data.settlement_result}`:''}.`);
      setShowAdd(false);setPreview(null);setSelectedKey('');await loadSettings();
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to install module');}
    finally{setInstalling(false);}
  };

  const refreshModule = async (module) => {
    setRefreshingModule(module.module_key); setError(''); setNotice('');
    try {
      const response = await axios.post(
        `/api/campaigns/${campaignID}/modules/${module.module_key}/refresh`,
        { settlement_strategy: 'merge' },
        { headers },
      );

      const { npcs_added, wiki_pages_added, settlement_result, settlement_name } = response.data;
      const summaryParts = [];

      // 1. Process NPCs breakdown
      if (npcs_added > 0) {
        summaryParts.push(`${npcs_added} new NPC${npcs_added === 1 ? '' : 's'}`);
      }

      // 2. Process Wiki Pages breakdown
      if (wiki_pages_added > 0) {
        summaryParts.push(`${wiki_pages_added} wiki page${wiki_pages_added === 1 ? '' : 's'}`);
      }

      // 3. Process Settlement Map breakdown
      if (settlement_name && settlement_result && settlement_result !== 'none') {
        const actionMap = {
          created: 'imported',
          merged: 'merged',
          overridden: 'overridden'
        };
        const actionWord = actionMap[settlement_result] || 'updated';
        summaryParts.push(`the "${settlement_name || 'Settlement'}" map was ${actionWord}`);
      }

      // 4. Construct the final announcement notice sentence
      if (summaryParts.length > 0) {
        if (npcs_added > 0 && summaryParts.length === 1) {
          setNotice(`${module.module_name} refreshed. ${npcs_added} new NPC${npcs_added === 1 ? '' : 's'} added to the library.`);
        } else {
        // Formats nicely: "Item A, Item B, and Item C added/updated."
        const lastPart = summaryParts.pop();
        const localizedList = summaryParts.length > 0
          ? `${summaryParts.join(', ')}, and ${lastPart}`
          : lastPart;

        setNotice(`${module.module_name} refreshed. Changes applied: ${localizedList}.`);
        }
      } else {
        setNotice(`${module.module_name} refreshed. Everything was already up to date!`);
      }

      await loadSettings();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to refresh module content');
    } finally {
      setRefreshingModule('');
    }
  };

  const replaceCampaign=(campaign)=>setSettings(current=>({...current,campaign}));

  const chooseCampaignIcon=async(presetKey)=>{
    setIconSaving(true);setError('');setNotice('');
    try{
      const response=await axios.patch(`/api/campaigns/${campaignID}/profile-icon`,{preset_key:presetKey},{headers});
      replaceCampaign(response.data.campaign);setNotice('Campaign profile icon updated.');
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to update the campaign icon');}
    finally{setIconSaving(false);}
  };

  const uploadCampaignIcon=async(processedBlob)=>{
    if(!processedBlob)return;
    setIconSaving(true);setError('');setNotice('');
    try{
      const iconFile=new File([processedBlob],`campaign-icon-${Date.now()}.png`,{type:processedBlob.type||'image/png'});
      const body=new FormData();body.append('icon',iconFile);
      const response=await axios.post(`/api/campaigns/${campaignID}/profile-icon`,body,{headers});
      replaceCampaign(response.data.campaign);setNotice('Campaign profile icon uploaded.');
      setIconModalOpen(false);
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to upload the campaign icon');}
    finally{setIconSaving(false);}
  };

  const resetCampaignIcon=async()=>{
    setIconSaving(true);setError('');setNotice('');
    try{
      const response=await axios.patch(`/api/campaigns/${campaignID}/profile-icon`,{reset:true},{headers});
      replaceCampaign(response.data.campaign);setNotice('Campaign profile icon reset.');
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to reset the campaign icon');}
    finally{setIconSaving(false);}
  };

  const chooseRuleset=async(ruleset)=>{
    setRulesetSaving(true);setError('');setNotice('');
    try{
      const response=await axios.patch(`/api/campaigns/${campaignID}/ruleset`,{ruleset},{headers});
      replaceCampaign(response.data.campaign);
      window.dispatchEvent(new CustomEvent('campaign-ruleset-updated',{detail:response.data.campaign}));
      setNotice(`Campaign ruleset changed to ${ruleset}.`);
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to update the campaign ruleset');}
    finally{setRulesetSaving(false);}
  };

  const saveCampaignName=async(event)=>{
    event.preventDefault();
    const name=campaignName.trim();
    if(!name){setError('Campaign name is required.');return;}
    setNameSaving(true);setError('');setNotice('');
    try{
      const response=await axios.patch(`/api/campaigns/${campaignID}/name`,{name},{headers});
      replaceCampaign(response.data.campaign);
      window.dispatchEvent(new CustomEvent('campaign-updated',{detail:response.data.campaign}));
      setNotice(`Campaign renamed to ${response.data.campaign.name}.`);
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to rename the campaign');}
    finally{setNameSaving(false);}
  };

  if(loading)return <div className="campaign-settings-state"><Spinner animation="border"/> Loading campaign settings…</div>;

  return <section className={`campaign-settings-page${embedded?' is-embedded':''}`}>
    {!embedded&&<header><div><span>CAMPAIGN MANAGEMENT</span><h1>{settings?.campaign?.name}</h1><p>Install adventures without discarding the campaign’s accumulated world state.</p></div></header>}
    {error&&<Alert variant="danger" dismissible onClose={()=>setError('')}>{error}</Alert>}
    {notice&&<Alert variant="success" dismissible onClose={()=>setNotice('')}>{notice}</Alert>}

    <div className="campaign-settings-grid">
      <Card className="settings-card campaign-profile-card"><Card.Body>
        <span>CAMPAIGN PROFILE</span><h2>Campaign details</h2>
        <Form className="campaign-name-editor" onSubmit={saveCampaignName}>
          <Form.Group controlId="campaignNameSetting"><Form.Label>Campaign name</Form.Label><Form.Control type="text" value={campaignName} onChange={event=>setCampaignName(event.target.value)} maxLength={100} disabled={nameSaving}/><Form.Text>This changes the display name and wiki URL, while campaign data remains linked by its internal ID.</Form.Text></Form.Group>
          <Button type="submit" disabled={nameSaving||!campaignName.trim()||campaignName.trim()===settings?.campaign?.name}>{nameSaving?'Saving…':'Save name'}</Button>
        </Form>
        <h3 className="campaign-profile-subheading">Profile icon</h3>
        <div className="campaign-icon-editor">
          <div className="campaign-icon-current"><img src={settings?.campaign?.icon||'/sea_turtle_icon_512.png'} alt="Current campaign icon"/><small>Shown on the Account Profile page</small></div>
          <div className="campaign-icon-options">
            <strong>Preloaded icons</strong>
            <div className="campaign-icon-presets">{(settings?.profile_icon_presets||[]).map(preset=><button type="button" key={preset.key} className={settings?.campaign?.icon===preset.url?'selected':''} onClick={()=>chooseCampaignIcon(preset.key)} disabled={iconSaving} aria-label={`Use ${preset.name} campaign icon`}><img src={preset.url} alt=""/><span>{preset.name}</span></button>)}</div>
            <div className="campaign-icon-actions">
              <Button variant="outline-primary" size="sm" onClick={()=>setIconModalOpen(true)} disabled={iconSaving}>Edit & Upload</Button>
              <Button variant="outline-secondary" size="sm" onClick={resetCampaignIcon} disabled={iconSaving||!settings?.campaign?.icon}>Use default</Button>
              {iconSaving&&<span><Spinner size="sm"/> Saving…</span>}
            </div>
          </div>
        </div>

        <IconEditorModal
          show={iconModalOpen}
          onClose={()=>setIconModalOpen(false)}
          onUpload={uploadCampaignIcon}
          disabled={iconSaving}
        />
      </Card.Body></Card>

      <div className="campaign-settings-access-layout">
        <div className="campaign-settings-access-stack">
          <Card className="settings-card campaign-rules-card"><Card.Body>
            <span>GAME RULES</span><h2>D&amp;D ruleset</h2>
            <p className="settings-card-description">Choose the edition used for character options, rules content, tables, and equipment presets.</p>
            <Form.Group controlId="campaignRulesetSetting"><Form.Label>Edition</Form.Label><Form.Select value={settings?.campaign?.ruleset||'5e'} onChange={event=>chooseRuleset(event.target.value)} disabled={rulesetSaving}>
              <option value="3.5e">3.5e</option>
              <option value="4e">4e</option>
              <option value="5e">5e</option>
              <option value="5e (2024)">5e (2024)</option>
            </Form.Select><Form.Text>System: D&amp;D{rulesetSaving?' · Saving…':''}</Form.Text></Form.Group>
          </Card.Body></Card>

          <Card className="settings-card campaign-wiki-card"><Card.Body>
            <div className="settings-card-title"><div><span>WIKI ACCESS</span><h2>Writing permissions</h2></div><Badge bg="secondary">DM always writes</Badge></div>
            <Form.Group controlId="campaignWikiPermission"><Form.Label>Who can write to the campaign wiki?</Form.Label>
              <Form.Select value={members.wiki_permission||'everyone'} onChange={event=>saveWikiPermission(event.target.value)} disabled={wikiSaving==='permission'}>
                <option value="everyone">Everyone can write</option>
                <option value="scribes_only">Scribes Only</option>
                <option value="dm_only">DM only</option>
              </Form.Select>
              <Form.Text>{members.wiki_permission==='scribes_only'
                ? 'The DM always has write permission. Scribes can publish directly; Scribes with Approval send changes to the DM for review.'
                : members.wiki_permission==='dm_only'
                  ? 'Only the DM can change wiki pages. Player roles are retained if you change this setting later.'
                  : 'Every active campaign member can publish wiki changes directly.'}</Form.Text>
            </Form.Group>
            <h3 className="campaign-profile-subheading">Player wiki roles</h3>
            <div className="campaign-wiki-roles">
              {(members.active||[]).map(member=><div key={`wiki-role-${member.id}`}>
                <div><strong>@{member.username}</strong><small>{member.is_dm?'Campaign DM':'Active player'}</small></div>
                {member.is_dm?<Badge bg="primary">DM · Full access</Badge>:<Form.Select aria-label={`Wiki role for @${member.username}`} value={member.wiki_role||'read_only'} onChange={event=>saveWikiRole(member,event.target.value)} disabled={wikiSaving===`member-${member.id}`}>
                  <option value="scribe">Scribe</option>
                  <option value="scribe_approval">Scribe with Approval</option>
                  <option value="read_only">Read Only</option>
                </Form.Select>}
              </div>)}
              {(members.pending||[]).map(member=><div key={`wiki-pending-${member.id}`} className="is-pending"><div><strong>@{member.username}</strong><small>Invitation pending</small></div><Badge bg="light" text="dark">Role available after acceptance</Badge></div>)}
            </div>
            <h3 className="campaign-profile-subheading">Approval queue</h3>
            {wikiProposals.length?<div className="wiki-proposal-list">{wikiProposals.map(proposal=><article key={proposal.id}>
              <div><strong>{proposal.page_title}</strong><small>Submitted by @{proposal.submitted_by?.username||'player'}</small><p>{proposal.content?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,180)||'Blank page content'}</p></div>
              <span><Button size="sm" onClick={()=>reviewWikiProposal(proposal,'approve')} disabled={wikiSaving===`proposal-${proposal.id}`}>Approve</Button><Button size="sm" variant="outline-secondary" onClick={()=>reviewWikiProposal(proposal,'reject')} disabled={wikiSaving===`proposal-${proposal.id}`}>Reject</Button></span>
            </article>)}</div>:<p className="settings-empty">No wiki changes are waiting for review.</p>}
          </Card.Body></Card>
        </div>

        <Card className="settings-card campaign-members-card"><Card.Body>
          <div className="settings-card-title"><div><span>TABLE</span><h2>Campaign members</h2></div><Badge bg="secondary">{(members.active||[]).length} active</Badge></div>
          <div className="campaign-member-list">
            {(members.active||[]).map(member=><div key={`active-${member.id}`}><strong>@{member.username}</strong><Badge bg="success">Active</Badge></div>)}
            {(members.pending||[]).map(member=><div key={`pending-${member.id}`}><strong>@{member.username}</strong><span><Badge bg="warning" text="dark">Pending</Badge><Button variant="outline-secondary" size="sm" onClick={()=>revokeInvitation(member)}>Revoke</Button></span></div>)}
            {!(members.active||[]).length&&!(members.pending||[]).length&&<p className="settings-empty">No campaign members are listed yet.</p>}
          </div>
          <hr/>
          <div className="settings-card-title"><div><span>FRIENDS</span><h2>Invite players</h2></div>{eligibleFriends.length>0&&<Button variant="link" size="sm" onClick={()=>setSelectedFriendIds(selectedFriendIds.length===eligibleFriends.length?[]:eligibleFriends.map(friend=>friend.id))}>{selectedFriendIds.length===eligibleFriends.length?'Clear':'Select all'}</Button>}</div>
          {eligibleFriends.length?<div className="campaign-friend-picker">{eligibleFriends.map(friend=><Form.Check key={friend.id} id={`campaign-friend-${friend.id}`} label={`@${friend.username}`} checked={selectedFriendIds.includes(friend.id)} onChange={event=>setSelectedFriendIds(current=>event.target.checked?[...current,friend.id]:current.filter(id=>id!==friend.id))}/>)}</div>:<p className="settings-empty">All eligible friends are already members or have pending invitations.</p>}
          <Button onClick={inviteFriends} disabled={!selectedFriendIds.length}>Invite selected</Button>
        </Card.Body></Card>
      </div>

      <Card className="settings-card"><Card.Body>
        <div className="settings-card-title"><div><span>MODULES</span><h2>Installed adventures</h2></div><Button onClick={openAddModule} disabled={!installable.length}>Add module</Button></div>
        {!settings?.installed_modules?.length?<p className="settings-empty">No module installation history is recorded yet.</p>:
          <div className="module-list">{settings.installed_modules.map(module=><article key={module.id}>
            <div><strong>{module.module_name}</strong><small>{module.setting_key?.replaceAll('_',' ')} · module year {module.starting_year??'unspecified'}</small></div>
            <div className="module-list-actions"><Badge bg="secondary">{module.settlement_strategy}</Badge><Button variant="outline-primary" size="sm" onClick={()=>openAdventure(module)}>Read adventure</Button><Button variant="outline-secondary" size="sm" onClick={()=>refreshModule(module)} disabled={!!refreshingModule}>{refreshingModule===module.module_key?'Refreshing…':'Refresh content'}</Button></div>
          </article>)}</div>}
        {!installable.length&&<small>All currently available modules are installed.</small>}
      </Card.Body></Card>

      <Card className="settings-card"><Card.Body>
        <span>IN-WORLD CALENDAR</span><h2>{settings?.calendar?.name||'Not configured'}</h2>
        {settings?.calendar?<dl><div><dt>Format</dt><dd>{settings.calendar.format_slug}</dd></div><div><dt>Current year</dt><dd>{settings.calendar.current_year}</dd></div><div><dt>Date</dt><dd>Month {settings.calendar.current_month_index+1}, day {settings.calendar.current_day}</dd></div></dl>:<p className="settings-empty">Installing a setting module will configure its calendar.</p>}
      </Card.Body></Card>
    </div>

    <Modal show={showAdd} onHide={()=>!installing&&setShowAdd(false)} size="lg" centered>
      <Modal.Header closeButton><Modal.Title>Add module</Modal.Title></Modal.Header>
      <Modal.Body className="module-import-modal">
        <Form.Group><Form.Label>Module</Form.Label><Form.Select value={selectedKey} onChange={event=>previewModule(event.target.value)}>
          {installable.map(module=><option key={module.key} value={module.key}>{module.name}</option>)}
        </Form.Select></Form.Group>
        {!preview&&selectedKey&&<div className="campaign-settings-state"><Spinner size="sm"/> Checking campaign conflicts…</div>}
        {preview&&<>
          <p>{preview.module.description}</p>
          <div className="module-facts"><span>{preview.module.setting_name}</span>{preview.module.starting_year!=null&&<span>{preview.module.starting_year_label||`Year ${preview.module.starting_year}`}</span>}{preview.module.calendar?.name&&<span>{preview.module.calendar.name}</span>}{preview.module.creature_count!=null&&<span>{preview.module.creature_count} creatures</span>}</div>
          {preview.calendar.year_mismatch&&<Alert variant="warning">
            You are currently in year <strong>{preview.calendar.current_year}</strong>, but this module is set in year <strong>{preview.calendar.module_year}</strong>. How should the timeline be reconciled?
          </Alert>}
          {preview.calendar.format_mismatch&&<Alert variant="warning">The campaign currently uses <strong>{preview.calendar.current_format}</strong>, while this module uses <strong>{preview.calendar.module_format}</strong>.</Alert>}
          {preview.module.calendar&&<Form.Group><Form.Label>Calendar</Form.Label><Form.Select value={calendarStrategy} onChange={event=>setCalendarStrategy(event.target.value)}>
            <option value="keep_current" disabled={!preview.calendar.exists}>Keep the current campaign date</option>
            <option value="use_module">Use the module calendar and move to year {preview.calendar.module_year}</option>
          </Form.Select></Form.Group>}
          {!!preview.settlement_conflicts.length&&<Alert variant="info">This module includes {preview.settlement_conflicts.map(conflict=>conflict.incoming_name).join(', ')}, which already exists in the campaign.</Alert>}
          {preview.settlement_template_available?<Form.Group><Form.Label>Existing settlements</Form.Label><Form.Select value={settlementStrategy} onChange={event=>setSettlementStrategy(event.target.value)}>
            <option value="merge">Merge additions into the current maps</option>
            <option value="keep">Keep current maps and import only non-map content</option>
            <option value="override">Replace conflicting settlement maps with module versions</option>
          </Form.Select><Form.Text>Merging retains existing records and adds module features whose stable IDs or names are new.</Form.Text></Form.Group>:<Alert variant="secondary">This module currently provides calendar and campaign content but no packaged settlement map.</Alert>}
        </>}
      </Modal.Body>
      <Modal.Footer><Button variant="secondary" onClick={()=>setShowAdd(false)} disabled={installing}>Cancel</Button><Button onClick={installModule} disabled={!preview||installing}>{installing?'Installing…':'Install module'}</Button></Modal.Footer>
    </Modal>
    <Modal show={!!adventureView} onHide={()=>{setAdventureView(null);setAdventureSection(null);}} size="xl" centered scrollable>
      <Modal.Header closeButton><Modal.Title>{adventureView?.name}</Modal.Title></Modal.Header>
      <Modal.Body>
        {adventureError&&<Alert variant="danger">{adventureError}</Alert>}
        {adventureView?.sections?.map(section=><Button key={section.index} variant="outline-secondary" size="sm" className="m-1" onClick={()=>openAdventureSection(section.index)}>{section.name}</Button>)}
        {adventureSection&&<div className="adventure-section"><h3>{adventureSection.name}</h3>{adventureText(adventureSection.entries||[]).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>}
      </Modal.Body>
    </Modal>
  </section>;
}
