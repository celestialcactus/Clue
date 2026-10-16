const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {ThreadStore}=require('../src/threads.cjs');const {routeIntent,publicQuery}=require('../src/intents.cjs');
const {executeWorkflow}=require('../src/workflow.cjs');const {readCompletionStream}=require('../src/runtime.cjs');
const {compactForPrompt}=require('../src/context.cjs');
const budgetModel={contextSize:8192,countMessages:async m=>Math.ceil(JSON.stringify(m).length/4),fitText:async(t,n)=>t.slice(0,n*4)};
const signal=()=>new AbortController().signal;
const emptyLibrary={list:()=>[],search:()=>[],read:()=>[]};
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-thread-'));const store=new ThreadStore(dir);return {dir,store,thread:store.create(),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};}
function model(answer='Here is the answer [S1].'){
 return {...budgetModel,complete:async(messages,_signal,json,onDelta)=>{if(json)return messages[0].content.includes('PUBLIC research topic')?'{"topic":"OSHA requirements"}':'{"action":"answer"}';onDelta?.(answer);return answer;}};
}

test('routes public search, compound tasks, follow-ups and explicit offline requests',()=>{
 const cases=[
  ['Search the web for OSHA hazard communication then compare it with my SOP.','web_and_documents','OSHA hazard communication'],
  ['Can you search online for OSHA rules?','web','OSHA rules'],
  ['Look up OSHA requirements','web','OSHA requirements'],
  ['What are the latest OSHA requirements?','web','What are the latest OSHA requirements'],
  ['Summarize our document then search the web for OSHA rules','web_and_documents','OSHA rules'],
 ];
 for(const [message,route,query] of cases){const intent=routeIntent({message});assert.equal(intent.route,route,message);assert.equal(intent.query,query,message);}
 assert.equal(routeIntent({message:'What about in California?',previousQuery:'OSHA hazard communication'}).query,'OSHA hazard communication California');
 assert.equal(routeIntent({message:'Do not search the web. Summarize my document.'}).requestedWeb,false);
 assert.equal(routeIntent({message:'Search the web for OSHA'}).query,'OSHA');
 assert.equal(routeIntent({message:'Use only project files to check compliance'}).requestedWeb,false);
 assert.equal(routeIntent({message:'Summarize the current uploaded report'}).requestedWeb,false);
 assert.equal(routeIntent({message:'Show the latest version of my SOP'}).requestedWeb,false);
});

test('ambiguous private-document searches never produce an outgoing query',()=>{
 assert.equal(publicQuery('Search the web for the contents of my confidential document'), '');
 assert.equal(routeIntent({message:'Search the web for that'}).query,'');
 assert.ok(routeIntent({message:'Search the web for that'}).clarification);
 assert.equal(publicQuery('Search the web for OSHA and compare with our confidential Project Mango document'),'OSHA');
 assert.equal(routeIntent({message:'OSHA requirements',pendingWeb:true}).query,'OSHA requirements');
 assert.equal(routeIntent({message:'Never mind',pendingWeb:true}).requestedWeb,false);
});

test('migrates old chats without changing original and isolates persistent thread state',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-migrate-'));
 try{const old=JSON.stringify([{id:'old',title:'Original',messages:[{role:'user',content:'Keep this'}]}]);fs.writeFileSync(path.join(dir,'chats.json'),old);
  const store=new ThreadStore(dir);assert.equal(store.get('old').messages[0].content,'Keep this');assert.equal(fs.readFileSync(path.join(dir,'chats.json'),'utf8'),old);
  const a=store.create();store.begin(a.id,'Existing question');store.update(a.id,{selected:['doc-a'],draft:'Unsent draft',webEnabled:false,title:'Thread A'});a.memory={summary:'Private thread A memory',covered:2};a.research={query:'Public A',results:[{url:'https://example.com'}],pages:[]};store.save();
  const b=store.create();assert.deepEqual(b.selected,[]);assert.equal(b.memory.summary,'');assert.equal(b.research.query,'');
  store.activate(a.id);const reopened=new ThreadStore(dir);assert.equal(reopened.data.activeId,a.id);assert.equal(reopened.get(a.id).draft,'Unsent draft');assert.equal(reopened.get(a.id).webEnabled,undefined);assert.equal(reopened.get(a.id).memory.summary,'Private thread A memory');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('interrupted requests survive restart with partial response and task history',()=>{
 const f=fixture();try{const {assistant}=f.store.begin(f.thread.id,'Do several things');assistant.content='Partial response';assistant.activities.push({id:'step',label:'Reading',status:'running'});f.store.save();
  const reopened=new ThreadStore(f.dir).get(f.thread.id);assert.equal(reopened.messages[0].content,'Do several things');assert.equal(reopened.messages[1].status,'interrupted');assert.equal(reopened.messages[1].content,'Partial response');assert.equal(reopened.messages[1].activities[0].status,'interrupted');
 }finally{f.cleanup();}
});

test('corrupt thread store fails without overwriting its data',()=>{
 const f=fixture();try{fs.writeFileSync(path.join(f.dir,'threads.json'),'broken data');assert.throws(()=>new ThreadStore(f.dir));assert.equal(fs.readFileSync(path.join(f.dir,'threads.json'),'utf8'),'broken data');}finally{f.cleanup();}
});

test('compound workflow executes search, reads, local retrieval, narration and streaming in order',async()=>{
 const f=fixture();try{
  f.thread.selected=['doc'];const message='Search the web for OSHA requirements then compare with my SOP';const {assistant}=f.store.begin(f.thread.id,message);const events=[],calls=[],deltas=[];
  const library={list:()=>[{id:'doc',name:'Internal SOP.txt'}],search:()=>[{id:'doc',name:'Internal SOP.txt',part:1,total:1,text:'PRIVATE_VALUE_738: inspect gloves weekly'}],read:()=>[]};
  const result=await executeWorkflow({thread:f.thread,assistant,message,library,runtime:model(),signal:signal(),save:()=>f.store.save(),onActivity:e=>events.push(e),onDelta:d=>deltas.push(d),searchWeb:async q=>{calls.push(['search',q]);assert.equal(q,'OSHA requirements');return [{title:'Official rule',url:'https://example.com',text:'Search snippet'}];},readWeb:async url=>{calls.push(['read',url]);return {title:'Official rule',url,text:'Public requirement',retrieved:new Date().toISOString()};}});
  assert.deepEqual(calls.map(c=>c[0]),['search','read']);assert.ok(events.find(e=>e.kind==='web_search'&&e.status==='running'));assert.ok(events.find(e=>e.kind==='web_search'&&e.status==='complete'));assert.ok(events.find(e=>e.kind==='documents'));assert.ok(result.sources.some(s=>s.documentId==='doc'));assert.ok(result.sources.some(s=>s.url));assert.equal(deltas.join(''),result.answer);assert.equal(new ThreadStore(f.dir).get(f.thread.id).research.pages.length,1);
 }finally{f.cleanup();}
});

test('follow-up reuses persisted public evidence offline and passes earlier conversation to the model',async()=>{
 const f=fixture();try{
  f.thread.webEnabled=false;f.thread.research={query:'OSHA',results:[{title:'Rule',url:'https://example.com',text:'Snippet'}],pages:[{title:'Rule',url:'https://example.com',sourceUrl:'https://example.com',text:'Saved rule'}]};f.thread.messages=[{role:'user',content:'Use plain language',status:'complete'},{role:'assistant',content:'We found a rule',status:'complete',sources:[]}];f.store.save();
  const message='Summarize that in two bullets';const {assistant}=f.store.begin(f.thread.id,message);let prompt;
  await executeWorkflow({thread:f.thread,assistant,message,library:emptyLibrary,runtime:{...budgetModel,complete:async messages=>{prompt=messages;return 'Summary';}},signal:signal(),searchWeb:()=>{throw Error('Must not search');},readWeb:()=>{throw Error('Must not fetch');}});
  assert.ok(JSON.stringify(prompt).includes('Saved rule'));assert.ok(JSON.stringify(prompt).includes('Use plain language'));
 }finally{f.cleanup();}
});

test('search failure is narrated and given to answer generation; cancellation stops the chain',async()=>{
 const f=fixture();try{
  const message='Search the web for OSHA';const {assistant}=f.store.begin(f.thread.id,message);let prompt;const events=[];
  await executeWorkflow({thread:f.thread,assistant,message,library:emptyLibrary,runtime:{...budgetModel,complete:async m=>{prompt=m;return 'Search was unavailable';}},signal:signal(),onActivity:e=>events.push(e),searchWeb:async()=>{throw Error('Provider unavailable');},readWeb:()=>assert.fail('No pages to read')});
  assert.ok(events.some(e=>e.kind==='web_search'&&e.status==='failed'));assert.match(JSON.stringify(prompt),/Provider unavailable/);
  const controller=new AbortController();const second=f.store.begin(f.thread.id,message).assistant;let called=false;
  await assert.rejects(executeWorkflow({thread:f.thread,assistant:second,message,library:emptyLibrary,runtime:{...budgetModel,complete:()=>{called=true;}},signal:controller.signal,searchWeb:async()=>{controller.abort();return[];},readWeb:()=>assert.fail()}));assert.equal(called,false);
 }finally{f.cleanup();}
});

test('capacity-based compaction retains transcript and recent exact turns',async()=>{
 const history=Array.from({length:14},(_,i)=>({role:i%2?'assistant':'user',content:i===0?'Our launch date is November 8. '+ 'detail '.repeat(400):'Earlier turn '+i+' '+ 'detail '.repeat(400),status:'complete'}));
 const original=JSON.stringify(history),thread={memory:{summary:'',covered:0}};let calls=0;
 const compose=(recent,summary)=>[{role:'system',content:summary},...recent,{role:'user',content:'What date?'}];
 const runtime={...budgetModel,complete:async()=>{calls++;return 'User launch date: November 8.';}};
 const result=await compactForPrompt({thread,history,runtime,signal:signal(),activity:async(_k,_l,fn)=>fn(),compose,evidence:[]});
 assert.ok(calls>0);assert.ok(thread.memory.covered>0);assert.match(thread.memory.summary,/November 8/);assert.equal(JSON.stringify(history),original);assert.ok(result.messages.some(m=>m.content===history.at(-1).content));assert.ok(thread.contextBudget.inputTokens+1256<=8192);
 calls=0;await compactForPrompt({thread:{memory:{summary:'',covered:0}},history:history.slice(-2),runtime,signal:signal(),activity:async(_k,_l,fn)=>fn(),compose,evidence:[]});assert.equal(calls,0,'Short chats must not be compacted');
});

test('SSE parser handles fragmented UTF-8, completion and truncated responses',async()=>{
 const bytes=Buffer.from('data: {"choices":[{"delta":{"content":"Hello 🌎"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\ndata: [DONE]\n\n');
 async function* stream(){for(let i=0;i<bytes.length;i+=3)yield bytes.subarray(i,i+3);}
 const deltas=[];assert.equal(await readCompletionStream(stream(),s=>deltas.push(s),signal()),'Hello 🌎!');assert.equal(deltas.join(''),'Hello 🌎!');
 async function* truncated(){yield Buffer.from('data: {"choices":[{"delta":{"content":"Partial"}}]}\n');}
 await assert.rejects(readCompletionStream(truncated(),()=>{},signal()),/before the answer finished/);
});

test('greetings do not inherit project evidence',()=>{for(const message of ['Hello there','Hi!','Good morning']){const intent=routeIntent({message,hasLibrary:true,selected:['doc'],hadSources:true});assert.equal(intent.documents,false);assert.equal(intent.smallTalk,true);assert.equal(intent.requestedWeb,false);}});

test('ordinary chat sends the original question without an empty research wrapper',async()=>{
 const f=fixture();try{
  const message='Whats good my ninja ?';const {assistant}=f.store.begin(f.thread.id,message);let prompt;
  await executeWorkflow({thread:f.thread,assistant,message,library:emptyLibrary,runtime:{...budgetModel,complete:async m=>{prompt=m;return 'Hey! What can I help with?';}},signal:signal()});
  assert.equal(prompt.at(-1).content,message);assert.doesNotMatch(prompt.at(-1).content,/Source material|REQUIRED RESPONSE|earlier conversation/);
  assert.match(prompt[0].content,/Respond naturally/);
 }finally{f.cleanup();}
});

test('new conversations do not inherit actions, selected files, memory or web research',async()=>{
 const f=fixture();try{
  f.thread.selected=['old-doc'];f.thread.pendingAttachments=['old-doc'];f.thread.memory={summary:'OLD_PRIVATE_CONTEXT',covered:2};
  f.thread.research={query:'Old research',results:[{url:'https://example.com',text:'OLD_PRIVATE_CONTEXT'}],pages:[]};
  const old=f.store.begin(f.thread.id,'Read my document').assistant;old.activities.push({id:'old-action',kind:'documents',status:'complete',label:'Old document search'});old.content='OLD_PRIVATE_CONTEXT';old.status='complete';f.store.save();
  const fresh=f.store.create();assert.deepEqual(fresh.messages,[]);assert.deepEqual(fresh.selected,[]);assert.deepEqual(fresh.pendingAttachments,[]);assert.equal(fresh.memory.summary,'');assert.equal(fresh.research.query,'');
  for(const message of ['Hello there','Explain how rainbows form']){
   const {assistant}=f.store.begin(fresh.id,message);let prompt;
   const result=await executeWorkflow({thread:fresh,assistant,message,library:{list:()=>[{id:'old-doc',name:'Old file.txt'}],search:()=>assert.fail('Unrelated document retrieval'),read:()=>assert.fail('Unrelated file read')},runtime:{...model('Hello!'),complete:async m=>{prompt=m;return 'Hello!';}},getProjectHistory:()=>[],signal:signal(),searchWeb:()=>assert.fail('Unrelated web search')});
   assert.deepEqual(result.sources,[]);assert.ok(!JSON.stringify(prompt).includes('OLD_PRIVATE_CONTEXT'));assert.deepEqual(assistant.activities.map(a=>a.kind),['route','route','answer']);assistant.status='complete';assistant.content=result.answer;
  }
  assert.equal(old.activities[0].id,'old-action','Keep the historical action log in its original conversation');
 }finally{f.cleanup();}
});
