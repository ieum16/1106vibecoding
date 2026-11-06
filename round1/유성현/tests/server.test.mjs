import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from '../server/index.mjs';
import {demoInput,demoResult} from '../src/demo.js';
test('서버 인증·출처·입력·AI 근거 검증',async()=>{
 process.env.OPENAI_API_KEY='test-only';process.env.OPENAI_MODEL='test-model';
 const token=readFileSync(new URL('../.local-token',import.meta.url),'utf8').trim();
 let payload;let output=structuredClone(demoResult);let calls=0;
 const server=createServer({apiFetch:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]}));}});
 await new Promise(r=>server.listen(4317,'127.0.0.1',r));
 const request=(data,headers={})=>fetch('http://127.0.0.1:4317/analyze',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 try{
  assert.equal((await request(demoInput,{Authorization:'Bearer wrong'})).status,401);
  assert.equal((await request(demoInput,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await request({...demoInput,resume:''})).status,400);assert.equal(calls,0);
  let response=await request(demoInput);assert.equal(response.status,200);let data=await response.json();assert.equal(data.result.recommendation,'도전 지원');assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);
  output=structuredClone(demoResult);output.requirements[0].resumeEvidence='실제로 없는 경험';response=await request(demoInput);data=await response.json();assert.equal(data.result.requirements[0].status,'확인 필요');
  output.requirements[0].jobEvidence='공고에 없는 요구조건';assert.equal((await request(demoInput)).status,502);
 }finally{await new Promise(r=>server.close(r));}
});
