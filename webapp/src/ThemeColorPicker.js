import React, { useState, useRef } from 'react';
import { parseHex, rgbHex, rgbHsv, hsvRgb } from './themeColors';

export default function ThemeColorPicker({value,onChange,label}) {
  const rgb=parseHex(value)||{r:0,g:0,b:0,a:1};
  const memory=useRef({value,hsv:rgbHsv(rgb)});
  if(memory.current.value!==value){const next=rgbHsv(rgb);memory.current={value,hsv:{...next,h:next.s&&next.v?next.h:memory.current.hsv.h,s:next.v?next.s:memory.current.hsv.s}};}
  const hsv=memory.current.hsv;
  const [raw,setRaw]=useState(null),[,redraw]=useState(0);
  const emitRgb=next=>{setRaw(null);onChange(rgbHex(next));};
  const emitHsv=next=>{const updated={...hsv,...next};const hex=rgbHex(hsvRgb({...updated,a:rgb.a}));memory.current={value:hex,hsv:updated};redraw(n=>n+1);setRaw(null);onChange(hex);};
  const pick=event=>{const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;emitHsv({h:(Math.atan2(y,x)*180/Math.PI+450)%360});};
  return <fieldset className="theme-picker"><legend>{label}</legend>
    <div className="theme-wheel" role="slider" tabIndex={0} aria-label="Hue wheel" aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(hsv.h)} style={{'--hue':hsv.h}} onPointerDown={event=>{event.currentTarget.setPointerCapture?.(event.pointerId);pick(event);}} onPointerMove={event=>{if(event.buttons===1)pick(event);}} onKeyDown={event=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();emitHsv({h:event.key==='Home'?0:event.key==='End'?359:(hsv.h+(['ArrowLeft','ArrowDown'].includes(event.key)?-1:1)*(event.shiftKey?10:1)+360)%360});}}}><span style={{background:value,transform:`rotate(${hsv.h}deg) translateY(-73px) rotate(${-hsv.h}deg)`}} /></div>
    <label>HEX<input aria-label="HEX color" value={raw ?? value} onChange={e=>{const v=e.target.value;setRaw(v);if(parseHex(v))onChange(rgbHex(parseHex(v)));}} onBlur={()=>setRaw(null)} spellCheck={false} /></label>
    <div className="theme-code-grid">{['r','g','b'].map(key=><label key={key}>{key.toUpperCase()}<input aria-label={`${key.toUpperCase()} channel`} type="number" min={0} max={255} value={Math.round(rgb[key])} onChange={e=>{if(e.target.value!==''&&Number(e.target.value)>=0&&Number(e.target.value)<=255)emitRgb({...rgb,[key]:Number(e.target.value)});}} /></label>)}</div>
    <div className="theme-code-grid">{[['h','Hue',359],['s','Saturation',100],['v','Value',100]].map(([key,name,max])=><label key={key}>{name}<input aria-label={`HSV ${name}`} type="number" min={0} max={max} value={Math.round(hsv[key])} onChange={e=>{if(e.target.value!==''&&Number(e.target.value)>=0&&Number(e.target.value)<=max)emitHsv({[key]:Number(e.target.value)});}} /></label>)}</div>
    {['s','v'].map(key=><label key={key}>{key==='s'?'Saturation':'Value'}<input type="range" aria-label={`${key==='s'?'Saturation':'Value'} slider`} min={0} max={100} value={hsv[key]} onChange={e=>emitHsv({[key]:Number(e.target.value)})} /></label>)}
    <label>Opacity<input type="range" aria-label="Opacity" min={0} max={100} value={Math.round(rgb.a*100)} onChange={e=>emitRgb({...rgb,a:Number(e.target.value)/100})} /></label>
    <p>Colors are yours to choose. Contrast suggestions never prevent saving.</p>
  </fieldset>;
}
