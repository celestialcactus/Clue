import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { Search, FileText, MessageSquare, Trash2, Plus, PanelRightClose, PanelRightOpen } from 'lucide-react'
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
 React.useEffect(()=>{setOpen(false);setQuery('')},[state.projectId])
 async function choose(item:any){try{files?await window.workspaceUI.preview(item.id):await window.workspaceUI.openChat(item.id);setOpen(false)}catch(e:any){setError(e.message)}}
 return <Dialog open={open} onOpenChange={value=>{setOpen(value);if(value)setQuery('')}}>
  <DialogTrigger asChild><Button id={files?'search-files':'search-chats'} type="button" variant="ghost" size="icon" disabled={state.busy} title={`${title} (${files?'Ctrl+P':'Ctrl+K'})`} aria-label={title}><Search/></Button></DialogTrigger>
  <DialogContent className="search-dialog gap-0 p-0 sm:max-w-xl" onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-search-result]'));const index=buttons.indexOf(document.activeElement as HTMLButtonElement);const next=e.key==='ArrowDown'?Math.min(index+1,buttons.length-1):Math.max(index-1,0);if(buttons[next]){e.preventDefault();buttons[next].focus()}}}}>
   <DialogHeader className="px-5 pt-5 pb-3 text-left"><DialogTitle>{title}</DialogTitle><DialogDescription>{files?'Preview files in this project. Opening a file does not send a chat message.':'Search titles and messages in this project.'}</DialogDescription></DialogHeader>
   <div className="px-5 pb-4"><Input aria-label={title} placeholder={files?'Filter files…':'Search conversations…'} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&results[0]){e.preventDefault();choose(results[0])}}}/></div>
   <div className="search-results border-t px-2 py-2" aria-busy={loading}>
    {error?<p role="alert" className="p-4 text-sm text-destructive">{error}</p>:loading?<p className="p-4 text-sm text-muted-foreground">Searching…</p>:results.length?results.map(item=><div key={item.id} className="group flex items-center gap-1">
     <Button data-search-result variant="ghost" type="button" className="h-auto min-h-12 flex-1 justify-start px-3 py-3 text-left overflow-hidden" onClick={()=>choose(item)}>
      {files?<FileText className="size-4 shrink-0 text-muted-foreground"/>:<MessageSquare className="size-4 shrink-0 text-muted-foreground"/>}
      <span className="min-w-0 flex-1"><span className="block truncate">{files?item.name:item.title}</span>{item.excerpt&&<span className="block truncate text-xs font-normal text-muted-foreground">{item.excerpt}</span>}</span>
     </Button>
     {files&&<Button variant="ghost" size="icon-sm" type="button" title={`Remove ${item.name}`} aria-label={`Remove ${item.name}`} onClick={async()=>{try{await window.workspaceUI.removeFile(item.id)}catch(e:any){setError(e.message)}}}><Trash2 className="size-3.5 text-muted-foreground"/></Button>}
    </div>):<p className="p-6 text-center text-sm text-muted-foreground">{query?'No matches found.':files?'No files yet. Add a file to this project.':'No conversations yet.'}</p>}
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
