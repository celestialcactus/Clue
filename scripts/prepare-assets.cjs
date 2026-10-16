// Build-time downloads only. The installed app never downloads models or runtimes.
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const {Readable}=require('node:stream'); const {pipeline}=require('node:stream/promises'); const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../assets');
async function json(url){const r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${url}`);return r.json();}
async function download(url,file,expected){
  if(fs.existsSync(file)&&(!expected||await hash(file)===expected))return;
  console.log('Downloading',path.basename(file)); const r=await fetch(url);if(!r.ok)throw Error(`Download failed: ${r.status}`);
  await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(file+'.part'));
  if(expected&&await hash(file+'.part')!==expected)throw Error('SHA256 mismatch for '+file);
  fs.renameSync(file+'.part',file);
}
async function hash(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
(async()=>{
  for(const d of ['runtime','model','downloads'])fs.mkdirSync(path.join(root,d),{recursive:true});
  const manifestFile=path.join(root,'manifest.json');
  let manifest;
  if(fs.existsSync(manifestFile))manifest=JSON.parse(fs.readFileSync(manifestFile));
  else {
    let release=await json('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest');
    if(!release.assets.some(a=>/bin-win-cpu-x64\.zip$/.test(a.name))) {
      const pointer=release.assets.find(a=>a.name==='nightly-tag.txt');
      if(pointer){const tag=(await (await fetch(pointer.browser_download_url)).text()).trim(); release=await json(`https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${encodeURIComponent(tag)}`);}
    }
    const asset=release.assets.find(a=>/bin-win-cpu-x64\.zip$/.test(a.name));
    if(!asset)throw Error('Windows CPU runtime not found in release.');
    const repo='Qwen/Qwen2.5-1.5B-Instruct-GGUF';const model=await json(`https://huggingface.co/api/models/${repo}?blobs=true`);
    const file=model.siblings.find(s=>s.rfilename==='qwen2.5-1.5b-instruct-q4_k_m.gguf');
    if(!file?.lfs?.sha256)throw Error('Model checksum unavailable.');
    manifest={runtime:{version:release.tag_name,url:asset.browser_download_url,sha256:asset.digest?.replace('sha256:','')},model:{repo,revision:model.sha,file:file.rfilename,sha256:file.lfs.sha256}};
    fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2));
  }
  const zip=path.join(root,'downloads/runtime.zip');
  await download(manifest.runtime.url,zip,manifest.runtime.sha256);
  execFileSync('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath '${zip.replace(/'/g,"''")}' -DestinationPath '${path.join(root,'runtime').replace(/'/g,"''")}' -Force`]);
  await download(`https://huggingface.co/${manifest.model.repo}/resolve/${manifest.model.revision}/${manifest.model.file}`,path.join(root,'model/model.gguf'),manifest.model.sha256);
  await download(`https://huggingface.co/${manifest.model.repo}/resolve/${manifest.model.revision}/LICENSE`,path.join(root,'model/LICENSE'));
  await download(`https://raw.githubusercontent.com/ggml-org/llama.cpp/${manifest.runtime.version}/LICENSE`,path.join(root,'runtime/LICENSE'));
  fs.copyFileSync(manifestFile,path.join(root,'model/manifest.json'));
  console.log('Bundled runtime and model verified.');
})().catch(e=>{console.error(e);process.exitCode=1;});
