const {test}=require('node:test');const assert=require('node:assert/strict');
const {runAgent}=require('../src/agent.cjs');const {executeWorkflow}=require('../src/workflow.cjs');
const budget={contextSize:8192,countMessages:async m=>Math.ceil(JSON.stringify(m).length/4),fitText:async(t,n)=>t.slice(0,n*4)};
const stale='I am sorry, but I do not have any specific source material or previous conversations to reference for this question. The phrase Whats good my ninja does not provide enough context.';
const library={list:()=>[{id:'doc',name:'Guide.pdf'}],read:()=>[{id:'doc',name:'Guide.pdf',part:1,total:50,text:'OWASP Generative AI Incident Response Guide. Purpose: prepare for and respond to AI incidents.'}],search:()=>[{id:'doc',name:'Guide.pdf',part:40,total:50,text:'Semantic similarity detection monitors variations of attack patterns.'}]};
test('fresh document research uses opening identity and the exact current request, without replaying stale answers',async()=>{
 const message='Mind searching the web for the latest content in this file?',assistant={id:'new',activities:[]};
 const thread={selected:['doc'],research:{query:'',pages:[],results:[]},memory:{summary:'OLD_GREETING',covered:2},messages:[{role:'user',content:'Whats good my ninja?',status:'complete'},{role:'assistant',content:stale,status:'complete'},{role:'user',content:message,status:'complete'},assistant]};
 const prompts=[],queries=[],deltas=[];let answers=0;
 const runtime={...budget,complete:async(m,_s,json)=>{prompts.push(m);if(json)return m[0].content.includes('PUBLIC research topic')?JSON.stringify({topic:'behavioral detection',publicTitle:'Generative AI Incident Response Guide'}):'{"action":"answer"}';return ++answers===1?stale:'The OWASP guide covers preparation and response to AI incidents [S1].';}};
 const result=await executeWorkflow({thread,assistant,message,library,runtime,signal:new AbortController().signal,onDelta:s=>deltas.push(s),searchWeb:async q=>{queries.push(q);return[];},readWeb:()=>assert.fail()});
 assert.match(queries[0],/OWASP.*Generative AI Incident Response Guide.*latest/);assert.doesNotMatch(queries[0],/behavioral/);
 const final=prompts.filter(m=>m.at(-1).content===message);assert.equal(final.length,2);assert.doesNotMatch(JSON.stringify(final),/ninja|OLD_GREETING/);assert.equal(thread.memory.summary,'OLD_GREETING','Task-local isolation must not corrupt compacted history');
 assert.doesNotMatch(result.answer,/ninja/);assert.equal(deltas.join(''),result.answer);assert.ok(assistant.activities.some(a=>a.kind==='verify'));
});
test('repeated stale response fails visibly instead of attaching citations to it',async()=>{
 const deltas=[];await assert.rejects(runAgent({message:'Search this file online',history:[{role:'assistant',content:stale}],library,runtime:{...budget,complete:async(_m,_s,json)=>json?'{"action":"answer"}':stale},selected:['doc'],intent:{goal:'research',documents:true,documentInformed:true},signal:new AbortController().signal,onDelta:s=>deltas.push(s)}),/repeated an earlier answer/);assert.deepEqual(deltas,[]);
});
