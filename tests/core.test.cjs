const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Library}=require('../src/library.cjs');const {runAgent}=require('../src/agent.cjs');const {isPublicIPv4}=require('../src/web.cjs');
test('imports, retrieves scoped evidence, deduplicates and persists deletion',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-test-'));try{
  const a=path.join(dir,'Safety.txt'),b=path.join(dir,'Leave.txt');fs.writeFileSync(a,'Protective gloves must be inspected every Monday.');fs.writeFileSync(b,'Annual leave requires manager approval.');
  const lib=new Library(path.join(dir,'data'));await lib.import(a);await lib.import(b);await lib.import(a);assert.equal(lib.list().length,2);
  assert.equal((await lib.search('protective gloves'))[0].name,'Safety.txt');assert.equal((await lib.search('protective gloves',[lib.list()[1].id])).length,0);
  const id=lib.list()[0].id;assert.match(lib.read(id)[0].text,/Monday/);lib.remove(id);assert.equal(new Library(path.join(dir,'data')).list().length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('network guard blocks private, loopback, link local, multicast and malformed IPs',()=>{
 for(const ip of ['127.0.0.1','10.0.1.2','172.16.1.2','192.168.2.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','999.1.1.1'])assert.equal(isPublicIPv4(ip),false,ip);
 assert.equal(isPublicIPv4('8.8.8.8'),true);
});
test('agent performs successive local actions then answers with evidence and no web tool',async()=>{
 const calls=[];let turn=0;const runtime={complete:async(messages,_signal,json)=>{calls.push(messages);return json?[JSON.stringify({action:'search',query:'gloves'}),JSON.stringify({action:'read',id:'a',offset:3}),JSON.stringify({action:'answer'})][turn++]:'Inspect gloves on Monday [S1].';}};
 const source={id:'a',name:'Safety',part:1,total:5,text:'Inspect gloves on Monday.'};
 const library={search:()=>[source],read:(_id,offset)=>[{...source,part:offset+1}],list:()=>[{id:'a',name:'Safety'}]};
 const result=await runAgent({message:'What should I do?',library,runtime,signal:new AbortController().signal});assert.equal(result.steps,2);assert.equal(result.sources.length,2);assert.match(result.answer,/\[S1\]/);assert.equal(calls.length,4);
});
test('agent rejects read actions outside selected document scope',async()=>{
 let read=false;const library={search:()=>[],read:()=>{read=true;return[];},list:()=>[{id:'private',name:'Outside scope'}]};
 const runtime={complete:async(_m,_s,json)=>json?'{"action":"read","id":"private"}':'No evidence.'};
 await runAgent({message:'Question',library,runtime,selected:[],signal:new AbortController().signal});assert.equal(read,true);
 read=false;library.list=()=>[];await runAgent({message:'Question',library,runtime,signal:new AbortController().signal});assert.equal(read,false);
});
test('cancellation prevents inference',async()=>{
 let called=false;await assert.rejects(runAgent({message:'Question',library:{search:()=>[],list:()=>[]},runtime:{complete:()=>{called=true;}},signal:AbortSignal.abort()}));assert.equal(called,false);
});

test('supporting passages preserve literal Markdown and HTML characters as quoted data',async()=>{
 const source={id:'doc',name:'Safety_[draft]',part:1,total:1,text:'Use **gloves**. <img src="tracker"> [link](javascript:alert)'};
 const result=await runAgent({message:'Summarize the document',library:{list:()=>[{id:'doc',name:source.name}],search:()=>[source],read:()=>[source]},runtime:{complete:async(_m,_s,json)=>json?'{"action":"answer"}':'Use gloves [S1].'},signal:new AbortController().signal});
 assert.ok(result.answer.includes('### Supporting passages'));
 assert.ok(result.answer.includes('Safety\\_\\[draft\\]'));
 assert.ok(result.answer.includes('\\*\\*gloves\\*\\*'));
 assert.ok(result.answer.includes('\\<img'));
 assert.doesNotMatch(result.answer,/function repeatsPreviousAnswer/);
});
test('Word and PDF imports extract text locally with PDF page references',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desk-formats-'));try{
  const JSZip=require('jszip');const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Annual training occurs in September.</w:t></w:r></w:p></w:body></w:document>');
  const doc=path.join(dir,'Training.docx');fs.writeFileSync(doc,await zip.generateAsync({type:'nodebuffer'}));
  const stream='BT /F1 12 Tf 50 750 Td (Inspect emergency exits weekly.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const pdfFile=path.join(dir,'Exits.pdf');fs.writeFileSync(pdfFile,pdf);const lib=new Library(path.join(dir,'data'));await lib.import(doc);await lib.import(pdfFile);assert.match((await lib.search('September'))[0].text,/September/);assert.equal((await lib.search('emergency'))[0].page,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
