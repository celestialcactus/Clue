const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
const {Embeddings}=require('../src/embeddings.cjs');const {Library}=require('../src/library.cjs');
(async()=>{const embedder=new Embeddings(path.resolve('assets'));try{
 const dir=path.resolve('.test-data','retrieval-'+Date.now());const library=new Library(dir,embedder);
 const a=await library.saveNote(null,'Safety.md','Workers must wear protective gloves when handling corrosive chemicals. Inspect emergency exits weekly.');
 await library.saveNote(null,'Leave.md','Annual vacation requests require approval from the manager.');
 const matches=await library.search('How should staff protect their hands from acids?');assert.equal(matches[0].id,a);assert.equal(matches[0].vector,undefined);
 const reopened=new Library(dir,embedder);assert.equal((await reopened.search('emergency exits'))[0].id,a);assert.equal(reopened.docs[0].parts[0].vector.length,384);
 console.log('PASS: local quantized embeddings retrieve paraphrases, preserve exact matches, and persist vectors.');
 }finally{await embedder.dispose();}})().catch(e=>{console.error(e);process.exitCode=1;});
