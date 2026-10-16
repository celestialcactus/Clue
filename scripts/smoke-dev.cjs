const {fork}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const profile=path.resolve('.test-data','dev-'+Date.now()),source=path.resolve('src/ui/style.css');
const child=fork(path.resolve('scripts/dev.cjs'),[],{env:{...process.env,DESK_DEV_PROFILE:profile},stdio:['ignore','pipe','pipe','ipc']});
let launches=0,changed=false,stopping=false;let output='';
const timer=setTimeout(()=>{console.error('Dev launcher timeout',output);child.send('stop');child.disconnect();process.exitCode=1;},90000);
child.stdout.on('data',b=>{output+=b;launches=(output.match(/Starting Desk Assistant from source/g)||[]).length;});child.stderr.on('data',b=>{output+=b;});
const poll=setInterval(()=>{
 const store=path.join(profile,'threads.json');
 if(!changed&&fs.existsSync(store)){const data=JSON.parse(fs.readFileSync(store));if(!data.threads.length)return;changed=true;const time=new Date();fs.utimesSync(source,time,time);}
 if(launches>=2&&!stopping){stopping=true;setTimeout(()=>{assert.ok(JSON.parse(fs.readFileSync(store)).threads.length>0);child.send('stop');child.disconnect();},2000);}
},250);
child.on('exit',code=>{clearInterval(poll);clearTimeout(timer);assert.equal(code,0);assert.ok(launches>=2);console.log('PASS: source dev launcher starts Electron, restarts after edits, preserves profile and shuts down.');});
