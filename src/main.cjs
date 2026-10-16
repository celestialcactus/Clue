const {app,BrowserWindow,ipcMain,dialog,session,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs');
const {Runtime}=require('./runtime.cjs');const {Embeddings}=require('./embeddings.cjs');const {ProjectLibraries}=require('./projects.cjs');
const {ThreadStore}=require('./threads.cjs');const {projectHistory}=require('./project-memory.cjs');const {executeWorkflow}=require('./workflow.cjs');

const {ChatQueue}=require('./chat-queue.cjs');
const {searchWeb,readWeb}=require('./web.cjs');
const {randomUUID}=require('node:crypto');const {syncSourceFolder}=require('./source-folders.cjs');const folderChoices=new Map();
const processStartedAt=Number(process.env.DESK_DEV_STARTED)||Date.now();
let win,library,libraries,embedder,runtime,store,jobs,importing=false;
// Keep the existing profile when changing the display/product name.
const legacyProfiles=['Desk Assistant','desk-assistant'].map(name=>path.join(app.getPath('appData'),name));
app.setPath('userData',legacyProfiles.find(dir=>fs.existsSync(path.join(dir,'threads.json')))||legacyProfiles[1]);app.setName('Clue');
if(!app.isPackaged&&process.env.DESK_TEST_PROFILE)app.setPath('userData',path.resolve(process.env.DESK_TEST_PROFILE));
const locked=app.requestSingleInstanceLock();
if(!locked)app.quit();
app.on('second-instance',()=>{win?.restore();win?.focus();});
function idle(){if(jobs?.busy||importing)throw Error('Please stop or finish the current task first.');}
function navigable(){if(importing)throw Error('Please wait for file indexing to finish.');}
function attachable(thread){navigable();if(jobs.has(thread.id)||thread.shareWithProject&&jobs.busy)throw Error('Wait for this chat’s active request before changing its files.');}
function emit(payload){if(win&&!win.isDestroyed())win.webContents.send('thread-event',payload);}

if(locked)app.whenReady().then(()=>{
 if(!app.isPackaged){try{require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../scripts/build-ui.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'pipe'});}catch(e){dialog.showErrorBox('UI build failed',String(e.stderr||e.message));app.quit();return;}}
 app.setAppUserModelId('local.desk.assistant');
 const dir=app.getPath('userData');
 const assets=app.isPackaged?process.resourcesPath:path.join(__dirname,'../assets');
 try{store=new ThreadStore(dir);embedder=new Embeddings(assets);libraries=new ProjectLibraries(dir,embedder,store);if(!store.data.activeId)store.create(null);library=libraries.getThread(store.get(store.data.activeId));}
 catch(e){dialog.showErrorBox('Local data could not be opened',e.message+'\nExisting data has not been replaced.');app.quit();return;}
 runtime=new Runtime(assets);
 jobs=new ChatQueue({store,emit,run:job=>executeWorkflow({...job,runtime,searchWeb,readWeb})});
 if(!app.isPackaged&&process.env.DESK_DEV_RELOAD){const reloadFile=path.join(dir,'reload.request');let seen=processStartedAt;fs.watchFile(reloadFile,{interval:500},stat=>{if(stat.mtimeMs>seen){seen=stat.mtimeMs;app.quit();}});app.on('before-quit',()=>fs.unwatchFile(reloadFile));}
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file://')}));
 win=new BrowserWindow({width:1440,height:900,minWidth:950,minHeight:650,backgroundColor:'#f8f7f4',title:'Clue',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'ui/index.html'));
 runtime.start().catch(e=>{runtime.state='Unable to start local model: '+e.message;});
 const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Unauthorized request');return fn(...args);});
 handle('activity-list',()=>store.activityList());
 handle('status',()=>({ready:!!runtime.ready,state:runtime.state,model:'Qwen2.5 · 1.5B · Q4',retrievalState:embedder.state,documents:library.list(),chats:store.list(),activeId:store.data.activeId,projects:store.projectTree(),recents:store.recents(),activeProjectId:store.data.activeProjectId}));
 const folderChoice=token=>{if(!token)return null;const folderPath=folderChoices.get(token);if(!folderPath)throw Error('Choose the folder again.');if(!fs.statSync(folderPath).isDirectory())throw Error('Source folder is unavailable.');return {id:randomUUID(),path:folderPath,state:'pending',count:0,errors:[]};};
 const syncFolder=async project=>syncSourceFolder(project,libraries.getFolder(project.id,project.sourceFolder.id),{save:()=>store.save(),progress:event=>emit({type:'folder-progress',...event})});
 handle('folder-choose',async()=>{idle();const result=await dialog.showOpenDialog(win,{title:'Choose a project source folder',properties:['openDirectory']});if(result.canceled||!result.filePaths.length)return null;const folderPath=fs.realpathSync(result.filePaths[0]),token=randomUUID();folderChoices.set(token,folderPath);return {token,path:folderPath,name:path.basename(folderPath)};});
 handle('project-create',async payload=>{idle();const data=typeof payload==='string'?{name:payload}:payload;if(!data||typeof data.name!=='string')throw Error('Enter a project name.');const folder=folderChoice(data.folderToken);const project=store.createProject(data.name);project.sourceFolder=folder;store.save();const thread=store.create();library=libraries.getThread(thread);importing=true;try{if(folder)await syncFolder(project);return thread;}finally{importing=false;library=libraries.getThread(thread);}});
 handle('project-source-update',async(id,payload)=>{idle();const project=store.data.projects.find(p=>p.id===id);if(!project)throw Error('Project not found.');let folder=payload.folderToken?folderChoice(payload.folderToken):null;if(folder?.path===project.sourceFolder?.path)folder=project.sourceFolder;const name=String(payload.name||'').trim().slice(0,100);if(!name)throw Error('Enter a project name.');project.name=name;if(folder||payload.detachFolder)project.sourceFolder=folder;store.save();importing=true;try{if(folder)await syncFolder(project);return project;}finally{importing=false;library=libraries.getThread(store.get(store.data.activeId));}});
 handle('project-source-refresh',async id=>{idle();const project=store.data.projects.find(p=>p.id===id);if(!project?.sourceFolder)throw Error('No source folder selected.');importing=true;try{return await syncFolder(project);}finally{importing=false;library=libraries.getThread(store.get(store.data.activeId));}});
 handle('project-source-open',async id=>{const folder=store.data.projects.find(p=>p.id===id)?.sourceFolder;if(!folder)throw Error('No source folder selected.');const error=await shell.openPath(folder.path);if(error)throw Error(error);});
 handle('project-load',(id,threadId)=>{navigable();if(threadId&&store.get(threadId)?.projectId!==id)throw Error('Conversation not found in this project.');store.activateProject(id);const thread=threadId?store.activate(threadId):store.data.activeId?store.activate(store.data.activeId):store.create();library=libraries.getThread(thread);return thread;});
 handle('chat-move', (id,projectId)=>{idle();const moved=store.moveToProject(id,projectId);library=libraries.getThread(store.get(store.data.activeId));return moved;});
 handle('project-drop',async(projectId,files,documentId)=>{
  idle();if(!store.data.projects.some(p=>p.id===projectId))throw Error('Project not found.');
  if(!Array.isArray(files)||files.length>20||(!files.length&&!documentId))throw Error('Drop between 1 and 20 documents.');
  const target=libraries.get(projectId),errors=[];let imported=0;importing=true;
  try{if(documentId){const doc=library.list().find(d=>d.id===documentId);if(!doc)throw Error('File not available in this chat.');const id=await target.import(library.originalPath(documentId));target.docs.find(d=>d.id===id).name=doc.name;target.save();imported++;}
   for(const file of files){try{if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Invalid file path.');await target.import(file);imported++;}catch(e){errors.push(path.basename(String(file))+': '+e.message);}}
   return {imported,errors};
  }finally{importing=false;}
 });
 handle('project-rename',name=>{idle();return store.renameProject(name);});
 handle('import',async chatId=>{
  const thread=store.require(chatId);attachable(thread);const target=libraries.getThread(thread);importing=true;
  try{const result=await dialog.showOpenDialog(win,{title:'Add documents',properties:['openFile','multiSelections'],filters:[{name:'Documents',extensions:['pdf','docx','txt','md','csv']}]});const errors=[],ids=[];
   for(const file of result.filePaths){try{ids.push(await target.import(file));}catch(e){errors.push(path.basename(file)+': '+e.message);}}
   thread.selected=[...new Set([...thread.selected,...ids])];thread.pendingAttachments=[...new Set([...thread.pendingAttachments,...ids])];store.save();return {documents:target.list(),selected:thread.selected,pendingAttachments:thread.pendingAttachments,errors};
  }finally{importing=false;}
 });
 handle('remove',id=>{idle();if(library.list().find(d=>d.id===id)?.sourcePath)throw Error('This is a source-folder file. Change the source folder contents and refresh, or disconnect the folder.');library.remove(id);for(const t of store.data.threads.filter(t=>t.id===store.data.activeId||store.data.activeProjectId&&t.projectId===store.data.activeProjectId))t.selected=t.selected.filter(d=>d!==id);store.save();return library.list();});
 handle('import-dropped',async(files,chatId)=>{
  const thread=store.require(chatId);attachable(thread);const target=libraries.getThread(thread);
  if(!Array.isArray(files)||!files.length||files.length>20)throw Error('Drop between 1 and 20 documents at a time.');
  importing=true;const errors=[],ids=[];
  try{for(const file of files){try{if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Could not read this file. Drag it from File Explorer.');ids.push(await target.import(file));}catch(e){errors.push((typeof file==='string'&&file?path.basename(file)+': ':'')+e.message);}}
   thread.selected=[...new Set([...thread.selected,...ids])];thread.pendingAttachments=[...new Set([...thread.pendingAttachments,...ids])];store.save();return {documents:target.list(),pendingAttachments:thread.pendingAttachments,selected:thread.selected,imported:ids.length,errors};
  }finally{importing=false;}
 });
 handle('document-read',(id,offset)=>{const doc=library.list().find(d=>d.id===id);if(!doc)throw Error('File not found in this project.');return {doc,parts:library.read(id,offset).map(({text,page,part,total})=>({text,page,part,total})),note:doc.editable?library.noteText(id):undefined};});
 handle('document-open',async id=>{const error=await shell.openPath(library.originalPath(id));if(error)throw Error(error);});
 handle('note-save',async payload=>{idle();importing=true;try{const id=await library.saveNote(payload.id,payload.name,payload.text);return {id,documents:library.list()};}finally{importing=false;}});
 handle('chat-new',projectId=>{navigable();const thread=store.create(projectId||null);library=libraries.getThread(thread);return thread;});
 handle('chat-search',query=>store.search(query));
 handle('chat-load',id=>{navigable();const thread=store.activate(id);library=libraries.getThread(thread);return thread;});
 handle('chat-update',(id,patch)=>{navigable();if(jobs.has(id)&&Object.keys(patch||{}).some(k=>k!=='draft'&&k!=='title'))throw Error('Wait for this chat’s request before changing its context.');if(!patch||typeof patch!=='object')throw Error('Invalid conversation settings.');return store.update(id,patch);});
 handle('chat-delete',id=>{idle();store.remove(id);if(!store.data.activeId)store.create(null);library=libraries.getThread(store.get(store.data.activeId));return store.data.activeId;});
 handle('web-clear',id=>{idle();const thread=store.require(id);thread.research={query:'',results:[],pages:[]};thread.publicTopic='';thread.ignorePriorWeb=true;thread.pendingWeb=false;store.save();return thread;});
 handle('cancel',id=>jobs.cancel(id));
 handle('ask',payload=>{
  navigable();if(!runtime.ready)throw Error(runtime.state);
  const message=String(payload?.message||'').trim();if(!message||message.length>4000)throw Error('Please enter a question under 4,000 characters.');
  const thread=store.require(payload.chatId);if(jobs.has(thread.id))throw Error('This chat already has a pending request.');
  const target=libraries.getThread(thread);
  if(Array.isArray(payload.selected))thread.selected=payload.selected.filter(id=>target.docs.some(d=>d.id===id));
  const attachments=target.list().filter(d=>thread.pendingAttachments.includes(d.id)&&thread.selected.includes(d.id));
  const history=projectHistory(store,thread.id,message);
  return jobs.enqueue({thread,message,attachments,library:target,projectName:store.project()?.name||'',getProjectHistory:()=>structuredClone(history)});
 });
 handle('open-source',async raw=>{const url=new URL(raw);if(url.protocol!=='https:')throw Error('Only HTTPS sources can be opened.');const known=store.data.threads.filter(t=>t.projectId===store.data.activeProjectId).some(t=>t.research.results.some(r=>r.url===raw)||t.messages.some(m=>m.sources?.some(s=>s.url===raw)));if(!known)throw Error('Unknown source');await shell.openExternal(url.href);});
 handle('export',async id=>{const thread=store.require(id);const result=await dialog.showSaveDialog(win,{defaultPath:'Conversation.txt',filters:[{name:'Text file',extensions:['txt']}]});if(result.canceled)return;fs.writeFileSync(result.filePath,thread.messages.map(m=>`${m.role==='user'?'You':'Assistant'}\n${m.content}${m.error?'\n'+m.error:''}\n${(m.sources||[]).map(s=>`[${s.citation}] ${s.label}${s.url?' — '+s.url:''}\n${s.text}`).join('\n\n')}`).join('\n\n----------------\n\n'));});
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{jobs?.close();try{store?.save();}catch{}runtime?.stop();});
