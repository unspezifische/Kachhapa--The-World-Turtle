import React, { useId, useRef } from 'react';
import { Button, Form } from 'react-bootstrap';

const clamp = value => Math.max(0, Math.min(1, value));

export default function NpcImageFramer({ crop, onChange, renderImage, label = 'Image framing preview' }) {
  const borderControlId = useId();
  const drag = useRef(null);
  const patch = values => onChange({...crop, ...values});
  const begin = event => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {x:event.clientX,y:event.clientY,crop:{...crop}};
  };
  const move = event => {
    if (!drag.current) return;
    const size = event.currentTarget.clientWidth || 220;
    patch({
      x:clamp(drag.current.crop.x - (event.clientX - drag.current.x) / size),
      y:clamp(drag.current.crop.y - (event.clientY - drag.current.y) / size),
    });
  };
  const end = event => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
  };
  const imageStyle = {
    width:'100%', height:'100%', objectFit:'cover', pointerEvents:'none', userSelect:'none',
    objectPosition:`${crop.x * 100}% ${crop.y * 100}%`,
    transform:`scale(${crop.zoom})`, transformOrigin:`${crop.x * 100}% ${crop.y * 100}%`,
  };
  return <div className="npc-image-framer">
    <div className={`npc-framer-stage ${crop.shape === 'circle' ? 'is-circle' : 'is-square'}`} role="application" aria-label={label}
      onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {renderImage(imageStyle)}
      {crop.border && <span className="npc-framer-border" style={{boxShadow:`inset 0 0 0 6px ${crop.border}`}} aria-hidden="true" />}
      <span className="npc-framer-hint">Drag image to position</span>
    </div>
    <div className="npc-framer-controls">
      <div role="group" aria-label="Image zoom"><Button size="sm" variant="outline-secondary" aria-label="Zoom out" disabled={crop.zoom <= 1} onClick={() => patch({zoom:Math.max(1, Number((crop.zoom - .25).toFixed(2)))})}>−</Button><output aria-label="Current zoom">{crop.zoom.toFixed(2)}×</output><Button size="sm" variant="outline-secondary" aria-label="Zoom in" disabled={crop.zoom >= 8} onClick={() => patch({zoom:Math.min(8, Number((crop.zoom + .25).toFixed(2)))})}>+</Button></div>
      <Button size="sm" variant="link" onClick={() => patch({x:.5,y:.5,zoom:1})}>Reset framing</Button>
      <Form.Select aria-label="Token shape" value={crop.shape} onChange={event => patch({shape:event.target.value})}><option value="circle">Circle frame</option><option value="square">Square frame</option></Form.Select>
      <Form.Check id={borderControlId} label="Decorative border" checked={Boolean(crop.border)} onChange={event => patch({border:event.target.checked ? '#ffffff' : ''})} />
      {crop.border && <Form.Control type="color" aria-label="Border color" value={crop.border} onChange={event => patch({border:event.target.value})} />}
    </div>
  </div>;
}
