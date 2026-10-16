const fs=require('node:fs'); const path=require('node:path');
function find(dir,name){return fs.existsSync(dir)&&fs.readdirSync(dir,{withFileTypes:true}).some(e=>e.isDirectory()?find(path.join(dir,e.name),name):e.name===name);}
for(const [folder,name] of [['runtime','llama-server.exe'],['model','model.gguf'],['model','LICENSE'],['runtime','LICENSE'],['embeddings','model_quantized.onnx'],['embeddings','tokenizer.json'],['embeddings','LICENSE']]){
 if(!find(path.join(__dirname,'../assets',folder),name))throw Error(`Missing bundled ${name}. Run npm run assets before packaging.`);
}
