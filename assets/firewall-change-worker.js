/* No network requests for configuration data; one local worker per review. */
importScripts('firewall-change-core.js?v=2');
self.onmessage=e=>{try{self.postMessage({result:FirewallChangeReview.review(e.data.before,e.data.after,e.data.scenarios,e.data.delta)});}catch(error){self.postMessage({error:error.code||'unexpected'});}};
