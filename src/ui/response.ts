import {marked} from 'marked'
import DOMPurify from 'dompurify'

// Model output is untrusted. No remote images, raw executable elements, custom
// attributes or in-app navigation are permitted by the response renderer.
function renderResponse(node:HTMLElement,text:string,options:any={}){
 const sources=options.sources||[],known=new Map<string,string>();
 for(const item of [...sources,...(options.links||[])]){try{const url=new URL(item.url);if(url.protocol==='https:'&&!url.username&&!url.password)known.set(url.href,item.url);}catch{}}
 const fragment=DOMPurify.sanitize(marked.parse(text,{gfm:true,breaks:false,async:false}) as string,{
  ALLOWED_TAGS:['p','br','strong','em','del','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','hr','table','thead','tbody','tr','th','td','a'],
  ALLOWED_ATTR:['href','title','start','align'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false,RETURN_DOM_FRAGMENT:true,
 });
 for(const a of fragment.querySelectorAll('a')){
  let target;try{target=known.get(new URL(a.getAttribute('href')||'').href);}catch{}
  if(!target){a.replaceWith(document.createTextNode(a.textContent||''));continue;}
  a.setAttribute('href',target);a.setAttribute('title',target);a.addEventListener('click',e=>{e.preventDefault();options.onLink(target);});
 }
 // Citation controls are built from trusted source metadata, never model HTML.
 const walker=document.createTreeWalker(fragment,NodeFilter.SHOW_TEXT),texts:Text[]=[];while(walker.nextNode())texts.push(walker.currentNode as Text);
 for(const text of texts){if(text.parentElement?.closest('a,pre,code'))continue;const matches=[...text.data.matchAll(/\[(S\d+)\]/g)];if(!matches.length)continue;
  const replacement=document.createDocumentFragment();let offset=0;
  for(const match of matches){replacement.append(text.data.slice(offset,match.index));const source=sources.find((s:any)=>s.citation===match[1]);if(source){const button=document.createElement('button');button.type='button';button.className='citation-link';button.textContent=match[0];button.title=source.label;button.setAttribute('aria-label','Open source '+match[1]+': '+source.label);button.onclick=()=>options.onSource(source);replacement.append(button);}else replacement.append(match[0]);offset=match.index!+match[0].length;}
  replacement.append(text.data.slice(offset));text.replaceWith(replacement);
 }
 node.classList.add('formatted-response');node.replaceChildren(fragment);
 for(const table of node.querySelectorAll('table')){const wrapper=document.createElement('div');wrapper.className='response-table';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label','Response table');table.replaceWith(wrapper);wrapper.append(table);}
}
(window as any).renderAssistantResponse=renderResponse;
window.dispatchEvent(new Event('response-renderer-ready'));
