const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {writeJson}=require('./storage.cjs');

const hasContext=thread=>thread.messages.some(m=>m.role==='user'&&String(m.content||'').trim());
const now = () => new Date().toISOString();
function normalize(thread) {
  return {
    ...thread,
    createdAt: thread.createdAt || now(), updatedAt: thread.updatedAt || now(),
    projectId:thread.projectId===undefined?'default':thread.projectId,selected: thread.selected || [], draft: thread.draft || '',
    pendingAttachments:thread.pendingAttachments||thread.selected||[],
    research: thread.research || { query: '', results: [], pages: [] },
    memory: thread.memory || { summary: '', covered: 0 },
    messages: (thread.messages || []).map(m => ({ id: randomUUID(), createdAt: now(), status: 'complete', activities: [], ...m })),
  };
}

class ThreadStore {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'threads.json');
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (![2,3].includes(this.data.version) || !Array.isArray(this.data.threads)) throw Error('Unrecognized thread data. Your files have been preserved.');
      if(this.data.version===2&&!fs.existsSync(this.file+'.v2-backup'))fs.copyFileSync(this.file,this.file+'.v2-backup');
    } else {
      const legacy = path.join(dir, 'chats.json');
      this.data = { version: 2, activeId: null, threads: fs.existsSync(legacy) ? JSON.parse(fs.readFileSync(legacy, 'utf8')) : [] };
      // Keep the original chats.json intact as a migration backup.
    }
    this.data.threads = this.data.threads.map(normalize).filter(hasContext);
    this.data.version=3;this.data.projects ||= [{id:'default',name:'My project',createdAt:now(),activeThreadId:this.data.activeId}];
    for(const project of this.data.projects)if(project.sourceFolder?.state==='indexing'){project.sourceFolder.state='attention';project.sourceFolder.errors=['Indexing was interrupted. Refresh the source folder to finish.'];}
    if(this.data.activeProjectId===undefined)this.data.activeProjectId='default';
    for(const thread of this.data.threads)delete thread.webEnabled;
    for (const thread of this.data.threads) {
      for (const message of thread.messages) {
        if (['running','queued'].includes(message.status)) {
          message.status = 'interrupted';
          message.error = 'The app closed before this response finished. You can retry the request.';
          for (const activity of message.activities) if (activity.status === 'running') activity.status = 'interrupted';
        }
      }
    }
    if (!this.get(this.data.activeId)||this.get(this.data.activeId).projectId!==this.data.activeProjectId) this.data.activeId = this.list()[0]?.id || null;
    this.save();
  }
  save() {
    const threads=this.data.threads.filter(hasContext),ids=new Set(threads.map(t=>t.id));
    writeJson(this.file,{...this.data,threads,activeId:ids.has(this.data.activeId)?this.data.activeId:null,projects:this.data.projects.map(p=>({...p,activeThreadId:ids.has(p.activeThreadId)?p.activeThreadId:null}))});
  }
  get(id) { return this.data.threads.find(t => t.id === id); }
  require(id) { const t = this.get(id); if (!t||t.projectId!==this.data.activeProjectId) throw Error('This conversation is not in the active project.'); return t; }
  list() {
    return this.data.threads.filter(t=>hasContext(t)&&!t.archived&&t.projectId===this.data.activeProjectId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({id,title,updatedAt}) => ({id,title,updatedAt}));
  }
  recents(){return this.data.threads.filter(t=>hasContext(t)&&!t.archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({id,title,updatedAt,projectId,pinned})=>({id,title,updatedAt,projectId,pinned:!!pinned}));}
  activityList(){
    const items=[];
    for(const thread of this.data.threads)for(const message of thread.messages){
      if(message.role!=='assistant')continue;
      const last=message.activities?.at(-1);
      items.push({id:message.id,threadId:thread.id,title:thread.title,projectName:this.data.projects.find(p=>p.id===thread.projectId)?.name||'Standalone chat',status:message.status,detail:message.error||last?.label||'Response',time:message.completedAt||last?.finishedAt||last?.startedAt||message.createdAt});
    }
    for(const project of this.data.projects){const folder=project.sourceFolder;if(!folder)continue;items.push({id:'folder-'+folder.id,projectId:project.id,title:project.name+' · Source folder',projectName:project.name,status:folder.state==='indexing'?'running':folder.state==='ready'?'complete':'error',detail:folder.errors?.[0]||`${folder.count||0} files indexed`,time:folder.indexedAt||project.createdAt});}
    return items.sort((a,b)=>(b.time||'').localeCompare(a.time||'')).slice(0,50);
  }
  moveToProject(id,projectId){
    const thread=this.get(id),project=this.data.projects.find(p=>p.id===projectId);
    if(!thread||(projectId!==null&&!project))throw Error('Conversation or project not found.');
    const previous=this.data.projects.find(p=>p.id===thread.projectId);
    thread.projectId=projectId;thread.shareWithProject=projectId!==null;thread.updatedAt=now();
    if(previous&&previous.id!==projectId&&previous.activeThreadId===id)previous.activeThreadId=this.data.threads.find(t=>!t.archived&&t.projectId===previous.id)?.id||null;
    if(project)project.activeThreadId=id;
    if(this.data.activeId===id)this.data.activeProjectId=projectId;
    this.save();return thread;
  }
  projectTree(){return this.data.projects.map(p=>({...p,threads:this.data.threads.filter(t=>hasContext(t)&&!t.archived&&t.projectId===p.id).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({id,title,updatedAt,pinned,projectId})=>({id,title,updatedAt,pinned:!!pinned,projectId}))}));}
  search(query='') {
    const term=String(query).trim().toLowerCase().slice(0,200);
    return this.data.threads.filter(t=>hasContext(t)&&!t.archived)
      .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
      .flatMap(t=>{const hit=t.messages.find(m=>m.content?.toLowerCase().includes(term));if(term&&!t.title.toLowerCase().includes(term)&&!hit)return[];
        const text=hit?.content||t.messages.find(m=>m.content)?.content||'';const start=term?Math.max(0,text.toLowerCase().indexOf(term)-45):0;
        return [{id:t.id,title:t.title,excerpt:(start?'…':'')+text.slice(start,start+160),updatedAt:t.updatedAt}];}).slice(0,100);
  }
  create(projectId=this.data.activeProjectId) {
    if(projectId!==null&&!this.data.projects.some(p=>p.id===projectId))throw Error('Project not found.');
    const thread = normalize({ id: randomUUID(),projectId, title: 'New conversation', messages: [] });
    this.data.threads.unshift(thread);this.activate(thread.id);return thread;
  }
  activate(id) { const thread = this.get(id);if(!thread)throw Error('Conversation not found.');this.data.activeProjectId=thread.projectId; this.data.activeId = id;if(this.project())this.project().activeThreadId=id; this.save(); return thread; }
  project(){return this.data.projects.find(p=>p.id===this.data.activeProjectId);}
  createProject(name){name=String(name||'').trim().slice(0,100);if(!name)throw Error('Enter a project name.');const project={id:randomUUID(),name,createdAt:now(),activeThreadId:null};this.data.projects.push(project);this.activateProject(project.id);return project;}
  activateProject(id){const project=this.data.projects.find(p=>p.id===id);if(!project)throw Error('Project not found.');this.data.activeProjectId=id;this.data.activeId=this.get(project.activeThreadId)?.projectId===id&&!this.get(project.activeThreadId)?.archived?project.activeThreadId:this.list()[0]?.id||null;this.save();return project;}
  renameProject(name){name=String(name||'').trim().slice(0,100);if(!name)throw Error('Enter a project name.');this.project().name=name;this.save();return this.project();}
  update(id, patch) {
    const thread = this.require(id);
    if (typeof patch.title === 'string' && patch.title.trim()) thread.title = patch.title.trim().slice(0,100);
    if (typeof patch.draft === 'string') thread.draft = patch.draft.slice(0,4000);
    if (Array.isArray(patch.selected)) thread.selected = [...new Set(patch.selected.filter(s => typeof s === 'string'))];
    if (Array.isArray(patch.pendingAttachments))thread.pendingAttachments=[...new Set(patch.pendingAttachments.filter(id=>thread.selected.includes(id)))];
    if(hasContext(thread))this.save(); return thread;
  }
  archiveList(){return this.data.threads.filter(t=>hasContext(t)&&t.archived).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({id,title,projectId,pinned})=>({id,title,projectId,pinned:!!pinned,archived:true}));}
  manage(id,patch){
    const thread=this.get(id);if(!thread||!hasContext(thread))throw Error('Saved conversation not found.');
    if(typeof patch.title==='string'){const title=patch.title.trim().slice(0,100);if(!title)throw Error('Enter a conversation name.');thread.title=title;}
    if(typeof patch.pinned==='boolean')thread.pinned=patch.pinned;
    if(typeof patch.archived==='boolean'){thread.archived=patch.archived;if(thread.archived)this.detachActive(id);}
    this.save();return thread;
  }
  pinProject(id,pinned){const project=this.data.projects.find(p=>p.id===id);if(!project)throw Error('Project not found.');if(typeof pinned!=='boolean')throw Error('Invalid pin setting.');project.pinned=pinned;this.save();return project;}
  detachActive(id){
    for(const project of this.data.projects)if(project.activeThreadId===id)project.activeThreadId=this.data.threads.find(t=>t.id!==id&&!t.archived&&hasContext(t)&&t.projectId===project.id)?.id||null;
    if(this.data.activeId===id)this.data.activeId=this.list().find(t=>t.id!==id)?.id||null;
  }
  remove(id) {
    if(!this.get(id))throw Error('Conversation not found.');
    this.detachActive(id);this.data.threads=this.data.threads.filter(t=>t.id!==id);this.save();
  }
  begin(id, content, attachments=[]) {
    const thread = this.require(id);
    if (!thread.messages.length && thread.title === 'New conversation') thread.title = content.slice(0,55);
    const user = { id: randomUUID(), role: 'user', content, attachments:attachments.map(({id,name})=>({id,name})), createdAt: now(), status: 'complete' };
    const assistant = { id: randomUUID(), role: 'assistant', content: '', sources: [], activities: [], status: 'running', createdAt: now() };
    thread.messages.push(user, assistant); thread.draft = '';thread.pendingAttachments=[]; thread.updatedAt = now(); this.save();
    return { thread, user, assistant };
  }
}
module.exports = { ThreadStore };
