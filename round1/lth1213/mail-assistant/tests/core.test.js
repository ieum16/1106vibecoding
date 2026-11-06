import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,demoData,validateSettings,validateRules,matchRule,makePlan,reconcile} from '../core.js';

test('키워드: 대소문자, 유니코드, OR/AND와 우선순위',() => {
  const m = {subject:'ＰＲＯＪＥＣＴ invoice',from:{emailAddress:{address:'TEAM@example.com'}},body:{content:'정산 내역'}};
  const rules = [{name:'스팸 우선',field:'subject',keywords:['project','INVOICE'],match:'every',enabled:true}, {name:'정산',field:'body',keywords:['정산'],match:'any',enabled:true}];
  assert.equal(matchRule(m,rules).name,'스팸 우선');
  rules[0].enabled = false;
  assert.equal(matchRule(m,rules).name,'정산');
  assert.equal(matchRule(m,[{field:'sender',keywords:['team@'],match:'any'}]).field,'sender');
  assert.equal(matchRule(m,[{field:'all',keywords:['없는 단어','정산'],match:'every'}]),null);
});
test('샘플 분류와 스팸 폴더: 일반 메일은 남기고 5개 이동 계획',() => {
  const {messages,rules,folders} = demoData();
  validateRules(rules,folders);
  const plan = makePlan(messages,rules,folders);
  assert.equal(plan.length,5);
  assert.equal(plan.find(i => i.id === 'demo-5').destination,'junk');
  assert.equal(plan.some(i => i.id === 'demo-3'),false);
  assert.equal(makePlan([{...messages[0],parentFolderId:'finance'}],rules,folders).length,0);
});
test('설정과 스팸 목적지 검증',() => {
  assert.throws(() => validateSettings({...DEFAULTS,limit:0}));
  assert.throws(() => validateSettings({...DEFAULTS,tenant:'../../bad'}));
  const {rules,folders} = demoData();
  assert.throws(() => validateRules([{...rules[0],destination:'finance'}],folders));
  assert.throws(() => validateRules([{...rules[0],keywords:[]}],folders));
  assert.throws(() => validateRules([{...rules[0],destination:'inbox'}],folders));
});
test('중단된 요청의 결과 판별과 복구 방향',() => {
  const i = {original:'a',destination:'b'};
  assert.equal(reconcile(i,'a'),'queued'); assert.equal(reconcile(i,'b'),'done');
  assert.equal(reconcile(i,'b',true),'done'); assert.equal(reconcile(i,'a',true),'restored');
  assert.equal(reconcile(i,'c'),'conflict'); assert.equal(reconcile(i,'c',true),'conflict');
});
