const {_electron:electron,expect}=require('@playwright/test');const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ThreadStore}=require('../src/threads.cjs');
(async()=>{
 const profile=path.resolve('.test-data/background-'+Date.now()),store=new ThreadStore(profile),project=store.createProject('Background test');store.create(null);
 const file=path.join(profile,'incident-note.txt');fs.writeFileSync(file,'Incident response procedure. The incident triage code is COBALT-317. Notify the incident lead before isolating the affected system.');
 const app=await electron.launch({args:['.'],env:{...process.env,DESK_TEST_PROFILE:profile}});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#composer-add');await page.waitForFunction(async()=> (await window.desk.status()).ready,null,{timeout:120000});
  // Hold just the first inference so queuing/navigation assertions are deterministic.
  await app.evaluate(({app,dialog},file)=>{const {Runtime}=process.mainModule.require(app.getAppPath()+'/src/runtime.cjs');const original=Runtime.prototype.complete;global.__restoreModel=()=>Runtime.prototype.complete=original;Runtime.prototype.complete=async function(_m,signal,_json,delta){return new Promise((resolve,reject)=>{global.__releaseFirst=()=>{delta?.('A_PRIVATE_RESULT');resolve('A_PRIVATE_RESULT');};signal.addEventListener('abort',()=>reject(Error('Stopped')),{once:true});});};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  await page.fill('#prompt','First background request');await page.click('#send');await expect(page.locator('.message.assistant')).toHaveAttribute('data-status','running');const a=await page.evaluate(()=>window.workspaceUI.snapshot().threadId);
  await page.click('#new');await expect(page.locator('#messages .message')).toHaveCount(0);await expect(page.locator('#send')).toBeEnabled();
  await page.getByRole('button',{name:'New conversation in Background test',exact:true}).click();await page.waitForFunction(id=>window.workspaceUI.snapshot().projectId===id,project.id);const b=await page.evaluate(()=>window.workspaceUI.snapshot().threadId);
  await page.click('#composer-add');await expect(page.locator('.attachment-card')).toHaveCount(1,{timeout:60000});await expect(page.locator('.attachment-name')).toHaveText('incident-note.txt');
  await page.fill('#prompt','Use only this file. What is the incident triage code?');await page.click('#send');await expect(page.locator('.message.assistant')).toHaveAttribute('data-status','queued');await expect(page.locator('.sent-attachment')).toHaveCount(1);await expect(page.locator('.attachment-card')).toHaveCount(0);
  await page.fill('#prompt','Keep this draft while the answer finishes');
  await page.click('#activity-bell');await expect(page.getByRole('dialog')).toContainText('Queued');await page.keyboard.press('Escape');
  await app.evaluate(()=>{global.__restoreModel();global.__releaseFirst();});
  await expect(page.locator('.message.assistant')).toHaveAttribute('data-status','complete',{timeout:120000});await expect(page.locator('.message.assistant .body')).toContainText('COBALT-317');await expect(page.locator('#prompt')).toHaveValue('Keep this draft while the answer finishes');await expect(page.locator('#messages')).not.toContainText('A_PRIVATE_RESULT');
  const states=await page.evaluate(async({a,b})=>{const first=await window.desk.load(a),second=await window.desk.load(b);return {first,second};},{a,b});assert.equal(states.first.messages[1].content,'A_PRIVATE_RESULT');assert.match(states.second.messages[1].content,/COBALT-317/);assert.equal(states.second.draft,'Keep this draft while the answer finishes');
  await page.screenshot({path:'.test-data/background-chats.png'});assert.deepEqual(errors,[]);console.log('PASS: queued cross-project chats, background navigation, native composer attachment, isolated real-model answer and preserved draft.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
