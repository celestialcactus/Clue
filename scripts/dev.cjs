// Restart Electron after source edits. Keep a separate persistent development
// profile, and let normal Electron shutdown terminate the inference subprocess.
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),profile=process.env.DESK_DEV_PROFILE?path.resolve(process.env.DESK_DEV_PROFILE):path.join(root,'.dev-data');fs.mkdirSync(profile,{recursive:true});
let child,restarting=false,closing=false,timer;
function launch(){console.log('Starting Clue from source. Data: '+profile);child=spawn(require('electron'),['.'],{cwd:root,env:{...process.env,DESK_TEST_PROFILE:profile,DESK_DEV_RELOAD:'1',DESK_DEV_STARTED:String(Date.now())},stdio:'inherit',windowsHide:false});child.once('exit',()=>{child=null;if(restarting&&!closing){restarting=false;launch();}else if(!closing){console.log('App closed. Watching src/ for changes.');}});}
const watcher=fs.watch(path.join(root,'src'),{recursive:true},()=>{clearTimeout(timer);timer=setTimeout(()=>{if(closing)return;if(!child)return launch();if(restarting)return;restarting=true;console.log('Source changed; restarting…');fs.writeFileSync(path.join(profile,'reload.request'),String(Date.now()));},500);});
function stop(){closing=true;watcher.close();clearTimeout(timer);if(child)fs.writeFileSync(path.join(profile,'reload.request'),String(Date.now()));else process.exit();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);if(process.send)process.on('message',message=>{if(message==='stop')stop();});launch();
