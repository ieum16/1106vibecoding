
const menu=document.querySelector('.menu'),nav=document.querySelector('nav');
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}
menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus()}});
matchMedia('(min-width:897px)').addEventListener('change',closeMenu);
const observedSections=[...document.querySelectorAll('main section[id]')];
const activeObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting){nav.querySelectorAll('a').forEach(a=>{if(a.hash==='#'+entry.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')})}}},{rootMargin:'-15% 0px -50% 0px'});observedSections.forEach(s=>activeObserver.observe(s));
const logo=new Image();logo.alt='느린걸음 로고';logo.onload=()=>document.querySelector('#fallback-logo').replaceWith(logo);logo.src='images/logo.png';
let timer;const toast=document.querySelector('.toast');function notify(message){toast.textContent=message;clearTimeout(timer);timer=setTimeout(()=>toast.textContent='',5000)}
document.querySelector('#copy').addEventListener('click',async()=>{const text='[느린걸음 · 가상 모임 안내]\n토요일 아침 산책 / 골목 발견 산책 / 말없이 걷는 시간\n일정 예시: 토요일 오전 10시, 가상 동네공원 입구\n준비물: 편한 신발, 물 한 병\n문의 예시: walk@example.com\n이 페이지는 시연용이며 실제 모임을 모집하지 않습니다.';try{await navigator.clipboard.writeText(text);notify('산책 안내를 복사했어요.')}catch{const field=document.createElement('textarea');field.value=text;field.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(field);field.select();let copied=false;try{copied=document.execCommand('copy')}catch{}field.remove();if(copied)notify('산책 안내를 복사했어요.');else notify('자동 복사가 제한되어 있어요. 참여 안내의 문구를 직접 선택해 복사해 주세요.')}});
