const {words,lexicalRank}=require('./retrieval.cjs');
// Retrieve original conversation excerpts with attribution. Never copy chats
// into other projects or turn assistant assertions into established facts.
function projectHistory(store,threadId,query){
 const active=store.require(threadId),passages=[];
 for(const thread of store.data.threads.filter(t=>t.projectId===active.projectId&&t.id!==active.id)){
  for(const message of thread.messages.filter(m=>['user','assistant'].includes(m.role)&&(!m.status||m.status==='complete')&&m.content)){
   for(let offset=0;offset<message.content.length;offset+=1000){const text=message.content.slice(offset,offset+1100),tokens=words(thread.title+' '+text),freq={};for(const token of tokens)freq[token]=(freq[token]||0)+1;
    passages.push({threadId:thread.id,messageId:message.id,offset,text,tokens,freq,date:message.createdAt||thread.updatedAt,label:`${thread.title} · ${message.role==='user'?'User statement':'Assistant response (may be mistaken)'} · ${message.createdAt||thread.updatedAt}`});}
  }
 }
 const relevant=lexicalRank(query,passages).map(r=>r.p),recent=[...passages].sort((a,b)=>b.date.localeCompare(a.date));
 const chosen=[],seen=new Set();for(const p of [...relevant.slice(0,5),...(/\b(other (?:chat|conversation|thread)|previous|earlier|we agreed|remember|project history)\b/i.test(query)?recent.slice(0,3):[])]){const key=p.threadId+':'+p.messageId+':'+p.offset;if(seen.has(key))continue;seen.add(key);chosen.push({threadId:p.threadId,messageId:p.messageId,part:p.offset,label:p.label,text:p.text,kind:'project_chat'});if(chosen.length>=6)break;}
 return chosen;
}
module.exports={projectHistory};
