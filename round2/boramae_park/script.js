const terminal = document.getElementById('terminal');
const toggle = document.getElementById('menuToggle');
const navLinks = [...document.querySelectorAll('.desktop-nav a')];
const sections = navLinks.map((link) => document.querySelector(link.getAttribute('href')));
const filterButtons = [...document.querySelectorAll('.filter-button')];
const projects = [...document.querySelectorAll('.project[data-project]')];
const filterStatus = document.getElementById('filterStatus');

function closeMenu() {
  terminal.classList.remove('menu-open');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', '메뉴 열기');
}

toggle.addEventListener('click', () => {
  const open = terminal.classList.toggle('menu-open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
});

navLinks.forEach((link) => link.addEventListener('click', closeMenu));

function updateActiveNav() {
  const marker = window.scrollY + 94;
  sections.forEach((section, index) => {
    if (section && section.offsetTop <= marker && section.offsetTop + section.offsetHeight > marker) {
      navLinks.forEach((link) => link.classList.remove('active'));
      navLinks[index].classList.add('active');
    }
  });
}

function setProjectFilter(filter) {
  let visibleCount = 0;
  projects.forEach((project) => {
    const visible = filter === 'all' || project.dataset.project.split(' ').includes(filter);
    project.hidden = !visible;
    if (visible) visibleCount += 1;
  });
  filterButtons.forEach((button) => {
    const selected = button.dataset.filter === filter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  filterStatus.textContent = filter === 'all'
    ? `전체 프로젝트 ${visibleCount}개를 표시하고 있습니다.`
    : `${filter.toUpperCase()} 분야 프로젝트 ${visibleCount}개를 표시하고 있습니다.`;
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => setProjectFilter(button.dataset.filter));
});

window.addEventListener('scroll', updateActiveNav, { passive: true });
window.addEventListener('resize', () => {
  if (window.innerWidth > 720) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

updateActiveNav();
