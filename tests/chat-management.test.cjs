const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ThreadStore}=require('../src/threads.cjs'),{ProjectLibraries}=require('../src/projects.cjs'),{projectHistory}=require('../src/project-memory.cjs');
test('pin, rename, archive, restore and removal preserve ownership and inactive chat selection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'clue-management-'));
 try{
  const store=new ThreadStore(root),libs=new ProjectLibraries(root,null,store),a=store.createProject('A'),owner=store.create(a.id);store.begin(owner.id,'Launch on November 8').assistant.status='complete';
  const id=await libs.getThread(owner).saveNote(null,'Schedule.md','Launch on November 8');store.moveToProject(owner.id,a.id);
  const viewer=store.create(a.id);store.begin(viewer.id,'When is launch?').assistant.status='complete';
  store.manage(owner.id,{title:'Schedule',pinned:true});store.pinProject(a.id,true);assert.equal(store.data.activeId,viewer.id);assert.equal(store.projectTree()[1].pinned,true);assert.ok(store.recents().find(t=>t.id===owner.id).pinned);
  assert.ok(libs.getThread(viewer).list().some(d=>d.id===id));store.manage(owner.id,{archived:true});assert.equal(store.data.activeId,viewer.id);assert.ok(!store.recents().some(t=>t.id===owner.id));assert.deepEqual(store.search('Schedule'),[]);assert.equal(libs.getThread(viewer).list().length,0);assert.deepEqual(projectHistory(store,viewer.id,'launch'),[]);assert.equal(store.archiveList()[0].id,owner.id);
  store.manage(owner.id,{archived:false});assert.ok(libs.getThread(viewer).list().some(d=>d.id===id));store.moveToProject(owner.id,null);assert.equal(owner.shareWithProject,false);assert.equal(libs.getThread(viewer).list().length,0);assert.equal(libs.getThread(owner).read(id)[0].text,'Launch on November 8');assert.equal(store.data.activeId,viewer.id);
  const reload=new ThreadStore(root);assert.equal(reload.get(owner.id).projectId,null);assert.equal(reload.get(owner.id).pinned,true);assert.equal(reload.data.projects.find(p=>p.id===a.id).pinned,true);reload.remove(owner.id);assert.equal(reload.data.activeId,viewer.id);assert.equal(reload.get(owner.id),undefined);
  reload.manage(viewer.id,{archived:true});assert.equal(reload.data.activeId,null);assert.equal(reload.data.projects.find(p=>p.id===a.id).activeThreadId,null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
