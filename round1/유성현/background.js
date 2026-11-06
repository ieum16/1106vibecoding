const busy=new Set();
chrome.runtime.onInstalled.addListener(()=>{
 chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
 chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
});
export function extractPage(){
 let structured=[];
 function walk(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(walk);return;}if([v['@type']].flat().includes('JobPosting'))structured.push(v);if(v['@graph'])walk(v['@graph']);}
 document.querySelectorAll('script[type="application/ld+json"]').forEach(s=>{try{walk(JSON.parse(s.textContent));}catch{}});
 let text='';
 if(structured.length){text=structured.map(j=>{const el=document.createElement('div');el.innerHTML=j.description||'';return [j.title,j.hiringOrganization?.name,el.innerText||el.textContent,j.qualifications,j.skills,j.experienceRequirements].filter(x=>typeof x==='string').join('\n');}).join('\n\n');}
 if(text.trim().length<80){const element=document.querySelector('main, [role="main"], article')||document.body;const clone=element.cloneNode(true);clone.querySelectorAll('script,style,nav,header,footer,form,button,input,textarea,[hidden],[aria-hidden="true"]').forEach(e=>e.remove());text=clone.textContent;}
 return {title:document.title,url:location.href,text:text.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim().slice(0,60000),capturedAt:new Date().toISOString()};
}
async function capture(tabId){const [r]=await chrome.scripting.executeScript({target:{tabId},func:extractPage});if(!r?.result||r.result.text.length<30)throw Error('공고 본문을 읽지 못했습니다. 공고를 직접 붙여넣어 주세요.');await chrome.storage.local.set({job:r.result});return r.result;}
async function analyze(input){
 const state=await chrome.storage.local.get(['settings','profile']);
 if(!state.settings?.consent)throw Error('설정에서 AI 전송에 동의한 뒤 분석하세요.');
 const response=await fetch('http://127.0.0.1:4317/analyze',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${state.settings.token||''}`},body:JSON.stringify(input),signal:AbortSignal.timeout(120000)}).catch(e=>{throw Error(e.name==='TimeoutError'?'분석 시간이 초과됐습니다.':'분석 서버에 연결하지 못했습니다. 서버가 실행 중인지 확인하세요.');});
 const data=await response.json();if(!response.ok)throw Error(data.error||'분석 실패');return data;
}
chrome.action.onClicked.addListener(tab=>{if(tab.id)capture(tab.id).catch(e=>chrome.storage.local.set({captureError:e.message}));});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id)return;
 const task=message.type==='capture'?capture(message.tabId):message.type==='analyze'?analyze(message.input):null;
 if(!task)return;
 task.then(value=>respond({ok:true,value})).catch(e=>respond({ok:false,error:e.message}));return true;
});
chrome.tabs.onUpdated.addListener(async(tabId,change,tab)=>{
 if(change.status!=='complete'||!tab.url?.startsWith('https://')||busy.has(tabId))return;
 const origin=new URL(tab.url).origin;
 const state=await chrome.storage.local.get(['settings','profile','autoSeen']);
 if(!state.settings?.consent||!state.settings.autoOrigins?.includes(origin)||!state.profile?.resume||state.autoSeen?.[tabId]===tab.url)return;
 if(!await chrome.permissions.contains({origins:[`${origin}/*`]}))return;
 busy.add(tabId);
 try{
  const job=await capture(tabId);
  if(!/채용|모집|자격요건|담당업무|requirements|qualifications|job description/i.test(job.text))return;
  await chrome.action.setBadgeText({tabId,text:'…'});
  const data=await analyze({job:job.text,...state.profile});
  const latest=await chrome.storage.local.get(['history','autoSeen','settings']);
  if(!latest.settings?.consent||!latest.settings.autoOrigins?.includes(origin))return;
  const entry={id:crypto.randomUUID(),date:new Date().toISOString(),job,input:{job:job.text,...state.profile},...data,demo:false};
  await chrome.storage.local.set({latest:entry,history:[entry,...latest.history||[]].slice(0,10),autoSeen:{...latest.autoSeen,[tabId]:tab.url}});
  await chrome.action.setBadgeText({tabId,text:'완료'});
 }catch(e){await chrome.storage.local.set({captureError:e.message});await chrome.action.setBadgeText({tabId,text:'!'});}
 finally{busy.delete(tabId);}
});
