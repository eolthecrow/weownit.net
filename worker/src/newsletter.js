/* weownit.net newsletter: private D1 subscriber registry + Resend double opt-in. */
const LANGS = ["en", "ro", "fr"];
const WAIT_MS = 15 * 60 * 1000;
const EXPIRE_MS = 48 * 60 * 60 * 1000;
const C = {
  en: {subject:"Confirm your weownit.net updates", intro:"You requested weownit.net security updates. Confirm your subscription:", action:"Confirm subscription", ignore:"If you did not request this, simply ignore this message.", title:"Email preferences", confirm:"Confirm subscription", unsub:"Unsubscribe", done:"Your preference has been updated.", invalid:"This link is invalid or expired.", failed:"We could not complete the request. Please try again later."},
  ro: {subject:"Confirmă abonarea la weownit.net", intro:"Ai solicitat actualizări de securitate de la weownit.net. Confirmă abonarea:",action:"Confirmă abonarea",ignore:"Dacă nu ai solicitat abonarea, ignoră acest mesaj.",title:"Preferințe email",confirm:"Confirmă abonarea",unsub:"Dezabonează-mă",done:"Preferința ta a fost actualizată.",invalid:"Linkul este invalid sau a expirat.",failed:"Nu am putut finaliza solicitarea. Încearcă din nou."},
  fr: {subject:"Confirmez votre abonnement weownit.net",intro:"Vous avez demandé à recevoir les actualités de sécurité weownit.net. Confirmez votre inscription :",action:"Confirmer l'inscription",ignore:"Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",title:"Préférences e-mail",confirm:"Confirmer l'inscription",unsub:"Se désabonner",done:"Votre préférence a été mise à jour.",invalid:"Ce lien est invalide ou expiré.",failed:"Impossible de terminer la demande. Veuillez réessayer."}
};
function language(v){return LANGS.includes(v)?v:"en";}
function h(v){return String(v).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));}
function result(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function page(title,body,lang){return new Response('<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>'+h(title)+'</title><style>body{background:#0a151c;color:#f2f1e8;font:16px system-ui;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:520px;padding:2rem;margin:1rem;border:1px solid #29404a}h1{font-size:1.6rem}button{border:0;background:#6ce2c7;color:#0a151c;padding:.85rem 1.3rem;font-weight:700;cursor:pointer}a{color:#6ce2c7}</style></head><body><main><p>weownit.net / Security Updates</p><h1>'+h(title)+'</h1>'+body+'<p><a href="https://weownit.net/">weownit.net ↗</a></p></main></body></html>',{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function validToken(s){return typeof s==="string" && /^[A-Za-z0-9_-]{43}$/.test(s);}
async function hash(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,"0")).join("");}
function required(env){return !!(env.SUBSCRIBERS_DB && env.RESEND_API_KEY && env.NEWSLETTER_FROM_EMAIL && env.TURNSTILE_SECRET && env.RESEND_SEGMENT_EN && env.RESEND_SEGMENT_RO && env.RESEND_SEGMENT_FR);}
function segment(env,lang){return env["RESEND_SEGMENT_"+language(lang).toUpperCase()];}
async function resend(env,path,method,body){
  const response=await fetch("https://api.resend.com"+path,{method,headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw new Error("Resend "+response.status);
  return response.json().catch(()=>({}));
}
async function verifyTurnstile(responseToken,env){
  if(typeof responseToken!=="string"||responseToken.length>2048||!responseToken)return false;
  const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:responseToken})});
  if(!response.ok)return false;
  const data=await response.json();
  return data.success===true && ["weownit.net","www.weownit.net"].includes(data.hostname) && data.action==="subscribe";
}
async function readJson(req){
  if(Number(req.headers.get("content-length")||0)>5000)return null;
  try {const t=await req.text();return t.length<=5000?JSON.parse(t):null;}catch{return null;}
}
async function subscribe(req,env){
  if(!required(env))return result({error:"Subscriptions are not configured."},503);
  const input=await readJson(req);
  const email=String(input?.email||"").trim().toLowerCase(),lang=language(input?.language);
  if(!/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/.test(email)||email.length>254||input?.consent!==true)return result({error:"Invalid email or consent."},400);
  if(!(await verifyTurnstile(input.turnstileToken,env)))return result({error:"Verification failed. Please retry."},403);
  const now=Date.now();
  const existing=await env.SUBSCRIBERS_DB.prepare("SELECT status,last_request_at FROM subscribers WHERE email=?").bind(email).first();
  const accepted=result({ok:true,message:"Check your inbox if confirmation is required."},202);
  if(existing?.status==="confirmed"||(existing&&now-existing.last_request_at<WAIT_MS))return accepted;
  const value=token(),valueHash=await hash(value),unsubValue=token(),unsubHash=await hash(unsubValue);
  await env.SUBSCRIBERS_DB.prepare("INSERT INTO subscribers(email,language,status,confirm_hash,confirm_expires_at,unsubscribe_hash,created_at,last_request_at,consent_version) VALUES(?,?,'pending',?,?,?,?,?,'2026-10') ON CONFLICT(email) DO UPDATE SET language=excluded.language,status='pending',confirm_hash=excluded.confirm_hash,confirm_expires_at=excluded.confirm_expires_at,unsubscribe_hash=excluded.unsubscribe_hash,last_request_at=excluded.last_request_at,consent_version=excluded.consent_version")
    .bind(email,lang,valueHash,now+EXPIRE_MS,unsubHash,now,now).run();
  const link=new URL("/newsletter/confirm",req.url);link.searchParams.set("token",value);link.searchParams.set("lang",lang);
  const optout=new URL("/newsletter/unsubscribe",req.url);optout.searchParams.set("token",unsubValue);optout.searchParams.set("lang",lang);
  const copy=C[lang];
  const html='<p>'+h(copy.intro)+'</p><p><a href="'+h(link.href)+'">'+h(copy.action)+'</a></p><p>'+h(copy.ignore)+'</p><p><a href="'+h(optout.href)+'">'+h(copy.unsub)+'</a></p><p><a href="https://weownit.net/privacy.html">'+h(copy.title)+'</a></p>';
  try{
    await resend(env,"/emails","POST",{from:env.NEWSLETTER_FROM_EMAIL,to:[email],subject:copy.subject,html,text:copy.intro+"\n"+link.href+"\n"+copy.ignore+"\n"+copy.unsub+": "+optout.href});
  }catch(err){
    // A failed email delivery must not lock the visitor out for the next 15 minutes.
    await env.SUBSCRIBERS_DB.prepare("UPDATE subscribers SET last_request_at=0 WHERE email=? AND confirm_hash=? AND status='pending'").bind(email,valueHash).run();
    console.error("Newsletter confirmation delivery failed",String(err.message).slice(0,50));
    return result({error:"Confirmation email could not be sent. Try later."},503);
  }
  return accepted;
}
async function addResendContact(env,email,lang){
  const seg=segment(env,lang);
  try {await resend(env,"/contacts","POST",{email,unsubscribed:false,segments:[{id:seg}]});}
  catch(err){
    if(!/409/.test(String(err.message)))throw err;
    const id=encodeURIComponent(email);
    await resend(env,"/contacts/"+id,"PATCH",{unsubscribed:false});
    // A returning subscriber may have changed languages: remove stale locale segments.
    for(const oldSegment of [env.RESEND_SEGMENT_EN,env.RESEND_SEGMENT_RO,env.RESEND_SEGMENT_FR]){
      if(oldSegment===seg)continue;
      try { await resend(env,"/contacts/"+id+"/segments/"+encodeURIComponent(oldSegment),"DELETE"); }
      catch(e){ if(!/404/.test(String(e.message)))throw e; }
    }
    try { await resend(env,"/contacts/"+id+"/segments/"+encodeURIComponent(seg),"POST"); }
    catch(e){ if(!/409/.test(String(e.message)))throw e; }
  }
}
async function doConfirmation(req,env,value,lang){
  const copy=C[lang];
  if(!validToken(value))return page(copy.invalid,"",lang);
  if(!required(env))return page(copy.failed,"",lang);
  const digest=await hash(value);
  const item=await env.SUBSCRIBERS_DB.prepare("SELECT email,language,confirm_expires_at,status FROM subscribers WHERE confirm_hash=?").bind(digest).first();
  if(!item||item.status!=="pending"||item.confirm_expires_at<Date.now())return page(copy.invalid,"",lang);
  try {
    await addResendContact(env,item.email,item.language);
    const now=Date.now();
    await env.SUBSCRIBERS_DB.prepare("UPDATE subscribers SET status='confirmed',confirmed_at=?,confirm_hash=NULL,confirm_expires_at=NULL WHERE confirm_hash=? AND status='pending' AND confirm_expires_at>=?").bind(now,digest,now).run();
    return page(copy.done,"",lang);
  }catch(err){console.error("Newsletter confirmation error",String(err.message).slice(0,50));return page(copy.failed,"",lang);}
}
async function doUnsubscribe(req,env,value,lang){
  const copy=C[lang];
  if(!validToken(value)||!env.SUBSCRIBERS_DB||!env.RESEND_API_KEY)return page(copy.invalid,"",lang);
  const digest=await hash(value);
  const item=await env.SUBSCRIBERS_DB.prepare("SELECT email,status FROM subscribers WHERE unsubscribe_hash=?").bind(digest).first();
  if(!item)return page(copy.invalid,"",lang);
  try{
    // Ensure Resend is suppressed before declaring local opt-out complete.
    try { await resend(env,"/contacts/"+encodeURIComponent(item.email),"PATCH",{unsubscribed:true}); }
    catch(err) { if(item.status!=="pending"||!/Resend 404/.test(String(err.message)))throw err; }
    // Pending subscribers do not exist in Resend; 404 is expected for their opt-out.
    await env.SUBSCRIBERS_DB.prepare("UPDATE subscribers SET status='unsubscribed',unsubscribed_at=?,confirm_hash=NULL,confirm_expires_at=NULL WHERE unsubscribe_hash=?").bind(Date.now(),digest).run();
    return page(copy.done,"",lang);
  }catch(err){console.error("Newsletter unsubscribe error",String(err.message).slice(0,50));return page(copy.failed,"",lang);}
}

/* Resend signs the exact raw webhook body with Svix headers. */
async function verifiedWebhookEvent(req,secret){
  if(typeof secret!=="string"||!/^whsec_[-A-Za-z0-9+/=]+$/.test(secret))return null;
  if(Number(req.headers.get("content-length")||0)>12_000)return null;
  const payload=await req.text();
  if(payload.length>12_000)return null;
  const id=req.headers.get("svix-id"),stamp=req.headers.get("svix-timestamp"),signature=req.headers.get("svix-signature");
  const epoch=Number(stamp);
  if(!id||!stamp||!signature||!Number.isInteger(epoch)||Math.abs(Date.now()/1000-epoch)>300)return null;
  let secretBytes;
  try {secretBytes=Uint8Array.from(atob(secret.slice(6)),char=>char.charCodeAt(0));}
  catch{return null;}
  const key=await crypto.subtle.importKey("raw",secretBytes,{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const message=new TextEncoder().encode(id+"."+stamp+"."+payload);
  for(const entry of signature.trim().split(/\s+/)){
    if(!entry.startsWith("v1,"))continue;
    try {
      const digest=Uint8Array.from(atob(entry.slice(3)),char=>char.charCodeAt(0));
      if(await crypto.subtle.verify("HMAC",key,digest,message)){
        return JSON.parse(payload);
      }
    }catch{/* malformed signature, continue */}
  }
  return null;
}
async function newsletterWebhook(req,env){
  if(req.method!=="POST")return result({error:"Method not allowed."},405);
  if(!env.RESEND_WEBHOOK_SECRET||!env.SUBSCRIBERS_DB)return result({error:"Not configured."},503);
  const event=await verifiedWebhookEvent(req,env.RESEND_WEBHOOK_SECRET);
  if(!event)return result({error:"Invalid webhook signature."},401);
  const data=event?.data;
  const optedOut=(event?.type==="contact.updated"&&data?.unsubscribed===true)||event?.type==="contact.deleted";
  if(optedOut && typeof data?.email==="string" && data.email.length<=254){
    await env.SUBSCRIBERS_DB.prepare("UPDATE subscribers SET status='unsubscribed',unsubscribed_at=?,confirm_hash=NULL,confirm_expires_at=NULL WHERE email=? AND status!='unsubscribed'")
      .bind(Date.now(),data.email.trim().toLowerCase()).run();
  }
  return result({ok:true});
}

export async function handleNewsletter(req,env,url){
  if(url.pathname==="/newsletter/webhook"){
    try{return await newsletterWebhook(req,env);}catch{return result({error:"Webhook unavailable."},503);}
  }
  if(url.pathname==="/newsletter/subscribe"){
    if(req.method!=="POST")return result({error:"Method not allowed."},405);
    try{return await subscribe(req,env);}catch(err){console.error("Newsletter subscribe failure",String(err.message).slice(0,60));return result({error:"Subscription unavailable."},503);}
  }
  const confirm=url.pathname==="/newsletter/confirm";
  const unsubscribe=url.pathname==="/newsletter/unsubscribe";
  if(!confirm&&!unsubscribe)return result({error:"Not found."},404);
  const lang=language(url.searchParams.get("lang"));
  if(req.method==="GET"){
    const value=url.searchParams.get("token");
    if(!validToken(value))return page(C[lang].invalid,"",lang);
    const title=confirm?C[lang].confirm:C[lang].unsub;
    return page(title,'<form method="post" action="'+url.pathname+'"><input type="hidden" name="token" value="'+h(value)+'"><input type="hidden" name="lang" value="'+lang+'"><button type="submit">'+h(title)+'</button></form>',lang);
  }
  if(req.method!=="POST")return result({error:"Method not allowed."},405);
  const form=await req.formData().catch(()=>null);
  const value=form?.get("token"),preferred=language(form?.get("lang"));
  try{return confirm?await doConfirmation(req,env,value,preferred):await doUnsubscribe(req,env,value,preferred);}
  catch(err){console.error("Newsletter action failure",String(err.message).slice(0,60));return page(C[preferred].failed,"",preferred);}
}
