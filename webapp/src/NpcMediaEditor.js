import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import axios from 'axios';
import NpcMediaImage from './NpcMediaImage';
import NpcImageFramer from './NpcImageFramer';
import { npcAudio } from './npcAudioManager';

const categories = ['Greeting','Farewell','Taunt','Combat','Spellcasting','Damage Reaction','Quote','Custom'];
export function VoiceLineForm({ line, onSave, onDelete, onReplace, onReset, children, onPlay }) {
  const [draft, setDraft] = useState(line);
  useEffect(() => setDraft(line), [line]);
  const change = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  return <article className="npc-voice-line"><Form onSubmit={event => { event.preventDefault(); const { label, category, transcript, description, quick_slot, display_order, gain, enabled } = draft; onSave({ label, category, transcript, description, quick_slot, display_order, gain, enabled }); }}>
    <Form.Label>Label<Form.Control aria-label={`Label for ${line.label}`} value={draft.label} maxLength={160} required onChange={event => change('label',event.target.value)} /></Form.Label>
    <Form.Label>Category<Form.Select value={draft.category} onChange={event => change('category',event.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</Form.Select></Form.Label>
    <Form.Label>Transcript<Form.Control as="textarea" value={draft.transcript} onChange={event => change('transcript',event.target.value)} /></Form.Label>
    <Form.Label>Notes<Form.Control value={draft.description} onChange={event => change('description',event.target.value)} /></Form.Label>
    <Form.Label>Quick slot (blank for More only)<Form.Control type="number" min="1" value={draft.quick_slot == null ? '' : draft.quick_slot + 1} onChange={event => change('quick_slot',event.target.value === '' ? null : Number(event.target.value)-1)} /></Form.Label>
    <Form.Label>Display order<Form.Control type="number" min="0" value={draft.display_order} onChange={event => change('display_order',Number(event.target.value))} /></Form.Label>
    <Form.Label>Playback gain<Form.Control type="number" min="0" max="4" step="0.1" value={draft.gain} onChange={event => change('gain',Number(event.target.value))} /></Form.Label>
    <Form.Check label="Enabled" checked={draft.enabled} onChange={event => change('enabled',event.target.checked)} />
    <div className="npc-inline-actions"><Button type="submit">Save recording</Button><Button type="button" variant="outline-secondary" onClick={onPlay}>▶ Play {line.label}</Button><Button variant="outline-danger" type="button" onClick={onDelete}>Delete recording</Button>{line.inherited_from && <Button type="button" onClick={onReset}>Reset recording to module default</Button>}</div>
    <Form.Label>Replace audio<Form.Control type="file" accept=".mp3,.wav,.m4a,.aac" onChange={event => { const file=event.target.files[0]; if(file) onReplace(file); event.target.value=''; }} /></Form.Label>
  </Form>{children}</article>;
}

export default function NpcMediaEditor({ npc, headers, TriggerEditor }) {
  const [media,setMedia]=useState({}), [lines,setLines]=useState([]), [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const [cropSource,setCropSource]=useState('portrait'), [crop,setCrop]=useState({ x:.5,y:.5,zoom:1,shape:'circle',border:'' });
  const [pendingUpload,setPendingUpload]=useState(null);
  const base=`/api/npc-media/npcs/${npc.id}`;
  const load=useCallback(async () => { const [profile,voices]=await Promise.all([axios.get(base,{headers}),axios.get(base+'/voices',{headers})]);setMedia(profile.data);setLines(voices.data.lines || []); },[base,headers]);
  useEffect(() => { let active=true;load().catch(() => {if(active)setError('Could not load NPC media.');});return()=>{active=false;}; },[load]);
  const run=async operation=>{setBusy(true);setError('');try{await operation();await load();window.dispatchEvent(new Event('npc-media-changed'));}catch(err){setError(err.response?.data?.message||'Could not update NPC media.');}finally{setBusy(false);}};
  const upload=async file=>{const form=new FormData();form.append('file',file);return (await axios.post('/api/npc-media/assets',form,{headers})).data;};
  useEffect(() => () => { if (pendingUpload?.preview) URL.revokeObjectURL(pendingUpload.preview); }, [pendingUpload]);
  const chooseImage = (kind, file) => {
    if (!file) return;
    setCrop({x:.5,y:.5,zoom:1,shape:kind === 'token' ? 'circle' : 'square',border:''});
    setPendingUpload({kind,file,preview:URL.createObjectURL(file)});
  };
  const savePendingImage = () => run(async()=>{
    const original=await upload(pendingUpload.file);
    const {data:framed}=await axios.post(`/api/npc-media/assets/${original.id}/crop`,crop,{headers});
    await axios.patch(base,{[pendingUpload.kind]:framed.id},{headers});
    setPendingUpload(null);
  });
  const play=line=>{npcAudio.configure(headers,headers?.campaignID||headers?.CampaignID);npcAudio.playVoiceLine(line);};
  return <section aria-label="NPC Media"><h3>Media</h3>{error&&<Alert variant="danger">{error}</Alert>}<fieldset disabled={busy}>
    <div className="npc-media-images">{['portrait','token'].map(kind=><section key={kind}><h4>{kind==='portrait'?'Portrait':'Token'}</h4><NpcMediaImage asset={media[kind]} headers={headers} size={kind==='portrait'?512:128} alt={`${npc.name} ${kind}`} style={{maxHeight:220}} />
      <Form.Label>Upload {kind}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{chooseImage(kind,event.target.files[0]);event.target.value='';}} /></Form.Label>
      <Button variant="outline-secondary" onClick={()=>run(()=>axios.patch(base,{[kind]:null},{headers}))}>Reset {kind} to default</Button>
    </section>)}</div>
    {pendingUpload && <section className="npc-pending-upload" aria-label={`Frame ${pendingUpload.kind} before upload`}><h4>Frame {pendingUpload.kind}</h4><p>Drag the image inside the frame. This preview is saved when you confirm the upload.</p><NpcImageFramer crop={crop} onChange={setCrop} renderImage={style=><img src={pendingUpload.preview} alt="Pending upload preview" style={style} draggable={false} />} /><div className="npc-inline-actions"><Button onClick={savePendingImage}>Use framing &amp; upload</Button><Button variant="outline-secondary" onClick={()=>setPendingUpload(null)}>Cancel upload</Button></div></section>}
    <details><summary>Crop portrait or generate token</summary><Form.Label>Source<Form.Select value={cropSource} onChange={e=>setCropSource(e.target.value)}><option value="portrait">Portrait</option><option value="token">Token</option></Form.Select></Form.Label>
      {media[cropSource] && <NpcImageFramer crop={crop} onChange={setCrop} renderImage={style=><NpcMediaImage asset={media[cropSource]} headers={headers} size={512} alt="Crop preview" style={style} />} />}
      {['portrait','token'].map(kind=><Button key={kind} disabled={!media[cropSource]} onClick={()=>run(async()=>{const {data}=await axios.post(`/api/npc-media/assets/${media[cropSource].id}/crop`,crop,{headers});await axios.patch(base,{[kind]:data.id},{headers});})}>Save as {kind}</Button>)}<p>The source image is preserved.</p>
    </details>
    <h4>Voice Lines</h4><Form.Label>Upload recordings<Form.Control type="file" multiple accept=".mp3,.wav,.m4a,.aac" onChange={event=>{const files=Array.from(event.target.files);event.target.value='';run(async()=>{for(const file of files){const asset=await upload(file);await axios.post(base+'/voices',{media_asset_id:asset.id,label:file.name.replace(/\.[^.]+$/,''),category:'Custom'},{headers});}});}} /></Form.Label>
    {lines.map(line=><VoiceLineForm key={line.id} line={line} onPlay={()=>play(line)} onSave={values=>run(()=>axios.patch(base+'/voices/'+line.id,values,{headers}))} onDelete={()=>run(()=>axios.delete(base+'/voices/'+line.id,{headers}))} onReset={()=>run(()=>axios.delete(base+'/voices/'+line.id+'?reset=1',{headers}))} onReplace={file=>run(async()=>{const asset=await upload(file);await axios.patch(base+'/voices/'+line.id,{media_asset_id:asset.id},{headers});})}>{TriggerEditor&&<TriggerEditor line={line} npc={npc} headers={headers} onChanged={load} />}</VoiceLineForm>)}
    {!lines.length&&<p>No voice recordings yet.</p>}
  </fieldset></section>;
}
