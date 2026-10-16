const fs=require('node:fs');const {PDFParse}=require('pdf-parse');
// Render one physical page, keeping memory bounded on low-spec devices.
async function renderPdfPage(file,page=1){
 if(!Number.isInteger(page)||page<1)throw Error('Invalid page number.');
 if(fs.statSync(file).size>40*1024*1024)throw Error('This PDF is too large to preview.');
 const parser=new PDFParse({data:new Uint8Array(fs.readFileSync(file)),isEvalSupported:false});
 try{
  const info=await parser.getInfo({parsePageInfo:true,partial:[page]});
  if(page>info.total)throw Error('Page not found.');
  const size=info.pages.find(p=>p.pageNumber===page);if(!size||size.width<=0||size.height<=0)throw Error('Page dimensions are unavailable.');
  const scale=Math.min(1400/size.width,2200/size.height);
  const result=await parser.getScreenshot({partial:[page],scale,imageDataUrl:true,imageBuffer:false});const rendered=result.pages[0];
  if(!rendered)throw Error('Page could not be rendered.');
  const extracted=await parser.getText({partial:[page]});
  return {page,total:result.total,dataUrl:rendered.dataUrl,width:rendered.width,height:rendered.height,cssWidth:Math.round(size.width*96/72),text:extracted.pages[0]?.text||''};
 }finally{await parser.destroy();}
}
module.exports={renderPdfPage};
