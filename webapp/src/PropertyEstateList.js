import React, { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

export default function PropertyEstateList({ properties, buildings, selectedId, onSelect, onSelectBuilding, onCreate, onRename, onDelete, onAddStructure, onMoveBuilding }) {
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const target = properties.find(property => property.id === dialog?.id);
  const openDetails = property => { setDialog({ id: property.id }); setName(property.name || ''); setConfirmDelete(false); };
  const close = () => { setDialog(null); setConfirmDelete(false); };
  return <>
    <div className="property-estate-list" aria-label="Properties">
      {properties.map(property => <section className={`property-list-item${selectedId === property.id ? ' is-selected' : ''}`} key={property.id}>
        <div className="property-list-heading">
          <button className="property-select" onClick={() => onSelect(property.id)} aria-pressed={selectedId === property.id}>
            <span className="property-list-label">Property</span><strong>{property.name || 'Unnamed Property'}</strong>
          </button>
          <button className="property-details" onClick={() => openDetails(property)} aria-label={`Details for ${property.name || 'Unnamed Property'}`}>Details</button>
        </div>
        <details className="property-building-drawer">
          <summary>Buildings on this property <span>{property.structure_ids?.length || 0}</span></summary>
          <div className="property-building-list">
            {(property.structure_ids || []).map(id => {
              const building = buildings.find(item => String(item.id) === String(id));
              return building ? <button key={id} onClick={() => { onSelect(property.id); onSelectBuilding(building); }}>
                <span>Building</span><strong>{building.name || 'Unnamed Building'}</strong><small>Select building →</small>
              </button> : <p key={id}>Missing building: {id}</p>;
            })}
            {!property.structure_ids?.length && <p>No buildings yet.</p>}
            <button onClick={() => { onSelect(property.id); onAddStructure(property.id); }}>Add Building to {property.name || 'Property'}</button>
            <label className="property-existing-building">Move existing building here
              <select aria-label={`Move existing building to ${property.name}`} value="" onChange={event => onMoveBuilding(property.id, buildings.find(building => String(building.id) === event.target.value)?.id)}>
                <option value="">Choose building…</option>
                {buildings.filter(building => !(property.structure_ids || []).some(id => String(id) === String(building.id))).map(building => <option key={building.id} value={building.id}>{building.name || 'Unnamed Building'}</option>)}
              </select>
            </label>
          </div>
        </details>
      </section>)}
      <button className="property-create" onClick={() => { setName(''); setDialog({ create: true }); }}>Create Property / Estate</button>
    </div>
    <><Dialog open={Boolean(dialog)} onClose={close} fullWidth maxWidth="xs" PaperProps={{ className: 'estate-details-dialog' }}>
      <form onSubmit={event => { event.preventDefault(); if (!name.trim()) return; if (dialog.create) onCreate(name.trim()); else onRename(target.id, name.trim()); close(); }}>
        <DialogTitle>{dialog?.create ? 'Create Property / Estate' : 'Property Details'}</DialogTitle>
        <DialogContent>
          {confirmDelete ? <>
            <p>Delete “{target?.name}” and its boundary and outdoor areas?</p>
            <p>Its {target?.structure_ids?.length || 0} buildings will be kept as separate properties with their existing floor plans and identifiers.</p>
          </> : <>
            <TextField autoFocus fullWidth label="Property name" value={name} onChange={event => setName(event.target.value)} margin="dense" />
            {!dialog?.create && <p>{target?.structure_ids?.length || 0} buildings on this property.</p>}
          </>}
        </DialogContent>
        <DialogActions>
          {confirmDelete ? <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button onClick={() => { onDelete(target.id); close(); }} className="property-delete-action">Delete Property</Button>
          </> : <>
            {!dialog?.create && <Button onClick={() => setConfirmDelete(true)} className="property-delete-action">Delete Property…</Button>}
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" disabled={!name.trim()}>{dialog?.create ? 'Create Property' : 'Save Details'}</Button>
          </>}
        </DialogActions>
      </form>
    </Dialog></>
  </>;
}
