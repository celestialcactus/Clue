const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('desk',{
 manageChat:(id,patch)=>ipcRenderer.invoke('chat-manage',id,patch),archives:()=>ipcRenderer.invoke('chat-archives'),pinProject:(id,pinned)=>ipcRenderer.invoke('project-pin',id,pinned),
 activity:()=>ipcRenderer.invoke('activity-list'),
 status:()=>ipcRenderer.invoke('status'),import:chatId=>ipcRenderer.invoke('import',chatId),remove:id=>ipcRenderer.invoke('remove',id),
 searchChats:query=>ipcRenderer.invoke('chat-search',query),
 importDropped:(files,chatId)=>ipcRenderer.invoke('import-dropped',Array.from(files,file=>webUtils.getPathForFile(file)),chatId),
 moveChat:(id,projectId)=>ipcRenderer.invoke('chat-move',id,projectId),
 newChat:projectId=>ipcRenderer.invoke('chat-new',projectId),load:id=>ipcRenderer.invoke('chat-load',id),update:(id,patch)=>ipcRenderer.invoke('chat-update',id,patch),deleteChat:id=>ipcRenderer.invoke('chat-delete',id),
 dropProject:(id,files=[],documentId)=>ipcRenderer.invoke('project-drop',id,Array.from(files,file=>webUtils.getPathForFile(file)),documentId),
 chooseFolder:()=>ipcRenderer.invoke('folder-choose'),updateProjectSource:(id,payload)=>ipcRenderer.invoke('project-source-update',id,payload),refreshProjectSource:id=>ipcRenderer.invoke('project-source-refresh',id),openProjectSource:id=>ipcRenderer.invoke('project-source-open',id),
 newProject:name=>ipcRenderer.invoke('project-create',name),loadProject:(id,threadId)=>ipcRenderer.invoke('project-load',id,threadId),renameProject:name=>ipcRenderer.invoke('project-rename',name),
 renderDocumentPage:(chatId,id,page)=>ipcRenderer.invoke('document-page',chatId,id,page),
 readDocument:(id,offset)=>ipcRenderer.invoke('document-read',id,offset),openDocument:id=>ipcRenderer.invoke('document-open',id),saveNote:payload=>ipcRenderer.invoke('note-save',payload),
 clearWeb:id=>ipcRenderer.invoke('web-clear',id),cancel:id=>ipcRenderer.invoke('cancel',id),ask:payload=>ipcRenderer.invoke('ask',payload),openSource:url=>ipcRenderer.invoke('open-source',url),export:id=>ipcRenderer.invoke('export',id),
 onEvent:fn=>ipcRenderer.on('thread-event',(_e,event)=>fn(event)),
});
