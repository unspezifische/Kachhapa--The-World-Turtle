import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Alert, Badge, Button, Card, Form, Modal, Spinner } from 'react-bootstrap';

import './CampaignSettings.css';

export default function CampaignSettings({ campaignID, headers, embedded = false }) {
  const [settings,setSettings]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [showAdd,setShowAdd]=useState(false),[selectedKey,setSelectedKey]=useState(''),[preview,setPreview]=useState(null);
  const [settlementStrategy,setSettlementStrategy]=useState('merge'),[calendarStrategy,setCalendarStrategy]=useState('keep_current');
  const [installing,setInstalling]=useState(false),[notice,setNotice]=useState('');

  const loadSettings=useCallback(async()=>{
    setLoading(true);setError('');
    try{const response=await axios.get(`/api/campaigns/${campaignID}/modules`,{headers});setSettings(response.data);}
    catch(requestError){setError(requestError.response?.data?.message||'Unable to load campaign settings');}
    finally{setLoading(false);}
  },[campaignID,headers]);

  useEffect(()=>{loadSettings();},[loadSettings]);
  const installable=useMemo(()=>settings?.available_modules?.filter(module=>!module.installed)||[],[settings]);

  const previewModule=useCallback(async(moduleKey)=>{
    setSelectedKey(moduleKey);setPreview(null);setError('');
    if(!moduleKey)return;
    try{
      const response=await axios.post(`/api/campaigns/${campaignID}/modules/preview`,{module_key:moduleKey},{headers});
      setPreview(response.data);
      setSettlementStrategy('merge');
      setCalendarStrategy(response.data.calendar.exists?'keep_current':'use_module');
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
      setNotice(`${response.data.installation.module_name} installed. Settlement: ${response.data.settlement_result}.`);
      setShowAdd(false);setPreview(null);setSelectedKey('');await loadSettings();
    }catch(requestError){setError(requestError.response?.data?.message||'Unable to install module');}
    finally{setInstalling(false);}
  };

  if(loading)return <div className="campaign-settings-state"><Spinner animation="border"/> Loading campaign settings…</div>;

  return <section className={`campaign-settings-page${embedded?' is-embedded':''}`}>
    {!embedded&&<header><div><span>CAMPAIGN MANAGEMENT</span><h1>{settings?.campaign?.name}</h1><p>Install adventures without discarding the campaign’s accumulated world state.</p></div></header>}
    {error&&<Alert variant="danger" dismissible onClose={()=>setError('')}>{error}</Alert>}
    {notice&&<Alert variant="success" dismissible onClose={()=>setNotice('')}>{notice}</Alert>}

    <div className="campaign-settings-grid">
      <Card className="settings-card"><Card.Body>
        <div className="settings-card-title"><div><span>MODULES</span><h2>Installed adventures</h2></div><Button onClick={openAddModule} disabled={!installable.length}>Add module</Button></div>
        {!settings?.installed_modules?.length?<p className="settings-empty">No module installation history is recorded yet.</p>:
          <div className="module-list">{settings.installed_modules.map(module=><article key={module.id}>
            <div><strong>{module.module_name}</strong><small>{module.setting_key?.replaceAll('_',' ')} · module year {module.starting_year??'unspecified'}</small></div>
            <Badge bg="secondary">{module.settlement_strategy}</Badge>
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
          <div className="module-facts"><span>{preview.module.setting_name}</span><span>{preview.module.starting_year_label||`Year ${preview.module.starting_year}`}</span><span>{preview.module.calendar?.name}</span></div>
          {preview.calendar.year_mismatch&&<Alert variant="warning">
            You are currently in year <strong>{preview.calendar.current_year}</strong>, but this module is set in year <strong>{preview.calendar.module_year}</strong>. How should the timeline be reconciled?
          </Alert>}
          {preview.calendar.format_mismatch&&<Alert variant="warning">The campaign currently uses <strong>{preview.calendar.current_format}</strong>, while this module uses <strong>{preview.calendar.module_format}</strong>.</Alert>}
          <Form.Group><Form.Label>Calendar</Form.Label><Form.Select value={calendarStrategy} onChange={event=>setCalendarStrategy(event.target.value)}>
            <option value="keep_current" disabled={!preview.calendar.exists}>Keep the current campaign date</option>
            <option value="use_module">Use the module calendar and move to year {preview.calendar.module_year}</option>
          </Form.Select></Form.Group>
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
  </section>;
}
