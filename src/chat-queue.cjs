// One inference worker. Each queued request owns its thread and library view;
// changing the visible chat never changes a job's inputs or event destination.
class ChatQueue {
 constructor({store,run,emit=()=>{}}){this.store=store;this.run=run;this.emit=emit;this.jobs=[];this.active=null;this.closed=false;}
 has(id){return this.jobs.some(j=>j.thread.id===id);}
 get busy(){return this.jobs.length>0;}
 enqueue({thread,message,attachments=[],...context}){
  if(this.closed)throw Error('Clue is closing.');
  if(this.has(thread.id))throw Error('This chat already has a request in progress. You can send in another chat.');
  const {assistant}=this.store.begin(thread.id,message,attachments);assistant.status='queued';
  const job={...context,thread,message,assistant,controller:new AbortController()};
  this.jobs.push(job);this.store.save();this.emit({type:'queued',threadId:thread.id,thread});
  setImmediate(()=>this.pump());return {thread};
 }
 async pump(){
  if(this.active||this.closed||!this.jobs.length)return;
  const job=this.jobs[0];this.active=job;const {thread,assistant,controller}=job;
  assistant.status='running';this.store.save();this.emit({type:'started',threadId:thread.id,thread});
  let lastSave=Date.now();
  try{
   const result=await this.run({...job,signal:controller.signal,save:()=>this.store.save(),
    onActivity:activity=>this.emit({type:'activity',threadId:thread.id,messageId:assistant.id,activity}),
    onDelta:delta=>{assistant.content+=delta;this.emit({type:'delta',threadId:thread.id,messageId:assistant.id,delta});if(Date.now()-lastSave>1000){this.store.save();lastSave=Date.now();}},
   });
   controller.signal.throwIfAborted();assistant.content=result.answer;assistant.sources=result.sources;assistant.status='complete';
  }catch(error){assistant.status=controller.signal.aborted?'stopped':'error';assistant.error=controller.signal.aborted?'Stopped. You can retry this request.':error.message;}
  finally{assistant.completedAt=new Date().toISOString();thread.updatedAt=assistant.completedAt;this.jobs=this.jobs.filter(j=>j!==job);this.active=null;this.store.save();this.emit({type:'finished',threadId:thread.id,thread});setImmediate(()=>this.pump());}
 }
 cancel(id){
  const job=this.jobs.find(j=>j.thread.id===id);if(!job)return;
  job.controller.abort();if(job===this.active)return;
  this.jobs=this.jobs.filter(j=>j!==job);job.assistant.status='stopped';job.assistant.error='Cancelled before starting.';job.assistant.completedAt=new Date().toISOString();this.store.save();this.emit({type:'finished',threadId:id,thread:job.thread});
 }
 close(){this.closed=true;for(const job of [...this.jobs])this.cancel(job.thread.id);}
}
module.exports={ChatQueue};
