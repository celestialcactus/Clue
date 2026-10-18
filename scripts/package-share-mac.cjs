const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
(async()=>{
 if(process.platform!=='darwin')throw Error('Run Mac packaging on macOS.');
 const version=require('../package.json').version,base=`Clue-${version}-macOS-${process.arch}`,dmg=path.resolve('dist',base+'.dmg'),zip=path.resolve('dist',base+'.zip');
 if(!fs.existsSync(dmg))throw Error('Build the DMG first.');
 if(fs.existsSync(zip))throw Error('ZIP already exists; use a fresh build directory.');
 const readme=path.resolve('dist','START-HERE-'+process.arch+'.txt');
 fs.writeFileSync(readme,`CLUE ${version} - Mac test release (${process.arch==='arm64'?'Apple Silicon: M1/M2/M3/M4 or newer':'Intel'})

1. Double-click the ZIP to extract it, then open the DMG.
2. Drag Clue into Applications. Eject the disk image.
3. Open Clue from Applications and wait for Ready.
4. Add documents with the + in the message box.

This preview is not Apple-notarized. If macOS blocks opening it, follow Apple's
instructions at https://support.apple.com/en-us/102445 to approve this trusted
download in System Settings > Privacy & Security > Open Anyway. Do not disable
Gatekeeper or other system-wide security settings. A managed work Mac may require IT.

Choose arm64 for an Apple chip or x64 for Intel (Apple menu > About This Mac).
The app is tested on macOS 15; older macOS versions have not been verified.
The model and embeddings are bundled. No Node.js, model account or separate download
is needed. Inference and document storage are local. Public web searches require
internet access and send search queries and page requests to public websites.
Answers can be wrong; check cited sources, especially for compliance decisions.
Your chats are saved locally. This package contains no developer chats or documents.
`);
 execFileSync('zip',['-0','-j',zip,dmg,readme],{stdio:'inherit'});
 execFileSync('unzip',['-t',zip],{stdio:'inherit'});
 for(const file of [dmg,zip]){const h=crypto.createHash('sha256');for await(const part of fs.createReadStream(file))h.update(part);fs.writeFileSync(file+'.sha256',h.digest('hex')+'  '+path.basename(file)+'\n');}
})().catch(e=>{console.error(e);process.exitCode=1;});
