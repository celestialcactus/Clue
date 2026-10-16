const fs=require('node:fs');
// Windows indexers/antivirus can briefly lock a destination during replacement.
// Keep the original intact and retry the atomic rename; never unlink it first.
function writeJson(file,data){
 const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data));
 for(let attempt=0;;attempt++){try{fs.renameSync(temp,file);return;}catch(error){if(attempt>=4||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,15*2**attempt);}}
}
module.exports={writeJson};
