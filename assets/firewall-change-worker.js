/* No network requests for configuration data; one local worker per review. */
importScripts('firewall-review-core.js?v=confidence-1','firewall-change-core.js?v=confidence-1');
self.onmessage=e=>{const data=e.data;try{const result=data.type==='parse'?FirewallReview.parse(data.texts,data.vendor):FirewallChangeReview.review(data.before,data.after,data.scenarios,data.delta);self.postMessage({id:data.id,result});}catch(error){self.postMessage({id:data.id,error:error.code||'unexpected',line:error.line||0});}};
