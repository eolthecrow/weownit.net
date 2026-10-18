/* GitHub release -> three Resend Broadcast drafts. Never sends emails. */
import {readFile} from "node:fs/promises";
const key=process.env.RESEND_API_KEY,from=process.env.NEWSLETTER_FROM_EMAIL;
const segments={en:process.env.RESEND_SEGMENT_EN,ro:process.env.RESEND_SEGMENT_RO,fr:process.env.RESEND_SEGMENT_FR};
if(!key||!from||Object.values(segments).some(x=>!x))throw Error("Missing newsletter secrets; see worker/NEWSLETTER.md");
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const input=event.inputs??{};
const release=event.release;
const title=String(input.title||release?.name||release?.tag_name||"Update").slice(0,120);
const summary=String(input.summary||release?.body||"New release details are available.").slice(0,1700);
const url=String(input.release_url||release?.html_url||"");
if(!/^https:\/\/github\.com\/eolthecrow\/weownit\.net\/releases\/[^\s"<>]+$/i.test(url))throw Error("Invalid release URL");
const escape=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const prefixes={en:"Tool update",ro:"Actualizare instrument",fr:"Mise à jour d'outil"};
const action={en:"View release",ro:"Vezi lansarea",fr:"Voir la version"};
for(const lang of ["en","ro","fr"]){
  // RO/FR drafts intentionally require editorial translation before manual send.
  const html='<div style="font:16px system-ui;max-width:620px;margin:auto;color:#14242b"><p>weownit.net / Security Updates</p><h1>'+escape(title)+'</h1><p style="white-space:pre-line">'+escape(summary)+'</p><p><a href="'+escape(url)+'">'+escape(action[lang])+'</a></p><p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe / Dezabonare / Se désabonner</a></p></div>';
  const response=await fetch("https://api.resend.com/broadcasts",{
    method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({segment_id:segments[lang],from,subject:prefixes[lang]+": "+title,html})
  });
  if(!response.ok)throw Error("Resend draft "+lang+" failed ("+response.status+")");
  const value=await response.json();
  console.log("Created draft for "+lang+"; broadcast id: "+value.id);
}
console.log("DRAFTS ONLY: review translations, subject, unsubscribe and recipients in Resend before sending.");
