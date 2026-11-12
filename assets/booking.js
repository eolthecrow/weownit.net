(() => {
  const details=document.getElementById('booking-details');
  const calendar=document.getElementById('booking-frame');
  const status=document.getElementById('booking-status');
  if(!details||!calendar||!status)return;
  const copy={
    en:{loading:'Loading available days and times…',slow:'The calendar is taking longer to load. Use the booking link above to choose a time directly.',ready:'Choose an available day and time below.',error:'The calendar could not load here. Use the booking link above to choose a time directly.',title:'Schedule a 30-minute meeting'},
    ro:{loading:'Se încarcă zilele și orele disponibile…',slow:'Calendarul se încarcă mai greu. Folosește linkul de mai sus pentru a alege direct o oră.',ready:'Alege mai jos o zi și o oră disponibile.',error:'Calendarul nu s-a putut încărca aici. Folosește linkul de mai sus pentru a alege direct o oră.',title:'Programează o întâlnire de 30 de minute'},
    fr:{loading:'Chargement des jours et horaires disponibles…',slow:'Le calendrier met plus de temps à charger. Utilisez le lien ci-dessus pour choisir directement un horaire.',ready:'Choisissez un jour et un horaire disponibles ci-dessous.',error:'Le calendrier n’a pas pu se charger ici. Utilisez le lien ci-dessus pour choisir directement un horaire.',title:'Planifier une réunion de 30 minutes'}
  };
  let started=false,ready=false,state='loading',timer;
  const language=()=>copy[document.documentElement.lang]?document.documentElement.lang:'en';
  function refresh(){
    const t=copy[language()];status.textContent=t[state];status.hidden=!started;
    calendar.setAttribute('aria-label',t.title);
    const frame=calendar.querySelector('iframe');if(frame)frame.title=t.title;
  }
  function markReady(){ready=true;clearTimeout(timer);state='ready';calendar.hidden=false;refresh();}
  function fail(){if(ready)return;clearTimeout(timer);state='error';calendar.hidden=true;refresh();}
  function open(){
    if(!details.open)details.open=true;
    if(started)return;started=true;calendar.hidden=false;refresh();
    timer=setTimeout(()=>{if(!ready){state='slow';calendar.hidden=true;refresh();}},18000);
    // Cal.com's official queue/bootstrap and inline SDK perform the iframe handshake.
    (function(C,A,L){const p=(a,ar)=>a.q.push(ar),d=C.document;C.Cal=C.Cal||function(){const cal=C.Cal,ar=arguments;if(!cal.loaded){cal.ns={};cal.q=cal.q||[];const script=d.createElement('script');script.src=A;script.async=true;script.onerror=fail;d.head.appendChild(script);cal.loaded=true;}if(ar[0]===L){const api=function(){p(api,arguments);};const namespace=ar[1];api.q=api.q||[];if(typeof namespace==='string'){cal.ns[namespace]=cal.ns[namespace]||api;p(cal.ns[namespace],ar);p(cal,['initNamespace',namespace]);}else p(cal,ar);return;}p(cal,ar);};})(window,'https://app.cal.com/embed/embed.js','init');
    try{
      window.Cal('init','weownit-consultation',{origin:'https://cal.com'});
      const cal=window.Cal.ns['weownit-consultation'];
      cal('on',{action:'linkReady',callback:markReady});
      cal('on',{action:'linkFailed',callback:fail});
      cal('inline',{elementOrSelector:'#booking-frame',calLink:'vladimirarjoca/30min',config:{layout:'month_view',theme:'dark',locale:language()}});
      cal('ui',{hideEventTypeDetails:false,layout:'month_view'});
    }catch(_){fail();}
  }
  details.addEventListener('toggle',()=>{if(details.open)open();});
  document.addEventListener('site:languagechange',refresh);
  function followHash(){if(location.hash==='#book')open();}
  window.addEventListener('hashchange',followHash);
  refresh();if(details.open||location.hash==='#book')open();
})();

