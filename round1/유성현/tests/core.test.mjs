import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateInput,validateResult,scoreResult} from '../src/contracts.js';
import {demoInput,demoResult} from '../src/demo.js';
test('입력 검증: 빈 공고와 범위 밖 글자 수 거부',()=>{assert.equal(validateInput(demoInput),demoInput);assert.throws(()=>validateInput({...demoInput,job:''}));assert.throws(()=>validateInput({...demoInput,limit:50}));assert.throws(()=>validateInput({...demoInput,resume:'x'.repeat(60001)}));});
test('필수 가중치·미확인 항목을 반영하고 확률로 계산하지 않음',()=>{assert.equal(scoreResult(demoResult),80);const r=structuredClone(demoResult);r.requirements[0].status='부분 충족';assert.equal(scoreResult(r),60);r.requirements=[];assert.equal(scoreResult(r),null);});
test('불완전하거나 허용하지 않은 AI 응답 거부',()=>{assert.equal(validateResult(demoResult),demoResult);assert.throws(()=>validateResult({...demoResult,confidence:'정확함'}));assert.throws(()=>validateResult({...demoResult,requirements:[]}));assert.throws(()=>validateResult({...demoResult,probability:90}));});
