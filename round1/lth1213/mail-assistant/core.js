export const DEFAULTS = {clientId: '', tenant: 'common', days: 30, limit: 100, interval: 15, auto: false};

export function validateSettings(input) {
  const s = {...DEFAULTS, ...input};
  if (s.clientId && !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(s.clientId)) throw Error('애플리케이션 ID는 GUID 형식이어야 합니다.');
  if (!/^(common|organizations|consumers|[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12})$/i.test(s.tenant)) throw Error('테넌트에는 common 또는 디렉터리(테넌트) ID를 입력하세요.');
  for (const [k, min, max] of [['days',1,365], ['limit',1,500], ['interval',1,1440]]) {
    s[k] = Number(s[k]);
    if (!Number.isInteger(s[k]) || s[k] < min || s[k] > max) throw Error(`${k}: ${min}~${max} 사이의 정수를 입력하세요.`);
  }
  s.auto = Boolean(s.auto);
  return s;
}

export function validateRules(rules, folders) {
  if (!Array.isArray(rules) || rules.length > 100) throw Error('규칙은 최대 100개까지 등록할 수 있습니다.');
  return rules.map(r => {
    if (!r.name?.trim() || !r.keywords?.length || r.keywords.some(k => !k.trim())) throw Error('규칙 이름과 키워드를 입력하세요.');
    if (!['subject','sender','body','all'].includes(r.field) || !['any','every'].includes(r.match)) throw Error('규칙 조건이 올바르지 않습니다.');
    if (!folders.some(f => f.id === r.destination && !f.isInbox)) throw Error('받은편지함 이외의 목적지 폴더를 선택하세요.');
    if (r.kind === 'spam' && !folders.some(f => f.id === r.destination && f.isJunk)) throw Error('스팸 규칙의 목적지는 정크 메일 폴더여야 합니다.');
    return {...r, name: r.name.trim(), keywords: r.keywords.map(k => k.trim()), enabled: r.enabled !== false};
  });
}

const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
export function matchRule(message, rules) {
  const fields = {
    subject: message.subject || '',
    sender: `${message.from?.emailAddress?.name || ''} ${message.from?.emailAddress?.address || ''}`,
    body: message.body?.content || ''
  };
  fields.all = Object.values(fields).join('\n');
  return rules.find(r => r.enabled !== false && r.keywords.length &&
    r.keywords[r.match === 'every' ? 'every' : 'some'](k => normalize(fields[r.field]).includes(normalize(k)))) || null;
}

export function makePlan(messages, rules, folders) {
  return messages.flatMap(m => {
    const rule = matchRule(m, rules);
    if (!rule || rule.destination === m.parentFolderId) return [];
    return [{id: m.id, subject: m.subject || '(제목 없음)', sender: m.from?.emailAddress?.address || '',
      original: m.parentFolderId, destination: rule.destination,
      folderName: folders.find(f => f.id === rule.destination)?.name || rule.destination,
      ruleName: rule.name, status: 'queued', error: ''}];
  });
}

// A persisted in-flight operation is reconciled by mailbox state before another POST.
export function reconcile(item, parent, undo = false) {
  const from = undo ? item.destination : item.original;
  const to = undo ? item.original : item.destination;
  if (parent === to) return undo ? 'restored' : 'done';
  if (parent === from) return undo ? 'done' : 'queued';
  return 'conflict';
}

export function demoData() {
  const folders = [{id:'inbox',name:'받은편지함',isInbox:true}, {id:'junk',name:'정크 메일',isJunk:true}, {id:'finance',name:'업무 / 정산'}, {id:'project',name:'업무 / 프로젝트'}, {id:'news',name:'뉴스레터'}];
  const seeds = [['11월 세금계산서 확인 요청','finance@partner.co.kr','이번 달 정산 내역과 청구서를 확인해 주세요.'], ['프로젝트 주간 회의 안내','team@company.co.kr','금요일 프로젝트 회의 자료입니다.'], ['이번 주 디자인 뉴스레터','news@design.co.kr','새로운 소식을 전합니다.'], ['점심 약속 확인','friend@example.com','내일 점심에 만나요.'], ['추가 정산 자료 전달','account@partner.co.kr','요청하신 세금계산서를 보냅니다.']];
  seeds.push(['광고 · 무료 당첨 안내','promo@unknown.example','지금 무료 당첨 혜택을 확인하세요.']);
  const messages = seeds.map(([subject,address,content], i) => ({id:`demo-${i}`,subject,from:{emailAddress:{address}},body:{content},parentFolderId:'inbox',receivedDateTime:new Date().toISOString()}));
  const rules = [{id:'r1',name:'정산 메일',field:'all',match:'any',keywords:['정산','세금계산서','청구서'],destination:'finance',enabled:true}, {id:'r2',name:'프로젝트',field:'subject',match:'any',keywords:['프로젝트','회의'],destination:'project',enabled:true}, {id:'r3',name:'뉴스레터',field:'subject',match:'any',keywords:['뉴스레터'],destination:'news',enabled:true}];
  rules.unshift({id:'r-spam',name:'스팸 키워드',field:'all',match:'any',keywords:['무료 당첨'],destination:'junk',kind:'spam',enabled:true});
  return {folders,messages,rules};
}
