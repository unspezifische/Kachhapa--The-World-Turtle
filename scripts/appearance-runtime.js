(function () {
  'use strict';
  var defaults=window.KachhapaThemePresets, state=null, recovery=new URLSearchParams(location.search).get('theme')==='default', pendingMode=null, modeRequest=0;
  function read(key) {try{return localStorage.getItem(key);}catch(_){return null;}}
  function write(key,value) {try{localStorage.setItem(key,value);}catch(_){}}
  function scope() {
    if (/^mtg\./i.test(location.hostname)||/^\/mtg(?:\/|$)/.test(location.pathname))return 'mtg';
    if (/^\/wiki\//.test(location.pathname))return 'wiki';
    if (/^\/(settlementManager|maps\/player|worldAtlas)(?:\/|$)/.test(location.pathname))return 'settlement';
    return 'kachhapa';
  }
  function snapshot(){return state||defaults;}
  function mode(){return recovery?'dark':pendingMode||(state&&state.mode)||read('theme')||'dark';}
  function colors(target){var data=snapshot(),id=data.assignments[target||scope()],theme=data.themes.find(function(t){return t.id===id;})||defaults.themes[0];return recovery?defaults.themes[0].palettes.dark:theme.palettes[mode()==='light'?'light':'dark'];}
  function apply(){
    var root=document.documentElement,c=colors(),m=mode()==='light'?'light':'dark';
    root.dataset.theme=m;root.dataset.appearanceScope=scope();root.style.colorScheme=m;
    Object.keys(c).forEach(function(key){root.style.setProperty('--'+key,c[key]);});
    var pairs={primary:'accent',secondary:'secondary','link-color':'accent-2','link-hover-color':'accent-2','body-bg':'bg-app','body-color':'text-main','emphasis-color':'text-main','secondary-bg':'bg-surface-2','tertiary-bg':'bg-surface-3'};
    Object.keys(pairs).forEach(function(key){var hex=c[pairs[key]].slice(1,7);root.style.setProperty('--bs-'+key+'-rgb',hex.match(/../g).map(function(v){return parseInt(v,16);}).join(','));});
    var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=c['bg-app'];
    window.dispatchEvent(new CustomEvent('appearance-changed',{detail:{mode:m,scope:scope()}}));
  }
  function accept(data){
    if(!data||data.version!==1||!Array.isArray(data.themes))return;
    if(state&&data.user_id===state.user_id&&data.revision<state.revision)return;
    state=data;
    if(data.user_id){write('appearance-owner',String(data.user_id));write('appearance:'+data.user_id,JSON.stringify(data));}
    write('theme',mode());apply();
  }
  function headers(){var token=read('token');var result={'X-Appearance-Mode':mode()};if(token)result.Authorization='Bearer '+token;return result;}
  function refresh(){return fetch('/api/appearance',{credentials:'same-origin',headers:headers(),cache:'no-store'}).then(function(r){if(!r.ok){if(r.status===401)clear();throw new Error('Appearance could not be loaded.');}return r.json();}).then(function(data){if(!state||data.user_id!==state.user_id||data.revision>=state.revision)accept(data);return data;});}
  function clear(){var owner=read('appearance-owner');try{if(owner)localStorage.removeItem('appearance:'+owner);localStorage.removeItem('appearance-owner');}catch(_){}state=null;pendingMode=null;apply();}
  function setMode(value){
    var requestId=++modeRequest, selected=value==='light'?'light':'dark';pendingMode=selected;write('theme',selected);apply();
    return fetch('/api/appearance',{method:'PATCH',credentials:'same-origin',headers:Object.assign({'Content-Type':'application/json'},headers()),body:JSON.stringify({mode:selected})}).then(function(r){if(!r.ok)throw new Error('Mode was changed locally; account sync is unavailable.');return r.json();}).then(function(data){if(requestId===modeRequest)pendingMode=null;accept(data);});
  }
  var owner=read('userID')||read('appearance-owner');
  if(owner){try {var cached=JSON.parse(read('appearance:'+owner));if(cached&&String(cached.user_id)===String(owner))state=cached;}catch(_) {}}
  window.KachhapaAppearance={snapshot:snapshot,colors:colors,scope:scope,mode:mode,apply:apply,accept:accept,refresh:refresh,setMode:setMode,clear:clear,recovery:recovery};
  apply();
  window.addEventListener('storage',function(e){if(e.key==='appearance-owner'||e.key==='theme'||(e.key||'').indexOf('appearance:')===0)refresh().catch(function(){});});
  window.addEventListener('focus',function(){refresh().catch(function(){});});
  window.addEventListener('popstate',apply);
  // Sibling named hosts have separate storage; visible tabs also refresh the account palette.
  window.setInterval(function(){if(document.visibilityState!=='hidden')refresh().catch(function(){});},30000);
  document.addEventListener('DOMContentLoaded',function(){refresh().catch(function(){});});
})();
