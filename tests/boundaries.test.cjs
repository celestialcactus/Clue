const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ThreadStore}=require('../src/threads.cjs'),{ProjectLibraries}=require('../src/projects.cjs'),{readCompletionStream,repetitionCut}=require('../src/runtime.cjs');
test('standalone chats persist outside projects; attachments remain private until explicitly shared',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'desk-boundaries-'));
 try{
  const store=new ThreadStore(root),libraries=new ProjectLibraries(root),project=store.createProject('Work'),a=store.create(),b=store.create();
  const file=path.join(root,'private.txt');fs.writeFileSync(file,'PRIVATE_ALPHA weekly inspection');const id=await libraries.getThread(a).import(file);
  assert.equal(libraries.getThread(a).list().length,1);assert.equal(libraries.getThread(b).list().length,0);assert.throws(()=>libraries.getThread(b).read(id));assert.equal((await libraries.getThread(b).search('PRIVATE_ALPHA')).length,0);
  const solo=store.create(null);assert.equal(solo.projectId,null);assert.ok(!store.projectTree().some(p=>p.threads.some(t=>t.id===solo.id)));assert.ok(store.recents().some(t=>t.id===solo.id));
  await libraries.getThread(solo).import(file);const solo2=store.create(null);assert.equal(libraries.getThread(solo2).list().length,0);
  await libraries.get(project.id).import(file);assert.equal(libraries.getThread(b).list()[0].scope,'project');assert.ok((await libraries.getThread(b).search('PRIVATE_ALPHA')).length);assert.equal(libraries.getThread(solo2).list().length,0);
  const restored=new ThreadStore(root);assert.equal(restored.get(solo2.id).projectId,null);assert.equal(restored.data.activeProjectId,null);assert.equal(new ProjectLibraries(root).getThread(restored.get(solo.id)).list().length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('stream stops repeated passages across arbitrary chunks and releases the iterator',async()=>{
 const phrase='The project is open to contributors and sponsors who can join the community Slack channel. ';
 for(const chunkSize of [3,99999]){
  let closed=false;async function* stream(){try{const text=phrase.repeat(12);for(let i=0;i<text.length;i+=chunkSize)yield Buffer.from('data: '+JSON.stringify({choices:[{delta:{content:text.slice(i,i+chunkSize)}}]})+'\n\n');yield Buffer.from('data: [DONE]\n\n');}finally{closed=true;}}
  const deltas=[];const answer=await readCompletionStream(stream(),s=>deltas.push(s),new AbortController().signal);
  assert.match(answer,/Generation stopped because/);assert.equal(answer,deltas.join(''));assert.ok(answer.length<phrase.length*5);assert.ok(closed);
 }
 assert.equal(repetitionCut('Yes. '.repeat(10)),null,'Short repeated words alone are not a long loop');
 assert.equal(repetitionCut(phrase.repeat(2)),null,'Two quotations should not trip the guard');
});
