'use strict';
const $ = id => document.getElementById(id);
const core = globalThis.IconSearch;
let controller;
let selected;
let items = [];
let exporting = false;
let runId = 0;

function setStatus(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}
function resetResults() {
  items = [];
  selected = null;
  $('results').replaceChildren();
  $('count').textContent = '0';
  $('editor').hidden = true;
  $('query-detail').textContent = '';
}
function syncWindowLink() {
  const params = new URLSearchParams();
  for (const [key, id] of [['ko', 'keyword-ko'], ['en', 'keyword-en'], ['kind', 'kind'], ['style', 'style']]) params.set(key, $(id).value);
  return params;
}
async function doSearch(event) {
  event?.preventDefault();
  controller?.abort();
  controller = new AbortController();
  const currentRun = ++runId;
  resetResults();
  $('search-button').disabled = true;
  $('cancel').hidden = false;
  $('empty').hidden = true;
  setStatus('키워드에 어울리는 아이콘을 찾고 있어요…');
  const query = { ko: $('keyword-ko').value, en: $('keyword-en').value, kind: $('kind').value, style: $('style').value };
  try {
    const result = await core.search(query, controller.signal);
    if (currentRun !== runId || controller.signal.aborted) return;
    items = result.items;
    $('query-detail').textContent = result.groups.map(group => `${group.original} → ${group.terms.join(' / ')} (${group.method})`).join(' ∩ ');
    $('count').textContent = String(items.length);
    setStatus(items.length ? `${items.length}개의 후보를 골랐어요. 원하는 그림을 선택하세요.` : '조건에 맞는 결과가 없어요.');
    if (!items.length) {
      $('empty').hidden = false;
      $('empty').querySelector('strong').textContent = '키워드를 더 간단하게 바꿔보세요';
      $('empty').querySelector('p').textContent = result.groups.length > 1 ? '두 검색 결과에 공통된 후보가 없습니다. 키워드를 하나만 입력하거나 스타일을 전체로 변경해 보세요.' : '다른 표현을 입력하거나 종류·스타일을 전체로 변경해 보세요.';
    }
    for (const item of items) renderCard(item);
  } catch (error) {
    if (currentRun !== runId) return;
    setStatus(controller.signal.aborted ? '검색을 취소했습니다.' : error.name === 'TimeoutError' ? '검색 응답이 지연되고 있습니다. 다시 시도해 주세요.' : error instanceof TypeError ? '검색 서비스에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' : error.message, true);
  } finally {
    if (currentRun === runId) { $('search-button').disabled = false; $('cancel').hidden = true; }
  }
}
function renderCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.dataset.id = item.id;
  card.setAttribute('aria-pressed', 'false');
  card.setAttribute('aria-label', `${item.id}, ${item.info.name || item.id.split(':')[0]}, 선택`);
  card.title = `${item.id}\n${item.info.license?.title || '라이선스 확인 필요'}`;
  const image = new Image();
  image.alt = '';
  image.src = core.svgUrl(item.id, $('color').value, 80);
  image.addEventListener('error', () => {
    const label = document.createElement('span');
    label.className = 'image-error';
    label.textContent = '미리보기 오류';
    card.append(label);
  }, { once: true });
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = item.id.split(':')[1];
  const source = document.createElement('small');
  source.textContent = item.info.name || item.id.split(':')[0];
  card.append(image, name, source);
  card.addEventListener('click', () => selectItem(item));
  $('results').append(card);
}
function selectItem(item) {
  if (exporting) return;
  selected = item;
  $('editor').hidden = false;
  $('selected-name').textContent = item.id.split(':')[1];
  $('selected-source').textContent = `${item.info.name || item.id.split(':')[0]} · ${item.info.author?.name || '제작자 정보는 출처 참조'}`;
  const fallback = `https://icon-sets.iconify.design/${item.id.split(':')[0]}/${item.id.split(':')[1]}/`;
  const license = item.info.license;
  $('license-link').href = /^https:\/\//.test(license?.url || '') ? license.url : fallback;
  $('license-link').textContent = `${license?.title || '출처에서 라이선스 확인'} ↗`;
  $('color').disabled = item.palette;
  $('color-hint').textContent = item.palette ? '컬러 그림은 원래 색상을 유지합니다. 투명 배경으로 저장됩니다.' : '색상을 변경할 수 있어요. 투명 배경으로 저장됩니다.';
  $('export-status').textContent = '사용 전 라이선스와 저작자 표시 조건을 확인하세요.';
  $('export-status').classList.remove('error');
  for (const card of $('results').children) card.setAttribute('aria-pressed', String(card.dataset.id === item.id));
  updatePreview();
  $('editor').scrollIntoView({ behavior: 'instant', block: 'nearest' });
}
function updatePreview() {
  if (!selected) return;
  $('selected-image').src = core.svgUrl(selected.id, $('color').value, Number($('size').value));
  $('selected-image').alt = selected.id;
}

async function svgToPng(svg, size) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG 변환을 사용할 수 없습니다. SVG로 저장해 주세요.');
    context.drawImage(image, 0, 0, size, size);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 변환에 실패했습니다.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function exportItem(format) {
  if (!selected || exporting) return;
  exporting = true;
  const item = selected;
  const color = $('color').value;
  const size = Number($('size').value);
  const buttons = ['download-svg', 'download-png', 'copy-svg'];
  buttons.forEach(id => { $(id).disabled = true; });
  $('export-status').classList.remove('error');
  $('export-status').textContent = format === 'copy' ? 'SVG를 복사하고 있어요…' : '다운로드 파일을 준비하고 있어요…';
  try {
    const responseSvg = await core.request(core.svgUrl(item.id, color, size), new AbortController().signal, 'text');
    const doc = new DOMParser().parseFromString(responseSvg, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg' || doc.querySelector('script, foreignObject, image, use[*|href]')) throw new Error('아이콘 SVG 응답을 확인하지 못했습니다. 다시 시도해 주세요.');
    const metadata = doc.createElementNS('http://www.w3.org/2000/svg', 'metadata');
    metadata.textContent = JSON.stringify({ icon: item.id, collection: item.info.name, author: item.info.author, license: item.info.license, source: `https://icon-sets.iconify.design/${item.id.replace(':', '/')}/` });
    doc.documentElement.prepend(metadata);
    const svg = new XMLSerializer().serializeToString(doc);
    if (format === 'copy') {
      await navigator.clipboard.writeText(svg);
      $('export-status').textContent = 'SVG 코드를 복사했습니다.';
    } else {
      const blob = format === 'png' ? await svgToPng(svg, size) : new Blob([svg], { type: 'image/svg+xml' });
      saveBlob(blob, `${item.id.replace(':', '-')}-${size}.${format}`);
      $('export-status').textContent = '다운로드를 요청했습니다. 크롬 다운로드 목록에서 확인하세요.';
    }
  } catch (error) {
    $('export-status').classList.add('error');
    $('export-status').textContent = error.name === 'NotAllowedError' ? '클립보드 접근이 허용되지 않았습니다. SVG 다운로드를 이용해 주세요.' : `저장 실패: ${error.name === 'TimeoutError' ? '응답 시간이 초과되었습니다.' : error.message} 다시 시도해 주세요.`;
  } finally {
    exporting = false;
    buttons.forEach(id => { $(id).disabled = false; });
  }
}
$('search-form').addEventListener('submit', doSearch);
$('cancel').addEventListener('click', () => controller?.abort());
$('color').addEventListener('input', () => {
  updatePreview();
  for (const card of $('results').children) card.querySelector('img').src = core.svgUrl(card.dataset.id, $('color').value, 80);
});
$('size').addEventListener('change', updatePreview);
for (const format of ['svg', 'png']) $(`download-${format}`).addEventListener('click', () => exportItem(format));
$('copy-svg').addEventListener('click', () => exportItem('copy'));
$('open-window').addEventListener('click', () => {
  const url = new URL(location.href);
  url.search = syncWindowLink().toString();
  if (globalThis.chrome?.windows?.create) chrome.windows.create({ url: url.href, type: 'popup', width: 700, height: 850 });
  else window.open(url.href, '_blank', 'noopener');
});
const initial = new URLSearchParams(location.search);
for (const [key, id] of [['ko', 'keyword-ko'], ['en', 'keyword-en'], ['kind', 'kind'], ['style', 'style']]) {
  if (initial.has(key)) $(id).value = initial.get(key).slice(0, 80);
}
if ($('keyword-ko').value || $('keyword-en').value) doSearch();
