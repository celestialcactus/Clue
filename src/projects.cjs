const fs=require('node:fs');const path=require('node:path');const {Library}=require('./library.cjs');
class ProjectLibraries{
 constructor(root,embedder){this.root=path.join(root,'projects');this.embedder=embedder;this.cache=new Map();fs.mkdirSync(this.root,{recursive:true});
  const legacy=path.join(root,'library'),dest=path.join(this.root,'default','library');
  if(fs.existsSync(path.join(legacy,'library.json'))&&!fs.existsSync(dest)){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(legacy,dest,{recursive:true});}
 }
 getThread(thread){if(!thread)throw Error('No conversation selected.');const key='chat-'+thread.id;if(!this.cache.has(key))this.cache.set(key,new Library(path.join(this.root,'..','conversations',thread.id,'library'),this.embedder));return new ConversationLibrary(this.cache.get(key),thread.projectId?this.get(thread.projectId):null);}
 get(id){if(!/^(default|[a-f0-9-]{36})$/.test(id))throw Error('Invalid project identifier.');if(!this.cache.has(id))this.cache.set(id,new Library(path.join(this.root,id,'library'),this.embedder));return this.cache.get(id);}
}
// Imports remain private to a conversation. Only explicit project drops enter shared storage.
class ConversationLibrary {
 constructor(local,shared){this.local=local;this.shared=shared;this.embedder=local.embedder;}
 get docs(){return [...this.local.docs,...(this.shared?.docs||[])];}
 list(){return [...this.local.list().map(d=>({...d,scope:'chat'})),...(this.shared?.list()||[]).map(d=>({...d,scope:'project'}))];}
 owner(id){if(this.local.docs.some(d=>d.id===id))return this.local;if(this.shared?.docs.some(d=>d.id===id))return this.shared;throw Error('File not available in this conversation.');}
 import(file){return this.local.import(file);}
 remove(id){this.owner(id).remove(id);this.index=null;}
 read(id,offset){return this.owner(id).read(id,offset);}
 originalPath(id){return this.owner(id).originalPath(id);}
 noteText(id){return this.owner(id).noteText(id);}
 saveNote(id,name,text){this.index=null;return (id?this.owner(id):this.local).saveNote(id,name,text);}
 async indexDocument(doc){await this.owner(doc.id).indexDocument(doc);this.index=null;}
 search(query,ids){this.index=null;return Library.prototype.search.call(this,query,ids);}
}
module.exports={ProjectLibraries};
