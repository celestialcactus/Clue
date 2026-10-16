const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {words,hybridRank}=require('./retrieval.cjs');
const {writeJson}=require('./storage.cjs');
function chunks(text, size = 1000) {
  const out = [];
  for(let start=0;start<text.length;){let end=Math.min(text.length,start+size);if(end<text.length){const boundary=text.lastIndexOf('\n',end);if(boundary>start+size*.6)end=boundary;}out.push(text.slice(start,end));if(end===text.length)break;start=end-120;}
  return out;
}
class Library {
  constructor(dir, embedder=null) {
    this.dir = dir; fs.mkdirSync(dir, {recursive:true});
    this.embedder=embedder;this.files=path.join(dir,'files');fs.mkdirSync(this.files,{recursive:true});this.file = path.join(dir, 'library.json');
    this.docs = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  save() {this.index=null;writeJson(this.file,this.docs);}
  list() { return this.docs.map(({id,name,added,parts,editable,original}) => ({id,name,added,chunks:parts.length,editable:!!editable,hasOriginal:!!original})); }
  async import(file) {
    const stat = fs.statSync(file);
    if(stat.size > 40 * 1024 * 1024) throw Error('Please choose a document smaller than 40 MB.');
    const data = fs.readFileSync(file), hash = crypto.createHash('sha256').update(data).digest('hex');
    const existing=this.docs.find(d=>d.hash===hash);if(existing){if(!existing.original){existing.original=existing.id+path.extname(file).toLowerCase();fs.copyFileSync(file,path.join(this.files,existing.original));this.save();}await this.indexDocument(existing);return existing.id;}
    const ext=path.extname(file).toLowerCase(); let pages=[];
    if(ext==='.pdf') {
      const {PDFParse}=require('pdf-parse');const parser=new PDFParse({data:new Uint8Array(data),isEvalSupported:false});
      try{const result=await parser.getText();pages=result.pages.map(p=>({text:p.text,page:p.num}));}finally{await parser.destroy();}
    } else if(ext==='.docx') pages=[{text:(await require('mammoth').extractRawText({buffer:data})).value}];
    else if(['.txt','.md','.csv'].includes(ext)) pages=[{text:data.toString('utf8')}];
    else throw Error('Supported formats: PDF, Word (.docx), text, Markdown, and CSV.');
    const parts=pages.flatMap(p=>chunks(p.text).map(text=>({text,page:p.page}))).filter(p=>p.text.trim());
    if(!parts.length) throw Error('No readable text found. Scanned documents need OCR before importing.');
    const id=crypto.randomUUID(),original=id+ext;fs.copyFileSync(file,path.join(this.files,original));
    const doc={id,hash,name:path.basename(file),added:new Date().toISOString(),parts,original};this.docs.push(doc);this.save();await this.indexDocument(doc);
  }
  remove(id) { const doc=this.docs.find(d=>d.id===id);this.docs=this.docs.filter(d=>d.id!==id);this.save();if(doc?.original)fs.rmSync(path.join(this.files,path.basename(doc.original)),{force:true}); }
  originalPath(id){const doc=this.docs.find(d=>d.id===id);if(!doc?.original)throw Error('This older import has extracted text only. Re-import the original to keep a file copy.');return path.join(this.files,path.basename(doc.original));}
  async saveNote(id,name,text){
    if(typeof text!=='string'||text.length>200000)throw Error('Notes must be under 200,000 characters.');if(!text.trim())throw Error('Enter some note text.');
    let doc=id?this.docs.find(d=>d.id===id):null;if(id&&(!doc||!doc.editable))throw Error('Only project notes can be edited.');
    if(!doc){doc={id:crypto.randomUUID(),editable:true,added:new Date().toISOString()};this.docs.push(doc);}
    doc.name=path.basename(String(name||'Project note.md')).slice(0,120);doc.original=doc.id+'.md';doc.hash=crypto.createHash('sha256').update(text).digest('hex');doc.parts=chunks(text).map(text=>({text}));
    fs.writeFileSync(path.join(this.files,doc.original),text);this.save();await this.indexDocument(doc);return doc.id;
  }
  noteText(id){const doc=this.docs.find(d=>d.id===id);if(!doc?.editable)throw Error('This file is not an editable note.');return fs.readFileSync(this.originalPath(id),'utf8');}
  async indexDocument(doc){if(!this.embedder)return;for(const part of doc.parts){if(!part.vector||part.embeddingModel!==this.embedder.signature){part.vector=await this.embedder.encode(part.text);part.embeddingModel=this.embedder.signature;}}this.save();}
  read(id, offset=0) {
    const d=this.docs.find(d=>d.id===id); if(!d) throw Error('Document no longer exists.');
    offset=Math.max(0,Math.floor(Number(offset)||0));
    return d.parts.slice(offset,offset+3).map((p,i)=>({...p,id:d.id,name:d.name,part:offset+i+1,total:d.parts.length}));
  }
  async search(query, ids=[]) {
    const docs=this.docs.filter(d=>!ids.length||ids.includes(d.id));
    if(this.embedder)for(const doc of docs)if(doc.parts.some(p=>!p.vector||p.embeddingModel!==this.embedder.signature))await this.indexDocument(doc);
    if(!this.index)this.index=this.docs.flatMap(d=>d.parts.map((p,i)=>{const tokens=words(p.text),freq={};for(const t of tokens)freq[t]=(freq[t]||0)+1;return {...p,id:d.id,name:d.name,part:i+1,total:d.parts.length,key:d.id+':'+i,tokens,freq};}));
    const candidates=this.index.filter(p=>!ids.length||ids.includes(p.id));return hybridRank(query,this.embedder?await this.embedder.encode(query):null,candidates);
  }
}
module.exports={Library,chunks,words};
