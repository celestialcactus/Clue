const {Runtime}=require('../src/runtime.cjs');const {runAgent}=require('../src/agent.cjs');const {Library}=require('../src/library.cjs');const path=require('node:path');const fs=require('node:fs');
const r=new Runtime(path.resolve('assets'));
(async()=>{
 const starting=r.start();const timer=setInterval(()=>console.log(r.state, r.diagnostics?.slice(-600)),15000);await starting;clearInterval(timer);console.log(r.state);if(!r.ready)throw Error(r.diagnostics||r.state);
 console.log(await r.complete([{role:'user',content:'Reply with exactly: Local model works.'}],AbortSignal.timeout(90000)));
 const dir=path.resolve('.test-data');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'sample.txt'),'The emergency contact is Morgan. Fire drills are held every Tuesday at 10 AM. The assembly point is the north parking lot.');
 const library=new Library(path.join(dir,'library'));await library.import(path.join(dir,'sample.txt'));
 const result=await runAgent({message:'When are fire drills held, and where should we assemble?',library,runtime:r,signal:AbortSignal.timeout(180000),onStep:console.log});console.log(JSON.stringify(result,null,2));if(!/Tuesday/i.test(result.answer))throw Error('Answer did not retrieve the known fact.');r.stop();
})().catch(e=>{console.error(e);r.stop();process.exitCode=1;});
