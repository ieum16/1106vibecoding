
'use strict';
const $=id=>document.getElementById(id);
const menu=document.querySelector('.menu'),nav=$('navigation');
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','메뉴 열기');menu.textContent='☰'}
menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');menu.textContent=open?'✕':'☰'});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus()}});
function trimRequired(form){for(const field of form.querySelectorAll('[required]')){field.setCustomValidity(field.value.trim()?'':'내용을 입력해 주세요.');if(!field.checkValidity()){field.reportValidity();return false}}return true}
document.querySelectorAll('input[required],textarea[required]').forEach(el=>{el.addEventListener('input',()=>el.setCustomValidity(''));el.addEventListener('invalid',()=>{if(!el.value.trim())el.setCustomValidity('내용을 입력해 주세요.')})});
$('idea-form').addEventListener('submit',e=>{e.preventDefault();if(!trimRequired(e.currentTarget))return;$('preview-title').textContent=$('title').value.trim();const dl=$('preview-content');dl.replaceChildren();[['problem','해결하려는 문제'],['idea','아이디어 설명'],['effect','기대 효과'],['cost','예상 비용'],['method','구현 방법']].forEach(([id,label])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=$(id).value.trim()||'입력하지 않음 (선택 항목)';dl.append(dt,dd)});$('idea-preview').hidden=false;$('idea-preview').focus();$('idea-preview').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'})});
$('edit-proposal').addEventListener('click',()=>$('title').focus());
for(let n=1;n<=10;n++){const label=document.createElement('label');label.className='score';const radio=document.createElement('input');radio.type='radio';radio.name='rating';radio.value=n;radio.setAttribute('aria-label',n+'점');const span=document.createElement('span');span.textContent=n;label.append(radio,span);$('scores').append(label);radio.addEventListener('change',()=>{$('score-result').textContent=`나의 체험 점수: ${n} / 10점 · 실제 평가 아님`})}
$('opinion-form').addEventListener('submit',e=>{e.preventDefault();if(!trimRequired(e.currentTarget))return;$('opinion-result').textContent='나의 체험 의견 · 전송되지 않음\n'+$('opinion').value.trim();$('opinion-result').hidden=false});
$('reset-feedback').addEventListener('click',()=>{document.querySelectorAll('[name="rating"]').forEach(el=>el.checked=false);$('score-result').textContent='아직 선택한 점수가 없습니다.';$('opinion-form').reset();$('opinion').setCustomValidity('');$('opinion-result').hidden=true;$('opinion-result').textContent=''});
let currentStep=1,approved=false,department='';
const stepNames=['제안 살펴보기','구현 가능성 검토','구현 승인 체험','협업 부서 지정 체험'];
function renderProcess(){document.querySelectorAll('#steps li').forEach((el,i)=>{el.classList.toggle('current',i===currentStep);if(i===currentStep)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current')});$('process-status').textContent=`체험 상태: ${stepNames[currentStep]} · ${approved?'승인 체험 완료':'승인 전'} · ${department||'지정 부서 없음'}`;$('approve').textContent=approved?'승인 체험 완료 ✓':'구현 승인 체험 ↗';$('approve').disabled=approved;}
$('next-step').addEventListener('click',()=>{currentStep=(currentStep+1)%4;renderProcess()});
$('approve').addEventListener('click',()=>{approved=true;currentStep=2;$('assignment-message').textContent='구현 승인을 체험했습니다. 실제 승인 기록은 생성되지 않습니다.';renderProcess()});
$('assign').addEventListener('click',()=>{if(!approved){$('assignment-message').textContent='먼저 구현 승인 체험을 해 주세요.';return}if(!$('department').value){$('assignment-message').textContent='체험용 협업 부서를 선택해 주세요.';$('department').focus();return}department=$('department').value;currentStep=3;$('assignment-message').textContent='부서 지정을 체험했습니다. 실제 배정이나 예산 집행은 발생하지 않습니다.';renderProcess()});
$('reset-process').addEventListener('click',()=>{currentStep=1;approved=false;department='';$('department').value='';$('assignment-message').textContent='';renderProcess()});
// All interactions are kept in memory. No network requests or persistent storage.
document.querySelectorAll('form').forEach(form=>form.reset());renderProcess();
