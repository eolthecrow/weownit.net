importScripts('incident-triage-sources.js?v=3','incident-triage-core.js?v=3','incident-triage-workspace.js?v=3');
self.onmessage=e=>{try{self.postMessage(e.data.restoreCase?{restored:IncidentWorkspace.restoreCase(e.data.restoreCase,IncidentTriage)}:{result:IncidentTriage.analyze(e.data)});}catch(error){self.postMessage({error:error.code||'unexpected'});}};
