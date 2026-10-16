const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const presets=require('../Flask/theme_presets.json'),source=fs.readFileSync(__dirname+'/appearance-runtime.js','utf8');
function setup(path='/profile',search='',cache={},network){
 const storage=new Map(Object.entries(cache)),listeners={},vars={},root={dataset:{},style:{setProperty(k,v){vars[k]=v;}}};let requests=[];
 const window={KachhapaThemePresets:structuredClone(presets),addEventListener(k,fn){listeners[k]=fn;},dispatchEvent(){},setInterval(){}};
 const document={documentElement:root,visibilityState:'visible',querySelector(){return null;},addEventListener(k,fn){listeners[k]=fn;}};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const location={pathname:path,hostname:'100.72.241.53',search};const fetch=async(url,options)=>{requests.push({url,options});if(network)return network(url,options);return {ok:true,json:async()=>({...structuredClone(presets),user_id:1,username:'one',revision:2})};};
 vm.runInNewContext(source,{window,document,localStorage,location,URLSearchParams,CustomEvent:function(){},fetch});
 return {api:window.KachhapaAppearance,vars,root,listeners,requests,location,storage};
}
test('early scope, paired palette and safe recovery use literal colors',()=>{
 const t=setup('/settlementManager');assert.equal(t.vars['--bg-app'],presets.themes[1].palettes.dark['bg-app']);
 t.location.pathname='/mtg/';t.api.apply();assert.equal(t.root.dataset.appearanceScope,'mtg');assert.equal(t.vars['--bg-app'],presets.themes[0].palettes.dark['bg-app']);
 const recovery=setup('/profile','?theme=default');recovery.api.accept({...presets,mode:'light',assignments:{...presets.assignments,kachhapa:'settlement'}});assert.equal(recovery.vars['--bg-app'],presets.themes[0].palettes.dark['bg-app']);
});
test('cached account assignments apply before fetching, changes preserve mounted content',async()=>{
 const data={...structuredClone(presets),user_id:1,revision:1,mode:'light',assignments:{...presets.assignments,kachhapa:'settlement'}};
 const t=setup('/profile','',{'userID':'1','appearance:1':JSON.stringify(data)});assert.equal(t.vars['--bg-app'],presets.themes[1].palettes.light['bg-app']);
 const identity=t.root;await t.api.refresh();assert.equal(t.root,identity);assert.equal(t.root.dataset.theme,'dark');assert.equal(t.storage.get('appearance-owner'),'1');
 t.listeners.storage({key:'appearance:1'});await Promise.resolve();assert.ok(t.requests.length>=2);assert.equal(t.requests[0].options.credentials,'same-origin');
});
test('mode selects paired colors immediately; other user cache is not loaded',async()=>{
 const t=setup('/wiki/1', '',{'userID':'2','appearance:1':JSON.stringify({...presets,user_id:1})});assert.equal(t.api.snapshot().user_id,undefined);const request=t.api.setMode('light');assert.equal(t.root.dataset.theme,'light');assert.equal(t.vars['--bg-app'],presets.themes[0].palettes.light['bg-app']);await request;
 assert.equal(t.requests[0].url,'/api/appearance');assert.equal(t.requests[0].options.method,'PATCH');
});

test('a stale refresh cannot undo a pending explicit mode change',async()=>{
 let finish;const dark={...structuredClone(presets),user_id:1,revision:1,mode:'dark'};
 const t=setup('/profile','',{},async(url,options)=>options.method==='PATCH'?new Promise(resolve=>{finish=resolve;}):{ok:true,json:async()=>dark});
 t.api.accept(dark);const change=t.api.setMode('light');await t.api.refresh();assert.equal(t.api.mode(),'light');assert.equal(t.root.dataset.theme,'light');
 finish({ok:true,json:async()=>({...dark,revision:2,mode:'light'})});await change;assert.equal(t.api.mode(),'light');await t.api.refresh();assert.equal(t.api.mode(),'light');assert.equal(t.requests.filter(r=>r.options.method==='PATCH').length,1);
});
