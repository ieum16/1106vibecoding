const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../search-core.js');

test('한글 단독은 사전으로 변환하고 영문 단독은 유지한다', async () => {
  const signal = new AbortController().signal;
  assert.deepEqual((await core.resolveKeyword('고객 지원', signal)).terms, ['support', 'headset', 'customer-service']);
  assert.deepEqual((await core.resolveKeyword('Coffee', signal)).terms, ['coffee']);
});
test('두 언어의 결과는 교집합이고 중복은 제거한다', () => {
  assert.deepEqual(core.mergeGroups([['mdi:shield', 'mdi:lock', 'mdi:shield'], ['mdi:shield', 'tabler:shield']]), ['mdi:shield']);
  assert.deepEqual(core.mergeGroups([['mdi:lock'], ['mdi:coffee']]), []);
});
test('최대 10개를 서로 다른 컬렉션에 분산한다', () => {
  const ids = [...Array.from({ length: 20 }, (_, i) => `mdi:shield-${i}`), 'lucide:shield', 'tabler:shield'];
  const result = core.rankAndDiversify(ids, ['shield']);
  assert.equal(result.length, 10);
  assert.equal(new Set(result).size, 10);
  assert(result.slice(0, 3).includes('lucide:shield'));
  assert(result.slice(0, 3).includes('tabler:shield'));
});
test('인물 후보와 일반 사물을 구분하고 SVG URL을 인코딩한다', () => {
  assert(core.isPerson('openmoji:female-doctor'));
  assert(core.isPerson('noto:woman-technologist'));
  assert(!core.isPerson('mdi:coffee'));
  assert(core.svgUrl('mdi:shield', '#123456', 256).includes('color=%23123456'));
  assert.throws(() => core.svgUrl('../bad', '#fff', 256));
});
test('실제 검색 흐름: 단독 입력, 양쪽 AND, 공통 결과 없음, 입력 누락, 번역 실패', async () => {
  const originalFetch = global.fetch;
  global.fetch = async input => {
    const url = new URL(input);
    if (url.hostname.includes('mymemory')) return { ok: true, json: async () => ({ responseStatus: 403, responseData: { translatedText: 'LIMIT' } }) };
    const query = url.searchParams.get('query');
    const responses = { security: ['mdi:shield', 'mdi:lock'], shield: ['mdi:shield'], lock: ['mdi:lock'], coffee: ['mdi:coffee'] };
    return { ok: true, json: async () => ({ icons: responses[query] || [], collections: { mdi: { name: 'Material Design Icons', palette: false } } }) };
  };
  try {
    const run = (ko, en) => core.search({ ko, en }, new AbortController().signal);
    assert.equal((await run('보안', '')).items.length, 2);
    assert.equal((await run('', 'coffee')).items[0].id, 'mdi:coffee');
    assert.deepEqual((await run('보안', 'shield')).items.map(item => item.id), ['mdi:shield']);
    assert.equal((await run('보안', 'coffee')).items.length, 0);
    await assert.rejects(run('', ''), /하나 이상/);
    await assert.rejects(run('미등록검색어', ''), /자동 번역/);
  } finally { global.fetch = originalFetch; }
});
