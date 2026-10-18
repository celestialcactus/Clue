// Upstream ONNX Runtime 1.23+ omits the Intel macOS Node binding.
// Pin the complete compatible package, never mix native binaries across versions.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
if(process.platform==='darwin'&&process.arch==='x64'){
 const file=require('node:path').resolve(__dirname,'../package.json');
 const config=JSON.parse(fs.readFileSync(file,'utf8'));
 config.overrides={...config.overrides,'onnxruntime-node':'1.22.0'};
 fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
 execFileSync('npm',['install','--no-audit','--no-fund'],{cwd:require('node:path').dirname(file),stdio:'inherit'});
}
