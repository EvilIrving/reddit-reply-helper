import { PROMPTS } from './lib/prompts/index.js';
const $=(s)=>document.querySelector(s), $$=(s)=>[...document.querySelectorAll(s)];
let state, pro=false, mode='reply', threadContext='', currentThread=null, lastRules=null, cachedDrafts=null;
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
init();
chrome.storage.onChanged.addListener(async (_changes,area)=>{if(area==='local'&&document.activeElement?.tagName!=='TEXTAREA'){await refreshState();await loadQueue();}});
async function init(){bind();$('#promo').value='none';await refreshState();await loadQueue();}
function bind(){
  $$('.tab').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  $$('.seg').forEach(b=>b.onclick=()=>selectMode(b.dataset.mode));
  $('#generateForm').onsubmit=generate;$('#settingsForm').onsubmit=saveSettings;
  $('#scan').onclick=()=>scan();$('#stashCurrent').onclick=stashCurrent;$('#goDraft').onclick=goDraft;$('#activate').onclick=activate;
  $('#cruiseToggle').onclick=toggleCruise;$('#forceScan').onclick=forceScan;
  $('#followEnabled').onchange=toggleFollow;
  $('#exportData').onclick=exportData;$('#importData').onchange=importData;$('#exportCsv').onclick=exportCsv;
  $('#monitorForm').onsubmit=addMonitor;$('#runMonitors').onclick=runMonitorNow;$('#productForm').onsubmit=saveProduct;$('#productForm').url.onchange=extractProduct;$('#trackingForm').onsubmit=addTracking;
  $('#queueFilter').onchange=loadQueue;$('#promptPipeline').onchange=loadPromptEditor;$('#promptEditor').oninput=updatePromptCount;$('#savePrompt').onclick=savePrompt;$('#restorePrompt').onclick=restorePrompt;
  $('#variableButtons').onclick=(e)=>{const b=e.target.closest('[data-variable]');if(!b)return;const editor=$('#promptEditor'),start=editor.selectionStart;editor.setRangeText(`{{${b.dataset.variable}}}`,start,editor.selectionEnd,'end');updatePromptCount();};
  $('#discoveries').onclick=discoveryAction;$('#monitorList').onclick=monitorAction;$('#productList').onclick=productAction;$('#queueList').onclick=queueAction;$('#queueList').onchange=queueNote;
  $('#proDialog [data-close]').onclick=()=>$('#proDialog').close();
  $$('summary').filter(x=>/Persona|产品库|自定义 Prompt|后台搜索|节奏与效果/.test(x.textContent)).forEach(x=>x.onclick=(e)=>{if(!pro){e.preventDefault();$('#proDialog').showModal();}});
  $('#results').onclick=async(e)=>{const b=e.target.closest('[data-copy]');if(b){await navigator.clipboard.writeText(b.closest('.card').querySelector('textarea').value);b.textContent='已复制';}};
}
function showTab(name){$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));$$('.panel').forEach(x=>x.classList.toggle('hidden',x.id!==`tab-${name}`));if(name==='discover'){chrome.runtime.sendMessage({type:'RRH_MARK_DISCOVERIES_READ'});for(const x of state?.discoveries||[])x.unread=false;}if(name==='queue'&&pro)chrome.runtime.sendMessage({type:'RRH_REFRESH_TRACKING'}).then(refreshState);}
function selectMode(next){if(['polish','post'].includes(next)&&!pro){$('#proDialog').showModal();return;}mode=next;$$('.seg').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));const labels={reply:'补充要求，可留空',polish:'你的中文观点',post:'主题方向',translate:'要理解的英文'},actions={reply:'生成回复草稿',polish:'转成地道英文',post:'生成发帖草稿',translate:'翻译为中文'};$('#ideaLabel').textContent=labels[mode];$('#generateForm button[type=submit]').textContent=actions[mode];$('#subField').classList.toggle('hidden',mode==='translate');$('.context-bar').classList.toggle('hidden',!['reply','post'].includes(mode));$('#generateForm .inline').classList.toggle('hidden',mode==='translate');}
async function refreshState(){const r=await chrome.runtime.sendMessage({type:'RRH_V1_GET_STATE'});if(!r?.state)return;state=r.state;pro=!!r.pro;$('#edition').textContent=pro?'Pro':'Free';$('#edition').classList.toggle('is-pro',pro);$$('.pro').forEach(x=>x.classList.toggle('unlocked',pro));const s=state.settings.ai,f=$('#settingsForm');f.baseUrl.value=s.baseUrl;f.model.value=s.model;f.apiKey.value=s.apiKey;f.personaName.value=state.persona.name;f.personaBackground.value=state.persona.background;f.personaVoice.value=state.persona.voice;f.personaTaboos.value=state.persona.taboos;if(f.healthCardEnabled)f.healthCardEnabled.checked=state.settings.healthCardEnabled!==false;if($('#followEnabled'))$('#followEnabled').checked=state.settings.followEnabled!==false;const product=(state.products||[]).find(x=>x.active);$('#activeProduct').textContent=product?product.name:'纯参与';renderDiscoveries();renderMonitors();renderProducts();renderTracking();loadPromptEditor();}
async function toggleFollow(){
  state.settings.followEnabled=$('#followEnabled').checked;
  await persist();
  await active({type:'RRH_SETTINGS_UPDATED',settings:state.settings});
  setStatus('#discoverStatus',state.settings.followEnabled?'实时监控已开启。刷 Reddit 即可。':'实时监控已关闭。');
}
let cruiseOn=false;
async function toggleCruise(){
  await cruise(!cruiseOn);
}
async function cruise(on){
  const r=await active({type:on?'RRH_START_CRUISE':'RRH_STOP_CRUISE'});
  if(!r?.ok){setStatus('#discoverStatus','请先打开一个 Reddit 标签页。',true);return;}
  cruiseOn=!!on;
  const btn=$('#cruiseToggle');
  if(btn){btn.setAttribute('aria-pressed',cruiseOn?'true':'false');btn.textContent=cruiseOn?'巡航中':'巡航';}
  if(on){state.settings.followEnabled=true;$('#followEnabled').checked=true;await persist();}
  setStatus('#discoverStatus',on?'巡航中：自动慢滚并推荐。':'巡航已停。实时监控仍在。');
}
async function forceScan(){
  setStatus('#discoverStatus','正在扫描当前页面…');
  const r=await active({type:'RRH_FORCE_SCAN'});
  if(!r?.ok){setStatus('#discoverStatus','请先打开一个 Reddit 标签页。',true);return;}
  await refreshState();
  setStatus('#discoverStatus','已扫描。命中会出现在右侧和下面列表。');
}
async function scan(options={}){
  const understand=options.understand!==false;
  setStatus('#discoverStatus','正在读取当前页面…');
  const r=await active({type:'RRH_SCRAPE'});
  if(!r?.ok){setStatus('#discoverStatus','请先打开一个 Reddit 页面。',true);clearCurrentThread();return false;}
  const posts=r.posts||r.items||[];
  currentThread=chooseThread(posts)||r.post||null;
  threadContext=currentThread?serialize(currentThread):'';
  cachedDrafts=null;
  $('#stashCurrent').disabled=!currentThread;
  $('#goDraft').disabled=!currentThread;
  $('#threadActions')?.classList.toggle('hidden',!currentThread);
  if(!currentThread){setStatus('#discoverStatus','当前页面没有可读取的讨论。');renderCurrentThread();return false;}
  if(currentThread.subreddit)$('#generateForm').subreddit.value=currentThread.subreddit;
  renderCurrentThread();
  setStatus('#discoverStatus',`已选定当前讨论（共读取 ${posts.length} 条）。`);
  if(understand) await understandCurrent();
  return true;
}
function clearCurrentThread(){currentThread=null;threadContext='';cachedDrafts=null;$('#stashCurrent').disabled=true;$('#goDraft').disabled=true;$('#threadActions')?.classList.add('hidden');renderCurrentThread();}
function renderCurrentThread(){
  if(!currentThread){$('#currentThread').innerHTML='';return;}
  const p=currentThread,age=p.createdAt?`${Math.round((Date.now()-p.createdAt)/3600000)} 小时前`:'时间未知';
  const body=(p.body||'').trim(),comments=(p.existingComments||p.commentsList||[]).length;
  $('#currentThread').innerHTML=`<article class="card"><h3>${esc(p.title||'当前讨论')}</h3><p class="muted">r/${esc(p.subreddit||'')} · ${Number(p.score||0)} 分 · ${esc(age)}${comments?` · ${comments} 条可见评论`:''}</p>${body?`<p>${esc(body.slice(0,420))}${body.length>420?'…':''}</p>`:''}<div id="threadUnderstanding" class="muted"></div></article>`;
}
async function understandCurrent(){
  if(!currentThread||!threadContext)return;
  const box=$('#threadUnderstanding');
  if(box)box.textContent='正在生成中文理解…';
  try{
    const product=state.products.find(x=>x.active)||{};
    const context={...Object.fromEntries(Object.entries(state.persona).map(([k,v])=>[`persona_${k}`,v])),product_name:product.name||'',product_url:product.url||'',product_desc:product.desc||'',promo_mode:'none',tone:'casual',length:'medium',subreddit:currentThread.subreddit||'',subreddit_rules:'',thread_context:threadContext,user_idea:'',source_text:'',today:new Date().toLocaleDateString('sv-SE')};
    const r=await chrome.runtime.sendMessage({type:'RRH_RUN_PIPELINE',pipeline:'reply',context});
    if(!r.ok)throw new Error(r.error);
    const understanding=r.result?.data?.understanding_zh||'';
    if(box)box.innerHTML=understanding?`<strong>中文理解</strong><p>${esc(understanding)}</p>`:'';
    if(Array.isArray(r.result?.data?.drafts))cachedDrafts={data:r.result.data,usage:r.result.usage};
  }catch(err){
    if(box)box.textContent=`理解暂不可用：${err.message}`;
  }
}
function goDraft(){
  if(!currentThread)return;
  selectMode('reply');
  if(currentThread.subreddit)$('#generateForm').subreddit.value=currentThread.subreddit;
  showTab('drafts');
  if(cachedDrafts){renderResult(cachedDrafts.data,cachedDrafts.usage);setStatus('#generateStatus','已带入发现页的理解结果，可直接编辑或重新生成。');}
  else setStatus('#generateStatus','已带入当前讨论，点击生成草稿即可。');
}
function chooseThread(posts){return [...(posts||[])].sort((a,b)=>threadScore(b)-threadScore(a))[0]||null;}
function threadScore(post){const age=post.createdAt?Math.max(0,(Date.now()-post.createdAt)/3600000):72,comments=Number(post.comments||post.commentCount||post.existingComments?.length||0),score=Number(post.score||0);return (age<=12?24:age<=48?12:0)+(comments>=2&&comments<=80?20:comments>0?8:0)+Math.min(24,Math.log2(Math.max(1,score+1))*4)+(post.body?8:0);}
function serialize(p){return `SUBREDDIT: r/${p.subreddit||''}\nPOST TITLE: ${p.title||''}\nPOST BODY: ${(p.body||'').slice(0,4000)}\nPOST SCORE / AGE: ${p.score??'unknown'}, ${p.createdAt?Math.round((Date.now()-p.createdAt)/3600000)+' hours ago':'unknown'}\nTARGET: none\nTOP COMMENTS:\n${(p.existingComments||p.commentsList||[]).slice(0,5).map((x,i)=>`${i+1}. ${x.text||x}`).join('\n')}`.slice(0,6000)}
async function generate(e) {
  e.preventDefault();
  if (['polish','post'].includes(mode) && !pro) { $('#proDialog').showModal(); return; }
  const f=e.currentTarget, sub=f.subreddit.value.replace(/^r\//,'').trim(), product=state.products.find(x=>x.active)||{};
  if (mode==='reply' && !threadContext) await scan({understand:false});
  if (mode==='reply' && !threadContext) { setStatus('#generateStatus','请先打开 Reddit 讨论页，或在发现页点「理解当前讨论」。',true); return; }
  lastRules=null;
  if (pro && ['reply','post'].includes(mode) && sub) {
    const rr=await chrome.runtime.sendMessage({type:'RRH_GET_RULES',subreddit:sub}); lastRules=rr.rules;
    if (lastRules?.promoStance==='banned' && $('#promo').value==='direct' && !confirm('该版明确禁止自我推广，继续将有较高移除或封号风险。仍要生成吗？')) return;
  }
  const context={...Object.fromEntries(Object.entries(state.persona).map(([k,v])=>[`persona_${k}`,v])),product_name:product.name||'',product_url:product.url||'',product_desc:product.desc||'',promo_mode:$('#promo').value,tone:f.tone.value,length:f.length.value,subreddit:sub,subreddit_rules:lastRules?.raw||'',thread_context:threadContext,user_idea:f.input.value.trim(),source_text:f.input.value.trim(),today:new Date().toLocaleDateString('sv-SE')};
  setStatus('#generateStatus','正在生成…'); f.querySelector('button[type=submit]').disabled=true;
  try {
    const r=await chrome.runtime.sendMessage({type:'RRH_RUN_PIPELINE',pipeline:mode,context});
    if(!r.ok){if(r.raw)renderRawFailure(r.raw);throw new Error(r.error);}
    renderResult(r.result.data,r.result.usage); setStatus('#generateStatus','草稿已生成，请核对并编辑。');
  } catch(err) { setStatus('#generateStatus',err.message,true); }
  finally { f.querySelector('button[type=submit]').disabled=false; }
}
function renderResult(data,usage){const tokens=usage?.total_tokens||0;let cards=[];if(data.drafts)cards=data.drafts.map((x)=>({title:x.angle_zh,text:x.reply_en,note:`${x.reply_zh_gloss||''}\n${x.personalize_note_zh||''}\n${x.risk_notes_zh||''}`}));else if(data.candidates)cards=data.candidates.map((x)=>({title:x.title_en,text:`${x.title_en}\n\n${x.body_en}`,note:`${x.strategy_zh||''}\n${x.risk_notes_zh||''}`}));else if(data.reply_en)cards=[{title:'润色结果',text:data.reply_en,note:`回译：${data.back_translation_zh||''}\n${(data.adaptation_notes_zh||[]).join('\n')}`}];else cards=[{title:'中文理解',text:data.translation_zh||JSON.stringify(data,null,2),note:`${data.tone_zh||''}\n${(data.notes||[]).map(x=>`${x.span_en}：${x.note_zh}`).join('\n')}`}];const stance=lastRules?.promoStance?`<div class="card"><span class="badge ${esc(lastRules.promoStance)}">推广规则：${esc(lastRules.promoStance)}</span><p class="muted">${esc(lastRules.summary_zh||'')}</p></div>`:'';$('#results').innerHTML=stance+cards.map(c=>`<article class="card"><h3>${esc(c.title)}</h3><textarea rows="7">${esc(c.text)}</textarea><details><summary>中文说明</summary><p>${esc(c.note).replace(/\n/g,'<br>')}</p></details><div class="meta"><span>${tokens?`${tokens} tokens`:''}</span><button class="text-btn" data-copy>复制</button></div></article>`).join('');}
function renderRawFailure(raw){$('#results').innerHTML=`<article class="card"><h3>服务返回内容无法解析</h3><textarea rows="8" readonly>${esc(raw)}</textarea><p class="muted">可检查原始内容后再次点击“生成草稿”重试。</p></article>`;}
async function saveSettings(e){e.preventDefault();const f=e.currentTarget;const baseUrl=f.baseUrl.value.trim();try{const origin=new URL(baseUrl).origin+'/*';if(!origin.startsWith('https://'))throw new Error('Base URL 必须使用 HTTPS');const granted=await chrome.permissions.request({origins:[origin]});if(!granted)throw new Error('未授予所选 AI 服务的网络权限');state.settings.ai={baseUrl,model:f.model.value.trim(),apiKey:f.apiKey.value.trim()};state.settings.healthCardEnabled=f.healthCardEnabled.checked;state.persona={name:f.personaName.value.trim(),background:f.personaBackground.value.trim(),voice:f.personaVoice.value.trim(),taboos:f.personaTaboos.value.trim()};await persist();setStatus('#settingsStatus','已保存。');}catch(err){setStatus('#settingsStatus',err.message,true);}}
async function activate(){try{const r=await chrome.runtime.sendMessage({type:'RRH_ACTIVATE',key:$('#settingsForm').licenseKey.value.trim()});if(!r.ok)throw new Error(r.error);await refreshState();setStatus('#settingsStatus','Pro 已激活。');}catch(e){setStatus('#settingsStatus',e.message,true);}}
async function loadQueue(){
  const r=await chrome.runtime.sendMessage({type:'RRH_GET_QUEUE'});
  const all=r.queue||state?.todos||[],subs=[...new Set(all.map(x=>x.subreddit).filter(Boolean))],oldFilter=$('#queueFilter').value;
  $('#queueFilter').innerHTML='<option value="">全部</option>'+subs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');$('#queueFilter').value=oldFilter;
  const q=all.filter(x=>!oldFilter||x.subreddit===oldFilter);
  $('#queueList').innerHTML=q.length?q.map(x=>`<article class="card"><h3>${esc(x.title)}</h3><p class="muted">r/${esc(x.subreddit||'')} · ${x.status==='replied'?'已回复':x.status==='skipped'?'已跳过':'待处理'}</p><label class="field"><span>备注</span><input data-todo-note data-id="${esc(x.id)}" value="${esc(x.note||'')}"></label><div class="card-actions"><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(x.permalink)}">打开</a><button class="btn" data-locate-todo="${esc(x.id)}">定位</button><button class="btn" data-todo-status="replied" data-id="${esc(x.id)}">标记回复</button><button class="btn" data-todo-status="skipped" data-id="${esc(x.id)}">跳过</button></div></article>`).join(''):'<p class="muted">暂时没有待办。可从 Reddit 页面加入。</p>';
}
async function active(message){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)return null;try{return await chrome.tabs.sendMessage(tab.id,message);}catch{return null;}}
function setStatus(sel,text,error=false){const el=$(sel);el.textContent=text;el.classList.toggle('error',error);}
async function exportData(){if(!confirm('导出文件会明文包含 API Key，确认继续？'))return;const r=await chrome.runtime.sendMessage({type:'RRH_EXPORT'});download(r.json,'reddit-helper-backup.json','application/json');}
async function importData(e){const file=e.target.files[0];if(!file)return;try{const r=await chrome.runtime.sendMessage({type:'RRH_IMPORT',json:await file.text()});if(!r.ok)throw new Error(r.error);await refreshState();await loadQueue();setStatus('#settingsStatus','备份已导入。');}catch(err){setStatus('#settingsStatus',err.message,true);}}
function exportCsv(){if(!requirePro())return;const rows=[['title','subreddit','permalink','status','note','addedAt'],...(state.todos||[]).map(x=>[x.title,x.subreddit,x.permalink,x.status,x.note,x.addedAt])];download(rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n'),'reddit-todos.csv','text/csv');}
function download(text,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

async function persist(){await chrome.runtime.sendMessage({type:'RRH_V1_SET_STATE',state});}
async function stashCurrent(){if(!currentThread)return;if(!pro&&state.todos.filter(x=>x.status==='pending').length>=20){setStatus('#discoverStatus','Free 队列上限为 20 条。',true);return;}const id=`t_${currentThread.id||crypto.randomUUID()}`;if(!state.todos.some(item=>item.id===id))state.todos.unshift({id,title:currentThread.title||'当前讨论',subreddit:currentThread.subreddit||'',permalink:currentThread.url||currentThread.permalink||'',addedAt:Date.now(),status:'pending',note:''});await persist();$('#stashCurrent').textContent='已加入';setStatus('#discoverStatus','已加入待办。');}
function requirePro(){if(pro)return true;$('#proDialog').showModal();return false;}
function renderDiscoveries(){const rows=(state.discoveries||[]).filter(x=>x.source!=='monitor'&&!x.monitorId);$('#discoveries').innerHTML=rows.length?rows.map(x=>`<article class="card"><h3>${esc(x.title)}</h3><p class="muted">r/${esc(x.subreddit)} · ${Number(x.recommendScore||x.score||0)} 分 · ${esc(formatTime(x.createdAt))}</p>${(x.reasons||[]).length?`<p class="muted">${esc((x.reasons||[]).join(' · '))}</p>`:''}<div class="card-actions"><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(x.permalink)}">打开</a><button class="btn" data-add-discovery="${esc(x.id)}">加入待办</button></div></article>`).join(''):'<p class="muted">还没有实时发现。打开 Reddit 滚动刷帖，或点「立即扫描页面」。</p>';}
async function runMonitorNow(){if(!requirePro())return;if(!(state.monitors||[]).length){setStatus('#settingsStatus','先添加一条后台搜索。',true);return;}setStatus('#settingsStatus','正在检查…');const r=await chrome.runtime.sendMessage({type:'RRH_RUN_MONITORS'});if(!r.ok){setStatus('#settingsStatus',r.error,true);return;}await refreshState();setStatus('#settingsStatus',r.checked?`检查完成，新增 ${r.added} 条。`:'没有到期的后台搜索。');}
async function discoveryAction(e){const b=e.target.closest('[data-add-discovery]');if(!b)return;const item=state.discoveries.find(x=>x.id===b.dataset.addDiscovery);if(!item)return;if(!pro&&state.todos.filter(x=>x.status==='pending').length>=20){setStatus('#discoverStatus','Free 队列上限为 20 条。',true);return;}if(!state.todos.some(x=>x.id===`t_${item.id}`))state.todos.unshift({id:`t_${item.id}`,title:item.title,subreddit:item.subreddit,permalink:item.permalink,addedAt:Date.now(),status:'pending',note:''});item.unread=false;await persist();await loadQueue();b.textContent='已加入';}
function renderMonitors(){$('#monitorList').innerHTML=(state.monitors||[]).map(m=>`<article class="card"><strong>${esc(m.keyword)}</strong><p class="muted">${esc((m.subreddits||['all']).join(', '))} · 每 ${Math.max(15,Number(m.intervalMinutes||15))} 分钟 · ${m.enabled?'运行中':'已暂停'}${m.lastError?` · ${esc(m.lastError)}`:''}</p><div class="card-actions"><button class="text-btn" data-toggle-monitor="${esc(m.id)}">${m.enabled?'暂停':'启用'}</button><button class="text-btn" data-delete-monitor="${esc(m.id)}">删除</button></div></article>`).join('');}
async function addMonitor(e){e.preventDefault();if(!requirePro())return;const f=e.currentTarget;if(state.monitors.length>=20){setStatus('#settingsStatus','后台搜索最多 20 个。',true);return;}state.monitors.push({id:`m_${crypto.randomUUID()}`,keyword:f.keyword.value.trim(),subreddits:f.subreddits.value.split(',').map(x=>x.replace(/^r\//,'').trim()).filter(Boolean).slice(0,10),enabled:true,intervalMinutes:Math.max(15,Number(f.intervalMinutes.value||15)),lastRunAt:0,seenPostIds:[]});if(!state.monitors.at(-1).subreddits.length)state.monitors.at(-1).subreddits=['all'];await persist();f.reset();f.intervalMinutes.value=15;renderMonitors();}
async function monitorAction(e){const toggle=e.target.closest('[data-toggle-monitor]'),del=e.target.closest('[data-delete-monitor]');if(!toggle&&!del)return;const id=(toggle||del).dataset.toggleMonitor||(toggle||del).dataset.deleteMonitor;if(del)state.monitors=state.monitors.filter(x=>x.id!==id);else{const m=state.monitors.find(x=>x.id===id);m.enabled=!m.enabled;}await persist();renderMonitors();}
function renderProducts(){$('#productList').innerHTML=(state.products||[]).map(p=>`<article class="card"><strong>${esc(p.name||p.url)}</strong> ${p.active?'<span class="badge allowed">当前</span>':''}<p class="muted">${esc(p.desc||'')}</p><div class="card-actions"><button class="text-btn" data-active-product="${esc(p.id)}">设为当前</button><button class="text-btn" data-edit-product="${esc(p.id)}">编辑</button><button class="text-btn" data-delete-product="${esc(p.id)}">删除</button></div></article>`).join('');}
async function extractProduct(){const f=$('#productForm');if(!pro||!this.value||f.elements.name.value)return;setStatus('#settingsStatus','正在读取当前标签页信息…');const r=await chrome.runtime.sendMessage({type:'RRH_EXTRACT_PRODUCT',url:this.value});if(r?.ok){f.elements.name.value=r.title||'';f.elements.desc.value=r.description||'';setStatus('#settingsStatus','已预填当前页面信息，请确认。');}else setStatus('#settingsStatus','请在当前标签页打开该网址，或手动填写。');}
async function saveProduct(e){e.preventDefault();if(!requirePro())return;const f=e.currentTarget,fields=f.elements,id=fields.id.value||`p_${crypto.randomUUID()}`;if(!fields.id.value&&state.products.length>=10){setStatus('#settingsStatus','产品最多 10 个。',true);return;}const old=state.products.find(x=>x.id===id),product={id,name:fields.name.value.trim(),url:fields.url.value.trim(),desc:fields.desc.value.trim(),active:old?.active||state.products.length===0};state.products=state.products.filter(x=>x.id!==id);state.products.push(product);await persist();f.reset();renderProducts();}
async function productAction(e){const b=e.target.closest('[data-active-product],[data-edit-product],[data-delete-product]');if(!b)return;const id=b.dataset.activeProduct||b.dataset.editProduct||b.dataset.deleteProduct,p=state.products.find(x=>x.id===id);if(b.dataset.activeProduct){state.products.forEach(x=>x.active=x.id===id);await persist();await refreshState();}else if(b.dataset.deleteProduct){state.products=state.products.filter(x=>x.id!==id);if(!state.products.some(x=>x.active)&&state.products[0])state.products[0].active=true;await persist();renderProducts();}else{const f=$('#productForm').elements;f.id.value=p.id;f.name.value=p.name;f.url.value=p.url;f.desc.value=p.desc;}}
const variables=['persona_name','persona_background','persona_voice','persona_taboos','product_name','product_url','product_desc','promo_mode','tone','length','subreddit','subreddit_rules','thread_context','user_idea','source_text','today'];
function loadPromptEditor(){const type=$('#promptPipeline').value,override=state.settings.promptOverrides[type],updated=override&&override.basedOnVersion<PROMPTS[type].promptVersion;$('#promptEditor').value=override?.text||PROMPTS[type].template;$('#promptUpdate').textContent=updated?'官方模板已更新，可查看差异或恢复。':'';$('#promptDiff').classList.toggle('hidden',!updated);$('#promptDefault').textContent=updated?lineDiff(override.text,PROMPTS[type].template):'';$('#variableButtons').innerHTML=variables.map(v=>`<button type="button" class="chip" data-variable="${v}">${v}</button>`).join('');updatePromptCount();}
function lineDiff(oldText,newText){const oldLines=String(oldText||'').split('\n'),newLines=String(newText||'').split('\n'),out=[];for(let i=0;i<Math.max(oldLines.length,newLines.length);i+=1){if(oldLines[i]===newLines[i])out.push(`  ${newLines[i]||''}`);else{if(oldLines[i]!=null)out.push(`- ${oldLines[i]}`);if(newLines[i]!=null)out.push(`+ ${newLines[i]}`);}}return out.join('\n');}
function formatTime(value){if(!value)return '时间未知';return new Date(value).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function updatePromptCount(){$('#promptCount').textContent=`${$('#promptEditor').value.length} 字符`;}
async function savePrompt(){if(!requirePro())return;const type=$('#promptPipeline').value,text=$('#promptEditor').value.trim();if(!text){setStatus('#settingsStatus','模板不能为空。',true);return;}setStatus('#settingsStatus','正在用测试输入校验 JSON 输出…');const context=Object.fromEntries(variables.map(v=>[v,v==='source_text'?'A simple test.':v==='user_idea'?'这是测试观点':'test']));const r=await chrome.runtime.sendMessage({type:'RRH_VALIDATE_PROMPT',pipeline:type,text,basedOnVersion:PROMPTS[type].promptVersion,context});if(!r.ok){setStatus('#settingsStatus',`校验失败，未保存：${r.error}`,true);return;}state.settings.promptOverrides[type]={text,basedOnVersion:PROMPTS[type].promptVersion};await persist();setStatus('#settingsStatus','模板已通过干跑校验并保存。');}
async function restorePrompt(){if(!requirePro()||!confirm('确认恢复此管线的官方默认模板？'))return;state.settings.promptOverrides[$('#promptPipeline').value]=null;await persist();loadPromptEditor();setStatus('#settingsStatus','已恢复默认模板。');}
function renderTracking(){const list=state.sentReplies||[],now=Date.now(),day=list.filter(x=>now-x.sentAt<86400000),week=list.filter(x=>now-x.sentAt<7*86400000),ratio=week.length?Math.round(week.filter(x=>x.isPromo).length/week.length*100):0;$('#healthCard').hidden=state.settings.healthCardEnabled===false;$('#healthCard').innerHTML=`<strong>近 24 小时 ${day.length} 条</strong><p class="muted">近 7 天推广占比 ${ratio}%${day.length>10?' · 节奏偏快':''}${ratio>20?' · 推广比例偏高，Reddit 社区惯例约 1:10':''}</p>`;$('#trackingList').innerHTML=list.sort((a,b)=>b.lastScore-a.lastScore).map(x=>`<article class="card"><a target="_blank" href="${esc(x.permalink)}">r/${esc(x.subreddit)}</a><p class="muted">${x.lastScore} 分 · ${x.lastReplies} 条回复</p></article>`).join('');}
async function addTracking(e){e.preventDefault();if(!requirePro())return;const f=e.currentTarget,u=new URL(f.permalink.value);if(!['www.reddit.com','old.reddit.com'].includes(u.hostname)||!u.pathname.includes('/comments/')){setStatus('#settingsStatus','请输入 Reddit 回复链接。',true);return;}const sub=u.pathname.match(/\/r\/([^/]+)/)?.[1]||'';state.sentReplies.unshift({id:`c_${crypto.randomUUID()}`,permalink:u.href,subreddit:sub,sentAt:Date.now(),isPromo:f.isPromo.checked,lastScore:0,lastReplies:0,lastCheckedAt:0});await persist();f.reset();renderTracking();}
async function queueAction(e){const locate=e.target.closest('[data-locate-todo]');if(locate){const item=state.todos.find(x=>x.id===locate.dataset.locateTodo),postId=item?.permalink?.match(/\/comments\/([a-z0-9]+)/i)?.[1];if(!postId||!(await active({type:'RRH_HIGHLIGHT',postId}))?.ok)setStatus('#settingsStatus','请先在当前标签页打开该讨论。',true);return;}const b=e.target.closest('[data-todo-status]');if(!b)return;const item=state.todos.find(x=>x.id===b.dataset.id);if(!item)return;item.status=b.dataset.todoStatus;if(item.status==='replied'&&pro&&confirm('是否登记到效果追踪？')){state.sentReplies.unshift({id:`c_${crypto.randomUUID()}`,permalink:item.permalink,subreddit:item.subreddit,sentAt:Date.now(),isPromo:false,lastScore:0,lastReplies:0,lastCheckedAt:0});}await persist();loadQueue();}
async function queueNote(e){const input=e.target.closest('[data-todo-note]');if(!input)return;let item=state.todos.find(x=>x.id===input.dataset.id);if(!item)return;item.note=input.value.trim();await persist();}
