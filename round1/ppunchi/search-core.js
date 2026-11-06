/* Shared search logic. No page access, remote scripts, or API keys. */
(() => {
  'use strict';
  const dictionary = {
    '고객지원': ['support', 'headset', 'customer-service'], '고객서비스': ['support', 'customer-service'],
    '고객': ['customer', 'account'], '지원': ['support', 'help'], '상담': ['headset', 'support'],
    '보안': ['security', 'shield', 'lock'], '안전': ['shield', 'safety'], '잠금': ['lock'],
    '개발자': ['developer', 'programmer', 'technologist'], '개발': ['code', 'developer'],
    '데이터': ['database', 'data'], '분석': ['analytics', 'chart'], '인공지능': ['robot', 'brain'],
    '로봇': ['robot'], '아바타': ['avatar', 'person', 'account'], '사람': ['person', 'user', 'account'],
    '사용자': ['user', 'account'], '프로필': ['profile', 'account'], '팀': ['team', 'users'],
    '의사': ['doctor', 'physician', 'health-worker'], '교사': ['teacher'], '선생님': ['teacher'],
    '학생': ['student'], '회사원': ['office-worker', 'business-person'], '직장인': ['office-worker'],
    '디자이너': ['artist', 'designer'], '요리사': ['cook', 'chef'], '과학자': ['scientist'],
    '우주비행사': ['astronaut'], '경찰': ['police'], '소방관': ['firefighter'],
    '남자': ['man', 'male'], '여자': ['woman', 'female'], '웃음': ['smile', 'grinning'],
    '행복': ['happy', 'smile'], '슬픔': ['sad', 'crying'], '고양이': ['cat'], '강아지': ['dog'],
    '커피': ['coffee'], '설정': ['settings', 'cog'], '검색': ['search'], '메일': ['mail', 'email'],
    '이메일': ['email', 'mail'], '전화': ['phone'], '알림': ['bell', 'notification'],
    '달력': ['calendar'], '일정': ['calendar', 'schedule'], '문서': ['file', 'document'],
    '파일': ['file'], '폴더': ['folder'], '다운로드': ['download'], '업로드': ['upload'],
    '클라우드': ['cloud'], '네트워크': ['network'], '인터넷': ['globe', 'web'],
    '쇼핑': ['shopping', 'cart'], '장바구니': ['cart'], '결제': ['payment', 'credit-card'],
    '돈': ['money', 'cash'], '성장': ['growth', 'trending-up'], '마케팅': ['marketing', 'megaphone'],
    '아이디어': ['lightbulb', 'idea'], '전구': ['lightbulb'], '목표': ['target', 'goal'],
    '홈': ['home'], '집': ['home', 'house'], '하트': ['heart'], '별': ['star'], '체크': ['check'],
    '시간': ['clock', 'time'], '지도': ['map'], '위치': ['location', 'map-pin'],
    '음악': ['music'], '사진': ['image', 'photo'], '영상': ['video'], '책': ['book'],
    '회의': ['meeting', 'presentation'], '협업': ['team', 'collaboration'], '자동화': ['automation', 'robot']
  };
  const personPattern = /(?:^|-)(?:person|people|user|users|account|avatar|profile|face|man|woman|male|female|boy|girl|baby|child|adult|elder|doctor|physician|health-worker|teacher|student|technologist|developer|programmer|artist|scientist|astronaut|police|firefighter|cook|chef|worker|pilot|judge|farmer|mechanic|singer|family|smile|smiling|happy|grinning|crying|sad|robot|ninja|superhero)(?:-|$)/;
  const colorPrefixes = ['noto', 'openmoji', 'fluent-emoji-flat'];
  const prefixes = { all: ['lucide', 'tabler', 'mdi', ...colorPrefixes], line: ['lucide', 'tabler'], filled: ['mdi'], color: colorPrefixes };
  const translationCache = new Map();
  const searchCache = new Map();

  async function request(url, signal, format = 'json') {
    const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(18000)]), credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(response.status === 429 ? '요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.' : `검색 서비스 응답 오류 (${response.status}). 다시 시도해 주세요.`);
    return format === 'json' ? response.json() : response.text();
  }

  async function resolveKeyword(value, signal) {
    const text = value.trim().replace(/\s+/g, ' ');
    const key = text.replace(/\s/g, '');
    if (dictionary[key]) return { original: text, terms: dictionary[key], method: '기본 사전' };
    if (!/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text)) return { original: text, terms: [text.toLowerCase()], method: '직접 검색' };
    if (translationCache.has(text)) return translationCache.get(text);
    const url = new URL('https://api.mymemory.translated.net/get');
    url.search = new URLSearchParams({ q: text, langpair: 'ko|en' });
    const data = await request(url, signal);
    const translated = data.responseData?.translatedText?.trim();
    if (Number(data.responseStatus) !== 200 || data.quotaFinished || !translated || /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(translated) || !/[a-z]/i.test(translated)) {
      throw new Error('한글 자동 번역을 완료하지 못했습니다. 한글 키워드를 바꾸거나 영문 키워드만 입력해 주세요.');
    }
    const result = { original: text, terms: [translated.toLowerCase().replace(/[.!?]+$/, '')], method: '자동 번역' };
    translationCache.set(text, result);
    return result;
  }

  function isPerson(id) { return personPattern.test(id.split(':')[1] || ''); }
  function validId(id) { return /^[a-z0-9-]+:[a-z0-9-]+$/.test(id); }
  function mergeGroups(groups) {
    if (!groups.length) return [];
    return [...new Set(groups[0])].filter(id => groups.every(group => group.includes(id)));
  }
  function rankAndDiversify(ids, terms, max = 10) {
    const score = id => {
      const name = id.split(':')[1];
      return Math.max(...terms.map(term => name === term.replace(/ /g, '-') ? 100 : name.includes(term.replace(/ /g, '-')) ? 50 : 0)) - name.length / 100;
    };
    const sorted = [...ids].sort((a, b) => score(b) - score(a) || a.localeCompare(b));
    // Round-robin collections so ten near-identical variants cannot crowd out other styles.
    const buckets = new Map();
    for (const id of sorted) {
      const prefix = id.split(':')[0];
      if (!buckets.has(prefix)) buckets.set(prefix, []);
      buckets.get(prefix).push(id);
    }
    const result = [];
    while (result.length < max && [...buckets.values()].some(bucket => bucket.length)) {
      for (const bucket of buckets.values()) { if (bucket.length && result.length < max) result.push(bucket.shift()); }
    }
    return result;
  }

  async function search({ ko, en, kind = 'all', style = 'all' }, signal) {
    if (!ko.trim() && !en.trim()) throw new Error('한글 또는 영문 키워드를 하나 이상 입력해 주세요.');
    const groups = await Promise.all([ko, en].filter(value => value.trim()).map(value => resolveKeyword(value, signal)));
    const collections = {};
    const activePrefixes = prefixes[style] || prefixes.all;
    const terms = [...new Set(groups.flatMap(group => group.terms))];
    const responses = new Map(await Promise.all(terms.map(async term => {
      const params = new URLSearchParams({ query: term, limit: '256', prefixes: activePrefixes.join(',') });
      const cacheKey = params.toString();
      let data = searchCache.get(cacheKey);
      if (!data) {
        data = await request(`https://api.iconify.design/search?${params}`, signal);
        if (!Array.isArray(data.icons)) throw new Error('아이콘 검색 응답을 읽지 못했습니다. 다시 시도해 주세요.');
        searchCache.set(cacheKey, data);
        if (searchCache.size > 60) searchCache.delete(searchCache.keys().next().value);
      }
      Object.assign(collections, data.collections || {});
      return [term, data.icons.filter(validId)];
    })));
    const lists = groups.map(group => [...new Set(group.terms.flatMap(term => responses.get(term)))]);
    let ids = mergeGroups(lists);
    ids = ids.filter(id => {
      if (style === 'filled' && /(?:outline|border|variant-outline)$/.test(id)) return false;
      if (kind === 'avatars') return isPerson(id);
      if (kind === 'icons') return !(colorPrefixes.includes(id.split(':')[0]) && isPerson(id));
      return true;
    });
    return { groups, total: ids.length, items: rankAndDiversify(ids, terms).map(id => ({ id, info: collections[id.split(':')[0]] || {}, palette: collections[id.split(':')[0]]?.palette ?? colorPrefixes.includes(id.split(':')[0]) })) };
  }

  function svgUrl(id, color, size) {
    if (!validId(id)) throw new Error('잘못된 아이콘 ID입니다.');
    const [prefix, name] = id.split(':');
    return `https://api.iconify.design/${prefix}/${name}.svg?${new URLSearchParams({ color, width: String(size), height: String(size) })}`;
  }
  const api = { search, resolveKeyword, mergeGroups, rankAndDiversify, isPerson, svgUrl, request };
  globalThis.IconSearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
