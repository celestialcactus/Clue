const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ThreadStore}=require('../src/threads.cjs');const {ChatQueue}=require('../src/chat-queue.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('background queue captures scope, serializes inference, cancels independently and persists',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clue-queue-'));const store=new ThreadStore(dir),gates=[],calls=[],events=[];
 const queue=new ChatQueue({store,emit:e=>events.push(structuredClone(e)),run:job=>new Promise((resolve,reject)=>{calls.push(job);gates.push(resolve);job.signal.addEventListener('abort',()=>reject(Error('aborted')));})});
 try{
  const a=store.create(null);queue.enqueue({thread:a,message:'A question',library:{scope:'A'}});await tick();
  const project=store.createProject('B project'),b=store.create(project.id);queue.enqueue({thread:b,message:'B question',library:{scope:'B'}});
  assert.equal(calls.length,1);assert.equal(b.messages[1].status,'queued');assert.throws(()=>queue.enqueue({thread:b,message:'duplicate'}),/already/);
  store.update(b.id,{draft:'Next B question'});store.create(null);
  gates[0]({answer:'Only A',sources:[]});await tick();await tick();
  assert.equal(calls.length,2);assert.equal(calls[1].library.scope,'B');assert.equal(a.messages[1].content,'Only A');assert.equal(b.draft,'Next B question');assert.equal(store.get(store.data.activeId).messages.length,0);
  const c=store.create(null);queue.enqueue({thread:c,message:'C question'});queue.cancel(c.id);assert.equal(c.messages[1].status,'stopped');assert.equal(calls[1].signal.aborted,false);
  queue.cancel(b.id);await tick();await tick();assert.equal(b.messages[1].status,'stopped');assert.equal(queue.busy,false);assert.equal(calls.length,2);
  assert.equal(events.filter(e=>e.type==='finished').length,3);
  const d=store.create(null);queue.enqueue({thread:d,message:'Pending at shutdown'});const reloaded=new ThreadStore(dir);assert.equal(reloaded.get(d.id).messages[1].status,'interrupted');
 }finally{queue.close();await tick();fs.rmSync(dir,{recursive:true,force:true});}
});
