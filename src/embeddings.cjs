const path=require('node:path');const fs=require('node:fs');
class Embeddings{
 constructor(root){this.root=path.join(root,'embeddings');this.signature='minilm-l6-v2-q8';this.state='Local semantic model available';this.cache=new Map();}
 async load(){
  if(!this.loading)this.loading=(async()=>{
   if(!fs.existsSync(path.join(this.root,'onnx/model_quantized.onnx')))throw Error('Semantic model is missing. Run npm run assets:embeddings.');
   const {pipeline,env}=await import('@huggingface/transformers');env.allowRemoteModels=false;env.allowLocalModels=true;env.useBrowserCache=false;
   this.extractor=await pipeline('feature-extraction',this.root.replaceAll('\\','/'),{local_files_only:true,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});this.state='Hybrid local retrieval ready';return this.extractor;
  })().catch(e=>{this.loading=null;this.state=e.message;throw e;});return this.loading;
 }
 async encode(text){if(this.cache.has(text))return this.cache.get(text);const model=await this.load();const output=await model(text,{pooling:'mean',normalize:true,truncation:true});const vector=Array.from(output.data);if(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);this.cache.set(text,vector);return vector;}
 async dispose(){await this.extractor?.dispose();}
}
module.exports={Embeddings};
