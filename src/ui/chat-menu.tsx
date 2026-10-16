import * as React from 'react'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {Pin,PinOff,Pencil,Share,Archive,Trash2,FolderInput,FolderMinus,ChevronLeft,ChevronRight,Folder} from 'lucide-react'
import {Button} from './components/button'
import {Input} from './components/input'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './components/dialog'

function ChatMenus(){
 const [menu,setMenu]=React.useState<any>(null),[moving,setMoving]=React.useState(false),[dialog,setDialog]=React.useState<any>(null),[name,setName]=React.useState(''),[error,setError]=React.useState(''),[pending,setPending]=React.useState(false),[archived,setArchived]=React.useState<any[]>([]);
 const popup=React.useRef<HTMLDivElement>(null),anchor=React.useRef<HTMLElement|null>(null);
 function restoreFocus(){if(anchor.current?.isConnected)anchor.current.focus();else document.getElementById('new')?.focus();}
 function close(){anchor.current?.setAttribute('aria-expanded','false');setMenu(null);setMoving(false);restoreFocus();}
 React.useEffect(()=>{
  const show=(event:any)=>{anchor.current=event.detail.anchor;anchor.current?.setAttribute('aria-expanded','true');const r=event.detail.anchor.getBoundingClientRect();setMenu({...event.detail.chat,left:Math.max(8,Math.min(r.left,window.innerWidth-238)),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-360))});setMoving(false);setError('');};
  const archives=()=>{setError('');setDialog({kind:'archives'});window.workspaceUI.archives().then(setArchived).catch((e:any)=>setError(e.message));};
  window.addEventListener('chat-menu',show);window.addEventListener('show-archives',archives);return()=>{window.removeEventListener('chat-menu',show);window.removeEventListener('show-archives',archives);};
 },[]);
 React.useEffect(()=>{
  if(!menu)return;popup.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const outside=(e:PointerEvent)=>{if(!popup.current?.contains(e.target as Node)&&!anchor.current?.contains(e.target as Node))close();};
  const resize=()=>close();document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};
 },[menu,moving]);
 async function run(fn:()=>Promise<any>){setPending(true);setError('');try{await fn();close();}catch(e:any){setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{setPending(false);}}
 function openDialog(kind:string){setDialog({kind,chat:menu});setName(menu.title);setError('');close();}
 function keydown(e:React.KeyboardEvent){
  const buttons=Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab')close();if(e.key==='ArrowLeft'&&moving){e.preventDefault();setMoving(false);}
 }
 const projects=window.workspaceUI.snapshot().projects||[];
 return <>{menu&&createPortal(<div ref={popup} role="menu" aria-label={'Actions for '+menu.title} className="chat-popover" style={{left:menu.left,top:menu.top,maxHeight:window.innerHeight-menu.top-8}} onKeyDown={keydown}>
  {moving?<><button role="menuitem" disabled={pending} onClick={()=>setMoving(false)}><ChevronLeft size={15}/>Back</button><div className="menu-caption">Move to project · shares history and files</div>{projects.filter((p:any)=>p.id!==menu.projectId).map((p:any)=><button key={p.id} role="menuitem" disabled={pending} onClick={()=>run(()=>window.workspaceUI.chatAction(menu.id,'move',p.id))}><Folder size={15}/>{p.name}</button>)}{!projects.some((p:any)=>p.id!==menu.projectId)&&<p className="menu-caption">Create another project first.</p>}</>:<>
   <button role="menuitem" disabled={pending} onClick={()=>openDialog('rename')}><Pencil size={15}/>Rename</button>
   <button role="menuitem" disabled={pending} onClick={()=>run(()=>window.workspaceUI.manageChat(menu.id,{pinned:!menu.pinned}))}>{menu.pinned?<PinOff size={15}/>:<Pin size={15}/>} {menu.pinned?'Unpin':'Pin'}</button><hr/>
   <button role="menuitem" disabled={pending} onClick={()=>run(()=>window.workspaceUI.chatAction(menu.id,'export'))}><Share size={15}/>Share / export…</button><div className="menu-caption">Save a local copy to share</div><hr/>
   <button role="menuitem" disabled={pending} onClick={()=>run(()=>window.workspaceUI.manageChat(menu.id,{archived:true}))}><Archive size={15}/>Archive</button>
   <button role="menuitem" disabled={pending} className="destructive" onClick={()=>openDialog('delete')}><Trash2 size={15}/>Delete</button><hr/>
   {menu.projectId&&<div className="menu-caption current-project" aria-label="Current project">{projects.find((p:any)=>p.id===menu.projectId)?.name||'Project'}</div>}
   <button role="menuitem" disabled={pending} aria-haspopup="menu" onClick={()=>setMoving(true)}><FolderInput size={15}/>Move to project<ChevronRight size={14}/></button>
   {menu.projectId&&<button role="menuitem" disabled={pending} onClick={()=>run(()=>window.workspaceUI.chatAction(menu.id,'move',null))}><FolderMinus size={15}/>Remove from project</button>}
  </>}{error&&<p role="alert" className="source-error">{error}</p>}
 </div>,document.body)}
 <Dialog open={!!dialog} onOpenChange={open=>{if(!open&&!pending)setDialog(null)}}><DialogContent onCloseAutoFocus={e=>{e.preventDefault();restoreFocus();}}><DialogHeader><DialogTitle>{dialog?.kind==='archives'?'Archived chats':dialog?.kind==='delete'?'Delete chat?':'Rename chat'}</DialogTitle><DialogDescription>{dialog?.kind==='archives'?'Restore a chat to return it to the sidebar.':dialog?.kind==='delete'?'This permanently removes the saved conversation. This cannot be undone.':'Choose a name for this conversation.'}</DialogDescription></DialogHeader>
  {dialog?.kind==='archives'?<div className="archive-list">{archived.length?archived.map(chat=><div className="archive-entry" key={chat.id}><span title={chat.title}>{chat.title}</span><Button variant="outline" disabled={pending} onClick={async()=>{setPending(true);setError('');try{await window.workspaceUI.manageChat(chat.id,{archived:false});setArchived(await window.workspaceUI.archives());}catch(e:any){setError(e.message);}finally{setPending(false);}}}>Restore</Button><Button variant="ghost" aria-label={'Delete '+chat.title} disabled={pending} onClick={()=>setDialog({kind:'delete',chat})}><Trash2 size={15}/></Button></div>):<p className="source-help">No archived chats.</p>}</div>:<form onSubmit={async e=>{e.preventDefault();if(pending)return;setPending(true);setError('');try{if(dialog.kind==='rename')await window.workspaceUI.manageChat(dialog.chat.id,{title:name});else await window.workspaceUI.chatAction(dialog.chat.id,'delete');setDialog(null);}catch(e:any){setError(e.message);}finally{setPending(false);}}}>
   {dialog?.kind==='rename'?<Input aria-label="Chat name" value={name} maxLength={100} onChange={e=>setName(e.target.value)} autoFocus required/>:<p>{dialog?.chat.title}</p>}
   <div className="chat-form-actions"><Button type="button" variant="ghost" disabled={pending} onClick={()=>setDialog(null)}>Cancel</Button><Button type="submit" disabled={pending||dialog?.kind==='rename'&&!name.trim()}>{dialog?.kind==='delete'?'Delete chat':'Save'}</Button></div>
  </form>}{error&&<p role="alert" className="source-error">{error}</p>}
 </DialogContent></Dialog></>;
}
createRoot(document.getElementById('chat-menu-root')!).render(<ChatMenus/>);
