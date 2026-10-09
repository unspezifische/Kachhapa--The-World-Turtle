import React, { useRef, useState } from 'react';
import PublicIcon from '@mui/icons-material/Public';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const atlasPoint = (event, bounds, view) => ({ x: clamp((event.clientX - bounds.left - view.x) / (bounds.width * view.zoom), 0, 1), y: clamp((event.clientY - bounds.top - view.y) / (bounds.height * view.zoom), 0, 1) });
// Preserve the existing atlas experience through 800%. The 800–1000% band is
// reserved for the cartographic-to-terrain handoff.
const atlasFade = zoom => clamp(1 - (zoom - 8) / 2, 0, 1);
// Grow markers gently in screen space as the cartography is enlarged. The
// visual is still counter-scaled against its transformed map parent, so this is
// an intentional readable-size curve rather than raw atlas magnification.
export const atlasMarkerScale = zoom => clamp(1 + (Math.max(1, zoom) - 1) * 0.075, 1, 1.65);

export default function AtlasViewport({ atlas, locations = [], selectedId, movableId = null, onSelect, onOpen, onMove, onPlace, onTerrainApproach, onTerrainEnter, placementEnabled = false, draftMarker = null }) {
  const viewportRef = useRef(null), gestureRef = useRef(null), handoffRef = useRef({ approach: null, entered: null }), viewRef = useRef({ zoom: 1, x: 0, y: 0 });
  const [view, setView] = useState(viewRef.current), [dragMarker, setDragMarker] = useState(null);
  const tileZoom = Number(atlas?.tile_zoom ?? 2), tileCount = 2 ** tileZoom;
  const tiles = !atlas?.image_url && atlas?.tile_url_template ? Array.from({ length: tileCount * tileCount }, (_, index) => ({ x: index % tileCount, y: Math.floor(index / tileCount) })) : [];
  const setViewport = updater => setView(current => { const next = typeof updater === 'function' ? updater(current) : updater; viewRef.current = next; return next; });
  const constrain = (next, bounds) => ({ ...next, x: clamp(next.x, Math.min(0, bounds.width * (1 - next.zoom)), 0), y: clamp(next.y, Math.min(0, bounds.height * (1 - next.zoom)), 0) });
  const zoomAt = (nextZoom, clientX, clientY) => {
    const bounds = viewportRef.current?.getBoundingClientRect(); if (!bounds) return;
    const current = viewRef.current;
    const zoom = clamp(nextZoom, 1, 10);
    const localX = clientX == null ? bounds.width / 2 : clientX - bounds.left, localY = clientY == null ? bounds.height / 2 : clientY - bounds.top;
    const worldX = (localX - current.x) / current.zoom, worldY = (localY - current.y) / current.zoom;
    setViewport(constrain({ zoom, x: localX - worldX * zoom, y: localY - worldY * zoom }, bounds));

    const focus = { x: worldX / bounds.width, y: worldY / bounds.height };
    const nearest = locations
      .filter(item => item.atlas_x != null && item.atlas_y != null && item.status !== 'destroyed')
      .map(item => ({ item, distance: Math.hypot((item.atlas_x - focus.x) * bounds.width * zoom, (item.atlas_y - focus.y) * bounds.height * zoom) }))
      .sort((a, b) => a.distance - b.distance)[0];
    const target = nearest?.distance <= 140 ? nearest.item : null;
    if (zoom < 8) handoffRef.current = { approach: null, entered: null };
    if (target && zoom >= 8 && handoffRef.current.approach !== target.id) {
      handoffRef.current.approach = target.id;
      onTerrainApproach?.(target.id);
    }
    if (target && zoom >= 9.98 && handoffRef.current.entered !== target.id) {
      handoffRef.current.entered = target.id;
      onTerrainEnter?.(target.id);
    }
  };
  const panBy = (x, y) => { const bounds = viewportRef.current?.getBoundingClientRect(); if (bounds) setViewport(current => constrain({ ...current, x: current.x + x, y: current.y + y }, bounds)); };
  const pointerDown = event => {
    if ((event.button != null && event.button !== 0) || event.target.closest('.atlas-marker,.atlas-viewport-controls')) return;
    const pointerId = event.pointerId ?? 'mouse';
    gestureRef.current = { type: 'pan', id: pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, dragged: false };
    event.currentTarget.setPointerCapture?.(pointerId);
  };
  const markerDown = (event, item) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const pointerId = event.pointerId ?? 'mouse';
    gestureRef.current = { type: 'marker', id: pointerId, markerId: item.id, movable: item.id === movableId, startX: event.clientX, startY: event.clientY, dragged: false, point: { x: item.atlas_x, y: item.atlas_y } };
    event.currentTarget.setPointerCapture?.(pointerId);
  };
  const pointerMove = event => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== (event.pointerId ?? 'mouse')) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 3) gesture.dragged = true;
    if (gesture.type === 'marker') {
      if (!gesture.dragged || !gesture.movable) return;
      const bounds = viewportRef.current?.getBoundingClientRect(); if (!bounds) return;
      const point = atlasPoint(event, bounds, viewRef.current); gesture.point = point; setDragMarker({ id: gesture.markerId, ...point });
      return;
    }
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y; gesture.x = event.clientX; gesture.y = event.clientY;
    if (gesture.dragged) { const bounds = viewportRef.current?.getBoundingClientRect(); if (bounds) setViewport(current => constrain({ ...current, x: current.x + dx, y: current.y + dy }, bounds)); }
  };
  const pointerUp = event => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== (event.pointerId ?? 'mouse')) return;
    gestureRef.current = null;
    if (gesture.type === 'marker') {
      setDragMarker(null);
      // A drag is placement only. In particular, do not enter a settlement as
      // the user releases its marker after accurately positioning its tip.
      if (gesture.dragged && gesture.movable) onMove?.(gesture.markerId, gesture.point.x, gesture.point.y);
      else if (!gesture.dragged) { onSelect?.(gesture.markerId); if (!gesture.movable) onOpen?.(gesture.markerId); }
      return;
    }
    if (!gesture.dragged && placementEnabled && onPlace) { const bounds = viewportRef.current?.getBoundingClientRect(); if (bounds) { const point = atlasPoint(event, bounds, viewRef.current); onPlace(point.x, point.y); } }
  };
  const display = item => dragMarker?.id === item.id ? dragMarker : item;
  const fade = atlasFade(view.zoom), terrainHandoff = 1 - fade;
  const markerCounterScale = atlasMarkerScale(view.zoom) / view.zoom;
  return <div ref={viewportRef} className={`atlas-map atlas-viewport ${atlas?.image_url ? 'has-image' : ''} ${placementEnabled ? 'placing-new' : ''} ${terrainHandoff > 0 ? 'terrain-handoff' : ''}`} onWheel={event => { event.preventDefault(); zoomAt(viewRef.current.zoom * Math.exp(-event.deltaY * .0015), event.clientX, event.clientY); }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gestureRef.current = null; setDragMarker(null); }} role="application" aria-label="Overworld atlas map">
    <div className="atlas-map-content" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
      <div className="atlas-art" style={{ opacity: fade, backgroundImage: atlas?.image_url ? `url(${atlas.image_url})` : undefined }}>
        {!!tiles.length && <div className="atlas-tiles" style={{ gridTemplateColumns: `repeat(${tileCount},1fr)` }}>{tiles.map(tile => <img key={`${tile.x}-${tile.y}`} src={atlas.tile_url_template.replace('{z}', tileZoom).replace('{x}', tile.x).replace('{y}', tile.y)} alt="" draggable="false"/>)}</div>}
      </div>
      <div className="atlas-terrain-handoff-layer" style={{ opacity: terrainHandoff }} aria-hidden="true"><span>terrain detail handoff</span></div>
      {!atlas?.image_url && !tiles.length && <div className="atlas-empty"><PublicIcon/><strong>{atlas?.name || 'Campaign World'}</strong><span>Add a world atlas image, or use the blank coordinate space.</span></div>}
      {locations.filter(item => item.atlas_x != null && item.atlas_y != null).map(item => { const point = display(item); const x = point.atlas_x ?? point.x, y = point.atlas_y ?? point.y, movable = item.id === movableId; return <button type="button" key={item.id} className={`atlas-marker ${item.id === selectedId ? 'active' : ''} ${item.status === 'destroyed' ? 'destroyed' : ''} ${movable ? 'movable' : ''} ${dragMarker?.id === item.id ? 'dragging' : ''}`} style={{ left: `${x * 100}%`, top: `${y * 100}%` }} onPointerDown={event => markerDown(event, item)} onClick={event => event.preventDefault()} title={movable ? `Drag ${item.name}'s pin tip to move it` : `Open ${item.name}`}><span className="atlas-marker-visual" style={{ transform: `translate(-50%, -100%) scale(${markerCounterScale})` }}><i/><span>{item.name}{item.status === 'destroyed' ? ' · Destroyed' : ''}</span></span></button>; })}
      {draftMarker?.atlas_x != null && <div className="atlas-draft-marker" style={{ left: `${draftMarker.atlas_x * 100}%`, top: `${draftMarker.atlas_y * 100}%` }}><span className="atlas-marker-visual" style={{ transform: `translate(-50%, -100%) scale(${markerCounterScale})` }}><i/><span>{draftMarker.name || 'New settlement'}</span></span></div>}
    </div>
    <div className="atlas-viewport-controls"><button type="button" onClick={() => panBy(0, 80)} aria-label="Pan north">↑</button><button type="button" onClick={() => zoomAt(view.zoom / 1.35)} aria-label="Zoom out">−</button><span>{Math.round(view.zoom * 100)}%</span><button type="button" onClick={() => zoomAt(view.zoom * 1.35)} aria-label="Zoom in">+</button><button type="button" onClick={() => panBy(0, -80)} aria-label="Pan south">↓</button><button type="button" onClick={() => setViewport({ zoom: 1, x: 0, y: 0 })}>Fit</button></div>
    <small className="atlas-navigation-hint">Wheel to zoom · drag empty map to pan · drag a pin by its tip{placementEnabled ? ' · click empty map to place a new marker' : ''}</small>
    {terrainHandoff > 0 && <div className="atlas-terrain-status">{view.zoom < 10 ? 'Atlas fading to terrain detail' : 'Terrain detail threshold reached'}</div>}
  </div>;
}
