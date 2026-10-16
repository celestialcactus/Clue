const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const {Library}=require('../src/library.cjs'),{ThreadStore}=require('../src/threads.cjs'),{ProjectLibraries}=require('../src/projects.cjs'),{syncSourceFolder}=require('../src/source-folders.cjs');
test('source folders index nested documents, update stable references, remove deleted files and preserve unavailable caches',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'desk-folders-'));try{
  const source=path.join(root,'source');fs.mkdirSync(path.join(source,'sub'),{recursive:true});fs.mkdirSync(path.join(source,'node_modules'));fs.writeFileSync(path.join(source,'node_modules','ignored.txt'),'Ignore this');fs.writeFileSync(path.join(source,'image.png'),'not a document');
  const file=path.join(source,'sub','Policy.txt');fs.writeFileSync(file,'Inspect exits on Friday.');fs.writeFileSync(path.join(source,'Duplicate.txt'),'Inspect exits on Friday.');
  const store=new ThreadStore(path.join(root,'profile')),project=store.createProject('Work');project.sourceFolder={id:randomUUID(),path:fs.realpathSync(source)};
  const libs=new ProjectLibraries(path.join(root,'profile'),null,store),library=libs.getFolder(project.id,project.sourceFolder.id);let progress=0;
  await syncSourceFolder(project,library,{save:()=>store.save(),progress:()=>progress++});assert.equal(project.sourceFolder.state,'ready');assert.equal(library.list().length,2);assert.equal(progress,2);const id=library.docs.find(d=>d.sourcePath===file).id;
  const chat=store.create();assert.equal(libs.getThread(chat).list().length,2);const standalone=store.create(null);assert.equal(libs.getThread(standalone).list().length,0);
  fs.writeFileSync(file,'Inspect exits on Monday.');fs.unlinkSync(path.join(source,'Duplicate.txt'));await syncSourceFolder(project,library);assert.equal(library.list().length,1);assert.equal(library.docs[0].id,id);assert.match(library.read(id)[0].text,/Monday/);assert.equal(library.list()[0].name,path.join('sub','Policy.txt'));
  assert.equal(fs.readFileSync(file,'utf8'),'Inspect exits on Monday.');fs.renameSync(source,source+'-offline');await syncSourceFolder(project,library);assert.equal(project.sourceFolder.state,'unavailable');assert.equal(library.list().length,1);assert.match(library.read(id)[0].text,/Monday/);
  store.save();const restored=new ThreadStore(path.join(root,'profile'));assert.equal(restored.data.projects.find(p=>p.id===project.id).sourceFolder.state,'unavailable');
  fs.renameSync(source+'-offline',source);fs.writeFileSync(file,'');await syncSourceFolder(project,library);assert.equal(project.sourceFolder.state,'attention');assert.equal(library.list().length,1,'Keep prior copy when parsing fails');assert.match(library.read(id)[0].text,/Monday/);
  project.sourceFolder=null;assert.equal(libs.getThread(chat).list().length,0);assert.ok(fs.existsSync(file),'Disconnecting never deletes source files');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
