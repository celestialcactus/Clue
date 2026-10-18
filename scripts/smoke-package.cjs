const {_electron:electron}=require('@playwright/test');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const fs=require('node:fs'),asar=require('@electron/asar');
 const appDir=process.platform==='darwin'?path.join('dist',process.arch==='arm64'?'mac-arm64':'mac','Clue.app','Contents'):'dist/win-unpacked';
 const resources=path.join(appDir,process.platform==='darwin'?'Resources':'resources');
 for(const root of ['src','.renderer'])for(const name of fs.readdirSync(root,{recursive:true})){
  const file=path.join(root,name);if(fs.statSync(file).isFile())assert.ok(asar.extractFile(path.join(resources,'app.asar'),file).equals(fs.readFileSync(file)),'Packaged file differs from source: '+file);
 }
 const profile=path.resolve('.test-data/packaged-'+Date.now());
 require('node:fs').mkdirSync(profile,{recursive:true});
 const app=await electron.launch({executablePath:path.resolve(appDir,process.platform==='darwin'?'MacOS/Clue':'Clue.exe'),args:['--user-data-dir='+profile]});
 try{
  assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
  assert.equal(path.resolve(await app.evaluate(({app})=>app.getPath('userData'))),profile);
  assert.equal(await app.evaluate(({app})=>app.getVersion()),require('../package.json').version);
  const page=await app.firstWindow();await page.waitForFunction(()=>document.getElementById('model-status')?.textContent.startsWith('Ready'),null,{timeout:150000});
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  await page.waitForSelector('#projects-tree');await page.waitForSelector('#files-pane');assert.equal(await page.locator('#web-enabled').count(),0);await page.waitForSelector('#search-chats');await page.waitForSelector('#search-files');
  const vector=await app.evaluate(async()=>{const {Embeddings}=process.mainModule.require('./embeddings.cjs');const model=new Embeddings(process.resourcesPath);try{return (await model.encode('Document retrieval test')).length;}finally{await model.dispose();}});
  assert.equal(vector,384);
  console.log('PASS: packaged executable has the expected version, starts its bundled model and embeddings, and exposes project and conversation controls with renderer isolation enabled.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
