/* Cancellable local jobs shared by Canvas and the full change workspace. No network/storage. */
(function(root){
 'use strict';
 function create({timeoutMs=30000,workerFactory=()=>new root.Worker('assets/firewall-change-worker.js?v=confidence-1')}={}){
  let pending=null,sequence=0;
  function cancel(){if(!pending)return;const job=pending;pending=null;job.worker.terminate();clearTimeout(job.timer);job.reject(Object.assign(new Error('cancelled'),{code:'cancelled'}));}
  function run(payload){cancel();const id=++sequence;return new Promise((resolve,reject)=>{let worker;try{worker=workerFactory();}catch(_){reject(Object.assign(new Error('workerUnavailable'),{code:'workerUnavailable'}));return;}
   const settle=(error,value)=>{if(pending?.id!==id)return;const job=pending;pending=null;clearTimeout(job.timer);worker.terminate();error?reject(error):resolve(value);};
   const timer=setTimeout(()=>settle(Object.assign(new Error('analysisTimeout'),{code:'analysisTimeout'})),timeoutMs);pending={worker,reject,id,timer};
   worker.onmessage=e=>{if(e.data.id!==id)return;settle(e.data.error?Object.assign(new Error(e.data.error),{code:e.data.error,line:e.data.line||0}):null,e.data.result);};
   worker.onerror=()=>settle(Object.assign(new Error('workerUnavailable'),{code:'workerUnavailable'}));
   try{worker.postMessage({...payload,id});}catch(_){settle(Object.assign(new Error('workerUnavailable'),{code:'workerUnavailable'}));}
  });}
  async function parse(texts,vendor='auto'){
   const list=Array.isArray(texts)?texts:[texts],nativeForti=vendor==='fortinet'||vendor==='auto'&&list.some(s=>/^\s*config\s+(?:firewall|vdom)\b/m.test(s)||/"path"\s*:\s*"firewall/.test(s));
   if(nativeForti)return run({type:'parse',texts:list,vendor});
   // PAN-OS XML/CLI/JSON normalization uses the browser's bounded native DOMParser.
   return root.FirewallReview.parse(list,vendor,root.DOMParser);
  }
  return {run,parse,cancel};
 }
 root.ChangeConfidenceRunner={create};if(typeof module!=='undefined'&&module.exports)module.exports={create};
})(typeof window!=='undefined'?window:globalThis);
