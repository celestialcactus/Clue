const $=id=>document.getElementById(id);
let thread=null,busy=false,ready=false,documents=[],chats=[],projects=[],projectId='',draftTimer,patchQueue=Promise.resolve(),preview=null,noteDirty=false,renameMode='thread',pendingAttachments=[],attachmentSignature='';
const selected=new Set(),welcome=$('welcome').cloneNode(true);
function el(tag,text,cls){const node=document.createElement(tag);if(tag==='button')node.type='button';if(text)node.textContent=text;if(cls)node.className=cls;return node;}
function notice(message=''){$('notice').textContent=message.replace(/^Error invoking remote method '[^']+': Error: /,'');$('notice').hidden=!message;}
function scrollIfNearBottom(){const area=$('messages');if(area.scrollHeight-area.scrollTop-area.clientHeight<160)area.scrollTop=area.scrollHeight;}
function setBusy(value){
 busy=value;for(const id of ['send','new','clear-web','rename','project-select','project-new','project-rename','new-note','save-note','use-document','edit-note'])$(id).disabled=value||(id==='send'&&!ready);
 $('stop').hidden=!value;$('prompt').disabled=value;$('note-name').disabled=value;$('note-text').disabled=value;
 document.querySelectorAll('.documents button,.documents input,.chat-row button,.retry').forEach(node=>node.disabled=value);
 if(!value)$('progress').textContent='';renderAttachments();publishWorkspace();
}
function queuePatch(patch){
 const id=thread?.id;if(!id)return Promise.resolve();$('saved-state').textContent='Saving…';
 patchQueue=patchQueue.catch(()=>{}).then(()=>window.desk.update(id,patch)).then(()=>{$('saved-state').textContent='Saved locally';});
 patchQueue.catch(e=>{notice(e.message);$('saved-state').textContent='Could not save';});return patchQueue;
}
async function flushDraft(){clearTimeout(draftTimer);if(thread&&!busy)await queuePatch({draft:$('prompt').value});await patchQueue;}
function publishWorkspace(){window.dispatchEvent(new Event('workspace-state'));}
function renderDocs(){renderAttachments();publishWorkspace();if(preview?.id)$('use-document').textContent=selected.has(preview.id)?'Remove from chat context':'Use in chat';}
async function removeFile(id){const file=documents.find(d=>d.id===id);if(!file||!confirm('Remove '+file.name+' from this project? Existing chat excerpts will remain.'))return;if(preview?.id===id&&!discardNote())return;await flushDraft();documents=await window.desk.remove(id);selected.delete(id);if(preview?.id===id)closePreview();thread.selected=[...selected];renderDocs();renderContext();}
async function openChat(id){if(busy)return;await flushDraft();renderThread(await window.desk.load(id));await refresh();}
function renderChats(){
 $('chats').replaceChildren();
 for(const c of chats){const row=el('div',null,'chat-row'),button=el('button',c.title,c.id===thread?.id?'active':'');button.title=c.title;button.disabled=busy;
  button.onclick=async()=>{if(busy)return;try{await flushDraft();renderThread(await window.desk.load(c.id));await refresh();}catch(e){notice(e.message);}};
  const remove=el('button','×','delete');remove.title='Delete conversation';remove.disabled=busy;
  remove.onclick=async()=>{if(!confirm('Delete this conversation, its memory, and saved excerpts?'))return;try{await flushDraft();const activeId=await window.desk.deleteChat(c.id);if(thread?.id===c.id)renderThread(activeId?await window.desk.load(activeId):await window.desk.newChat());await refresh();}catch(e){notice(e.message);}};
  row.append(button,remove);$('chats').append(row);
 }
}
function renderContext(){
 if(!thread)return;
 $('thread-context').textContent=selected.size?`${selected.size} document${selected.size===1?'':'s'} selected`:'Project context';
 const results=thread.research?.results||[];$('context-count').textContent=`${results.length} web sources · ${thread.messages.length} messages`;
 $('source-count').textContent=String(results.length);$('web-results').replaceChildren();for(const r of results){const node=el('button',r.title,'web-result');node.append(el('span',new URL(r.url).hostname));node.onclick=()=>showWeb(r);$('web-results').append(node);}
 $('memory-text').textContent=thread.memory?.summary||'Older turns will be compacted when the model needs more context space. Full history stays saved.';
 const budget=thread.contextBudget;$('context-usage').textContent=budget?`${budget.inputTokens.toLocaleString()} / ${budget.capacity.toLocaleString()} tokens`:'';$('context-usage').title='Last prompt token count; space is reserved for the response.';
}
function activitiesNode(message){
 const details=el('details',null,'activities');details.open=message.status==='running';
 const running=(message.activities||[]).find(a=>a.status==='running');const count=message.activities?.length||0;
 details.append(el('summary',running?.label||(message.status==='running'?'Starting your request…':`${count} actions · ${message.status==='complete'?'finished':message.status}`)));
 const list=el('ol');for(const a of message.activities||[]){const row=el('li',null,a.status);row.append(el('span',a.status==='running'?'◌':a.status==='complete'?'✓':a.status==='failed'?'!':'—','activity-icon'),el('span',a.label));if(a.detail)row.append(el('small',a.detail));list.append(row);}details.append(list);return details;
}
function appendMessage(message,index){
 const article=el('article',null,'message '+message.role);article.dataset.messageId=message.id;article.dataset.status=message.status;
 article.append(el('div',message.role==='user'?'You':'Desk Assistant','speaker'));
 if(message.role==='assistant')article.append(activitiesNode(message));
 article.append(el('div',message.content,'body'));
 if(message.error){article.append(el('p',message.error,'message-error'));const retry=el('button','Retry this request','retry');retry.disabled=busy;retry.onclick=()=>{const previous=thread.messages[index-1];if(previous?.role==='user'){$('prompt').value=previous.content;$('composer').requestSubmit();}};article.append(retry);}
 if(message.sources?.length){const details=el('details',null,'sources');details.append(el('summary',`${message.sources.length} source passages · view evidence`));for(const s of message.sources){const box=el('div',null,'source');box.append(el('b',`[${s.citation}] ${s.label}`));if(s.retrieved)box.append(el('div','Retrieved '+new Date(s.retrieved).toLocaleDateString()));box.append(el('p',s.text));if(s.url){const link=el('button','Open public source ↗');link.onclick=()=>window.desk.openSource(s.url).catch(e=>notice(e.message));box.append(link);}details.append(box);}article.append(details);}
 $('messages').append(article);
}
function renderThread(value){
 thread=value;selected.clear();thread.selected.forEach(id=>selected.add(id));$('title').textContent=thread.title;$('prompt').value=thread.draft||'';
 $('messages').replaceChildren();if(!thread.messages.length)$('messages').append(welcome.cloneNode(true));else thread.messages.forEach(appendMessage);
 renderDocs();renderContext();renderChats();$('messages').scrollTop=$('messages').scrollHeight;$('saved-state').textContent='Saved locally';
}
async function refresh(){
 try{const state=await window.desk.status();ready=state.ready;documents=state.documents;chats=state.chats;projects=state.projects;projectId=state.activeProjectId;$('model-status').textContent=state.state;$('model-dot').classList.toggle('amber',!ready);$('send').disabled=busy||!ready;renderProjects();renderDocs();renderChats();return state;}catch(e){notice(e.message);}
}
$('new').onclick=async()=>{try{await flushDraft();renderThread(await window.desk.newChat());notice();await refresh();$('prompt').focus();}catch(e){notice(e.message);}};
$('clear-web').onclick=async()=>{try{await flushDraft();thread=await window.desk.clearWeb(thread.id);renderContext();}catch(e){notice(e.message);}};
async function importFiles(){try{await flushDraft();setBusy(true);notice();$('progress').textContent='Adding documents to your local library…';const result=await window.desk.import();documents=result.documents;renderDocs();if(result.errors.length)notice(result.errors.join('\n'));}catch(e){notice(e.message);}finally{setBusy(false);}};

$('prompt').oninput=()=>{clearTimeout(draftTimer);$('saved-state').textContent='Saving…';draftTimer=setTimeout(()=>queuePatch({draft:$('prompt').value}),300);};
$('prompt').onblur=()=>{if(!busy)flushDraft().catch(e=>notice(e.message));};
$('composer').onsubmit=async event=>{
 event.preventDefault();if(busy||!ready||!thread)return;const message=$('prompt').value.trim();if(!message)return;
 const pendingDraft=flushDraft();setBusy(true);
 try{await pendingDraft;notice();$('prompt').value='';const result=await window.desk.ask({message,chatId:thread.id,selected:[...selected]});renderThread(result.thread);}
 catch(e){notice(e.message);$('prompt').value=message;}
 finally{setBusy(false);await refresh();$('prompt').focus();}
};
$('prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}};
$('stop').onclick=()=>window.desk.cancel().catch(e=>notice(e.message));
$('export').onclick=()=>thread?window.desk.export(thread.id).catch(e=>notice(e.message)):notice('Start a conversation before exporting.');
$('rename').onclick=()=>openNameDialog('thread','Conversation name',thread.title);
$('rename-cancel').onclick=()=>$('rename-dialog').close();
$('rename-form').onsubmit=async e=>{e.preventDefault();try{const title=$('rename-input').value.trim();if(!title)return;await flushDraft();if(renameMode==='thread'){await queuePatch({title});thread.title=title;$('title').textContent=title;}else if(renameMode==='project-new'){if(!discardNote())return;closePreview();renderThread(await window.desk.newProject(title));}else await window.desk.renameProject(title);$('rename-dialog').close();await refresh();}catch(error){notice(error.message);}};
$('messages').onclick=e=>{const button=e.target.closest('[data-prompt]');if(button){$('prompt').value=button.dataset.prompt;$('prompt').focus();$('prompt').dispatchEvent(new Event('input'));}};
window.desk.onEvent(event=>{
 if(event.threadId!==thread?.id)return;
 if(event.type==='started'){renderThread(event.thread);setBusy(true);return;}
 if(event.type==='finished'){renderThread(event.thread);return;}
 const message=thread.messages.find(m=>m.id===event.messageId);if(!message)return;
 const article=[...$('messages').querySelectorAll('.message')].find(n=>n.dataset.messageId===message.id);if(!article)return;
 if(event.type==='activity'){
  const i=message.activities.findIndex(a=>a.id===event.activity.id);if(i>=0)message.activities[i]=event.activity;else message.activities.push(event.activity);
  article.querySelector('.activities').replaceWith(activitiesNode(message));if(event.activity.status==='running')$('progress').textContent=event.activity.label;
 }else if(event.type==='delta'){message.content+=event.delta;article.querySelector('.body').textContent=message.content;}
 scrollIfNearBottom();
});
(async()=>{const state=await refresh();if(!state)return;renderThread(state.activeId?await window.desk.load(state.activeId):await window.desk.newChat());await refresh();})().catch(e=>notice(e.message));
setInterval(refresh,4000);
function renderProjects(){const select=$('project-select');if(document.activeElement!==select){select.replaceChildren(...projects.map(p=>{const option=el('option',p.name);option.value=p.id;return option;}));select.value=projectId;}$('project-files-title').textContent=projects.find(p=>p.id===projectId)?.name||'Project files';}
function openNameDialog(mode,label,value=''){renameMode=mode;$('rename-label').textContent=label;$('rename-input').value=value;$('rename-dialog').showModal();$('rename-input').focus();$('rename-input').select();}
function toggleFiles(open){$('files-pane').hidden=!open;$('pane-resizer').hidden=!open;localStorage.setItem('preview-open',String(open));if(open)applyPaneWidth(paneWidth);publishWorkspace();}
function discardNote(){return !noteDirty||confirm('Discard unsaved changes to this note?');}
function closePreview(){preview=null;noteDirty=false;$('file-preview').hidden=true;$('preview-empty').hidden=false;}
let previewRequest=0;
async function showDocument(id,offset=0){if(!discardNote())return;const request=++previewRequest,project=projectId;const data=await window.desk.readDocument(id,offset);if(request!==previewRequest||project!==projectId)return;preview={id,offset,type:'document',editable:data.doc.editable,note:data.note,total:data.doc.chunks};noteDirty=false;toggleFiles(true);$('preview-empty').hidden=true;$('file-preview').hidden=false;$('preview-title').textContent=data.doc.name;$('note-editor').hidden=true;$('preview-content').hidden=false;$('preview-content').replaceChildren();
 if(data.doc.editable)$('preview-content').append(el('p',data.note));else for(const part of data.parts){const section=el('section');section.append(el('small',part.page?'Page '+part.page:'Passage '+part.part),el('p',part.text));$('preview-content').append(section);}
 $('preview-position').textContent=data.doc.editable?'Project note':(offset+1)+'–'+Math.min(offset+3,data.doc.chunks)+' / '+data.doc.chunks;$('preview-prev').hidden=$('preview-next').hidden=data.doc.editable;$('preview-prev').disabled=offset===0;$('preview-next').disabled=offset+3>=data.doc.chunks;$('open-original').hidden=!data.doc.hasOriginal;$('open-original').textContent='Open original ↗';$('use-document').hidden=false;$('edit-note').hidden=!data.doc.editable;renderDocs();}
function showWeb(result){if(!discardNote())return;const page=thread.research.pages.find(p=>p.sourceUrl===result.url||p.url===result.url)||result;preview={type:'web',url:result.url};noteDirty=false;toggleFiles(true);$('preview-empty').hidden=true;$('file-preview').hidden=false;$('note-editor').hidden=true;$('preview-content').hidden=false;$('preview-title').textContent=result.title;$('preview-content').replaceChildren(el('p',page.text));$('preview-prev').hidden=$('preview-next').hidden=$('use-document').hidden=$('edit-note').hidden=true;$('preview-position').textContent=page.retrieved?'Retrieved '+new Date(page.retrieved).toLocaleDateString():'';$('open-original').hidden=false;$('open-original').textContent='Open website ↗';}
$('project-new').onclick=()=>openNameDialog('project-new','New project name');
$('project-rename').onclick=()=>openNameDialog('project-rename','Project name',projects.find(p=>p.id===projectId)?.name||'');
$('project-select').onchange=async()=>{if(!discardNote()){$('project-select').value=projectId;return;}try{await flushDraft();closePreview();renderThread(await window.desk.loadProject($('project-select').value));await refresh();}catch(e){notice(e.message);}};

$('preview-close').onclick=()=>{if(discardNote())closePreview();};
$('preview-prev').onclick=()=>showDocument(preview.id,Math.max(0,preview.offset-3)).catch(e=>notice(e.message));$('preview-next').onclick=()=>showDocument(preview.id,preview.offset+3).catch(e=>notice(e.message));
$('open-original').onclick=()=>{const task=preview.type==='web'?window.desk.openSource(preview.url):window.desk.openDocument(preview.id);task.catch(e=>notice(e.message));};
$('new-note').onclick=()=>{if(!discardNote())return;preview={type:'note',id:null};noteDirty=false;toggleFiles(true);$('preview-empty').hidden=true;$('preview-content').hidden=true;$('use-document').hidden=$('edit-note').hidden=true;$('file-preview').hidden=false;$('preview-title').textContent='New project note';$('preview-content').replaceChildren();$('note-editor').hidden=false;$('note-name').value='Project notes.md';$('note-text').value='';$('preview-prev').hidden=$('preview-next').hidden=$('open-original').hidden=true;$('preview-position').textContent='';$('note-text').focus();};
$('note-name').oninput=$('note-text').oninput=()=>{noteDirty=true;};
$('save-note').onclick=async()=>{try{await flushDraft();setBusy(true);$('progress').textContent='Saving and indexing project note…';const result=await window.desk.saveNote({id:preview.id,name:$('note-name').value,text:$('note-text').value});documents=result.documents;noteDirty=false;await showDocument(result.id);renderDocs();}catch(e){notice(e.message);}finally{setBusy(false);}};

$('browse-files').onclick=()=>$('search-files')?.click();
$('use-document').onclick=async()=>{if(busy||!preview?.id)return;try{selected.has(preview.id)?selected.delete(preview.id):selected.add(preview.id);thread.selected=[...selected];await queuePatch({selected:[...selected]});renderContext();renderDocs();}catch(e){notice(e.message);}};
$('edit-note').onclick=()=>{if(!preview?.editable)return;$('note-name').value=$('preview-title').textContent;$('note-text').value=preview.note;$('note-editor').hidden=false;$('preview-content').hidden=true;$('edit-note').hidden=true;$('note-text').focus();};
$('cancel-note').onclick=()=>{if(!discardNote())return;noteDirty=false;if(preview?.id)showDocument(preview.id).catch(e=>notice(e.message));else closePreview();};
let paneWidth=Number(localStorage.getItem('preview-width'))||380;
function applyPaneWidth(width){const max=Math.max(280,Math.min(720,window.innerWidth-600));paneWidth=Math.max(280,Math.min(max,width));$('files-pane').style.width=paneWidth+'px';$('pane-resizer').setAttribute('aria-valuemin','280');$('pane-resizer').setAttribute('aria-valuemax',String(max));$('pane-resizer').setAttribute('aria-valuenow',String(Math.round(paneWidth)));}
applyPaneWidth(paneWidth);toggleFiles(localStorage.getItem('preview-open')!=='false');
window.addEventListener('resize',()=>applyPaneWidth(paneWidth));
const divider=$('pane-resizer');let dragging=false,collapseOnRelease=false,dragStartWidth=paneWidth;
divider.onpointerdown=e=>{if(e.button!==0)return;dragging=true;dragStartWidth=paneWidth;collapseOnRelease=false;divider.setPointerCapture(e.pointerId);document.body.classList.add('resizing');};
divider.onpointermove=e=>{if(!dragging)return;const desired=window.innerWidth-e.clientX;collapseOnRelease=desired<180;applyPaneWidth(desired);divider.classList.toggle('will-collapse',collapseOnRelease);};
function finishResize(e){if(!dragging)return;dragging=false;document.body.classList.remove('resizing');divider.classList.remove('will-collapse');if(divider.hasPointerCapture(e.pointerId))divider.releasePointerCapture(e.pointerId);if(collapseOnRelease){applyPaneWidth(dragStartWidth);toggleFiles(false);}else localStorage.setItem('preview-width',String(paneWidth));}
divider.onpointerup=finishResize;divider.onpointercancel=finishResize;
divider.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();applyPaneWidth(paneWidth+(e.key==='ArrowLeft'?24:-24));localStorage.setItem('preview-width',String(paneWidth));}else if(e.key==='Enter'){e.preventDefault();toggleFiles(false);$('toggle-files')?.focus();}};
window.workspaceUI={snapshot:()=>({documents,chats,projectId,projectName:projects.find(p=>p.id===projectId)?.name||'My project',busy,paneOpen:!$('files-pane').hidden}),searchChats:query=>window.desk.searchChats(query),preview:showDocument,openChat,removeFile,importFiles,togglePane:toggleFiles};
const chatDropPane=document.querySelector('main');
const dropOverlay=el('div',null,'chat-drop-overlay');dropOverlay.id='chat-drop-overlay';dropOverlay.hidden=true;dropOverlay.setAttribute('aria-hidden','true');dropOverlay.append(el('strong','Drop documents here'),el('span','Add to this project and use in this chat'),el('small','PDF, Word, text, Markdown or CSV · up to 40 MB each'));chatDropPane.append(dropOverlay);
let dragDepth=0;
const hasFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
function clearDrop(){dragDepth=0;dropOverlay.hidden=true;}
// Prevent Chromium from navigating to a file dropped outside the chat target.
window.addEventListener('dragover',e=>{if(hasFiles(e)){e.preventDefault();if(!chatDropPane.contains(e.target))e.dataTransfer.dropEffect='none';}});
window.addEventListener('drop',e=>{if(hasFiles(e))e.preventDefault();clearDrop();});
window.addEventListener('dragend',clearDrop);window.addEventListener('blur',clearDrop);
chatDropPane.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();dragDepth++;if(!busy&&thread)dropOverlay.hidden=false;});
chatDropPane.addEventListener('dragleave',e=>{if(!hasFiles(e))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)clearDrop();});
chatDropPane.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect=busy||!thread?'none':'copy';});
chatDropPane.addEventListener('drop',async e=>{
 if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();clearDrop();
 if(busy||!thread){notice('Wait for the current task to finish before adding documents.');return;}
 const files=Array.from(e.dataTransfer.files);if(!files.length)return;
 const chatId=thread.id,pending=flushDraft();pendingAttachments=files.map(file=>({name:file.name}));setBusy(true);notice();$('progress').textContent='Adding and indexing dropped documents…';
 try{await pending;const result=await window.desk.importDropped(files,chatId);documents=result.documents;selected.clear();result.selected.forEach(id=>selected.add(id));thread.selected=[...selected];renderDocs();renderContext();notice([result.imported?`${result.imported} document${result.imported===1?'':'s'} added to this chat. Your message has not been sent.`:'',...result.errors].filter(Boolean).join('\n'));}
 catch(error){notice(error.message);}finally{pendingAttachments=[];setBusy(false);await refresh();}
});

function attachmentIcon(){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6');svg.append(path);return svg;}
function renderAttachments(){
 const files=documents.filter(d=>selected.has(d.id)),signature=JSON.stringify({files:files.map(d=>[d.id,d.name]),pendingAttachments,busy});if(signature===attachmentSignature)return;attachmentSignature=signature;
 const tray=$('chat-attachments');tray.replaceChildren();tray.hidden=!files.length&&!pendingAttachments.length;
 for(const file of [...files,...pendingAttachments.map(d=>({...d,pending:true}))]){
  const card=el('div',null,'attachment-card');card.dataset.pending=String(!!file.pending);
  const button=el('button',null,'attachment-preview');button.title=file.name;button.setAttribute('aria-label',(file.pending?'Adding ':'Preview ')+file.name);button.disabled=!!file.pending;const visual=el('span',null,'attachment-visual');visual.append(attachmentIcon());
  const label=el('span',null,'attachment-label'),type=el('span',(file.name.split('.').pop()||'FILE').slice(0,5).toUpperCase(),'attachment-type');type.dataset.type=type.textContent.toLowerCase();label.append(type,el('span',file.name,'attachment-name'));button.append(visual,label);
  button.onclick=()=>showDocument(file.id).catch(e=>notice(e.message));card.append(button);
  if(file.pending){card.append(el('span','Adding…','attachment-status'));}else{const remove=el('button','×','attachment-remove');remove.title='Remove from chat context';remove.setAttribute('aria-label','Remove '+file.name+' from chat');remove.disabled=busy;remove.onclick=async()=>{if(busy)return;try{const next=[...selected].filter(id=>id!==file.id);await queuePatch({selected:next});selected.delete(file.id);thread.selected=next;renderDocs();renderContext();$('prompt').focus();}catch(e){notice(e.message);}};card.append(remove);}
  tray.append(card);
 }
}
