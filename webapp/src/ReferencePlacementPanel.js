import React, { useEffect, useRef, useState } from 'react';
import { guessReferencePlacement, prepareReferencePreview, referenceForSave } from './referencePlacement';
import './ReferencePlacementPanel.css';

export default function ReferencePlacementPanel({ layers, selectedId, select, draft, setDraft, cameraRef, apply, remove, fit, calibration }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const fileRef = useRef(null), urlRef = useRef(null), mounted = useRef(true), pickerRef = useRef(null);
  const selected = layers.find(l => l.id === selectedId) || layers[0];
  const selectedOpacity = Number.isFinite(Number(selected?.opacity)) ? Number(selected.opacity) : 0.7;
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); setDraft(null);
  }; }, [setDraft]);
  const cancel = () => { setDraft(null); fileRef.current = null; if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; setError(''); };
  const upload = async file => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const preview = await prepareReferencePreview(file);
      if (!mounted.current) { URL.revokeObjectURL(preview.url); return; }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = preview.url; fileRef.current = file;
      setDraft({ id: 'reference-preview', name: file.name.replace(/\.[^.]+$/, ''), image_url: preview.url,
        pixel_width: preview.width, pixel_height: preview.height, ...guessReferencePlacement(preview.width, preview.height, cameraRef.current),
        rotation_degrees: 0, opacity: 0.7, visible: true, scope: 'city', project_to_terrain: true, _placing: true, _lockAspect: true });
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(false); }
  };
  const patch = values => setDraft(current => ({ ...current, ...values }));
  const number = (label, key, min) => <label key={key}>{label}<input type="number" step="any" min={min} value={draft[key] ?? 0} onChange={event => {
    if (!event.target.value || !Number.isFinite(event.target.valueAsNumber)) return;
    const value = min == null ? event.target.valueAsNumber : Math.max(min, event.target.valueAsNumber);
    const values = { [key]: value };
    if (draft._lockAspect && key === 'width_feet') values.height_feet = value * draft.height_feet / draft.width_feet;
    if (draft._lockAspect && key === 'height_feet') values.width_feet = value * draft.width_feet / draft.height_feet;
    patch(values);
  }} /></label>;
  const commit = async () => {
    setBusy(true); patch({ _busy: true }); setError('');
    try {
      const placement = referenceForSave(draft);
      await apply(placement, fileRef.current);
      if (mounted.current) {
        fileRef.current = null;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
        setDraft(null);
      }
    }
    catch (err) { if (mounted.current) { setError(err.response?.data?.message || err.message || 'Unable to save this image.'); patch({ _busy: false }); } }
    finally { if (mounted.current) setBusy(false); }
  };
  return <aside className="editor-menu reference-menu reference-placement-panel" aria-label="Reference images">
    <h3>REFERENCE IMAGES</h3>
    {!draft && <><button className="reference-upload-button" disabled={busy} onClick={() => pickerRef.current?.click()}>{busy ? 'Reading image…' : 'Upload image'}</button>
      <input ref={pickerRef} aria-label="Reference image file" type="file" hidden disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
    </>}
    {error && <p role="alert" className="reference-error">{error}</p>}
    {draft ? <fieldset disabled={busy}>
      <p className="reference-step">POSITION → SCALE → APPLY</p>
      <p>Use the red camera-center gizmo: drag the center to move, the ring to rotate, or the diagonal handle to scale. Wheel to zoom; right-drag to navigate.</p>
      <label>Name<input value={draft.name} onChange={e => patch({ name: e.target.value })} /></label>
      <p className="reference-hint">{draft.pixel_width} × {draft.pixel_height} px · Initial feet dimensions are an estimate, not a measured scale.</p>
      <label className="reference-check"><input type="checkbox" checked={draft.project_to_terrain !== false} onChange={e => patch({ project_to_terrain: e.target.checked })} /> Project onto sculpted terrain</label>
      <label className="reference-check"><input type="checkbox" checked={draft._lockAspect} onChange={e => patch({ _lockAspect: e.target.checked })} /> Lock proportions</label>
      <div className="reference-number-grid">{number('Width (ft)', 'width_feet', 1)}{number('Height (ft)', 'height_feet', 1)}{number('Center X (ft)', 'origin_x')}{number('Center Y (ft)', 'origin_y')}{number('Rotation (°)', 'rotation_degrees')}</div>
      <label>Opacity · {Math.round(draft.opacity * 100)}%<input type="range" min="0" max="1" step="0.01" value={draft.opacity} onChange={e => patch({ opacity: Number(e.target.value) })} /></label>
      <div className="reference-actions"><button onClick={() => patch(guessReferencePlacement(draft.width_feet, draft.height_feet, cameraRef.current))}>Fit at camera</button><button onClick={() => fit(draft)}>View image</button></div>
      <p className="reference-hint">Apply saves the current alignment and returns to the reference image list. Cancel discards these changes.</p>
      <div className="reference-actions"><button className="reference-primary" onClick={commit}>{busy ? 'Saving…' : 'Apply changes'}</button><button onClick={cancel}>Cancel</button></div>
    </fieldset> : <>
      <p>Upload a map or choose an existing image to adjust its placement.</p>
      <div className="reference-layer-list">{layers.map(layer => <button key={layer.id} aria-pressed={selected?.id === layer.id} onClick={() => select(layer.id)}>{layer.name}<small>{Math.round(layer.width_feet)} × {Math.round(layer.height_feet)} ft</small></button>)}</div>
      {selected && <><div className="reference-actions"><button className="reference-primary" disabled={busy} onClick={() => { fileRef.current = null; setDraft({ opacity: .7, ...selected, visible: true, _placing: true, _lockAspect: true }); }}>Edit placement</button><button onClick={() => fit(selected)}>View image</button></div>
        <label className="reference-check"><input type="checkbox" checked={selected.visible !== false} onChange={e => apply({ ...selected, visible: e.target.checked })} /> Visible</label>
        <label>Opacity · {Math.round(selectedOpacity * 100)}%<input type="range" min="0" max="1" step="0.01" value={selectedOpacity} onChange={e => apply({ ...selected, opacity: Number(e.target.value) })} /></label>
        {calibration}
        <button className="reference-remove" onClick={() => { if (window.confirm(`Remove “${selected.name}” from this map?`)) remove(selected.id); }}>Remove image</button>
      </>}
    </>}
  </aside>;
}
