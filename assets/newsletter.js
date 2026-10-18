/* Isolated signup widget; doesn't change navigation or existing page translation. */
(()=>{"use strict";
const API="https://network-security-assistant.vlad-network-security.workers.dev/newsletter/subscribe";
const copy={
en:{micro:"WEOWNIT / SECURITY UPDATES",title:"Useful updates. No noise.",description:"Important tool releases, practical security insights and new guides. Only meaningful updates.",email:"Email address",action:"Subscribe",consent:"I agree to receive weownit.net updates by email and understand I can unsubscribe at any time.",privacy:"Privacy notice",pending:"Check your inbox for a confirmation link.",error:"Subscription unavailable. Please try again.",offline:"Subscriptions will open soon.",verify:"Please complete the verification.",invalid:"Enter a valid email and accept the terms."},
ro:{micro:"WEOWNIT / ACTUALIZĂRI DE SECURITATE",title:"Noutăți utile. Fără zgomot.",description:"Lansări importante ale instrumentelor, analize practice și ghiduri noi. Doar actualizări relevante.",email:"Adresa de email",action:"Abonează-te",consent:"Sunt de acord să primesc actualizări weownit.net prin email și știu că mă pot dezabona oricând.",privacy:"Politica de confidențialitate",pending:"Verifică emailul pentru linkul de confirmare.",error:"Abonarea este indisponibilă. Încearcă din nou.",offline:"Abonările vor fi disponibile în curând.",verify:"Completează verificarea.",invalid:"Introdu un email valid și acceptă condițiile."},
fr:{micro:"WEOWNIT / ACTUALITÉS SÉCURITÉ",title:"L'essentiel. Sans bruit.",description:"Nouvelles versions d'outils, analyses pratiques et guides. Seulement les mises à jour utiles.",email:"Adresse e-mail",action:"S'abonner",consent:"J'accepte de recevoir des actualités weownit.net par e-mail et peux me désabonner à tout moment.",privacy:"Politique de confidentialité",pending:"Vérifiez votre boîte mail pour confirmer.",error:"Abonnement indisponible. Réessayez.",offline:"Les inscriptions seront bientôt disponibles.",verify:"Terminez la vérification.",invalid:"Saisissez un e-mail valide et acceptez les conditions."}
};
const block=document.getElementById("updates"),form=document.getElementById("newsletter-form");
if(!block||!form)return;
const status=block.querySelector(".newsletter-status"),submit=block.querySelector('button[type="submit"]');
const preferred=()=>{try{return SiteI18n.getInitialLanguage()||document.documentElement.lang||"en";}catch{return document.documentElement.lang||"en";}};
const t=()=>copy[preferred()]||copy.en;
// A public site key is not an activation signal: enable only after Worker + Resend E2E verification.
const available=()=>window.WEOWNIT_NEWSLETTER_ENABLED===true && Boolean(window.WEOWNIT_TURNSTILE_SITE_KEY);
function render(){
const c=t();
block.querySelector("[data-newsletter-micro]").textContent=c.micro;
block.querySelector("[data-newsletter-title]").textContent=c.title;
block.querySelector("[data-newsletter-description]").textContent=c.description;
block.querySelector('input[type="email"]').placeholder=c.email;
block.querySelector('input[type="email"]').setAttribute("aria-label",c.email);
submit.textContent=c.action;
block.querySelector("[data-newsletter-consent]").textContent=c.consent;
block.querySelector("[data-newsletter-privacy]").textContent=c.privacy;
if(!available()){status.textContent=c.offline;submit.disabled=true;}
}
let widgetId=null,verificationToken="";
function initialise(){
if(!available()){render();return;}
if(!window.turnstile){status.textContent=t().offline;submit.disabled=true;return;}
widgetId=window.turnstile.render("#newsletter-turnstile",{sitekey:window.WEOWNIT_TURNSTILE_SITE_KEY,action:"subscribe",callback:(value)=>{verificationToken=value;submit.disabled=!available();},'expired-callback':()=>{verificationToken="";submit.disabled=true;},"error-callback":()=>{verificationToken="";submit.disabled=true;}});
}
window.weownitNewsletterTurnstileReady=initialise;
form.addEventListener("submit",async e=>{
e.preventDefault();
if(!available()){status.textContent=t().offline;submit.disabled=true;return;}
const c=t(),input=form.elements.email,consent=form.elements.consent;
if(!input.validity.valid||!consent.checked){status.textContent=c.invalid;status.dataset.state="error";return;}
if(!verificationToken){status.textContent=c.verify;status.dataset.state="error";return;}
submit.disabled=true;status.textContent="";status.dataset.state="";
try{
const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:input.value.trim(),language:preferred(),consent:true,turnstileToken:verificationToken})});
if(!r.ok)throw Error("subscribe-failed");
status.textContent=c.pending;status.dataset.state="success";form.reset();
}catch{status.textContent=c.error;status.dataset.state="error";}
finally{verificationToken="";if(window.turnstile&&widgetId!==null)window.turnstile.reset(widgetId);else submit.disabled=true;}
});
document.addEventListener("site:languagechange",render);
render();
if(window.turnstile&&available())initialise();
})();