importScripts('incident-triage-core.js?v=1');
self.onmessage=e=>{try{self.postMessage({result:IncidentTriage.analyze(e.data)});}catch(error){self.postMessage({error:error.code||'unexpected'});}};
