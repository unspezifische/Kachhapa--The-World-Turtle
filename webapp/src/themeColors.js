export function parseHex(value) {
  const hex=String(value).trim().replace(/^#/,'');
  if(!/^(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(hex))return null;
  const full=hex.length<5?hex.split('').map(c=>c+c).join(''):hex;
  return {r:parseInt(full.slice(0,2),16),g:parseInt(full.slice(2,4),16),b:parseInt(full.slice(4,6),16),a:full.length===8?parseInt(full.slice(6),16)/255:1};
}
export function rgbHex({r,g,b,a=1}) {
  const byte=v=>Math.max(0,Math.min(255,Math.round(v+1e-9))).toString(16).padStart(2,'0');
  return '#'+byte(r)+byte(g)+byte(b)+(a<1?byte(a*255):'');
}
export function rgbHsv({r,g,b}) {
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  let h=d===0?0:max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;
  return {h:(h*60+360)%360,s:max===0?0:d/max*100,v:max*100};
}
export function hsvRgb({h,s,v,a=1}) {
  s=Math.max(0,Math.min(100,s))/100;v=Math.max(0,Math.min(100,v))/100;
  const c=v*s,x=c*(1-Math.abs(((h%360+360)%360)/60%2-1)),m=v-c;
  const rgb=hsvSector((h%360+360)%360,c,x).map(n=>(n+m)*255);
  return {r:rgb[0],g:rgb[1],b:rgb[2],a};
}
function hsvSector(h,c,x){return h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];}
export function contrast(a,b) {
  const luminance=hex=>{const rgb=parseHex(hex);if(!rgb)return 0;return [rgb.r,rgb.g,rgb.b].map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);};
  const [x,y]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (x+.05)/(y+.05);
}
export function companion(palette,mode) {
  const target={...palette};
  for(const key of ['bg-app','bg-surface','bg-surface-2','bg-surface-3']) {
    const hsv=rgbHsv(parseHex(palette[key]));hsv.s=Math.min(hsv.s,mode==='light'?10:40);hsv.v=mode==='light'?({ 'bg-app':95,'bg-surface':100,'bg-surface-2':97,'bg-surface-3':91}[key]):({'bg-app':9,'bg-surface':14,'bg-surface-2':19,'bg-surface-3':25}[key]);target[key]=rgbHex(hsvRgb(hsv));
  }
  for(const key of ['text-main','text-muted','text-subtle','accent-2','focus','danger','warning','success','info']) {
    const hsv=rgbHsv(parseHex(palette[key]));hsv.v=mode==='light'?35:94;hsv.s=Math.min(hsv.s,mode==='light'?80:45);target[key]=rgbHex(hsvRgb(hsv));
  }
  target['disabled-bg']=target['bg-surface-2'];target['text-disabled']=target['text-subtle'];
  target['selected-bg']=target['bg-surface-3'];target['text-selected']=target['text-main'];
  for(const status of ['danger','warning','success','info']){target[status+'-bg']=target['bg-surface-2'];target[status+'-border']=target[status];}
  target['border-main']=mode==='light'?'#acb4c2':'#526079';target['border-strong']=mode==='light'?'#68778f':'#8d9bb3';
  return target;
}
export const ROLE_LABELS={'bg-app':'Page background','bg-surface':'Container background','bg-surface-2':'Nested container','bg-surface-3':'Raised / selected surface','text-main':'Main text','text-muted':'Secondary text','text-subtle':'Muted / disabled text','border-main':'Borders','border-strong':'Strong borders',accent:'Primary background','accent-hover':'Primary hover','accent-2':'Links / outlines','text-on-accent':'Primary text',secondary:'Secondary background','secondary-hover':'Secondary hover','text-on-secondary':'Secondary text','menu-bg':'Navigation background','menu-bg-hover':'Navigation hover','menu-bg-selected':'Navigation selected',danger:'Danger text','danger-bg':'Danger background',warning:'Warning text','warning-bg':'Warning background',success:'Success text','success-bg':'Success background',info:'Information text','info-bg':'Information background',focus:'Focus indicator',overlay:'Dialog overlay'};
