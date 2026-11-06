// 강사 예시의 모바일 메뉴를 참고하고 키보드 조작을 추가했습니다.
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
const navLinks = [...nav.querySelectorAll('a')];
const mobile = window.matchMedia('(max-width: 720px)');

function setMenu(open) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.querySelector('.menu-label').textContent = open ? '메뉴 닫기' : '메뉴 열기';
  nav.hidden = mobile.matches && !open;
}

function syncLayout() {
  toggle.hidden = !mobile.matches;
  setMenu(false);
}

toggle.addEventListener('click', () => {
  setMenu(toggle.getAttribute('aria-expanded') !== 'true');
});

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    setMenu(false);
    // 모바일 메뉴가 숨겨져도 키보드 초점은 이동한 영역에 남게 합니다.
    const section = document.querySelector(link.hash);
    section.setAttribute('tabindex', '-1');
    section.focus({ preventScroll: true });
    navLinks.forEach((item) => item.removeAttribute('aria-current'));
    link.setAttribute('aria-current', 'location');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mobile.matches && toggle.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    toggle.focus();
  }
});

document.addEventListener('click', (event) => {
  if (mobile.matches && !event.target.closest('.site-header')) setMenu(false);
});

mobile.addEventListener('change', syncLayout);
syncLayout();

// 스크롤할 때 현재 보고 있는 영역을 메뉴에 표시합니다.
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      navLinks.forEach((link) => {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
  }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });
  document.querySelectorAll('main > section').forEach((section) => observer.observe(section));
}
