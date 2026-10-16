const {randomUUID}=require('node:crypto');
const {routeIntent,publicTopic}=require('./intents.cjs');
const {completedMessages}=require('./context.cjs');
const {buildDocumentQuery}=require('./search-query.cjs');
const {runAgent}=require('./agent.cjs');

async function executeWorkflow({thread,assistant,message,library,runtime,searchWeb,readWeb,projectName='',getProjectHistory,signal,onActivity=()=>{},onDelta=()=>{},save=()=>{}}){
 const activity=async(kind,label,fn,detail='')=>{
  signal.throwIfAborted();const event={id:randomUUID(),kind,label,detail,status:'running',startedAt:new Date().toISOString()};
  assistant.activities.push(event);save();onActivity({...event});
  try{const result=await fn();signal.throwIfAborted();event.status='complete';event.finishedAt=new Date().toISOString();save();onActivity({...event});return result;}
  catch(e){event.status=signal.aborted?'stopped':'failed';event.detail=e.message;event.finishedAt=new Date().toISOString();save();onActivity({...event});throw e;}
 };
 const history=thread.messages.slice(0,-2);
 const previous=history.filter(m=>m.role==='assistant'&&m.status==='complete').at(-1);
 const named=library.list().filter(d=>message.toLowerCase().includes(d.name.toLowerCase())||message.toLowerCase().includes(d.name.split(/[\\/]/).pop().toLowerCase())).map(d=>d.id);
 if(named.length)thread.selected=named;
 thread.selected=thread.selected.filter(id=>library.list().some(d=>d.id===id));
 const intent=await activity('route','Identifying the task',async()=>routeIntent({message,previousQuery:thread.research.query||thread.publicTopic,selected:thread.selected,pendingWeb:thread.pendingWeb,hadSources:!!previous?.sources?.some(s=>s.documentId),hasLibrary:library.list().length>0}));
 assistant.intent=intent;thread.pendingWeb=!!intent.clarification;save();
 if(!intent.documents&&!intent.requestedWeb){const topic=publicTopic(message);if(topic)thread.publicTopic=topic;}
 await activity('route',`Task: ${intent.goal.replaceAll('_',' ')}${intent.requestedWeb?' · public web research':''}${intent.documents?' · local documents':''}`,async()=>{},intent.reason);
 if(intent.clarification){onDelta(intent.clarification);return {answer:intent.clarification,sources:[],steps:0};}
 let seedPassages;
 if(intent.documentInformed){
  seedPassages=await activity('documents','Finding document context for public research',()=>library.search(message,thread.selected));
  if(!seedPassages.length)for(const doc of library.list().filter(d=>!thread.selected.length||thread.selected.includes(d.id)).slice(0,3))seedPassages.push(...library.read(doc.id,0).slice(0,1));
  intent.query=await activity('query','Developing a public research topic from document context',()=>buildDocumentQuery({message,intent,passages:seedPassages.slice(0,5),projectName,runtime,signal}));
  if(!intent.query){const answer='I could not form a useful public query without including identifying information. Which public topic or standard should I research?';thread.pendingWeb=true;onDelta(answer);return {answer,sources:[],steps:0};}
 }
 const observations=[];
 if(intent.requestedWeb){
  thread.research={query:intent.query,results:[],pages:[]};thread.ignorePriorWeb=false;save();
  try{
   thread.research.results=await activity('web_search',`Searching the web for “${intent.query}”`,()=>searchWeb(intent.query,signal),'Only this public query is sent to the search provider.');save();
   observations.push(`Searched the public web for: ${intent.query}`);
  }catch(e){signal.throwIfAborted();observations.push('Public web search failed: '+e.message);}
 }
 if(intent.smallTalk)return runAgent({message,thread,history:completedMessages(history),memory:thread.memory.summary,library,runtime,signal,activity,onDelta,intent});
 const pages=thread.research.pages;
 const readPublic=async index=>{
  const result=thread.research.results[index];if(!result)return;
  const cached=pages.find(p=>p.sourceUrl===result.url||p.url===result.url);if(cached)return cached;
  if(!intent.allowNetwork||!intent.requestedWeb)return {...result,text:'Search snippet only: '+result.text};
  let page;
  try{page=await activity('web_read','Reading '+result.title,()=>readWeb(result.url,signal),result.url);}
  catch(e){signal.throwIfAborted();page={...result,text:'Search snippet only (page could not be read): '+result.text};observations.push(`Could not read ${result.url}; only its search snippet is available.`);}
  page.sourceUrl=result.url;pages.push(page);save();return page;
 };
 if(thread.research.results.length){
  if(!intent.requestedWeb&&pages.length)await activity('context','Reusing public sources saved in this conversation',async()=>{});
  for(let i=0;i<Math.min(3,thread.research.results.length);i++)await readPublic(i);
 }
 const web=thread.research.results.map(r=>pages.find(p=>p.sourceUrl===r.url||p.url===r.url)||{...r,text:'Search snippet only: '+r.text});
 const priorSources=(previous?.sources||[]).filter(s=>(!intent.requestedWeb&&!thread.ignorePriorWeb)||!s.url);
 const projectSources=getProjectHistory?getProjectHistory():[];
 if(projectSources.length)await activity('project_context','Using relevant history from other conversations in this project',async()=>{for(const source of projectSources)source.text=await runtime.fitText(source.text,220,signal);});
 const result=await runAgent({message,thread,projectSources,history:completedMessages(history),memory:thread.memory.summary,library,runtime,web,priorSources,seedPassages,selected:thread.selected,signal,activity,onDelta,intent,observations,readPublic:intent.allowNetwork&&intent.requestedWeb?readPublic:undefined});
 return {...result,intent};
}
module.exports={executeWorkflow};
