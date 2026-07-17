import test from 'node:test';
import assert from 'node:assert/strict';
import { assemblePrompt } from '../lib/prompts/index.js';
import { PROMPTS } from '../lib/prompts/index.js';
import { SAFETY_RULES } from '../lib/prompts/safety.js';
import { parseJsonResponse, chatCompletion } from '../lib/ai-client.js';
import { runPipeline, buildPipelineRequest } from '../lib/pipelines.js';
import { verifyLicense, PUBLIC_KEY_JWK, canonicalJson } from '../lib/license.js';
import { generateKeyPairSync, sign } from 'node:crypto';
import { runMonitors } from '../lib/reddit-client.js';
import { planRateLimit } from '../lib/reddit-client.js';
import { setState, exportState, importState, DEFAULT_STATE } from '../lib/store.js';
import { readFile } from 'node:fs/promises';
import { sanitizeState, PRO_MESSAGE } from '../lib/entitlements.js';

test('四条管线互相隔离且安全尾段不可移除', () => {
  for (const type of ['reply', 'post', 'translate', 'polish']) {
    const text = assemblePrompt(type, {}, { text: `custom-${type}` });
    assert.match(text, new RegExp(`custom-${type}`));
    assert.match(text, /NON-NEGOTIABLE RULES/);
  }
});
test('三层 Prompt 组装注入变量并以不可覆写安全规则收尾', () => {
  const builtIn=assemblePrompt('reply',{persona_name:'独立开发者',subreddit:'macapps'});
  assert.match(builtIn,/Identity: 独立开发者/);
  assert.match(builtIn,/r\/macapps/);
  const overridden=assemblePrompt('reply',{persona_name:'测试用户'},{text:'CUSTOM {{persona_name}}'});
  assert.ok(overridden.startsWith('CUSTOM 测试用户'));
  assert.ok(!overridden.includes('long-time Reddit user'));
  assert.ok(overridden.endsWith(SAFETY_RULES));
});
test('四条内置模板与 SPEC 第 4 节逐字一致', async () => {
  const spec=await readFile(new URL('../SPEC.md',import.meta.url),'utf8');
  const definitions=[['reply','#### 4.4.1 内置 System Prompt 模板',''],['post','#### 内置 System Prompt 模板',''],['translate','#### 内置 System Prompt 模板(Layer 1,完整交付版)','### 4.6 管线三'],['polish','#### 内置 System Prompt 模板(Layer 1,完整交付版)','### 4.7 管线四']];
  for(const [id,heading,after] of definitions){const offset=after?spec.indexOf(after):0,at=spec.indexOf(heading,offset),open=spec.indexOf('```',at),start=spec.indexOf('\n',open)+1,end=spec.indexOf('\n```',start);assert.equal(PROMPTS[id].template,spec.slice(start,end));}
});
test('四条管线参数独立且与 SPEC 一致', () => {
  const state={settings:{ai:{model:'m'},promptOverrides:{}}},context={source_text:'x'.repeat(100)};
  const reply=buildPipelineRequest('reply',context,state),post=buildPipelineRequest('post',context,state),translate=buildPipelineRequest('translate',context,state),polish=buildPipelineRequest('polish',context,state);
  assert.deepEqual([reply.temperature,reply.max_tokens],[0.8,2000]);assert.deepEqual([post.temperature,post.max_tokens],[0.9,2500]);assert.equal(translate.temperature,0.2);assert.ok(translate.max_tokens<=3000);assert.deepEqual([polish.temperature,polish.max_tokens],[0.6,1500]);
});
test('JSON 容错支持纯 JSON、围栏和外围文本', () => {
  assert.equal(parseJsonResponse('{"a":1}').a, 1);
  assert.equal(parseJsonResponse('```json\n{"a":2}\n```').a, 2);
  assert.equal(parseJsonResponse('结果如下 {"a":3} 完成').a, 3);
  assert.throws(() => parseJsonResponse('no json'));
});
test('AI 500 最多重试两次，断网错误原样返回', async () => {
  let attempts=0;const config={baseUrl:'https://api.example.com',apiKey:'key'},request={model:'m',messages:[]};
  await assert.rejects(()=>chatCompletion(config,request,{fetchImpl:async()=>{attempts+=1;return new Response('failed',{status:500});},sleep:async()=>{}}),/500/);assert.equal(attempts,3);
  await assert.rejects(()=>chatCompletion(config,request,{fetchImpl:async()=>{throw new TypeError('offline');},sleep:async()=>{}}),/offline/);
});

test('四条管线均可解析 OpenAI 兼容 mock 返回', async () => {
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (_url,init)=>{const request=JSON.parse(init.body);const system=request.messages[0].content;let value={translation_zh:'译文'};if(system.includes('editable English drafts'))value={understanding_zh:'理解',drafts:[{reply_en:'draft'}]};else if(system.includes('two distinct candidates'))value={candidates:[{title_en:'title',body_en:'body'}]};else if(system.includes('bilingual writing partner'))value={reply_en:'reply'};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}],usage:{total_tokens:12}}),{status:200,headers:{'content-type':'application/json'}});};
  const state={settings:{ai:{baseUrl:'https://api.example.com',model:'test',apiKey:'key'},promptOverrides:{}}};
  try { for(const type of ['reply','post','translate','polish'])assert.ok((await runPipeline(type,{source_text:'x'},state,true)).data); } finally { globalThis.fetch=oldFetch; }
});

test('许可证可离线验签且篡改载荷失败', async () => {
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');Object.assign(PUBLIC_KEY_JWK,publicKey.export({format:'jwk'}));
  const payload={lid:'test',ed:'pro',iat:1,exp:null,note:'test'},body=canonicalJson(payload),key=`RRH1.${Buffer.from(body).toString('base64url')}.${sign(null,Buffer.from(body),privateKey).toString('base64url')}`;
  assert.equal((await verifyLicense(key)).edition,'pro');
  const parts=key.split('.');parts[1]=`${parts[1].slice(0,-1)}${parts[1].endsWith('A')?'B':'A'}`;
  await assert.rejects(()=>verifyLicense(parts.join('.')));
});

test('监控只读搜索、去重并记录 429 一小时退避', async () => {
  const memory={settings:{ai:{baseUrl:'https://api.deepseek.com',model:'x',apiKey:''},promptOverrides:{},defaults:{}},license:{edition:'pro'},persona:{},products:[],todos:[],monitors:[{id:'m1',keyword:'tool',subreddits:['all'],enabled:true,lastRunAt:0,seenPostIds:[]}],discoveries:[],subredditRules:{},sentReplies:[],usage:{},schemaVersion:1};
  globalThis.chrome={storage:{local:{get:async(keys)=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,memory[k]])),set:async(patch)=>Object.assign(memory,patch)}}};
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{assert.equal(init.method,'GET');assert.match(url,/search\.json/);return new Response(JSON.stringify({data:{children:[{kind:'t3',data:{id:'p1',title:'Post',subreddit:'all',permalink:'/r/all/comments/p1/x/',created_utc:1,score:2}}]}}),{status:200});};
  try { const result=await runMonitors();assert.equal(result.added,1);assert.equal(memory.discoveries.length,1);assert.equal((await runMonitors()).checked,0);memory.monitors[0].lastRunAt=0;globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(()=>runMonitors());assert.ok(memory.monitors[0].backoffUntil>Date.now()+59*60_000); } finally {globalThis.fetch=oldFetch;delete globalThis.chrome;}
});
test('全局 Reddit 调度严格限制每分钟六次', () => {
  const now=1_000_000,times=Array.from({length:6},(_,index)=>now-59_000+index);
  assert.equal(planRateLimit(times,now).waitMs,1_000);
  assert.equal(planRateLimit(times,now+60_000).waitMs,0);
});

test('全量导出、清空、导入后数据恢复', async () => {
  const memory={};globalThis.chrome={storage:{local:{get:async(keys)=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,memory[k]])),set:async(patch)=>Object.assign(memory,patch)}}};
  try { const original=structuredClone(DEFAULT_STATE);original.persona.name='tester';original.todos=[{id:'t1',title:'x'}];await setState(original);const backup=await exportState();for(const key of Object.keys(memory))delete memory[key];await importState(backup);assert.equal(memory.persona.name,'tester');assert.equal(memory.todos[0].id,'t1'); } finally {delete globalThis.chrome;}
});
test('Free 与 Pro 权限边界由后台状态层强制执行', () => {
  const source=structuredClone(DEFAULT_STATE);source.todos=Array.from({length:25},(_,index)=>({id:`t${index}`}));source.monitors=[{id:'m1'}];source.products=Array.from({length:12},(_,index)=>({id:`p${index}`,active:index<2}));source.persona.name='付费人设';source.settings.promptOverrides.reply={text:'custom'};
  const free=sanitizeState(source,false);assert.equal(free.todos.length,20);assert.equal(free.monitors.length,0);assert.equal(free.products.length,0);assert.equal(free.persona.name,'');assert.equal(free.settings.promptOverrides.reply,null);
  const pro=sanitizeState(source,true);assert.equal(pro.products.length,10);assert.equal(pro.products.filter(item=>item.active).length,1);assert.match(PRO_MESSAGE,/heyiwuyi/);assert.match(PRO_MESSAGE,/¥99/);
});
