import http from 'node:http';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {resultSchema,instructions,validateInput,validateResult} from '../src/contracts.js';
const root=fileURLToPath(new URL('../',import.meta.url));
if(existsSync(path.join(root,'.env')))process.loadEnvFile(path.join(root,'.env'));
const tokenPath=path.join(root,'.local-token');
const token=existsSync(tokenPath)?readFileSync(tokenPath,'utf8').trim():randomBytes(32).toString('hex');
if(!existsSync(tokenPath))writeFileSync(tokenPath,token,{mode:0o600});
const port=Number(process.env.PORT||4317);
function authorized(req){const a=Buffer.from(req.headers.authorization||'');const b=Buffer.from(`Bearer ${token}`);return a.length===b.length&&timingSafeEqual(a,b);}
export function createServer({apiFetch=fetch}={}){
 let running=false;
 return http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';
  if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)&&origin!==`http://127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origin||`http://127.0.0.1:${port}`,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
  const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
  if(!authorized(req)){send(401,{error:'연결 토큰이 맞지 않습니다. 서버 시작 시 표시된 토큰을 설정에 입력하세요.'});return;}
  if(req.url==='/health'&&req.method==='GET'){send(200,{ready:!!(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL),model:process.env.OPENAI_MODEL||null});return;}
  if(req.url!=='/analyze'||req.method!=='POST'){send(404,{error:'없는 경로입니다.'});return;}
  if(running){send(429,{error:'분석이 진행 중입니다. 완료 후 다시 시도하세요.'});return;}
  if(!process.env.OPENAI_API_KEY||!process.env.OPENAI_MODEL){send(503,{error:'.env에 OPENAI_API_KEY와 OPENAI_MODEL을 입력하고 서버를 다시 시작하세요.'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){send(415,{error:'JSON 요청만 지원합니다.'});return;}
  running=true;
  try{
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>900000){send(413,{error:'입력 자료가 너무 큽니다.'});return;}chunks.push(chunk);}
   let data;try{data=validateInput(JSON.parse(Buffer.concat(chunks).toString()));}catch(e){send(400,{error:e.message});return;}
   const upstream=await apiFetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(110000),body:JSON.stringify({model:process.env.OPENAI_MODEL,store:false,instructions,input:JSON.stringify(data),max_output_tokens:14000,text:{format:{type:'json_schema',name:'career_analysis',strict:true,schema:resultSchema}}})});
   if(!upstream.ok){send(502,{error:`AI 연결 오류 (${upstream.status}). API 키·모델 권한·결제 한도를 확인하세요.`});return;}
   const body=await upstream.json();
   if(body.status!=='completed')throw Error('AI 응답이 완료되지 않았습니다. 자료를 줄이거나 다시 시도하세요.');
   const output=(body.output||[]).flatMap(x=>x.content||[]);
   if(output.some(x=>x.type==='refusal'))throw Error('AI가 이 요청에 응답하지 못했습니다. 입력 내용을 확인하세요.');
   const result=validateResult(JSON.parse(output.filter(x=>x.type==='output_text').map(x=>x.text).join('')));
   // Exact citations are checked against source text; unsupported matches cannot earn points.
   for(const row of result.requirements){
    if(!row.jobEvidence||!data.job.includes(row.jobEvidence))throw Error('공고 인용 검증에 실패했습니다. 공고 본문을 확인하고 다시 시도하세요.');
    if(!row.resumeEvidence||!data.resume.includes(row.resumeEvidence)){
     row.resumeEvidence='';row.status='확인 필요';row.advice+=' 원문에서 근거를 확인하지 못했습니다.';
    }
   }
   result.changes=result.changes.filter(c=>c.before&&data.resume.includes(c.before));
   if(result.coverLetterDraft.length>data.limit){result.warnings.push('자소서가 요청 글자 수를 초과했습니다. 표시된 글자 수를 확인하고 줄여주세요.');}
   send(200,{result,model:process.env.OPENAI_MODEL});
  }catch(e){send(502,{error:e.name==='TimeoutError'?'분석 시간이 초과되었습니다. 다시 시도하세요.':e instanceof SyntaxError?'AI 응답을 읽지 못했습니다. 다시 시도하세요.':e.message});}
  finally{running=false;}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url))createServer().listen(port,'127.0.0.1',()=>{
 console.log(`지원노트 분석 서버: http://127.0.0.1:${port}\n연결 토큰: ${token}\nAI 설정: ${process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL?'준비됨':'미설정 (.env 파일을 확인하세요)'}\n종료: Ctrl+C`);
});
