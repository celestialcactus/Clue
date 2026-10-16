const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ThreadStore}=require('../src/threads.cjs'),{ProjectLibraries}=require('../src/projects.cjs'),{readCompletionStream,repetitionCut}=require('../src/runtime.cjs');
const {projectHistory}=require('../src/project-memory.cjs');
test('dropping a thread shares its files and history only with its current project and survives restart',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'desk-move-'));
 try{
  const store=new ThreadStore(root),libraries=new ProjectLibraries(root,null,store);
  const a=store.createProject('A'),receiver=store.create(),b=store.createProject('B'),other=store.create(),source=store.create(null);
  const file=path.join(root,'Launch.txt');fs.writeFileSync(file,'Launch date November 8.');const id=await libraries.getThread(source).import(file);
  store.begin(source.id,'Our launch date is November 8.').assistant.status='complete';store.update(source.id,{selected:[id],pendingAttachments:[id],draft:'Draft stays intact'});
  const separate=store.create(null);assert.deepEqual(projectHistory(store,separate.id,'launch date'),[]);
  store.moveToProject(source.id,a.id);assert.equal(store.data.activeId,separate.id,'Moving an inactive chat does not switch chats');
  store.activate(receiver.id);assert.ok(projectHistory(store,receiver.id,'launch date').some(s=>s.threadId===source.id));assert.equal(libraries.getThread(receiver).read(id)[0].text,'Launch date November 8.');assert.equal(libraries.getThread(other).list().length,0);
  store.moveToProject(source.id,b.id);assert.deepEqual(projectHistory(store,receiver.id,'launch date'),[]);assert.throws(()=>libraries.getThread(receiver).read(id));
  store.activate(source.id);store.moveToProject(source.id,a.id);assert.equal(store.data.activeProjectId,a.id);assert.equal(store.get(source.id).draft,'Draft stays intact');assert.deepEqual(store.get(source.id).selected,[id]);
  const restored=new ThreadStore(root),again=new ProjectLibraries(root,null,restored);assert.equal(restored.get(source.id).shareWithProject,true);assert.equal(again.getThread(restored.get(receiver.id)).list()[0].id,id);
  const added=await again.getThread(restored.get(source.id)).saveNote(null,'Later.md','A later update');assert.ok(again.getThread(restored.get(receiver.id)).list().some(d=>d.id===added),'Future attachments are shared too');
  assert.throws(()=>restored.moveToProject(source.id,'missing'));restored.remove(source.id);assert.equal(again.getThread(restored.get(receiver.id)).list().length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
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
