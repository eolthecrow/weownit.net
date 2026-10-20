/* Shared runner protocol; cancelled/expired jobs are terminated by the caller. */
importScripts('firewall-migration-core.js?v=1','firewall-migration-emit.js?v=1');
self.onmessage=function(event){const {id,texts,source,options,model}=event.data;try{const parsed=model||self.FirewallMigration.parse(texts,source);const result=self.FirewallMigration.compile(parsed,options);self.postMessage({id,result});}catch(e){self.postMessage({id,error:e.code||'unexpected',line:e.line||0});}};
