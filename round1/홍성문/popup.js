const $ = id => document.getElementById(id);
const {localDate,groupOf,normalize,mergeEvents} = Schedule;
let todos=[];
let settings={theme:'forest',autoSync:false,connected:false};
let busy=false;
const status=message=>{$('status').textContent=message;};
const configured=()=>Boolean(chrome.runtime.getManifest().oauth2?.client_id?.endsWith('.apps.googleusercontent.com'));
async function saveTodos(next){await chrome.storage.local.set({todos:next});todos=next;render();}
async function saveSettings(next){await chrome.storage.local.set({settings:next});settings=next;applySettings();}
function applySettings(){
  document.documentElement.dataset.theme=settings.theme;
  $('theme').value=settings.theme;
  $('auto-sync').checked=settings.autoSync;
  $('auto-sync').disabled=!settings.connected || busy;
  $('google-connect').disabled=busy || !configured();
  $('google-disconnect').disabled=busy || !settings.connected;
  $('google-config').textContent=configured()?(settings.connected?'연결됨 · 오늘 일정을 가져올 수 있어요.':'Google 로그인 후 읽기 권한을 허용해 주세요.'):'연동 준비 필요: GOOGLE_SETUP.md 안내에 따라 Google 앱 식별자를 등록해 주세요.';
}
function run(action){return async(...args)=>{
  if(busy)return;
  busy=true;
  $('google-connect').disabled=true;
  $('google-disconnect').disabled=true;
  try{await action(...args);}catch(error){status(error.message || '저장하지 못했습니다. 다시 시도해 주세요.');render();}
  finally{busy=false;applySettings();}
};}
function render(){
  const visible=todos.filter(t=>t.date===$('view-date').value && !t.dismissed);
  $('remaining').textContent=`남은 할 일 ${visible.filter(t=>!t.completed).length}개 / 전체 ${visible.length}개`;
  $('empty-message').hidden=visible.length>0;
  $('todo-groups').replaceChildren();
  for(const [group,title] of [['morning','오전'],['afternoon','오후'],['unscheduled','시간 미정 · 종일']]){
    const items=visible.filter(t=>groupOf(t)===group).sort((a,b)=>a.time.localeCompare(b.time));
    if(!items.length)continue;
    const section=document.createElement('section');section.className='group';
    const heading=document.createElement('div');heading.className='group-heading';
    const label=document.createElement('h3');label.textContent=`${title} · ${items.length}`;
    const bulk=document.createElement('button');bulk.type='button';
    const allDone=items.every(t=>t.completed);
    bulk.textContent=allDone?`${title} 완료 해제`:`${title} 모두 완료`;
    bulk.addEventListener('click',run(async()=>{const ids=new Set(items.map(t=>t.id));await saveTodos(todos.map(t=>ids.has(t.id)?{...t,completed:!allDone}:t));}));
    heading.append(label,bulk);
    const list=document.createElement('ul');list.className='todo-list';list.setAttribute('aria-label',`${title} 일정`);
    for(const todo of items){
      const item=document.createElement('li');item.className=`todo-item${todo.completed?' completed':''}`;
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=todo.completed;checkbox.setAttribute('aria-label',`${todo.text} 완료`);
      checkbox.addEventListener('change',run(async()=>{await saveTodos(todos.map(t=>t.id===todo.id?{...t,completed:checkbox.checked}:t));}));
      const content=document.createElement('div');content.className='todo-content';
      const text=document.createElement('span');text.className='todo-text';text.textContent=todo.text;
      const time=document.createElement('input');time.type='time';time.className='time-edit';time.value=todo.time;time.setAttribute('aria-label',`${todo.text} 시간`);
      time.addEventListener('change',run(async()=>{await saveTodos(todos.map(t=>t.id===todo.id?{...t,time:time.value}:t));}));
      content.append(text,time);
      if(todo.source==='google'){const source=document.createElement('span');source.className='source';source.textContent='Google 캘린더 · 갱신 시 원래 시간 적용';content.append(source);}
      const remove=document.createElement('button');remove.type='button';remove.className='delete-button';remove.textContent='×';remove.setAttribute('aria-label',`${todo.text} 삭제`);
      remove.addEventListener('click',run(async()=>{await saveTodos(todo.source==='google'?todos.map(t=>t.id===todo.id?{...t,dismissed:true}:t):todos.filter(t=>t.id!==todo.id));}));
      item.append(checkbox,content,remove);list.append(item);
    }
    section.append(heading,list);$('todo-groups').append(section);
  }
}
async function syncGoogle(interactive){
  if(!configured())throw new Error('Google 앱 식별자를 먼저 등록해 주세요. GOOGLE_SETUP.md를 참고하세요.');
  status('Google의 오늘 일정을 가져오는 중…');
  const result=await chrome.identity.getAuthToken({interactive});
  const token=typeof result==='string'?result:result.token;
  if(!token)throw new Error('설정에서 Google에 다시 연결해 주세요.');
  const start=new Date();start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  const events=[];let pageToken='';
  do{
    const url=new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    const params={timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'2500'};
    if(pageToken)params.pageToken=pageToken;
    url.search=new URLSearchParams(params).toString();
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
    if(response.status===401){await chrome.identity.removeCachedAuthToken({token});throw new Error('Google 인증이 만료되었습니다. 다시 연결해 주세요.');}
    if(!response.ok)throw new Error(`일정을 가져오지 못했습니다 (${response.status}). Calendar API와 계정 권한을 확인해 주세요.`);
    const data=await response.json();events.push(...(data.items || []));pageToken=data.nextPageToken || '';
  }while(pageToken);
  await saveTodos(mergeEvents(todos,events,localDate(start)));
  await saveSettings({...settings,connected:true,...(interactive?{autoSync:true}:{})});
  status(`오늘 Google 일정 ${events.filter(e=>e.status!=='cancelled').length}개를 갱신했습니다. 중복 일정은 만들지 않습니다.`);
}
async function init(){
  $('view-date').value=localDate();
  const stored=await chrome.storage.local.get(['todos','settings']);
  todos=normalize(stored.todos,localDate());settings={...settings,...stored.settings};
  if(!['forest','ocean','lavender','sunset','night'].includes(settings.theme))settings.theme='forest';
  await chrome.storage.local.set({todos});
  applySettings();render();
  $('settings-toggle').addEventListener('click',()=>{$('settings').hidden=!$('settings').hidden;$('settings-toggle').setAttribute('aria-expanded',String(!$('settings').hidden));});
  $('theme').addEventListener('change',run(async()=>{await saveSettings({...settings,theme:$('theme').value});}));
  $('auto-sync').addEventListener('change',run(async()=>{await saveSettings({...settings,autoSync:$('auto-sync').checked});}));
  $('view-date').addEventListener('change',()=>{if(!$('view-date').value)$('view-date').value=localDate();render();});
  $('today-button').addEventListener('click',()=>{$('view-date').value=localDate();render();});
  $('todo-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const text=$('todo-input').value.trim();if(!text){status('일정 내용을 입력해 주세요.');return;}
    await saveTodos([{id:crypto.randomUUID(),text,date:$('view-date').value || localDate(),time:$('todo-time').value,completed:false},...todos]);
    $('todo-input').value='';$('todo-time').value='';$('todo-input').focus();status('일정을 추가했습니다.');
  })();});
  if(location.hash==='#google'){
    $('settings').hidden=false;
    $('settings-toggle').setAttribute('aria-expanded','true');
  }
  $('google-connect').addEventListener('click',run(async()=>{
    // An action popup can close when Google opens a login window. Keep login in a tab.
    if(location.hash!=='#google'){
      await chrome.tabs.create({url:chrome.runtime.getURL('popup.html#google')});
      status('열린 탭에서 Google 연결 및 가져오기를 눌러 주세요.');
      return;
    }
    await syncGoogle(true);
  }));
  $('google-disconnect').addEventListener('click',run(async()=>{
    await saveSettings({...settings,connected:false,autoSync:false});await chrome.identity.clearAllCachedAuthTokens();
    status('이 확장 프로그램의 연결을 해제했습니다. Google 계정의 앱 권한은 계정 보안 설정에서 철회할 수 있습니다.');
  }));
  if(settings.connected && settings.autoSync && configured())await run(async()=>{await syncGoogle(false);})();
}
init().catch(()=>status('저장된 정보를 불러오지 못했습니다. 창을 다시 열어 주세요.'));
