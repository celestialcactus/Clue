import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Search, FileText, MessageSquare, Trash2, Plus, PanelRightClose, PanelRightOpen, Folder, FolderPlus, RefreshCw, X, Bell, Check, CircleAlert, LoaderCircle, Square } from 'lucide-react'
import { Button } from './components/button'
import { Input } from './components/input'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './components/dialog'

declare global { interface Window { workspaceUI: any } }
function useWorkspace() {
 const [state,setState]=React.useState(()=>window.workspaceUI.snapshot())
 React.useEffect(()=>{const update=()=>setState(window.workspaceUI.snapshot());window.addEventListener('workspace-state',update);return()=>window.removeEventListener('workspace-state',update)},[])
 return state
}
function SearchDialog({kind}:{kind:'chats'|'files'}) {
 const state=useWorkspace(),[open,setOpen]=React.useState(false),[query,setQuery]=React.useState(''),[results,setResults]=React.useState<any[]>([]),[error,setError]=React.useState(''),[loading,setLoading]=React.useState(false)
 const files=kind==='files',title=files?'Find a file':'Search chats'
 React.useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()===(files?'p':'k')){e.preventDefault();if(!state.busy)setOpen(true)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[state.busy,files])
 React.useEffect(()=>{if(!open)return;let stale=false;setError('');setLoading(true);const timer=setTimeout(async()=>{try{const found=files?state.documents.filter((d:any)=>d.name.toLowerCase().includes(query.toLowerCase())):await window.workspaceUI.searchChats(query);if(!stale){setResults(found);setLoading(false)}}catch(e:any){if(!stale){setError(e.message);setLoading(false)}}},100);return()=>{stale=true;clearTimeout(timer)}},[query,open,state.projectId,state.documents,files])
 React.useEffect(()=>{setOpen(false);setQuery('')},[state.projectId,state.threadId])
 async function choose(item:any){try{files?await window.workspaceUI.preview(item.id):await window.workspaceUI.openChat(item.id);setOpen(false)}catch(e:any){setError(e.message)}}
 return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(value)setQuery('')}}>
  <DialogTrigger asChild><Button id={files?'search-files':'search-chats'} type="button" variant="ghost" size="icon" disabled={state.busy} title={`${title} (${files?'Ctrl+P':'Ctrl+K'})`} aria-label={title}><Search/></Button></DialogTrigger>
  <DialogContent className="search-dialog gap-0 p-0 sm:max-w-xl" onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-search-result]'));const index=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='ArrowDown'?Math.min(index+1,buttons.length-1):Math.max(index-1,0);if(buttons[next]){e.preventDefault();buttons[next].focus()}}}}>
   <DialogHeader className="px-5 pt-5 pb-3 text-left"><DialogTitle>{title}</DialogTitle><DialogDescription>{files?'Preview files available to this chat. Opening a file does not send a chat message.':'Search titles and messages across your chats.'}</DialogDescription></DialogHeader>
   <div className="px-5 pb-4"><Input aria-label={title} placeholder={files?'Filter files…':'Search conversations…'} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&results[0]){e.preventDefault();choose(results[0])}}}/></div>
   <div className="search-results border-t px-2 py-2" aria-busy={loading}>
    {error?<p role="alert" className="p-4 text-sm text-destructive">{error}</p>:loading?<p className="p-4 text-sm text-muted-foreground">Searching…</p>:results.length?results.map(item=><div key={item.id} className="group flex items-center gap-1">
     <Button data-search-result variant="ghost" type="button" className="h-auto min-h-12 flex-1 justify-start px-3 py-3 text-left overflow-hidden" onClick={()=>choose(item)}>
      {files?<FileText className="size-4 shrink-0 text-muted-foreground"/>:<MessageSquare className="size-4 shrink-0 text-muted-foreground"/>}
      <span className="min-w-0 flex-1"><span className="block truncate">{files?item.name:item.title}</span>{item.excerpt&&<span className="block truncate text-xs font-normal text-muted-foreground">{item.excerpt}</span>}</span>
     </Button>
     {files&&!item.sourcePath&&<Button variant="ghost" size="icon-sm" type="button" title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`} onClick={async()=>{try{await window.workspaceUI.removeFile(item.id)}catch(e:any){setError(e.message)}}}><Trash2 className="size-3.5 text-muted-foreground"/></Button>}
    </div>):<p className="p-6 text-center text-sm text-muted-foreground">{query?'No matches found.':files?'No files yet. Attach a file to this chat.':'No conversations yet.'}</p>}
   </div>
   <div className="border-t px-5 py-3 text-xs text-muted-foreground">{state.projectName} <span className="float-right">↑ ↓ Navigate · Enter Open · Esc Close</span></div>
  </DialogContent>
 </Dialog>
}
function FileTools(){const state=useWorkspace();return <><SearchDialog kind="files"/><Button id="add" variant="ghost" size="icon" type="button" disabled={state.busy} title="Add files" aria-label="Add files" onClick={()=>window.workspaceUI.importFiles()}><Plus/></Button><Button id="close-files" variant="ghost" size="icon" type="button" title="Collapse preview" aria-label="Collapse preview" onClick={()=>window.workspaceUI.togglePane(false)}><PanelRightClose/></Button></>}
function PaneToggle(){const state=useWorkspace();return <Button id="toggle-files" variant="ghost" size="icon" type="button" title={state.paneOpen?'Collapse preview':'Open file preview'} aria-label={state.paneOpen?'Collapse preview':'Open file preview'} aria-controls="files-pane" aria-expanded={state.paneOpen} onClick={()=>window.workspaceUI.togglePane(!state.paneOpen)}>{state.paneOpen?<PanelRightClose/>:<PanelRightOpen/>}</Button>}
createRoot(document.getElementById('chat-search-root')!).render(<SearchDialog kind="chats"/>);
createRoot(document.getElementById('file-tools-root')!).render(<FileTools/>);
createRoot(document.getElementById('pane-toggle-root')!).render(<PaneToggle/>);

function ActivityView(){
 const state=useWorkspace(),[open,setOpen]=React.useState(false),[items,setItems]=React.useState<any[]>([]),[error,setError]=React.useState(''),[seen,setSeen]=React.useState(()=>Number(localStorage.getItem('clue-activity-seen'))||0);
 React.useEffect(()=>{let disposed=false;const update=async()=>{try{const entries=await window.workspaceUI.activity();if(!disposed){setItems(entries);setError('')}}catch(e:any){if(!disposed)setError(e.message)}};update();const timer=setInterval(update,2000);return()=>{disposed=true;clearInterval(timer)}},[]);
 React.useEffect(()=>{if(open){const time=Date.now();setSeen(time);localStorage.setItem('clue-activity-seen',String(time));}},[open,items]);
 const unread=items.some(item=>item.status!=='running'&&Date.parse(item.time)>seen),running=items.filter(item=>item.status==='running').length;
 async function show(item:any){try{if(item.threadId)await window.workspaceUI.openChat(item.threadId);else await window.workspaceUI.openProject(item.projectId);setOpen(false)}catch(e:any){setError(e.message)}}
 return <Dialog open={open} onOpenChange={setOpen}>
  <DialogTrigger asChild><Button id="activity-bell" type="button" variant="ghost" size="icon" title="Activity" aria-label={unread?'Activity, unread updates':'Activity'} className="activity-bell"><Bell/>{(unread||running>0)&&<span className={running?'activity-dot running':'activity-dot'} aria-hidden="true"/>}</Button></DialogTrigger>
  <DialogContent className="activity-dialog sm:max-w-lg"><DialogHeader><DialogTitle>Activity</DialogTitle><DialogDescription>{running?`${running} task in progress`:'Recent responses and document indexing'}</DialogDescription></DialogHeader>
   {error&&<p role="alert" className="source-error">{error}</p>}
   <div className="activity-feed">{items.length?items.map(item=><div key={item.id} className="activity-item">
    <span className={'activity-state '+item.status}>{item.status==='running'?<LoaderCircle size={16}/>:item.status==='complete'?<Check size={16}/>:item.status==='stopped'?<Square size={14}/>:<CircleAlert size={16}/>}</span>
    <div className="activity-copy"><strong>{item.title}</strong><span>{item.projectName} · {({running:'In progress',complete:'Completed',error:'Needs attention',stopped:'Stopped',interrupted:'Interrupted'} as any)[item.status]||item.status}</span><p>{item.detail}</p><time>{new Date(item.time).toLocaleString()}</time></div>
    <Button type="button" variant="ghost" size="sm" disabled={state.busy} onClick={()=>show(item)}>{item.threadId?'Open chat':'Open project'}</Button>
   </div>):<p className="activity-empty">No activity yet. Responses and file indexing will appear here.</p>}</div>
   {state.busy&&<p className="source-help">You can view activity while Clue works. Opening another chat is available when the current task finishes.</p>}
  </DialogContent>
 </Dialog>
}
createRoot(document.getElementById('activity-root')!).render(<ActivityView/>);

function ProjectDialog(){
 const [open,setOpen]=React.useState(false),[project,setProject]=React.useState<any>(null),[name,setName]=React.useState(''),[folder,setFolder]=React.useState<any>(null),[pending,setPending]=React.useState(false),[choosing,setChoosing]=React.useState(false),[progress,setProgress]=React.useState(''),[error,setError]=React.useState('');
 React.useEffect(()=>{const show=(event:any)=>{setProject(event.detail);setName(event.detail?.name||'');setFolder(event.detail?.sourceFolder||null);setError('');setProgress('');setOpen(true)};const update=(event:any)=>setProgress(event.detail.label);window.addEventListener('project-dialog',show);window.addEventListener('folder-progress',update);return()=>{window.removeEventListener('project-dialog',show);window.removeEventListener('folder-progress',update)}},[]);
 async function choose(){setChoosing(true);setError('');try{const value=await window.workspaceUI.chooseFolder();if(value){setFolder(value);if(!name.trim())setName(value.name)}}catch(e:any){setError(e.message)}finally{setChoosing(false)}}
 async function save(e:React.FormEvent){e.preventDefault();if(!name.trim()||pending||choosing)return;setPending(true);setError('');setProgress(folder?'Preparing local index…':'Creating project…');try{await window.workspaceUI.saveProject({name:name.trim(),folderToken:folder?.token,detachFolder:!!project?.sourceFolder&&!folder},project?.id);setOpen(false)}catch(e:any){setError(e.message)}finally{setPending(false)}}
 const locked=pending||choosing;
 return <Dialog open={open} onOpenChange={value=>{if(!locked)setOpen(value)}}><DialogContent className="project-dialog sm:max-w-lg" showCloseButton={!locked} onCloseAutoFocus={e=>{e.preventDefault();document.getElementById('project-new')?.focus()}}>
  <DialogHeader><DialogTitle>{project?'Project settings':'Create project'}</DialogTitle><DialogDescription>Keep related chats and local documents together.</DialogDescription></DialogHeader>
  <form onSubmit={save} className="project-form">
   <label className="sr-only" htmlFor="project-name">Project name</label><div className="project-name-field"><Folder size={17}/><Input id="project-name" placeholder="Project name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} disabled={locked} autoFocus required/></div>
   <label className="source-label">Source folder <span>Optional</span></label>
   <div className="source-folder-picker">{folder?<><div className="chosen-folder"><Folder size={20}/><span title={folder.path}>{folder.path}</span><Button type="button" variant="ghost" size="icon-sm" aria-label="Remove source folder" disabled={locked} onClick={()=>setFolder(null)}><X size={15}/></Button></div><Button type="button" variant="outline" disabled={locked} onClick={choose}>Change folder</Button></>:<><span>Add a folder on this computer</span><Button type="button" variant="outline" disabled={locked} onClick={choose}><FolderPlus size={16}/>{choosing?'Choosing…':'Choose folder'}</Button></>}</div>
   <p className="source-help">PDF, Word, text, Markdown and CSV files in this folder and its subfolders become available to this project’s chats. Originals stay unchanged. Use Refresh files to pick up changes.</p>
   {pending&&<p role="status" className="source-progress">{progress}</p>}{error&&<p role="alert" className="source-error">{error}</p>}
   <div className="project-form-actions"><Button type="button" variant="ghost" disabled={locked} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" disabled={locked||!name.trim()}>{pending?'Indexing…':project?'Save project':'Create project'}</Button></div>
  </form>
 </DialogContent></Dialog>
}
function SourceFolderStatus(){
 const state=useWorkspace(),project=state.project,folder=project?.sourceFolder,[error,setError]=React.useState('');
 React.useEffect(()=>setError(''),[project?.id,folder?.indexedAt]);
 if(!project)return null;
 const run=async(fn:()=>Promise<any>)=>{setError('');try{await fn()}catch(e:any){setError(e.message)}};
 return <section className="source-folder-status" aria-label="Project source folder">
  <div className="source-folder-title"><Folder size={14}/><span title={folder?.path}>{folder?.path||'No source folder'}</span><Button type="button" variant="ghost" size="icon-sm" aria-label="Manage source folder" disabled={state.busy} onClick={()=>window.dispatchEvent(new CustomEvent('project-dialog',{detail:project}))}><Plus size={14}/></Button></div>
  {folder&&<><p>{folder.state==='indexing'?'Indexing locally…':folder.state==='unavailable'?'Folder unavailable · using last indexed copies':folder.state==='attention'?'Some files need attention':`${folder.count||0} indexed files`}{folder.indexedAt&&` · ${new Date(folder.indexedAt).toLocaleString()}`}</p><div className="source-folder-actions"><Button type="button" variant="ghost" disabled={state.busy} onClick={()=>run(()=>window.workspaceUI.refreshSource(project.id))}><RefreshCw size={12}/>Refresh files</Button><Button type="button" variant="ghost" disabled={state.busy} onClick={()=>run(()=>window.workspaceUI.openSourceFolder(project.id))}>Open folder</Button></div>{folder.errors?.length>0&&<details><summary>{folder.errors.length} indexing issue(s)</summary>{folder.errors.map((e:string,i:number)=><p key={i}>{e}</p>)}</details>}</>}
  {error&&<p role="alert" className="source-error">{error}</p>}
 </section>
}
createRoot(document.getElementById('project-dialog-root')!).render(<ProjectDialog/>);
createRoot(document.getElementById('source-folder-root')!).render(<SourceFolderStatus/>);
