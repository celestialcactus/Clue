const https=require('node:https'); const dns=require('node:dns/promises'); const cheerio=require('cheerio');
function isPublicIPv4(ip){
 const n=ip.split('.').map(Number); if(n.length!==4||n.some(v=>!Number.isInteger(v)||v<0||v>255))return false;
 const [a,b]=n; return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
async function publicGet(raw,signal,redirects=0){
 const url=new URL(raw); if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw Error('Only public HTTPS pages are supported.');
 const addresses=await dns.lookup(url.hostname,{all:true,family:4}); if(!addresses.length||addresses.some(a=>!isPublicIPv4(a.address)))throw Error('Private network addresses are blocked.');
 return new Promise((resolve,reject)=>{
   const request=https.get(url,{signal,headers:{'User-Agent':'DeskAssistant/0.1','Accept':'text/html,application/xhtml+xml'},lookup:(_host,options,cb)=>cb(null,options?.all?[{address:addresses[0].address,family:4}]:addresses[0].address,4)},res=>{
     if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(redirects>=3)return reject(Error('Too many redirects.'));return publicGet(new URL(res.headers.location,url).href,signal,redirects+1).then(resolve,reject);}
     if(res.statusCode!==200){res.resume();return reject(Error(`Website returned ${res.statusCode}. Try another search or source.`));}
     if(!/text\/|xhtml/.test(res.headers['content-type']||'')){res.resume();return reject(Error('This page is not readable HTML.'));}
     let size=0;const buffers=[];res.on('data',b=>{size+=b.length;if(size>2_000_000)res.destroy(Error('Page is too large.'));else buffers.push(b);});res.on('error',reject);res.on('end',()=>resolve({html:Buffer.concat(buffers).toString('utf8'),url:url.href}));
   });request.setTimeout(20000,()=>request.destroy(Error('Website took too long to respond.')));request.on('error',reject);
 });
}
async function searchWeb(query,signal){
 if(typeof query!=='string'||!query.trim()||query.length>300)throw Error('Enter a public search topic (up to 300 characters).');
 const {html}=await publicGet('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query),signal);
 const $=cheerio.load(html);const results=[];
 $('.result').each((_,el)=>{const a=$(el).find('.result__a');let href=a.attr('href');if(!href)return;
   try{const u=new URL(href,'https://html.duckduckgo.com');href=u.searchParams.get('uddg')||u.href;if(new URL(href).protocol!=='https:')return;}catch{return;}
   results.push({title:a.text(),url:href,text:$(el).find('.result__snippet').text(),retrieved:new Date().toISOString()});
 });
 if(!results.length)throw Error('Search returned no readable results. The search provider may be blocking requests; please try again later.');
 return results.slice(0,5);
}
async function readWeb(url,signal){const result=await publicGet(url,signal);const $=cheerio.load(result.html);$('script,style,nav,footer,header,form,iframe').remove();return {url:result.url,title:$('title').text(),text:($('main').text()||$('article').text()||$('body').text()).replace(/\s+/g,' ').slice(0,6500),retrieved:new Date().toISOString()};}
module.exports={searchWeb,readWeb,isPublicIPv4};
