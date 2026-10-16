const {app,BrowserWindow,ipcMain,dialog,session,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs');
const {Runtime}=require('./runtime.cjs');const {Embeddings}=require('./embeddings.cjs');const {ProjectLibraries}=require('./projects.cjs');
const {ThreadStore}=require('./threads.cjs');const {executeWorkflow}=require('./workflow.cjs');

const {searchWeb,readWeb}=require('./web.cjs');
const processStartedAt=Number(process.env.DESK_DEV_STARTED)||Date.now();
let win,library,libraries,embedder,runtime,store,active,importing=false;
if(!app.isPackaged&&process.env.DESK_TEST_PROFILE)app.setPath('userData',path.resolve(process.env.DESK_TEST_PROFILE));
const locked=app.requestSingleInstanceLock();
if(!locked)app.quit();
app.on('second-instance',()=>{win?.restore();win?.focus();});
function idle(){if(active||importing)throw Error('Please stop or finish the current task first.');}
function emit(payload){if(win&&!win.isDestroyed())win.webContents.send('thread-event',payload);}

if(locked)app.whenReady().then(()=>{
 if(!app.isPackaged){try{require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../scripts/build-ui.cjs')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'pipe'});}catch(e){dialog.showErrorBox('UI build failed',String(e.stderr||e.message));app.quit();return;}}
 app.setAppUserModelId('local.desk.assistant');
 const dir=app.getPath('userData');
 const assets=app.isPackaged?process.resourcesPath:path.join(__dirname,'../assets');
 try{store=new ThreadStore(dir);embedder=new Embeddings(assets);libraries=new ProjectLibraries(dir,embedder);if(!store.data.activeId)store.create(null);library=libraries.getThread(store.get(store.data.activeId));}
 catch(e){dialog.showErrorBox('Local data could not be opened',e.message+'\nExisting data has not been replaced.');app.quit();return;}
 runtime=new Runtime(assets);
 if(!app.isPackaged&&process.env.DESK_DEV_RELOAD){const reloadFile=path.join(dir,'reload.request');let seen=processStartedAt;fs.watchFile(reloadFile,{interval:500},stat=>{if(stat.mtimeMs>seen){seen=stat.mtimeMs;app.quit();}});app.on('before-quit',()=>fs.unwatchFile(reloadFile));}
 session.defaultSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file://')}));
 win=new BrowserWindow({width:1440,height:900,minWidth:950,minHeight:650,backgroundColor:'#f8f7f4',title:'Desk Assistant',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'ui/index.html'));
 runtime.start().catch(e=>{runtime.state='Unable to start local model: '+e.message;});
 const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw Error('Unauthorized request');return fn(...args);});
 handle('status',()=>({ready:!!runtime.ready,state:runtime.state,model:'Qwen2.5 · 1.5B · Q4',retrievalState:embedder.state,documents:library.list(),chats:store.list(),activeId:store.data.activeId,projects:store.projectTree(),recents:store.recents(),activeProjectId:store.data.activeProjectId}));
 handle('project-create',name=>{idle();store.createProject(name);const thread=store.create();library=libraries.getThread(thread);return thread;});
 handle('project-load',(id,threadId)=>{idle();if(threadId&&store.get(threadId)?.projectId!==id)throw Error('Conversation not found in this project.');store.activateProject(id);const thread=threadId?store.activate(threadId):store.data.activeId?store.activate(store.data.activeId):store.create();library=libraries.getThread(thread);return thread;});
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
 handle('import',async()=>{
  idle();importing=true;
  try{const result=await dialog.showOpenDialog(win,{title:'Add documents',properties:['openFile','multiSelections'],filters:[{name:'Documents',extensions:['pdf','docx','txt','md','csv']}]});const errors=[];
   for(const file of result.filePaths){try{await library.import(file);}catch(e){errors.push(path.basename(file)+': '+e.message);}}
   return {documents:library.list(),errors};
  }finally{importing=false;}
 });
 handle('remove',id=>{idle();library.remove(id);for(const t of store.data.threads.filter(t=>t.id===store.data.activeId||store.data.activeProjectId&&t.projectId===store.data.activeProjectId))t.selected=t.selected.filter(d=>d!==id);store.save();return library.list();});
 handle('import-dropped',async(files,chatId)=>{
  idle();const thread=store.require(chatId);
  if(!Array.isArray(files)||!files.length||files.length>20)throw Error('Drop between 1 and 20 documents at a time.');
  importing=true;const errors=[],ids=[];
  try{for(const file of files){try{if(typeof file!=='string'||!path.isAbsolute(file))throw Error('Could not read this file. Drag it from File Explorer.');ids.push(await library.import(file));}catch(e){errors.push((typeof file==='string'&&file?path.basename(file)+': ':'')+e.message);}}
   thread.selected=[...new Set([...thread.selected,...ids])];thread.pendingAttachments=[...new Set([...thread.pendingAttachments,...ids])];store.save();return {documents:library.list(),pendingAttachments:thread.pendingAttachments,selected:thread.selected,imported:ids.length,errors};
  }finally{importing=false;}
 });
 handle('document-read',(id,offset)=>{const doc=library.list().find(d=>d.id===id);if(!doc)throw Error('File not found in this project.');return {doc,parts:library.read(id,offset).map(({text,page,part,total})=>({text,page,part,total})),note:doc.editable?library.noteText(id):undefined};});
 handle('document-open',async id=>{const error=await shell.openPath(library.originalPath(id));if(error)throw Error(error);});
 handle('note-save',async payload=>{idle();importing=true;try{const id=await library.saveNote(payload.id,payload.name,payload.text);return {id,documents:library.list()};}finally{importing=false;}});
 handle('chat-new',projectId=>{idle();const thread=store.create(projectId||null);library=libraries.getThread(thread);return thread;});
 handle('chat-search',query=>store.search(query));
 handle('chat-load',id=>{idle();const thread=store.activate(id);library=libraries.getThread(thread);return thread;});
 handle('chat-update',(id,patch)=>{idle();if(!patch||typeof patch!=='object')throw Error('Invalid conversation settings.');return store.update(id,patch);});
 handle('chat-delete',id=>{idle();store.remove(id);return store.data.activeId;});
 handle('web-clear',id=>{idle();const thread=store.require(id);thread.research={query:'',results:[],pages:[]};thread.publicTopic='';thread.ignorePriorWeb=true;thread.pendingWeb=false;store.save();return thread;});
 handle('cancel',()=>active?.controller.abort());
 handle('ask',async payload=>{
  idle();if(!runtime.ready)throw Error(runtime.state);
  const message=String(payload?.message||'').trim();if(!message||message.length>4000)throw Error('Please enter a question under 4,000 characters.');
  const thread=store.require(payload.chatId);
  if(Array.isArray(payload.selected))thread.selected=payload.selected.filter(id=>library.docs.some(d=>d.id===id));
  const attachments=library.list().filter(d=>thread.pendingAttachments.includes(d.id)&&thread.selected.includes(d.id));
  const {assistant}=store.begin(thread.id,message,attachments);
  const controller=new AbortController();active={controller,threadId:thread.id};const signal=controller.signal;
  emit({type:'started',threadId:thread.id,thread});
  let lastSave=Date.now();
  try{
   const result=await executeWorkflow({thread,assistant,message,library,runtime,searchWeb,readWeb,projectName:store.project()?.name||'',signal,save:()=>store.save(),
    onActivity:activity=>emit({type:'activity',threadId:thread.id,messageId:assistant.id,activity}),
    onDelta:delta=>{assistant.content+=delta;emit({type:'delta',threadId:thread.id,messageId:assistant.id,delta});if(Date.now()-lastSave>1000){store.save();lastSave=Date.now();}},
   });
   signal.throwIfAborted();assistant.content=result.answer;assistant.sources=result.sources;assistant.status='complete';assistant.completedAt=new Date().toISOString();
  }catch(e){assistant.status=signal.aborted?'stopped':'error';assistant.error=signal.aborted?'Stopped. Your question and partial response are saved.':e.message;}
  finally{active=null;thread.updatedAt=new Date().toISOString();store.save();}
  emit({type:'finished',threadId:thread.id,thread});return {thread};
 });
 handle('open-source',async raw=>{const url=new URL(raw);if(url.protocol!=='https:')throw Error('Only HTTPS sources can be opened.');const known=store.data.threads.filter(t=>t.projectId===store.data.activeProjectId).some(t=>t.research.results.some(r=>r.url===raw)||t.messages.some(m=>m.sources?.some(s=>s.url===raw)));if(!known)throw Error('Unknown source');await shell.openExternal(url.href);});
 handle('export',async id=>{const thread=store.require(id);const result=await dialog.showSaveDialog(win,{defaultPath:'Conversation.txt',filters:[{name:'Text file',extensions:['txt']}]});if(result.canceled)return;fs.writeFileSync(result.filePath,thread.messages.map(m=>`${m.role==='user'?'You':'Assistant'}\n${m.content}${m.error?'\n'+m.error:''}\n${(m.sources||[]).map(s=>`[${s.citation}] ${s.label}${s.url?' — '+s.url:''}\n${s.text}`).join('\n\n')}`).join('\n\n----------------\n\n'));});
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{active?.controller.abort();try{store?.save();}catch{}runtime?.stop();});
