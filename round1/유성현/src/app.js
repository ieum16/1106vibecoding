import {scoreResult,validateInput} from './contracts.js';
import {demoInput,demoResult} from './demo.js';
const $=id=>document.getElementById(id);
const extension=!!globalThis.chrome?.storage?.local;
const storage=extension?chrome.storage.local:{async get(keys){const s=JSON.parse(localStorage.getItem('career-note')||'{}');return Object.fromEntries(keys.map(k=>[k,s[k]]));},async set(patch){localStorage.setItem('career-note',JSON.stringify({...JSON.parse(localStorage.getItem('career-note')||'{}'),...patch}));},async clear(){localStorage.removeItem('career-note');}};
let state=await storage.get(['profile','settings','job','history','latest']);let current=null;let inProgress=false;
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
const names={analysis:['공고 분석','내 경험으로 답할 수 있는 공고인지 확인하세요.'],profile:['이력서와 문체','경험의 사실은 유지하고, 공고에 맞게 강조합니다.'],history:['분석 기록','공고별 판단과 수정본을 다시 확인하세요.'],settings:['연결 설정','자료가 어디에 저장되고 전송되는지 관리하세요.']};
function view(id){document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==id);document.querySelectorAll('[data-view]').forEach(e=>{if(e.dataset.view===id)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});$('view-title').textContent=names[id][0];$('subtitle').textContent=names[id][1];window.history.replaceState(null,'','#'+id);}
function hydrate(){
 $('resume').value=state.profile?.resume||'';$('style').value=state.profile?.style||'';$('question').value=state.profile?.question||'';$('limit').value=state.profile?.limit||1000;
 $('profile-summary').textContent=state.profile?.resume?`등록된 이력서 ${state.profile.resume.length.toLocaleString()}자 · 문체 참고 ${state.profile.style?.length||0}자`:'이력서를 먼저 등록하세요.';
 $('token').value=state.settings?.token||'';$('consent').checked=!!state.settings?.consent;
 if(state.job){$('job').value=state.job.text;$('job-source').textContent=`${state.job.title} · ${state.job.url}`;}
 renderHistory();renderOrigins();
}
async function save(patch){await storage.set(patch);Object.assign(state,patch);}
async function message(m){const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'확장프로그램 응답이 없습니다.');return r.value;}
function item(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
function list(id,rows){$(id).replaceChildren(...(rows.length?rows:['추가 항목이 없습니다.']).map(x=>item('li',x)));}
function render(entry){
 current=entry;$('result').hidden=false;$('empty').hidden=true;$('demo-label').hidden=!entry.demo;
 const r=entry.result;$('score').textContent=scoreResult(r)??'—';$('recommendation').textContent=r.recommendation;$('confidence').textContent=r.confidence;$('summary').textContent=r.summary;
 $('result-date').textContent=`${entry.demo?'체험 예시':'AI 분석'} · ${new Date(entry.date).toLocaleString('ko-KR')}`;
 $('requirements').replaceChildren(...r.requirements.map(row=>{const el=item('article','');const head=item('div','','section-head');head.append(item('h3',row.requirement),item('span',`${row.kind} · ${row.status}`,'status'));el.append(head,item('p',`공고: ${row.jobEvidence||'근거 없음'}`),item('p',`이력서: ${row.resumeEvidence||'문서에서 확인하지 못했습니다.'}`),item('p',row.advice,'meta'));return el;}));
 list('priorities',r.priorities);list('questions',r.questions);list('warnings',r.warnings);
 $('resume-draft').value=entry.editedResume??r.resumeDraft;$('cover-draft').value=entry.editedCover??r.coverLetterDraft;
 $('original').textContent=entry.input.resume;
 $('changes').replaceChildren(...r.changes.map(c=>{const el=item('article','');el.append(item('p',`원문: ${c.before}`),item('p',`수정: ${c.after}`),item('p',c.reason,'meta'));return el;}));count();
}
function count(){const n=$('cover-draft').value.length;const max=current?.input.limit||Number($('limit').value);$('char-count').textContent=`공백 포함 ${n.toLocaleString()} / ${max.toLocaleString()}자${n>max?' · 초과':''}`;}
function renderHistory(){const rows=state.history||[];$('history-list').replaceChildren(...(rows.length?rows.map(e=>{const button=item('button',`${e.demo?'[체험] ':''}${e.job.title||'직접 입력한 공고'} · ${new Date(e.date).toLocaleDateString('ko-KR')}`,'history-row');button.onclick=()=>{if(!confirmDraftSwitch())return;state.job=e.job;$('job').value=e.input.job;$('job-source').textContent=e.job.title||'직접 입력한 공고';render(e);view('analysis');};return button;}):[item('p','아직 분석한 공고가 없습니다.')]));}
function renderOrigins(){const origins=state.settings?.autoOrigins||[];$('auto-list').replaceChildren(...(origins.length?origins.map(origin=>{const row=item('div','','section-head');row.append(item('span',origin));const b=item('button','끄기');b.onclick=async()=>{await chrome.permissions.remove({origins:[`${origin}/*`]});await save({settings:{...state.settings,autoOrigins:origins.filter(x=>x!==origin)}});renderOrigins();};row.append(b);return row;}):[item('p','자동 분석을 켠 사이트가 없습니다.','meta')]));}
function confirmDraftSwitch(){return !current||($('resume-draft').value===(current.editedResume??current.result.resumeDraft)&&$('cover-draft').value===(current.editedCover??current.result.coverLetterDraft))||confirm('저장하지 않은 수정본이 있습니다. 다른 결과를 열까요?');}
async function run(){
 if(inProgress)return;
 if(!state.profile?.resume){view('profile');notice('이력서를 등록하고 저장하세요.');return;}
 if(!state.settings?.consent){view('settings');notice('AI 전송 범위를 확인하고 설정을 저장하세요.');return;}
 if(!extension){notice('실제 분석은 Chrome에 설치한 확장프로그램에서 실행하세요.');return;}
 if(!confirmDraftSwitch())return;
 const input={...state.profile,job:$('job').value,question:$('question').value,limit:Number($('limit').value)};
 try{
  validateInput(input);inProgress=true;$('analyze').disabled=true;$('analyze').textContent='근거 비교·수정본 작성 중…';notice('분석 중입니다. 패널을 열어두세요. 최대 약 2분이 걸릴 수 있습니다.');
  const data=await message({type:'analyze',input});const job={text:input.job,title:state.job?.text===input.job?state.job.title:'직접 입력한 공고',url:state.job?.text===input.job?state.job.url:'',capturedAt:new Date().toISOString()};
  const entry={id:crypto.randomUUID(),date:new Date().toISOString(),job,input,...data,demo:false};
  await save({job,latest:entry,history:[entry,...state.history||[]].slice(0,10)});render(entry);renderHistory();notice('분석을 완료했습니다. 근거와 확인 필요 항목을 검토하세요.');
 }catch(e){notice(e.message);}finally{inProgress=false;$('analyze').disabled=false;$('analyze').textContent='공고와 이력서 분석';}
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
$('edit-profile').onclick=()=>view('profile');$('analyze').onclick=run;
$('save-profile').onclick=async()=>{const resume=$('resume').value.trim();if(resume.length<30){notice('이력서를 30자 이상 입력하세요.');return;}await save({profile:{resume,style:$('style').value,question:$('question').value,limit:Number($('limit').value)}});hydrate();notice('이력서와 문체를 저장했습니다.');view('analysis');};
$('save-settings').onclick=async()=>{await save({settings:{...state.settings,token:$('token').value.trim(),consent:$('consent').checked}});notice('연결 설정을 저장했습니다.');};
$('health').onclick=async()=>{try{const r=await fetch('http://127.0.0.1:4317/health',{headers:{Authorization:`Bearer ${$('token').value.trim()}`},signal:AbortSignal.timeout(5000)});const d=await r.json();if(!r.ok)throw Error(d.error);notice(d.ready?`연결 완료 · 모델 ${d.model}`:'서버 연결 완료. .env의 API 키와 모델을 설정하세요.');}catch(e){notice(`연결 확인 실패: ${e.message}`);}};
$('capture').onclick=async()=>{if(!extension){notice('현재 탭 읽기는 Chrome에 확장프로그램을 설치한 뒤 사용할 수 있습니다.');return;}try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const job=await message({type:'capture',tabId:tab.id});await save({job});$('job').value=job.text;$('job-source').textContent=`${job.title} · ${job.url}`;notice('본문을 읽었습니다. 채용 조건이 빠지지 않았는지 확인하세요.');}catch(e){notice(e.message);}};
$('wide').onclick=()=>extension?chrome.tabs.create({url:chrome.runtime.getURL('index.html')}):notice('현재 화면은 브라우저 미리보기입니다.');
$('auto-site').onclick=async()=>{
 if(!extension){notice('자동 분석은 Chrome 확장프로그램에서 설정하세요.');return;}
 if(!state.settings?.consent||!state.profile?.resume){notice('이력서와 AI 전송 동의를 먼저 저장하세요.');return;}
 try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const origin=new URL(tab.url).origin;if(!origin.startsWith('https://'))throw Error('채용 공고의 HTTPS 탭에서 설정하세요.');
 const granted=await chrome.permissions.request({origins:[`${origin}/*`]});if(!granted)return;
 await save({settings:{...state.settings,autoOrigins:[...new Set([...(state.settings.autoOrigins||[]),origin])]}});renderOrigins();notice(`${origin}에서 공고가 로드될 때 자동 분석합니다. 설정에서 끌 수 있습니다.`);
 }catch(e){notice(e.message);}
};
$('demo').onclick=()=>{if(!confirmDraftSwitch())return;const date=new Date().toISOString();$('job').value=demoInput.job;$('job-source').textContent='체험용 샘플 공고 · 내 저장 자료는 유지됩니다.';render({id:'demo',date,input:demoInput,job:{title:'체험용 프론트엔드 공고',text:demoInput.job,url:''},result:demoResult,demo:true});view('analysis');notice('미리 작성한 체험 결과입니다. 실제 자료로 분석하려면 이력서와 API 연결을 설정하세요.');};
$('resume-file').onchange=async()=>{
 const file=$('resume-file').files[0];if(!file)return;
 try{if(file.size>10*1024*1024)throw Error('10MB 이하 파일을 선택하세요.');notice('파일에서 텍스트를 읽고 있습니다…');let text='';const ext=file.name.split('.').pop().toLowerCase();
 if(['txt','md'].includes(ext))text=await file.text();
 else if(ext==='docx'){const mammoth=await import('mammoth/mammoth.browser.js');text=(await (mammoth.default||mammoth).extractRawText({arrayBuffer:await file.arrayBuffer()})).value;}
 else if(ext==='pdf'){const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';const loadingTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});const pdf=await loadingTask.promise;try{if(pdf.numPages>60)throw Error('PDF는 60페이지 이하로 준비하세요.');for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);const content=await p.getTextContent();text+=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n';}}finally{await loadingTask.destroy();}}
 else throw Error('PDF, DOCX, TXT, MD 파일을 선택하세요.');
 if(text.trim().length<30)throw Error('텍스트를 충분히 읽지 못했습니다. 스캔 PDF·이미지는 OCR 후 텍스트로 붙여넣어 주세요.');if(text.length>60000)throw Error('내용이 60,000자를 초과합니다. 필요한 경력을 골라 붙여넣어 주세요.');$('resume').value=text;notice('추출한 이력서를 확인하고 자료 저장을 누르세요. PDF의 표와 줄바꿈은 원본과 다를 수 있습니다.');
 }catch(e){notice(e.message);}
};
$('cover-draft').oninput=count;
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText($(b.dataset.copy).value);notice('수정본을 복사했습니다.');}catch{notice('복사하지 못했습니다. 내용을 선택해 직접 복사하세요.');}});
document.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>{const url=URL.createObjectURL(new Blob(['\ufeff'+$(b.dataset.download).value],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=b.dataset.download==='resume-draft'?'맞춤-이력서.txt':'맞춤-자기소개서.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('save-drafts').onclick=async()=>{if(!current)return;current={...current,editedResume:$('resume-draft').value,editedCover:$('cover-draft').value};if(current.demo){notice('체험 수정본은 복사·다운로드할 수 있습니다. 실제 분석 기록에는 저장하지 않습니다.');return;}await save({latest:current,history:(state.history||[]).map(e=>e.id===current.id?current:e)});notice('편집한 수정본을 저장했습니다.');};
$('clear').onclick=async()=>{if(inProgress){notice('분석이 끝난 뒤 삭제하세요.');return;}if(!confirm('이 브라우저의 이력서, 문체, 분석 기록, 연결 설정을 모두 삭제할까요?'))return;if(extension){for(const o of state.settings?.autoOrigins||[])await chrome.permissions.remove({origins:[`${o}/*`]});}await storage.clear();location.reload();};
if(extension)chrome.storage.onChanged.addListener(async(changes,area)=>{if(area!=='local')return;if(changes.job){state.job=changes.job.newValue;$('job').value=state.job?.text||'';$('job-source').textContent=state.job?`${state.job.title} · ${state.job.url}`:'공고를 읽으세요.';}if(changes.captureError?.newValue)notice(changes.captureError.newValue);if(changes.history){state.history=changes.history.newValue;renderHistory();}if(changes.latest?.newValue&&!inProgress){state.latest=changes.latest.newValue;if(confirmDraftSwitch())render(state.latest);}});
hydrate();if(state.latest)render(state.latest);view(names[location.hash.slice(1)]?location.hash.slice(1):'analysis');
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(names[id])view(id);});
