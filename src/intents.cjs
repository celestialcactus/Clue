const DOCS=/\b(documents?|files?|folders?|notes?|sops?|polic(?:y|ies)|uploaded|attached|internal|our company|this procedure)\b/i;
const PRIVATE=/\b(my|our|internal|confidential|uploaded|attached|documents?|files?|sops?|company)\b/i;
const OFFLINE=/\b(don['’]?t|do not|never|without|no|avoid|stop)\s+(?:using\s+|use\s+|doing\s+|a\s+|any\s+)?(?:web|internet|online|brows(?:e|ing)|search(?:ing)?)|\b(?:offline only|local only|only (?:use|search|read) (?:my |our |the )?(?:files|documents|library))\b/i;
const FOLLOWUP=/^(?:(?:please|now)\s+)*(?:(?:what|how) about|and (?:in|for)|search again|search (?:for )?(?:that|it|this)|look (?:that|it|this) up|check (?:that|it|this)|find more|any updates)/i;
function publicQuery(message,previous=''){
 let q=message.trim();const split=q.search(/\b(?:then|and)\s+(?:search|browse|look up|google)\b/i);if(split>=0)q=q.slice(split).replace(/^(then|and)\s+/i,'');
 q=q.replace(/^(?:(?:please|can you|could you|would you|i want you to|i need you to|now)\s+)*/i,'').replace(/^(?:do\s+)?(?:a\s+)?(?:web|internet|online)\s+(?:search|research)\s*(?:for|on|about)?\s*/i,'').replace(/^(?:search|browse|check|research|find|look\s+up|look\s+on|google|bing)\s+(?:(?:the\s+)?(?:web|internet)|online)?\s*(?:for|on|about)?\s*/i,'').replace(/\s+(?:on\s+(?:the\s+)?(?:web|internet)|online)\b/ig,'');
 q=q.split(/(?:[,;]?\s+\b(?:and(?:\s+then)?|then)\s+(?:compare|summari[sz]e|extract|use|read|check (?:my|our)|tell me|explain|make|write)|[;\n])/i)[0].replace(/[?.!]+$/,'').trim();
 if(FOLLOWUP.test(message)||/^(?:for\s+)?(?:that|it|this|the same)(?:\s+(?:topic|again))?$/i.test(q)){if(!previous)return '';const qualifier=message.match(/\b(?:in|for)\s+([\p{L}\p{N} ,'-]{2,70})[?.!]?$/iu)?.[1]?.trim();q=previous+(qualifier&&!PRIVATE.test(qualifier)?' '+qualifier:'');}
 return !q||PRIVATE.test(q)||/^(what|how|that|it|this|more|the latest|updates|again)$/i.test(q)?'':q.slice(0,250);
}
function routeIntent({message,previousQuery='',selected=[],pendingWeb=false,hadSources=false,hasLibrary=false}){
 if(/^\s*(?:(?:hi|hello|hey)(?: there)?|thanks|thank you|good morning|good afternoon|good evening)[!.\s]*$/i.test(message))return {goal:'chat',route:'chat',documents:false,requestedWeb:false,query:'',allowNetwork:false,reason:'Conversational greeting',smallTalk:true};
 const offline=OFFLINE.test(message)||/\b(?:use|search|read) only (?:my |our |the |project )?(?:files|documents|library)\b/i.test(message),docReference=DOCS.test(message);
 const explicit=/\blook\s+(?:this|that|it)\s+up\b|\bfind\s+(?:public |official |reliable )?(?:sources|references|websites)\b/i.test(message)||/\b(?:search|browse|look up|research|google|bing)\b/i.test(message)&&(!docReference||/\b(web|internet|online|public)\b/i.test(message))||/\b(?:find|check)\b.{0,35}\b(?:online|on the web|on the internet)\b/i.test(message);
 const localTransform=/^\s*(?:summari[sz]e|extract|rewrite|translate|list)\b/i.test(message)&&docReference;
 const freshness=!localTransform&&/\b(latest|current|up[- ]to[- ]date|recent|today|news|weather|price|stock price|exchange rate|who (?:is|currently)|changed since)\b/i.test(message)&&!(/\b(?:latest|current) (?:version|draft) of (?:my|our|the)\b/i.test(message)&&docReference);
 const verification=/\b(verify|fact[- ]?check|complies?|compliant|compliance|legal requirements?|regulations?|external sources?|official sources?|citations?)\b/i.test(message)&&!/^\s*(?:summari[sz]e|extract|rewrite|translate|list)\b/i.test(message);
 const followup=!!previousQuery&&FOLLOWUP.test(message);
 const localFind=/\b(?:search|find|look)\b.{0,30}\b(?:in|through|within)\s+(?:my |our |the )?(?:files|documents|library)\b/i.test(message)&&!explicit;
 const requestedWeb=!offline&&!localFind&&(explicit||freshness||verification||followup||pendingWeb&&!docReference&&!/^(cancel|never mind)/i.test(message));
 const documents=selected.length>0||docReference||hadSources&&!requestedWeb;
 const goal=/\bcompar(?:e|ison)|\bdifferences?\b|\bversus\b|\bcompli(?:es|ance|ant)\b/i.test(message)?'compare':/\bsummari[sz]e|\bsummary\b|\bsimplify\b/i.test(message)?'summarize':/\bextract|\bpull out|\baction items\b|\bkey dates\b/i.test(message)?'extract':requestedWeb?'research':documents?'document_question':'chat';
 const query=requestedWeb?publicQuery(message,previousQuery):'';
 const documentInformed=requestedWeb&&hasLibrary&&(selected.length>0||docReference||goal==='compare'||!query);
 const reason=offline?'You requested local-only work':explicit?'You asked for public research':freshness?'This question needs current information':verification?'This task needs external verification':followup?'Continuing public research':documents?'This task can use project documents':'This can be answered in the conversation';
 return {goal,route:requestedWeb?documents?'web_and_documents':'web':documents?'documents':'chat',documents,requestedWeb,query,documentInformed,allowNetwork:!offline,reason,clarification:requestedWeb&&!query&&!documentInformed?'What topic should I research? You can name a subject or select a project document.':''};
}
function publicTopic(message){const m=message.match(/^(?:(?:please|can you)\s+)?(?:tell me about|explain|what is|what are|who is)\s+(.+?)[?.!]?$/i);return m&&!PRIVATE.test(m[1])?m[1].slice(0,250):'';}
module.exports={routeIntent,publicQuery,publicTopic};
