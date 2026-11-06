import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRss, safeUrl, plain, classify, selectArticles, extractiveSummary, collectSource, summarizeBatch, validateAiSummary } from '../server/news.mjs';
import { createStore } from '../server/store.mjs';

const now = '2026-11-06T06:00:00.000Z';
function article(overrides = {}) { return { id:'a', source:'etnews', sources:['etnews'], publisher:'전자신문', originalTitle:'AI 기술 발표', originalUrl:'https://www.etnews.com/202611060001', language:'ko', category:'AI·IT', description:'연구팀이 새로운 기술을 발표했다. 처리 속도는 기존 대비 20% 향상됐다. 세부 결과는 내일 공개할 예정이다.', publishedAt:now, fetchedAt:now, ...overrides }; }

test('RSS decodes CDATA, entities and dates without executing HTML', () => {
  const xml = '<rss><channel><item><title><![CDATA[AI &amp; 기술]]></title><description><![CDATA[<b>새로운</b> 기술]]></description><link>https://www.etnews.com/a?utm_source=x&amp;id=2</link><pubDate>Fri, 06 Nov 2026 15:00:00 +0900</pubDate></item><item><title>악성</title><link>javascript:alert(1)</link></item></channel></rss>';
  const [a] = parseRss(xml,{source:'etnews',publisher:'전자신문',category:'AI·IT'});
  assert.equal(a.originalTitle,'AI & 기술');assert.equal(a.description,'새로운 기술');assert.equal(a.originalUrl,'https://www.etnews.com/a?id=2');assert.equal(a.publishedAt,now);
  assert.equal(parseRss(xml,{source:'etnews',category:'AI·IT'}).length,1);
  assert.throws(()=>parseRss('<!DOCTYPE rss><rss/>',{}));
});
test('URLs and titles cannot inject script or credentials', () => {
  assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('https://user:pass@example.com'),'');
  assert.equal(plain('&lt;script&gt;alert(1)&lt;/script&gt; 안전'),'안전');
});
test('classification and dedupe preserve actual publisher and both collection routes', () => {
  assert.equal(classify('아파트 청약 정책'),'부동산');assert.equal(classify('AI semiconductor chip'),'AI·IT');
  const selected=selectArticles([article({source:'naver',sources:['naver'],publisher:'확인 불가'}),article(),article({id:'old',originalUrl:'https://example.com/old',publishedAt:'2026-11-01T00:00:00Z'}),article({id:'future',originalUrl:'https://example.com/future',publishedAt:'2026-11-08T00:00:00Z'})],Date.parse(now));
  assert.equal(selected.length,1);assert.equal(selected[0].publisher,'전자신문');assert.deepEqual(selected[0].sources,['naver','etnews']);
});
test('extractive summary never invents missing sentences or translations', () => {
  const result=extractiveSummary(article());assert.equal(result.summarySentences.length,3);assert.equal(result.summaryStatus,'extractive');
  assert.deepEqual(extractiveSummary(article({description:'짧은 설명 하나입니다.'})).summarySentences,[]);
  assert.equal(extractiveSummary(article({language:'en'})).summaryStatus,'needs_ai');
  const decimals=extractiveSummary(article({description:'오늘 주가는 20.79% 상승한 1877원에 거래된다. 매출은 1.9% 늘어난 것으로 나타났다. 관련 공시는 내일 발표될 예정이다.'}));
  assert.ok(decimals.summarySentences[0].includes('20.79%')); assert.ok(decimals.summarySentences[1].includes('1.9%'));
});
test('unconfigured Naver and restricted Nate make no network calls', async () => {
  let called=false;const fetcher=()=>{called=true;throw Error();};
  assert.equal((await collectSource('naver',{},fetcher)).status,'unconfigured');
  assert.equal((await collectSource('nate',{},fetcher)).status,'restricted');assert.equal(called,false);
});
test('Naver API uses authentication headers, normalizes links and identifies provision date', async () => {
  const fetcher=async (url,options)=>{
    assert.equal(new URL(url).hostname,'openapi.naver.com');assert.equal(options.headers['X-Naver-Client-Id'],'test-id');
    return new Response(JSON.stringify({items:[{title:'<b>AI</b> 기술',description:'뉴스 설명',originallink:'https://example.com/news',link:'https://n.news.naver.com/1',pubDate:now}]}));
  };
  const result=await collectSource('naver',{NAVER_CLIENT_ID:'test-id',NAVER_CLIENT_SECRET:'test-secret'},fetcher);
  assert.equal(result.status,'ok');assert.equal(result.articles[0].originalTitle,'AI 기술');assert.equal(result.articles[0].dateLabel,'제공');
});
test('AI validates Korean output and keeps key out of URL and prompt data', async () => {
  const mock={id:'a',titleKo:'새로운 기술 발표',sentences:['연구팀이 기술을 발표했습니다.','처리 속도는 20% 향상됐습니다.','세부 내용은 내일 공개됩니다.']};
  assert.equal(validateAiSummary(mock),true);assert.equal(validateAiSummary({...mock,sentences:['English only.']}),false);
  const fetcher=async (url,options)=>{assert.ok(!url.includes('test-key'));assert.equal(options.headers['x-goog-api-key'],'test-key');assert.ok(!options.body.includes('test-key'));return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({articles:[mock]})}]}}]}));};
  const result=await summarizeBatch([article()],{GEMINI_API_KEY:'test-key'},fetcher);assert.equal(result.get('a').summaryStatus,'ai');
});
test('store preserves earlier source on partial failure and survives restart', async () => {
  const directory=await mkdtemp(join(tmpdir(),'news-store-'));let fails=false;
  const collector=async id=>{if(id==='etnews'){if(fails)throw Error('upstream error containing a secret');return {status:'ok',message:'done',articles:[article({publishedAt:new Date().toISOString()})]};}return {status:'unconfigured',message:'not configured',articles:[]};};
  try {
    const store=createStore({directory,env:{},collector});await store.refresh();assert.equal(store.snapshot().articles.length,1);
    fails=true;await store.refresh();assert.equal(store.snapshot().articles[0].stale,true);assert.equal(store.snapshot().sources[0].status,'error');assert.ok(!JSON.stringify(store.snapshot()).includes('secret'));
    const reload=createStore({directory,env:{},collector});await reload.load();assert.equal(reload.snapshot().articles.length,1);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('refresh coalesces concurrent calls and valid AI summaries are cached', async () => {
  let resolve;const gate=new Promise(r=>{resolve=r;});let summaries=0;
  const collector=async id=>{await gate;return {status:'ok',message:'done',articles:id==='etnews'?[article({publishedAt:new Date().toISOString()})]:[]};};
  const summarizer=async ()=>{summaries++;return new Map([['a',{titleKo:'테스트 제목',summarySentences:['검증된 첫 문장입니다.','검증된 두 번째 문장입니다.','검증된 세 번째 문장입니다.'],summaryStatus:'ai'}]]);};
  const store=createStore({env:{GEMINI_API_KEY:'test'},collector,summarizer});const first=store.refresh();assert.equal(await store.refresh(),false);resolve();await first;await store.refresh();assert.equal(summaries,1);assert.equal(store.snapshot().refreshing,false);
});
