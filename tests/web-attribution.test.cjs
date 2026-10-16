const {test}=require('node:test'),assert=require('node:assert/strict');const {runAgent,attributionIssues}=require('../src/agent.cjs');
const doc={id:'local',name:'Procedure',part:1,total:1,text:'Inspect exits every Friday.'};
const library={list:()=>[{id:doc.id,name:doc.name}],search:()=>[doc],read:()=>[doc]};
const web=Array.from({length:4},(_,i)=>({title:'Public source '+i,url:'https://example.com/source-'+i,text:i===0?'Search snippet only: Inspect exits regularly.':'Public inspection guidance '+i,retrieved:'2026-10-16T12:00:00Z'}));
test('web attribution retries local-only citations and retains every cited public reference',async()=>{
 let answers=0;const activities=[],deltas=[];
 const result=await runAgent({message:'Compare the procedure with current public guidance',library,web,runtime:{complete:async(messages,_signal,json)=>{if(json)return '{"action":"answer"}';assert.match(JSON.stringify(messages),/URL: https:/);assert.match(messages[0].content,/Web claims must cite PUBLIC WEB/);return ++answers===1?'Inspect every Friday [S1].':'Local: inspect every Friday [S1]. Public guidance describes regular checks [S2]. Further guidance [S3] [S4] [S5].';}},signal:new AbortController().signal,activity:async(kind,_label,fn)=>{activities.push(kind);return fn();},onDelta:d=>deltas.push(d)});
 assert.equal(answers,2);assert.ok(activities.includes('attribution'));assert.equal(result.answer,deltas.join(''));assert.match(result.answer,/Web · example.com · retrieved 2026-10-16 · search snippet only/);assert.ok(result.answer.includes('https://example.com/source-3'));assert.doesNotMatch(result.answer,/Attribution incomplete/);
});
test('failed attribution is explicit and never fabricates inline web citations',async()=>{
 const result=await runAgent({message:'Compare with the web',library,web:web.slice(0,1),runtime:{complete:async(_m,_s,json)=>json?'{"action":"answer"}':'Current requirements are covered by the local document [S1].'},signal:new AbortController().signal});
 assert.match(result.answer,/Attribution incomplete/);assert.match(result.answer,/Web sources consulted/);assert.match(result.answer,/not verified support/);assert.ok(!result.answer.split('### Supporting passages')[0].includes('[S2]'));
 assert.deepEqual(attributionIssues('Claim [S99]',[{citation:'S1',url:'https://example.com'}]),['unknown citation','missing web citation']);
});
