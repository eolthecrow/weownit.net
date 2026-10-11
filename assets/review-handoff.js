/* Explicit, single-use contact handoff. Never stores configurations or logs automatically. */
(function(root){
  'use strict';
  const KEY='weownit.review-enquiry.v1',TTL=20*60*1000,MAX=2000;
  function validSummary(s){return typeof s==='string'&&s.trim().length>0&&s.length<=MAX&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);}
  function prepare(summary,language){
    if(!validSummary(summary)||!['en','ro','fr'].includes(language))return false;
    try{root.sessionStorage.setItem(KEY,JSON.stringify({version:1,summary:summary.trim(),language,expiresAt:Date.now()+TTL}));return true;}catch(_){return false;}
  }
  function consume(){
    try{const raw=root.sessionStorage.getItem(KEY);root.sessionStorage.removeItem(KEY);if(!raw||raw.length>12000)return null;const d=JSON.parse(raw),now=Date.now();if(d.version!==1||!validSummary(d.summary)||!['en','ro','fr'].includes(d.language)||!Number.isFinite(d.expiresAt)||d.expiresAt<=now||d.expiresAt>now+TTL)return null;return {summary:d.summary,language:d.language};}catch(_){return null;}
  }
  root.ReviewHandoff={prepare,consume,MAX};
})(typeof window!=='undefined'?window:globalThis);
