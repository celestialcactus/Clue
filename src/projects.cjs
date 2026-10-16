const fs=require('node:fs');const path=require('node:path');const {Library}=require('./library.cjs');
class ProjectLibraries{
 constructor(root,embedder){this.root=path.join(root,'projects');this.embedder=embedder;this.cache=new Map();fs.mkdirSync(this.root,{recursive:true});
  const legacy=path.join(root,'library'),dest=path.join(this.root,'default','library');
  if(fs.existsSync(path.join(legacy,'library.json'))&&!fs.existsSync(dest)){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(legacy,dest,{recursive:true});}
 }
 get(id){if(!/^(default|[a-f0-9-]{36})$/.test(id))throw Error('Invalid project identifier.');if(!this.cache.has(id))this.cache.set(id,new Library(path.join(this.root,id,'library'),this.embedder));return this.cache.get(id);}
}
module.exports={ProjectLibraries};
