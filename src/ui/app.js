const $=id=>document.getElementById(id);
let thread=null,busy=false,ready=false,documents=[],chats=[],projects=[],projectId='',draftTimer,patchQueue=Promise.resolve(),preview=null,noteDirty=false,renameMode='thread';
const selected=new Set(),welcome=$('welcome').cloneNode(true);
function el(tag,text,cls){const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;}
function notice(message=''){$('notice').textContent=message.replace(/^Error invoking remote method '[^']+': Error: /,'');$('notice').hidden=!message;}
function scrollIfNearBottom(){const area=$('messages');if(area.scrollHeight-area.scrollTop-area.clientHeight<160)area.scrollTop=area.scrollHeight;}
function setBusy(value){
 busy=value;for(const id of ['send','add','new','clear-web','rename','project-select','project-new','project-rename','new-note','save-note'])$(id).disabled=value||(id==='send'&&!ready);
 $('stop').hidden=!value;$('prompt').disabled=value;$('note-name').disabled=value;$('note-text').disabled=value;
 document.querySelectorAll('.documents button,.documents input,.chat-row button,.retry').forEach(node=>node.disabled=value);
 if(!value)$('progress').textContent='Your files. Your computer. Your assistant.';
}
function queuePatch(patch){
 const id=thread?.id;if(!id)return Promise.resolve();$('saved-state').textContent='Saving…';
 patchQueue=patchQueue.catch(()=>{}).then(()=>window.desk.update(id,patch)).then(()=>{$('saved-state').textContent='Saved locally';});
 patchQueue.catch(e=>{notice(e.message);$('saved-state').textContent='Could not save';});return patchQueue;
}
async function flushDraft(){clearTimeout(draftTimer);if(thread&&!busy)await queuePatch({draft:$('prompt').value});await patchQueue;}
function renderDocs(){
 $('documents').replaceChildren();if(!documents.length)$('documents').append(el('p','No documents yet. Add a PDF, Word document, or text file.','hint'));
 for(const d of documents){const row=el('div',null,'doc'),label=el('div',null,'doc-label'),check=el('input');check.type='checkbox';check.setAttribute('aria-label','Use '+d.name+' as context');check.checked=selected.has(d.id);check.disabled=busy;
  check.onchange=()=>{check.checked?selected.add(d.id):selected.delete(d.id);thread.selected=[...selected];renderContext();queuePatch({selected:[...selected]});};
  const fileButton=el('button',d.name,'file-name');fileButton.title='Preview '+d.name;fileButton.onclick=()=>showDocument(d.id).catch(e=>notice(e.message));label.append(check,fileButton);const remove=el('button','×','delete');remove.title='Remove '+d.name;remove.disabled=busy;
  remove.onclick=async()=>{if(!confirm('Remove '+d.name+' from this project? Existing chat excerpts will remain.'))return;try{await flushDraft();selected.delete(d.id);documents=await window.desk.remove(d.id);if(preview?.id===d.id)closePreview();thread.selected=[...selected];renderDocs();renderContext();}catch(e){notice(e.message);}};
  row.append(label,remove);$('documents').append(row);
 }
}
function renderChats(){
 $('chats').replaceChildren();const filter=$('thread-filter').value.toLowerCase();
 for(const c of chats.filter(c=>c.title.toLowerCase().includes(filter))){const row=el('div',null,'chat-row'),button=el('button',c.title,c.id===thread?.id?'active':'');button.title=c.title;button.disabled=busy;
  button.onclick=async()=>{if(busy)return;try{await flushDraft();renderThread(await window.desk.load(c.id));await refresh();}catch(e){notice(e.message);}};
  const remove=el('button','×','delete');remove.title='Delete conversation';remove.disabled=busy;
  remove.onclick=async()=>{if(!confirm('Delete this conversation, its memory, and saved excerpts?'))return;try{await flushDraft();const activeId=await window.desk.deleteChat(c.id);if(thread?.id===c.id)renderThread(activeId?await window.desk.load(activeId):await window.desk.newChat());await refresh();}catch(e){notice(e.message);}};
  row.append(button,remove);$('chats').append(row);
 }
}
function renderContext(){
 if(!thread)return;
 $('thread-context').textContent=selected.size?`${selected.size} document${selected.size===1?'':'s'} selected`:'Context stays with this conversation';
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
 try{const state=await window.desk.status();ready=state.ready;documents=state.documents;chats=state.chats;projects=state.projects;projectId=state.activeProjectId;$('model-status').textContent=state.state;$('retrieval-state').textContent=state.retrievalState;$('model-dot').classList.toggle('amber',!ready);$('send').disabled=busy||!ready;renderProjects();renderDocs();renderChats();return state;}catch(e){notice(e.message);}
}
$('new').onclick=async()=>{try{await flushDraft();renderThread(await window.desk.newChat());notice();await refresh();$('prompt').focus();}catch(e){notice(e.message);}};
$('clear-web').onclick=async()=>{try{await flushDraft();thread=await window.desk.clearWeb(thread.id);renderContext();}catch(e){notice(e.message);}};
$('add').onclick=async()=>{try{await flushDraft();setBusy(true);notice();$('progress').textContent='Adding documents to your local library…';const result=await window.desk.import();documents=result.documents;renderDocs();if(result.errors.length)notice(result.errors.join('\n'));}catch(e){notice(e.message);}finally{setBusy(false);}};
$('thread-filter').oninput=renderChats;
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
function toggleFiles(open){$('files-pane').hidden=!open;$('toggle-files').setAttribute('aria-expanded',String(open));$('toggle-files').textContent=open?'Files ›':'Files ‹';}
function discardNote(){return !noteDirty||confirm('Discard unsaved changes to this note?');}
function closePreview(){preview=null;noteDirty=false;$('file-preview').hidden=true;}
async function showDocument(id,offset=0){if(!discardNote())return;const data=await window.desk.readDocument(id,offset);preview={id,offset,type:data.doc.editable?'note':'document',total:data.doc.chunks};noteDirty=false;toggleFiles(true);$('file-preview').hidden=false;$('preview-title').textContent=data.doc.name;$('note-editor').hidden=!data.doc.editable;$('preview-content').replaceChildren();if(data.doc.editable){$('note-name').value=data.doc.name;$('note-text').value=data.note;}else for(const part of data.parts){const section=el('section');section.append(el('small',`${part.page?'Page '+part.page+' · ':''}Passage ${part.part}`),el('p',part.text));$('preview-content').append(section);}$('preview-position').textContent=`${offset+1}–${Math.min(offset+3,data.doc.chunks)} / ${data.doc.chunks}`;$('preview-prev').hidden=$('preview-next').hidden=data.doc.editable;$('preview-prev').disabled=offset===0;$('preview-next').disabled=offset+3>=data.doc.chunks;$('open-original').hidden=!data.doc.hasOriginal;$('open-original').textContent='Open original ↗';}
function showWeb(result){if(!discardNote())return;const page=thread.research.pages.find(p=>p.sourceUrl===result.url||p.url===result.url)||result;preview={type:'web',url:result.url};noteDirty=false;toggleFiles(true);$('file-preview').hidden=false;$('note-editor').hidden=true;$('preview-title').textContent=result.title;$('preview-content').replaceChildren(el('p',page.text));$('preview-prev').hidden=$('preview-next').hidden=true;$('preview-position').textContent=page.retrieved?'Retrieved '+new Date(page.retrieved).toLocaleDateString():'';$('open-original').hidden=false;$('open-original').textContent='Open website ↗';}
$('project-new').onclick=()=>openNameDialog('project-new','New project name');
$('project-rename').onclick=()=>openNameDialog('project-rename','Project name',projects.find(p=>p.id===projectId)?.name||'');
$('project-select').onchange=async()=>{if(!discardNote()){$('project-select').value=projectId;return;}try{await flushDraft();closePreview();renderThread(await window.desk.loadProject($('project-select').value));await refresh();}catch(e){notice(e.message);}};
$('toggle-files').onclick=()=>toggleFiles($('files-pane').hidden);$('close-files').onclick=()=>toggleFiles(false);
$('preview-close').onclick=()=>{if(discardNote())closePreview();};
$('preview-prev').onclick=()=>showDocument(preview.id,Math.max(0,preview.offset-3)).catch(e=>notice(e.message));$('preview-next').onclick=()=>showDocument(preview.id,preview.offset+3).catch(e=>notice(e.message));
$('open-original').onclick=()=>{const task=preview.type==='web'?window.desk.openSource(preview.url):window.desk.openDocument(preview.id);task.catch(e=>notice(e.message));};
$('new-note').onclick=()=>{if(!discardNote())return;preview={type:'note',id:null};noteDirty=false;toggleFiles(true);$('file-preview').hidden=false;$('preview-title').textContent='New project note';$('preview-content').replaceChildren();$('note-editor').hidden=false;$('note-name').value='Project notes.md';$('note-text').value='';$('preview-prev').hidden=$('preview-next').hidden=$('open-original').hidden=true;$('preview-position').textContent='';$('note-text').focus();};
$('note-name').oninput=$('note-text').oninput=()=>{noteDirty=true;};
$('save-note').onclick=async()=>{try{await flushDraft();setBusy(true);$('progress').textContent='Saving and indexing project note…';const result=await window.desk.saveNote({id:preview.id,name:$('note-name').value,text:$('note-text').value});documents=result.documents;noteDirty=false;await showDocument(result.id);renderDocs();}catch(e){notice(e.message);}finally{setBusy(false);}};
