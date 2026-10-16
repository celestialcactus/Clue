const {_electron:electron,expect}=require('@playwright/test');const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const profile=path.resolve('.test-data/ui-'+Date.now());fs.mkdirSync(profile,{recursive:true});const fixture=path.join(profile,'Safety notes.txt');fs.writeFileSync(fixture,'Fire drills happen every Tuesday at 10 AM. Meet at the north parking lot. PPE training must happen every year.');
 const launch=()=>electron.launch({args:['.'],env:{...process.env,DESK_TEST_PROFILE:profile}});let app=await launch();
 async function ask(page,text){await page.fill('#prompt',text);await page.click('#send');await page.waitForSelector('.message.assistant[data-status="running"]');await page.waitForFunction(()=>!document.getElementById('send').disabled,null,{timeout:180000});const last=page.locator('.message.assistant').last();assert.equal(await last.getAttribute('data-status'),'complete',await last.textContent());return last;}
 try{
  let page=await app.firstWindow();await page.waitForSelector('#prompt');await page.waitForFunction(()=>document.getElementById('saved-state').textContent==='Saved locally');await page.screenshot({path:'.test-data/welcome-v3.png'});
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
  await page.click('#add');await page.getByText('Safety notes.txt',{exact:true}).waitFor();await page.locator('.doc input').check();
  const pdf=path.join(profile,'Interface.pdf');const pdfData=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.printToPDF({})).toString('base64'));fs.writeFileSync(pdf,Buffer.from(pdfData,'base64'));
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},pdf);await page.click('#add');await page.getByText('Interface.pdf',{exact:true}).waitFor();
  await page.waitForFunction(()=>!document.getElementById('send').disabled,null,{timeout:150000});
  await page.evaluate(()=>{window.testDeltas=0;window.desk.onEvent(e=>{if(e.type==='delta')window.testDeltas++;});});
  let last=await ask(page,'When are fire drills and where do we meet?');assert.match(await last.locator('.body').textContent(),/Tuesday/i);assert.match(await last.locator('.body').textContent(),/north/i);assert.ok(await page.evaluate(()=>window.testDeltas)>1,'Answer should stream multiple deltas');
  await last.locator('.activities summary').click();await last.locator('.sources summary').click();await page.screenshot({path:'.test-data/answer-v3.png'});
  await page.getByRole('button',{name:'Safety notes.txt',exact:true}).click();await expect(page.locator('#preview-content')).toContainText('north parking lot');
  await page.click('#close-files');await expect(page.locator('#files-pane')).toBeHidden();await page.click('#toggle-files');
  await page.click('#new-note');await page.fill('#note-name','Project plan.md');await page.fill('#note-text','Review safety procedures on Friday.');await page.click('#save-note');await page.getByRole('button',{name:'Project plan.md',exact:true}).waitFor();
  await page.click('#rename');await page.fill('#rename-input','Safety review');await page.click('#rename-form button[type="submit"]');await expect(page.locator('#title')).toHaveText('Safety review');
  await page.fill('#prompt','Remember this draft for later');await expect(page.locator('#saved-state')).toHaveText('Saved locally');
  await app.close();app=await launch();page=await app.firstWindow();await expect(page.locator('#title')).toHaveText('Safety review');await expect(page.locator('#prompt')).toHaveValue('Remember this draft for later');assert.equal(await page.locator('.doc input').first().isChecked(),true);assert.equal(await page.locator('#web-enabled').count(),0);assert.match(await page.locator('.message.assistant .body').textContent(),/Tuesday/i);
  await page.click('#new');await expect(page.locator('#title')).toHaveText('New conversation');assert.equal(await page.locator('.message').count(),0);assert.equal(await page.locator('.doc input').first().isChecked(),false);
  await page.getByRole('button',{name:'Safety review',exact:true}).click();await expect(page.locator('#prompt')).toHaveValue('Remember this draft for later');await page.waitForFunction(()=>!document.getElementById('send').disabled,null,{timeout:150000});
  last=await ask(page,'What time did you say?');assert.match(await last.locator('.body').textContent(),/10\s*(?:AM|a\.m\.|a\.m)/i);
  last=await ask(page,'Search the web for OSHA hazard communication requirements then compare them with the selected document.');
  const activities=await last.locator('.activities').textContent();assert.match(activities,/Searching the web for/);assert.match(activities,/Finding relevant passages/);
  assert.match(await last.locator('.body').textContent(),/local document|Safety notes|selected document|SOP/i,'Comparison should discuss the local side as well as web evidence');
  const data=JSON.parse(fs.readFileSync(path.join(profile,'threads.json'),'utf8'));const thread=data.threads.find(t=>t.title==='Safety review');assert.ok(thread.research.query.length>4);assert.ok(thread.messages.at(-1).activities.some(a=>a.kind==='query'));assert.ok(thread.messages.at(-1).activities.some(a=>a.kind==='web_search'&&a.status==='complete'),'Live search must succeed');assert.ok(thread.research.results.length>0);
  await last.locator('.activities summary').click();await page.screenshot({path:'.test-data/workflow-v3.png'});
  const defaultProject=await page.locator('#project-select').inputValue();await page.click('#project-new');await page.fill('#rename-input','Separate project');await page.click('#rename-form button[type="submit"]');await expect(page.locator('#project-files-title')).toHaveText('Separate project');assert.equal(await page.locator('.doc').count(),0);assert.equal(await page.locator('.message').count(),0);
  await page.selectOption('#project-select',defaultProject);await expect(page.locator('#title')).toHaveText('Safety review');await expect(page.locator('.doc')).toHaveCount(3);
  await page.fill('#prompt','Explain every detail of this document in a long, thorough answer.');await page.click('#send');await page.waitForSelector('.message.assistant[data-status="running"]');await page.click('#stop');await page.waitForSelector('.message.assistant[data-status="stopped"]');
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  console.log('PASS: PDF/text import; real streaming inference; narration; rename; draft, selection and history after restart; thread isolation; contextual follow-up; automatic live web search + local comparison; cancellation.');
  console.log('Test profile:',profile);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
