const fs=require('node:fs/promises'),path=require('node:path');
const supported=new Set(['.pdf','.docx','.txt','.md','.csv']);
const ignored=new Set(['node_modules','vendor','dist','build','__pycache__']);
// Read source files only. Indexes and managed preview copies live in the app profile.
async function syncSourceFolder(project,library,{save=()=>{},progress=()=>{}}={}){
 const folder=project.sourceFolder;if(!folder)return;
 folder.state='indexing';folder.errors=[];save();
 const files=[],seen=new Set();let skipped=0,bytes=0,entries=0,complete=true;
 const errors=[];
 try{
  const root=await fs.realpath(folder.path);if(root!==folder.path)throw Error('The folder location changed. Choose the source folder again.');
  async function walk(dir){
   for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    if(++entries>10000)throw Error('Folder scan limit reached (10,000 entries). Choose a smaller source folder.');
    if(entry.isSymbolicLink()||entry.name.startsWith('.')||ignored.has(entry.name.toLowerCase())){skipped++;continue;}
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()){try{await walk(file);}catch(e){complete=false;errors.push(e.message);if(entries>10000)return;}}
    else if(entry.isFile()&&supported.has(path.extname(file).toLowerCase())){
     seen.add(file);const stat=await fs.stat(file);
     if(stat.size>40*1024*1024){errors.push(path.relative(root,file)+': exceeds 40 MB');continue;}
     if(files.length>=500||bytes+stat.size>200*1024*1024){complete=false;errors.push('Index limit reached (500 documents / 200 MB). Choose a smaller source folder.');return;}
     bytes+=stat.size;files.push(file);
    }else skipped++;
   }
  }
  await walk(root);
  for(let i=0;i<files.length;i++){
   const file=files[i],name=path.relative(root,file);progress({projectId:project.id,label:`Indexing ${i+1} of ${files.length}: ${name}`});
   try{await library.import(file,{sourcePath:file,displayName:name});}
   catch(e){errors.push(name+': '+e.message);}
  }
  // Do not discard cached files after a partial scan or an unavailable folder.
  if(complete)for(const doc of [...library.docs])if(doc.sourcePath&&!seen.has(doc.sourcePath))library.remove(doc.id);
  folder.state=errors.length?'attention':'ready';folder.indexedAt=new Date().toISOString();
 }catch(e){folder.state='unavailable';errors.push(e.message);}
 folder.count=library.list().length;folder.skipped=skipped;folder.errors=[...new Set(errors)].slice(0,30);save();return folder;
}
module.exports={syncSourceFolder};
