/* Local packet evidence and bounded cross-tool case integration. */
(function(root){
  'use strict';
  const FIELDS=['frame.number','frame.time_epoch','ip.src','ip.dst','ipv6.src','ipv6.dst','tcp.srcport','tcp.dstport','udp.srcport','udp.dstport','tcp.stream','tcp.flags.syn','tcp.flags.ack','tcp.flags.reset','tcp.analysis.retransmission','dns.qry.name','dns.flags.rcode'];
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  function single(value){
    if(value==null)return '';
    if(Array.isArray(value)){const values=[...new Set(value.map(single))];if(values.length!==1)fail('ambiguousPacket');return values[0];}
    if(typeof value==='object')fail('ambiguousPacket');
    const s=String(value);if(s.length>32768)fail('oversizedRecord');return s;
  }
  function packetData(input){
    if(!object(input))return null;
    const layers=input._source?.layers||input.layers;
    const flat=input.platform==='tshark'?input.data:input;
    if(!layers&&!object(flat))return null;
    if(!layers&&input.platform!=='tshark'&&!Object.hasOwn(flat,'frame.time_epoch'))return null;
    const data=Object.create(null);
    for(const field of FIELDS){
      const family=field.split('.')[0];
      const value=layers?(layers[field]??layers[family]?.[field]):flat[field];
      if(value!=null)data[field]=single(value);
    }
    if(input.platform==='tshark'&&flat._capturePhase!=null)data._capturePhase=single(flat._capturePhase);
    return data;
  }
  const ipv4=v=>typeof v==='string'&&/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)&&v.split('.').every(n=>Number(n)<=255);
  const port=v=>/^\d{1,5}$/.test(String(v||''))&&Number(v)>0&&Number(v)<=65535;
  const bit=v=>['1','true','True'].includes(String(v));
  function normalizePacket(input,options={}){
    let data;try{data=packetData(input);}catch(e){return {error:e.code};}if(!data)return null;
    if(options.mode&&!['auto','tshark'].includes(options.mode))return {error:'sourceMismatch'};
    const phase=data._capturePhase||options.capturePhase||'before';if(!['before','after'].includes(phase))return {error:'invalidPacketPhase'};
    data._capturePhase=phase;
    const seconds=data['frame.time_epoch'];let timestamp=typeof input.timestamp==='string'?input.timestamp:'';if(input.host!=null&&typeof input.host!=='string')return {error:'invalidRecord'};
    if(seconds){if(!/^\d{1,12}(?:\.\d{1,9})?$/.test(seconds)||Number(seconds)*1000>8640000000000000)return {error:'invalidPacketTime'};timestamp=new Date(Number(seconds)*1000).toISOString();}
    const tcp=port(data['tcp.srcport'])&&port(data['tcp.dstport']),udp=port(data['udp.srcport'])&&port(data['udp.dstport']);
    if(tcp&&udp)return {error:'ambiguousPacket'};
    const protocol=tcp?'tcp':udp?'udp':'',sourceIP=data['ip.src']||data['ipv6.src']||'',destinationIP=data['ip.dst']||data['ipv6.dst']||'';
    if(!sourceIP||!destinationIP||!protocol)return {error:'unsupportedPacket'};
    const family=protocol+'.';
    return {platform:'tshark',provider:'Wireshark TShark',channel:'packet',eventId:'packet',timestamp,host:input.host||options.host||'',recordId:data['frame.number']||'',data,user:'',sourceIP,destinationIP,sourcePort:data[family+'srcport'],destinationPort:data[family+'dstport'],protocol,command:'',image:'',activity:'packet',authStatus:'',authScope:'',deviceScope:'',severity:'',action:'',contextApplied:options.host&&!input.host?['host']:[]};
  }
  function tuple(event){
    const d=event.data||{};
    let protocol=event.protocol||d.Protocol||d.protocol||d.proto||'';
    protocol=({'6':'tcp','17':'udp'}[protocol]||protocol).toLowerCase();
    const sourceIP=event.sourceIP||d.SourceIp||'',destinationIP=event.destinationIP||d.DestinationIp||'';
    const sourcePort=event.sourcePort||d.SourcePort||d.srcport||d.sport||'',destinationPort=event.destinationPort||d.DestinationPort||d.dstport||d.dport||'';
    if(!['tcp','udp'].includes(protocol)||!sourceIP||!destinationIP||!port(sourcePort)||!port(destinationPort))return null;
    return {sourceIP,destinationIP,sourcePort:String(Number(sourcePort)),destinationPort:String(Number(destinationPort)),protocol};
  }
  const tupleKey=t=>JSON.stringify([t.protocol,t.sourceIP,t.sourcePort,t.destinationIP,t.destinationPort]);
  const reverse=t=>({...t,sourceIP:t.destinationIP,destinationIP:t.sourceIP,sourcePort:t.destinationPort,destinationPort:t.sourcePort});
  const canonical=t=>[tupleKey(t),tupleKey(reverse(t))].sort()[0];
  function candidateRecord(e){return e.category==='sysmon'&&e.eventId===3||['fortinet','paloalto','checkpoint','cisco-asa'].includes(e.platform)&&(/traffic/i.test(e.channel)||e.activity==='traffic-denied');}
  function summarize(report){
    const groups=new Map(),index=new Map();
    for(const e of report.events||[]){
      const t=tuple(e);if(!t)continue;
      if(e.platform==='tshark'){
        const phase=e.data._capturePhase||'before',stream=e.protocol==='tcp'?e.data['tcp.stream']||'':'',key=JSON.stringify([e.source.id,phase,stream,canonical(t)]);
        if(!groups.has(key))groups.set(key,{key,phase,sourceId:e.source.id,packets:[],tuple:t});
        groups.get(key).packets.push(e);
      }else if(candidateRecord(e)&&e.timestamp){const key=tupleKey(t);if(!index.has(key))index.set(key,[]);index.get(key).push(e);}
    }
    for(const list of index.values())list.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
    const flows=[];let candidateBudget=2000;
    for(const group of groups.values()){
      const packets=group.packets.sort((a,b)=>(Date.parse(a.timestamp)||0)-(Date.parse(b.timestamp)||0));
      const initiator=packets.find(e=>e.protocol==='tcp'&&bit(e.data['tcp.flags.syn'])&&!bit(e.data['tcp.flags.ack']))||packets[0];
      const t=tuple(initiator),key=tupleKey(t),responses=packets.filter(e=>tupleKey(tuple(e))===tupleKey(reverse(t)));
      const syn=packets.filter(e=>tupleKey(tuple(e))===key&&bit(e.data['tcp.flags.syn'])&&!bit(e.data['tcp.flags.ack']));
      const synAck=responses.filter(e=>bit(e.data['tcp.flags.syn'])&&bit(e.data['tcp.flags.ack']));
      // Only report the observed SYN / SYN-ACK pair; do not claim a complete handshake.
      const firstSyn=syn.find(s=>s.timestamp);const pairObserved=Boolean(firstSyn&&synAck.some(a=>a.timestamp&&Date.parse(a.timestamp)>=Date.parse(firstSyn.timestamp)));
      const timed=packets.filter(e=>e.timestamp),start=timed[0]?.timestamp||null,end=timed.at(-1)?.timestamp||null;
      const candidates=[],list=index.get(key)||[],lower=start?Date.parse(start)-2000:Infinity,upper=end?Date.parse(end)+2000:-Infinity;
      let lo=0,hi=list.length;while(lo<hi){const mid=(lo+hi)>>1;if(Date.parse(list[mid].timestamp)<lower)lo=mid+1;else hi=mid;}
      for(let i=lo;i<list.length&&Date.parse(list[i].timestamp)<=upper&&candidates.length<128&&candidateBudget>0;i++){
        const e=list[i];candidates.push({uid:e.uid,platform:e.platform,host:e.host,deviceScope:e.deviceScope||'',timestamp:e.timestamp,action:e.action||'',processGuid:e.processGuid||'',image:e.image||''});candidateBudget--;
      }
      flows.push({key:group.key,phase:group.phase,sourceId:group.sourceId,...t,start,end,packetCount:packets.length,eventRefs:packets.slice(0,128).map(e=>e.uid),synCount:syn.length,synAckCount:synAck.length,synPairObserved:pairObserved,responsePackets:responses.length,retransmissions:packets.filter(e=>Object.hasOwn(e.data,'tcp.analysis.retransmission')&&!['0','false'].includes(e.data['tcp.analysis.retransmission'])).length,resets:packets.filter(e=>bit(e.data['tcp.flags.reset'])).length,dnsNXDomain:packets.filter(e=>e.data['dns.flags.rcode']==='3').length,dnsNames:[...new Set(packets.map(e=>e.data['dns.qry.name']).filter(Boolean))].slice(0,20),candidates,ipv4:ipv4(t.sourceIP)&&ipv4(t.destinationIP)});
    }
    const comparisons=[];
    const comparable=new Map();
    for(const flow of flows){const key=JSON.stringify([flow.protocol,flow.sourceIP,flow.destinationIP,flow.destinationPort]);if(!comparable.has(key))comparable.set(key,{key,sourceIP:flow.sourceIP,destinationIP:flow.destinationIP,protocol:flow.protocol,destinationPort:flow.destinationPort,before:[],after:[]});comparable.get(key)[flow.phase].push(flow);}
    for(const c of comparable.values())if(c.before.length&&c.after.length){
      const metrics=items=>({captures:new Set(items.map(f=>f.sourceId)).size,packets:items.reduce((n,f)=>n+f.packetCount,0),synPairObserved:items.some(f=>f.synPairObserved),retransmissions:items.reduce((n,f)=>n+f.retransmissions,0),dnsNXDomain:items.reduce((n,f)=>n+f.dnsNXDomain,0)});
      comparisons.push({...c,before:metrics(c.before),after:metrics(c.after)});
    }
    return {flows,comparisons,packetCount:flows.reduce((n,f)=>n+f.packetCount,0),candidateCount:flows.reduce((n,f)=>n+f.candidates.length,0),scope:'Exact exported five-tuples in the same direction within the capture interval ±2 seconds. Candidate association only; NAT, DHCP, clock drift, capture point, device scope and completeness require validation. Before/after grouping uses source IP, destination IP, protocol and destination port; packet counts are not normalized for capture duration.'};
  }
  function draft(flow,context){
    if(!flow.ipv4)fail('ipv4Required');
    const scenario={name:context.name||'Capture '+flow.sourceIP+' → '+flow.destinationIP,sourceIP:flow.sourceIP,destinationIP:flow.destinationIP,sourcePort:Number(flow.sourcePort),protocol:flow.protocol,port:Number(flow.destinationPort),from:context.from,to:context.to,beforeScope:context.beforeScope,afterScope:context.afterScope,expected:context.expected};
    const engine=root.FirewallChangeReview||(typeof require==='function'?require('./firewall-change-core.js'):null);
    return engine.scenarios([scenario])[0];
  }
  function restoreConnected(value,events){
    if(value==null)return null;
    const bad=()=>fail('invalidCase');
    if(!object(value)||value.schema!=='weownit.connected-case'||value.schemaVersion!==1||typeof value.id!=='string'||value.id.length>128||!value.id||!Array.isArray(value.reviews)||value.reviews.length>3)bad();
    const known=new Set(events.map(e=>e.uid)),eventIndex=new Map(events.map(e=>[e.uid,e])),fw=root.FirewallReview||(typeof require==='function'?require('./firewall-review-core.js'):null),change=root.FirewallChangeReview||(typeof require==='function'?require('./firewall-change-core.js'):null);
    const reviews=value.reviews.map(r=>{
      if(!object(r)||!Array.isArray(r.links)||!r.links.length||r.links.length>100||typeof r.created!=='string'||!Number.isFinite(Date.parse(r.created))||JSON.stringify(r).length>4*1024*1024)bad();
      const scenarios=change.scenarios(r.scenarios),before=fw.parse(JSON.stringify(r.beforeSnapshot)),after=fw.parse(JSON.stringify(r.afterSnapshot));
      if(before.vendor!==after.vendor)bad();
      const links=r.links.map(l=>{if(!object(l)||!Number.isInteger(l.scenarioIndex)||l.scenarioIndex<0||l.scenarioIndex>=scenarios.length||!Array.isArray(l.eventRefs)||!l.eventRefs.length||l.eventRefs.length>128||l.eventRefs.some(id=>typeof id!=='string'||!known.has(id)))bad();const scenario=scenarios[l.scenarioIndex];for(const id of l.eventRefs){const e=eventIndex.get(id),t=tuple(e);if(e.platform!=='tshark'||!t||t.protocol!==scenario.protocol)bad();const direct=t.sourceIP===scenario.sourceIP&&t.destinationIP===scenario.destinationIP&&Number(t.destinationPort)===Number(scenario.port)&&Number(t.sourcePort)===scenario.sourcePort;const rev=t.destinationIP===scenario.sourceIP&&t.sourceIP===scenario.destinationIP&&Number(t.sourcePort)===Number(scenario.port)&&Number(t.destinationPort)===scenario.sourcePort;if(!direct&&!rev)bad();}return {scenarioIndex:l.scenarioIndex,eventRefs:[...new Set(l.eventRefs)]};});
      return {created:r.created,beforeSnapshot:fw.snapshot(before),afterSnapshot:fw.snapshot(after),scenarios,links,result:change.review(before,after,scenarios,fw.diff(before,after)),recomputed:true};
    });
    return {schema:value.schema,schemaVersion:1,id:value.id,reviews};
  }
  const api={FIELDS,normalizePacket,tuple,summarize,draft,restoreConnected,ipv4,tupleKey};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.ConnectedCase=api;
})(typeof window!=='undefined'?window:globalThis);
