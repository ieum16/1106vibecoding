const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const S=require('./schedule.js');
for(const [time,group] of [['00:00','morning'],['11:59','morning'],['12:00','afternoon'],['23:59','afternoon'],['','unscheduled'],['25:00','unscheduled']])assert.equal(S.groupOf({time}),group);
assert.equal(S.localDate(new Date(2026,10,6,0,1)),'2026-11-06');
assert.equal(S.normalize([{id:'old',text:'기존 일정',completed:true}], '2026-11-06')[0].date,'2026-11-06');
const event={id:'event',summary:'회의',start:{dateTime:new Date(2026,10,6,13,30).toISOString()}};
let merged=S.mergeEvents([{id:'local',text:'로컬',date:'2026-11-06'}],[event],'2026-11-06');
merged[1].completed=true;
merged=S.mergeEvents(merged,[{...event,summary:'변경 회의'}],'2026-11-06');
assert.equal(merged.length,2);assert.equal(merged[1].completed,true);assert.equal(merged[1].text,'변경 회의');
merged[1].dismissed=true;assert.equal(S.mergeEvents(merged,[event],'2026-11-06')[1].dismissed,true);
assert.equal(S.mergeEvents(merged,[],'2026-11-06').length,1);
assert.equal(S.mergeEvents([], [{id:'all-day',start:{date:'2026-11-06'}}], '2026-11-06')[0].time,'');
class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.value='';this.hidden=false;this.dataset={};}
  append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=nodes;}
  setAttribute(k,v){this[k]=v;}addEventListener(k,v){this.listeners[k]=v;}focus(){}
  async fire(type){await this.listeners[type]?.({preventDefault(){}});await new Promise(r=>setImmediate(r));}
}
const ids=[...fs.readFileSync('popup.html','utf8').matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));elements.settings.hidden=true;
const stored={todos:[{id:'legacy',text:'기존 할 일',completed:false}]};
const doc={getElementById:id=>elements[id],createElement:tag=>new Element(tag),documentElement:new Element()};
let manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
let requests=0;
const context=vm.createContext({Schedule:S,document:doc,location:{hash:'#google'},crypto:webcrypto,Date,URL,URLSearchParams,AbortSignal,console,
 chrome:{runtime:{getManifest:()=>manifest},storage:{local:{get:async()=>structuredClone(stored),set:async data=>Object.assign(stored,structuredClone(data))}},identity:{getAuthToken:async()=>({token:'test-token'}),clearAllCachedAuthTokens:async()=>{},removeCachedAuthToken:async()=>{}}},
 fetch:async()=>{requests++;return {ok:true,json:async()=>({items:[{id:'remote',summary:'가져온 일정',start:{date:S.localDate()}}]})};}});
vm.runInContext(fs.readFileSync('popup.js','utf8'),context);
const tick=()=>new Promise(r=>setImmediate(r));
const descendants=e=>e.children.flatMap(c=>[c,...descendants(c)]);
async function add(text,time){elements['todo-input'].value=text;elements['todo-time'].value=time;await elements['todo-form'].fire('submit');}
(async()=>{
 await tick();assert.equal(stored.todos[0].date,S.localDate());assert.equal(elements['google-connect'].disabled,true);
 await add('오전 회의','09:00');await add('오후 운동','18:00');
 let buttons=descendants(elements['todo-groups']).filter(e=>e.tagName==='button');
 await buttons.find(e=>e.textContent==='오전 모두 완료').fire('click');
 assert.equal(stored.todos.find(t=>t.text==='오전 회의').completed,true);assert.equal(stored.todos.find(t=>t.text==='오후 운동').completed,false);
 buttons=descendants(elements['todo-groups']).filter(e=>e.tagName==='button');await buttons.find(e=>e.textContent==='오전 완료 해제').fire('click');
 assert.equal(stored.todos.find(t=>t.text==='오전 회의').completed,false);
 elements['view-date'].value='2099-01-01';await elements['view-date'].fire('change');await add('미래 일정','10:00');
 buttons=descendants(elements['todo-groups']).filter(e=>e.tagName==='button');await buttons.find(e=>e.textContent==='오전 모두 완료').fire('click');assert.equal(stored.todos.find(t=>t.text==='오전 회의').completed,false);
 for(const theme of ['forest','ocean','lavender','sunset','night']){elements.theme.value=theme;await elements.theme.fire('change');assert.equal(stored.settings.theme,theme);assert.equal(doc.documentElement.dataset.theme,theme);}
 assert.equal(elements.settings.hidden,false);
 await elements['settings-toggle'].fire('click');assert.equal(elements.settings.hidden,true);
 await elements['settings-toggle'].fire('click');assert.equal(elements.settings.hidden,false);
 manifest={...manifest,oauth2:{client_id:'test.apps.googleusercontent.com'}};
 await elements['google-connect'].fire('click');assert.equal(requests,1);assert.equal(stored.settings.autoSync,true);assert.equal(stored.todos.filter(t=>t.source==='google').length,1);
 await elements['google-connect'].fire('click');assert.equal(stored.todos.filter(t=>t.source==='google').length,1);
 await elements['google-disconnect'].fire('click');assert.equal(stored.settings.connected,false);assert.equal(stored.settings.autoSync,false);
 assert.equal(stored.todos.find(t=>t.id==='legacy').text,'기존 할 일');
 console.log('PASS: boundaries, legacy migration, date isolation, bulk completion/undo, 5 themes, settings, mocked Google import/dedup/disconnect');
})().catch(error=>{console.error(error);process.exitCode=1;});
