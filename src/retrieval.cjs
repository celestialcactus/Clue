const STOP=new Set('the a an is are was were be been being to of for in on and or with this that it what how when where which does do did please me my our your their his her its from by at as into through about should would could can may might must will shall have has had not than then them they we you he she i us all any some also each every these those'.split(' '));
const words=text=>(text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(w=>!STOP.has(w));
const cosine=(a,b)=>a?.length===b?.length&&a?.length?a.reduce((sum,v,i)=>sum+v*b[i],0):0;
function lexicalRank(query,passages){
 const terms=[...new Set(words(query))],avg=passages.reduce((s,p)=>s+p.tokens.length,0)/(passages.length||1);
 const df=Object.fromEntries(terms.map(t=>[t,passages.filter(p=>p.freq[t]).length]));
 return passages.map(p=>{let score=0;for(const term of terms){const f=p.freq[term]||0;score+=Math.log(1+(passages.length-df[term]+.5)/(df[term]+.5))*f*2.2/(f+1.2*(.25+.75*p.tokens.length/(avg||1)));}return {p,score};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score);
}
function hybridRank(query,queryVector,passages,limit=6){
 const lex=lexicalRank(query,passages).slice(0,40);
 const semantic=queryVector?passages.map(p=>({p,score:cosine(queryVector,p.vector)})).filter(r=>r.score>.18).sort((a,b)=>b.score-a.score).slice(0,40):[];
 const pool=new Map();for(const ranking of [lex,semantic])ranking.forEach(({p},i)=>{const item=pool.get(p.key)||{p,score:0};item.score+=1/(60+i+1);pool.set(p.key,item);});
 const candidates=[];for(const candidate of [...pool.values()].sort((a,b)=>b.score-a.score)){if(!candidates.some(c=>c.p.text.replace(/\s+/g,' ').trim()===candidate.p.text.replace(/\s+/g,' ').trim()))candidates.push(candidate);}
 const max=Math.max(...candidates.map(c=>c.score),.001),selected=[];
 while(candidates.length&&selected.length<limit){let best=0,bestScore=-Infinity;for(let i=0;i<candidates.length;i++){
   const c=candidates[i];const redundancy=selected.length?Math.max(...selected.map(s=>c.p.vector&&s.p.vector?cosine(c.p.vector,s.p.vector):overlap(c.p.tokens,s.p.tokens))):0;
   const sameDoc=selected.filter(s=>s.p.id===c.p.id).length;
   const score=.78*c.score/max-.22*redundancy-(sameDoc>=3?.12:0);
   if(score>bestScore){bestScore=score;best=i;}
  }selected.push(candidates.splice(best,1)[0]);
 }
 return selected.map(({p,score})=>{const {tokens,freq,vector,key,...rest}=p;return {...rest,score};});
}
function overlap(a,b){const aa=new Set(a),bb=new Set(b);return [...aa].filter(t=>bb.has(t)).length/Math.max(aa.size,bb.size,1);}
module.exports={words,cosine,lexicalRank,hybridRank};
