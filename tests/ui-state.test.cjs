const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {ThreadStore}=require('../src/threads.cjs');const {writeJson}=require('../src/storage.cjs');
test('chat search finds message content, includes standalone and project chats and does not change active chat',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-search-'));try{const store=new ThreadStore(dir);const a=store.create();store.update(a.id,{title:'Training plan'});a.messages=[{role:'user',content:'Reference Silver-Orchid for the launch.'}];store.save();const b=store.create();store.createProject('Separate');const hidden=store.create();store.update(hidden.id,{title:'Silver-Orchid private'});store.activateProject('default');const before=fs.readFileSync(store.file,'utf8');assert.equal(store.search('silver-orchid').length,2);assert.match(store.search('silver-orchid').find(t=>t.id===a.id).excerpt,/Silver-Orchid/);assert.equal(store.search('training')[0].id,a.id);assert.equal(store.search('nothing').length,0);assert.equal(store.data.activeId,b.id);assert.equal(fs.readFileSync(store.file,'utf8'),before);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('atomic JSON replacement retries a transient lock and preserves original on permanent error',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-atomic-')),file=path.join(dir,'state.json'),rename=fs.renameSync;try{
  writeJson(file,{value:'old'});let tries=0;fs.renameSync=(a,b)=>{if(tries++===0)throw Object.assign(Error('Locked'),{code:'EPERM'});return rename(a,b)};writeJson(file,{value:'new'});assert.equal(tries,2);assert.equal(JSON.parse(fs.readFileSync(file)).value,'new');
  fs.renameSync=()=>{throw Object.assign(Error('Failure'),{code:'EIO'})};assert.throws(()=>writeJson(file,{value:'not saved'}),/Failure/);assert.equal(JSON.parse(fs.readFileSync(file)).value,'new');
 }finally{fs.renameSync=rename;fs.rmSync(dir,{recursive:true,force:true});}
});
