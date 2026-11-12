/* Shared cancellable job protocol; evidence stays in this worker. */
importScripts('exposure-compare-core.js?v=1');
self.onmessage=function(event){const {id,before,after,synthetic}=event.data;try{self.postMessage({id,result:self.ExposureCompare.compare(before,after,{synthetic})});}catch(e){self.postMessage({id,error:e.code||'unexpected'});}};
