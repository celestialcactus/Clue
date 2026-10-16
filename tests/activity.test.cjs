const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ThreadStore}=require('../src/threads.cjs');
test('activity lists responses and indexing without exposing drafts or message content',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'clue-activity-'));try{
  const store=new ThreadStore(root),blank=store.create(null);store.update(blank.id,{draft:'Unsent secret'});assert.deepEqual(store.activityList(),[]);
  const chat=store.create(null),{assistant}=store.begin(chat.id,'Test request');assistant.content='Private response body';assistant.activities.push({label:'Writing answer',status:'running',startedAt:'2026-10-16T20:00:00Z'});assert.equal(store.activityList()[0].status,'running');
  assistant.status='error';assistant.error='Model stopped';assistant.completedAt='2026-10-16T20:01:00Z';store.save();const item=store.activityList()[0];assert.equal(item.threadId,chat.id);assert.equal(item.detail,'Model stopped');assert.ok(!JSON.stringify(store.activityList()).includes('Private response body'));assert.ok(!JSON.stringify(store.activityList()).includes('Unsent secret'));
  const project=store.createProject('Files');project.sourceFolder={id:'folder',state:'ready',count:2,indexedAt:'2026-10-16T20:02:00Z'};store.save();assert.equal(store.activityList()[0].projectId,project.id);assert.equal(new ThreadStore(root).activityList().length,2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
