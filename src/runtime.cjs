const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const net=require('node:net');const {spawn}=require('node:child_process');const {randomBytes}=require('node:crypto');
function find(dir,name){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isFile()&&e.name===name)return p;if(e.isDirectory()){const hit=find(p,name);if(hit)return hit;}}}
class Runtime {
 constructor(root){this.root=root;this.contextSize=8192;this.tokenCounts=new Map();this.state='Starting local model…';this.key=randomBytes(32).toString('hex');}
 async start(){
  const exe=find(path.join(this.root,'runtime'),'llama-server.exe');const model=path.join(this.root,'model/model.gguf');
  if(!exe||!fs.existsSync(model)){this.state='Model files are missing. Reinstall Desk Assistant.';return;}
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  this.url=`http://127.0.0.1:${port}`;
  this.child=spawn(exe,['-m',model,'--host','127.0.0.1','--port',String(port),'-c','8192','-t',String(Math.max(1,Math.min(4,os.availableParallelism()-1))),'-ngl','0','--parallel','1','--api-key',this.key,'--no-webui'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  this.diagnostics='';this.child.stderr.on('data',data=>{this.diagnostics=(this.diagnostics+data.toString()).slice(-4000);});
  this.child.on('error',()=>{this.state='Could not start the local model. Reinstall or check antivirus permissions.';});
  this.child.on('exit',()=>{this.ready=false;this.state='Local model stopped. Close and reopen the app.';});
  for(let n=0;n<240;n++){
   if(this.child.exitCode!==null||this.child.killed)return;
   try{const r=await fetch(this.url+'/health',{headers:{Authorization:'Bearer '+this.key},signal:AbortSignal.timeout(1000)});if(r.ok){this.ready=true;this.state='Ready · runs on this computer';return;}}catch{}
   await new Promise(r=>setTimeout(r,500));
  }
  this.state='The model is taking too long to start. Close other apps and reopen Desk Assistant.'; this.child.kill();
 }
 async post(endpoint,body,signal){const r=await fetch(this.url+endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.key},body:JSON.stringify(body)});if(!r.ok)throw Error('Local model utility failed: '+endpoint+' ('+r.status+')');return r.json();}
 async countMessages(messages,signal){const key=JSON.stringify(messages);if(this.tokenCounts.has(key))return this.tokenCounts.get(key);const {prompt}=await this.post('/apply-template',{messages},signal);const {tokens}=await this.post('/tokenize',{content:prompt,add_special:true,parse_special:true},signal);if(!Array.isArray(tokens))throw Error('Tokenizer returned no tokens.');const count=tokens.length;if(this.tokenCounts.size>80)this.tokenCounts.clear();this.tokenCounts.set(key,count);return count;}
 async countText(text,signal){return (await this.post('/tokenize',{content:text,add_special:false,parse_special:false},signal)).tokens.length;}
 async fitText(text,budget,signal){if(await this.countText(text,signal)<=budget)return text;let low=0,high=text.length;while(high-low>16){const mid=Math.floor((low+high)/2);if(await this.countText(text.slice(0,mid),signal)<=budget)low=mid;else high=mid;}return text.slice(0,low);}
 async complete(messages,signal,json=false,onDelta,options={}){
  if(!this.ready)throw Error(this.state);
  const maxTokens=options.maxTokens||(json?300:1000);if(await this.countMessages(messages,signal)+maxTokens+128>this.contextSize)throw Error('The task exceeds the local model context after budgeting. Shorten the request or reduce selected evidence.');
  const r=await fetch(this.url+'/v1/chat/completions',{method:'POST',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.key},body:JSON.stringify({messages,temperature:.2,max_tokens:maxTokens,stream:!!onDelta,...(json?{response_format:{type:'json_object'}}:{})})});
  if(!r.ok)throw Error('The local model could not finish this request. Try a shorter question or start a new chat.');
  if(onDelta)return readCompletionStream(r.body,onDelta,signal);
  return (await r.json()).choices[0].message.content;
 }
 stop(){this.child?.kill();}
}
async function readCompletionStream(body,onDelta,signal){
 const decoder=new TextDecoder();let pending='',answer='',done=false;
 const line=raw=>{if(!raw.startsWith('data:'))return;const data=raw.slice(5).trim();if(data==='[DONE]'){done=true;return;}if(!data)return;const event=JSON.parse(data);if(event.error)throw Error(event.error.message||'Local inference failed.');const delta=event.choices?.[0]?.delta?.content;if(delta){answer+=delta;onDelta(delta);}};
 for await(const bytes of body){signal?.throwIfAborted();pending+=decoder.decode(bytes,{stream:true});let index;while((index=pending.indexOf('\n'))>=0){line(pending.slice(0,index).replace(/\r$/,''));pending=pending.slice(index+1);}if(done)break;}
 pending+=decoder.decode();if(pending.trim()&&!done)line(pending.trim());
 if(!done)throw Error('The model connection ended before the answer finished. Please retry.');
 return answer;
}
module.exports={Runtime,readCompletionStream};
