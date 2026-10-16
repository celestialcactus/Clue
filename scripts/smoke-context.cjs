const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {Runtime}=require('../src/runtime.cjs');const {ThreadStore}=require('../src/threads.cjs');const {executeWorkflow}=require('../src/workflow.cjs');
const runtime=new Runtime(path.resolve('assets'));
(async()=>{
 const dir=path.resolve('.test-data/context-'+Date.now());fs.mkdirSync(dir,{recursive:true});let store=new ThreadStore(dir);let thread=store.create();
 const messages=['The launch date we agreed on is November 8. Please remember it.','I will remember November 8 as the launch date.','Use short plain-language answers.','Understood.','We are preparing a short training session.','We can work on the training session.','There are six people attending.','There are six attendees.','We will discuss safety procedures.','We can discuss the safety procedures.'];
 for(let i=0;i<12;i++)messages.push('Training preparation background. '+ 'Discuss the attendance arrangements and the training room setup. '.repeat(65));
 thread.messages=messages.map((content,i)=>({id:'fixture-'+i,role:i%2?'assistant':'user',content,status:'complete',activities:[]}));store.save();
 await runtime.start();assert.ok(runtime.ready,runtime.state);const message='What date did we agree on for the launch?';const {assistant}=store.begin(thread.id,message);
 const result=await executeWorkflow({thread,assistant,message,library:{list:()=>[],search:()=>[],read:()=>[]},runtime,signal:AbortSignal.timeout(600000),save:()=>store.save(),onActivity:a=>{if(a.status==='running')console.log(a.label);},searchWeb:()=>assert.fail('No web search expected'),readWeb:()=>assert.fail('No web read expected')});
 assistant.content=result.answer;assistant.status='complete';store.save();assert.match(result.answer,/November\s+8/i);assert.ok(thread.memory.summary.length>0);assert.ok(thread.memory.covered>0);
 store=new ThreadStore(dir);thread=store.get(thread.id);assert.match(thread.memory.summary,/November\s+8/i);assert.equal(thread.messages.at(-1).content,result.answer);
 console.log('PASS: real-model rolling memory, older-fact recall, and persisted context after reopening.');console.log(result.answer);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>runtime.stop());
