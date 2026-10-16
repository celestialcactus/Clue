const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desk',{
 status:()=>ipcRenderer.invoke('status'),import:()=>ipcRenderer.invoke('import'),remove:id=>ipcRenderer.invoke('remove',id),
 searchChats:query=>ipcRenderer.invoke('chat-search',query),
 newChat:()=>ipcRenderer.invoke('chat-new'),load:id=>ipcRenderer.invoke('chat-load',id),update:(id,patch)=>ipcRenderer.invoke('chat-update',id,patch),deleteChat:id=>ipcRenderer.invoke('chat-delete',id),
 newProject:name=>ipcRenderer.invoke('project-create',name),loadProject:id=>ipcRenderer.invoke('project-load',id),renameProject:name=>ipcRenderer.invoke('project-rename',name),
 readDocument:(id,offset)=>ipcRenderer.invoke('document-read',id,offset),openDocument:id=>ipcRenderer.invoke('document-open',id),saveNote:payload=>ipcRenderer.invoke('note-save',payload),
 clearWeb:id=>ipcRenderer.invoke('web-clear',id),cancel:()=>ipcRenderer.invoke('cancel'),ask:payload=>ipcRenderer.invoke('ask',payload),openSource:url=>ipcRenderer.invoke('open-source',url),export:id=>ipcRenderer.invoke('export',id),
 onEvent:fn=>ipcRenderer.on('thread-event',(_e,event)=>fn(event)),
});
