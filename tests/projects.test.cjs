const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {ThreadStore}=require('../src/threads.cjs');const {ProjectLibraries}=require('../src/projects.cjs');const {Library}=require('../src/library.cjs');
const {hybridRank,words}=require('../src/retrieval.cjs');const {buildDocumentQuery,validatePublicQuery}=require('../src/search-query.cjs');
test('projects isolate files, notes, retrieval and threads across restart; migrate legacy library',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-projects-'));try{
  const file=path.join(dir,'Legacy.txt');fs.writeFileSync(file,'Weekly exit inspections.');await new Library(path.join(dir,'library')).import(file);
  let store=new ThreadStore(dir);let libraries=new ProjectLibraries(dir);const first=store.create();store.begin(first.id,'First project question');const original=libraries.get('default').list()[0];assert.ok(original);
  const p=store.createProject('Training');const second=store.create();store.begin(second.id,'Second project question');assert.deepEqual(libraries.get(p.id).list(),[]);assert.throws(()=>store.require(first.id));assert.throws(()=>libraries.get(p.id).read(original.id));
  const id=await libraries.get(p.id).saveNote(null,'Training.md','Safety instruction on Friday.');assert.match(libraries.get(p.id).noteText(id),/Friday/);assert.equal((await libraries.get('default').search('Friday')).length,0);
  await libraries.get(p.id).saveNote(id,'Training.md','Safety instruction on Monday.');assert.match((await libraries.get(p.id).search('Monday'))[0].text,/Monday/);
  store=new ThreadStore(dir);libraries=new ProjectLibraries(dir);assert.equal(store.data.activeId,second.id);assert.equal(store.data.activeProjectId,p.id);assert.equal(libraries.get(p.id).list().length,1);
  store.activateProject('default');assert.equal(store.data.activeId,first.id);assert.equal(store.list().length,1);assert.ok(fs.existsSync(path.join(dir,'library','library.json')));
  const saved=libraries.get(p.id).originalPath(id);libraries.get(p.id).remove(id);assert.equal(fs.existsSync(saved),false);assert.throws(()=>libraries.get('../escape'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('version 2 migration preserves backup and associates existing chats with default project',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-v2-'));try{const old=JSON.stringify({version:2,activeId:'a',threads:[{id:'a',title:'Old',messages:[{role:'user',content:'Old question'}],webEnabled:false}]});fs.writeFileSync(path.join(dir,'threads.json'),old);const store=new ThreadStore(dir);assert.equal(store.require('a').projectId,'default');assert.equal(store.data.version,3);assert.equal(fs.readFileSync(path.join(dir,'threads.json.v2-backup'),'utf8'),old);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('hybrid retrieval combines exact terms and semantic candidates and diversifies duplicates',()=>{
 const passage=(key,text,vector)=>{const tokens=words(text),freq={};tokens.forEach(t=>freq[t]=(freq[t]||0)+1);return {key,id:key,text,tokens,freq,vector};};
 const results=hybridRank('hazard gloves',[1,0],[passage('a','hazard gloves',[1,0]),passage('duplicate','hazard gloves',[1,0]),passage('b','protective hand equipment',[.8,.6]),passage('c','holiday payroll',[0,1])],3);
 assert.equal(results[0].id,'a');assert.equal(results[1].id,'b');assert.equal(results.some(r=>r.id==='c'),false);assert.equal(results[0].vector,undefined);
});
test('document research abstracts public topics locally and rejects known private identifiers',async()=>{
 const text='Acme LLC\nContact: jane@example.com\nProject: Mango\nOSHA 29 CFR 1910.1200 hazard communication and safety data sheets.';
 assert.equal(validatePublicQuery('Acme LLC hazard communication',text),'');assert.equal(validatePublicQuery('Mango safety rules',text),'');assert.equal(validatePublicQuery('jane@example.com safety',text),'');
 let prompt;const query=await buildDocumentQuery({message:'Check this SOP against current rules',intent:{query:''},passages:[{text}],projectName:'Mango',runtime:{complete:async m=>{prompt=JSON.stringify(m);return JSON.stringify({topic:'hazard communication safety data sheets',standard:'OSHA 29 CFR 1910.1200',jurisdiction:''});}},signal:AbortSignal.timeout(1000)});
 assert.match(query,/hazard communication/);assert.doesNotMatch(prompt,/jane@example.com|Acme LLC|Project: Mango/);
 const fallback=await buildDocumentQuery({message:'Check this SOP',intent:{query:''},passages:[{text}],runtime:{complete:async()=>'{"topic":"Acme LLC"}'},signal:AbortSignal.timeout(1000)});assert.match(fallback,/OSHA/);assert.doesNotMatch(fallback,/Acme/);
});
