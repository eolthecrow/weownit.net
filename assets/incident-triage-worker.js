importScripts('firewall-review-core.js?v=connected-1','firewall-change-core.js?v=connected-1','connected-case-core.js?v=connected-1','incident-triage-sources.js?v=connected-1','incident-triage-core.js?v=connected-1','incident-triage-workspace.js?v=connected-1');
self.onmessage=e=>{try{self.postMessage(e.data.restoreCase?{restored:IncidentWorkspace.restoreCase(e.data.restoreCase,IncidentTriage)}:{result:IncidentTriage.analyze(e.data)});}catch(error){self.postMessage({error:error.code||'unexpected'});}};

