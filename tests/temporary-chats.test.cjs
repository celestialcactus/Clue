const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ThreadStore}=require('../src/threads.cjs');
test('blank chats and unsent drafts stay temporary; first submitted turn saves exactly once',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'desk-temporary-'));
 try{
  const store=new ThreadStore(root),project=store.createProject('Work');
  for(const projectId of [null,project.id]){
   const blank=store.create(projectId);store.update(blank.id,{draft:'Unsent draft',title:'Unsent title',selected:['file'],pendingAttachments:['file']});
   assert.equal(store.recents().length,0);assert.equal(store.search('Unsent').length,0);assert.equal(store.projectTree().find(p=>p.id===project.id).threads.length,0);
   const disk=JSON.parse(fs.readFileSync(store.file));assert.deepEqual(disk.threads,[]);assert.equal(disk.activeId,null);assert.ok(disk.projects.every(p=>p.activeThreadId===null));
   assert.equal(new ThreadStore(root).get(blank.id),undefined);
  }
  const chat=store.create(null);const {assistant}=store.begin(chat.id,'Hello');assert.equal(store.recents().length,1);assert.equal(JSON.parse(fs.readFileSync(store.file)).threads.length,1);
  assistant.status='error';assistant.error='Test failure';store.save();store.update(chat.id,{draft:'Next draft'});store.create(null);
  const again=new ThreadStore(root);assert.equal(again.get(chat.id).messages[0].content,'Hello');assert.equal(again.get(chat.id).draft,'Next draft');assert.equal(again.recents().length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
