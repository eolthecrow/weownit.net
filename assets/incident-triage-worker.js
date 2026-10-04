importScripts('incident-triage-sources.js?v=2','incident-triage-core.js?v=2');
self.onmessage=e=>{try{self.postMessage({result:IncidentTriage.analyze(e.data)});}catch(error){self.postMessage({error:error.code||'unexpected'});}};
