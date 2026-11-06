
const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('#navigation');
function closeMenu(){toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','메뉴 열기');nav.classList.remove('open')}
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');nav.classList.toggle('open',open)});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){closeMenu();toggle.focus()}});
matchMedia('(min-width:641px)').addEventListener('change',closeMenu);
const logo=document.querySelector('#logo-image');function showLogo(){if(logo.naturalWidth){logo.hidden=false;document.querySelector('#fallback-logo').hidden=true;document.querySelector('#fallback-logo').style.display='none'}}logo.addEventListener('load',showLogo);if(logo.complete)showLogo();
