/* Entirely synthetic examples. No customer/device exports. */
(function(root){
  'use strict';
  const fortinet=`# weownit.net synthetic migration lab
config system global
set hostname "SYNTHETIC-LAB"
end
config firewall address
edit "CLIENTS"
set subnet 10.10.0.0 255.255.255.0
next
edit "APP"
set subnet 10.20.0.10 255.255.255.255
next
end
config firewall addrgrp
edit "USERS"
set member "CLIENTS"
next
end
config firewall service custom
edit "TLS"
set tcp-portrange 443
next
end
config firewall service group
edit "WEB"
set member "TLS"
next
end
config firewall policy
edit 10
set name "Disabled-example"
set srcintf "inside"
set dstintf "outside"
set srcaddr "USERS"
set dstaddr "APP"
set service "WEB"
set action accept
set status disable
set schedule always
set logtraffic all
next
edit 20
set name "App-TLS"
set srcintf "inside"
set dstintf "outside"
set srcaddr "USERS"
set dstaddr "APP"
set service "WEB"
set action accept
set status enable
set schedule always
set logtraffic all
next
end`;
  const paloalto=`# weownit.net synthetic migration lab
set vsys vsys1 address CLIENTS ip-netmask 10.10.0.0/24
set vsys vsys1 address APP ip-netmask 10.20.0.10/32
set vsys vsys1 address-group USERS static [ CLIENTS ]
set vsys vsys1 service TLS protocol tcp port 443
set vsys vsys1 service-group WEB members [ TLS ]
${[['Disabled-example','yes','USERS','APP','WEB','trust','untrust','allow'],['App-TLS','no','USERS','APP','WEB','trust','untrust','allow'],['Final-drop','no','any','any','any','any','any','deny']].map(([name,disabled,src,dst,service,from,to,action])=>`set vsys vsys1 rulebase security rules ${name} from ${from}
set vsys vsys1 rulebase security rules ${name} to ${to}
set vsys vsys1 rulebase security rules ${name} source ${src}
set vsys vsys1 rulebase security rules ${name} destination ${dst}
set vsys vsys1 rulebase security rules ${name} service ${service}
set vsys vsys1 rulebase security rules ${name} application any
set vsys vsys1 rulebase security rules ${name} action ${action}
set vsys vsys1 rulebase security rules ${name} disabled ${disabled}
set vsys vsys1 rulebase security rules ${name} log-end yes`).join('\n')}`;
  const asa=`! weownit.net synthetic objects-only migration lab
ASA Version 9.18(4)
hostname SYNTHETIC-LAB
object network CLIENTS
 subnet 10.10.0.0 255.255.255.0
!
object network APP
 host 10.20.0.10
!
object-group network USERS
 network-object object CLIENTS
!
object service TLS
 service tcp destination eq 443
!
object-group service WEB
 service-object object TLS
!
access-list INSIDE extended permit tcp object-group USERS object APP eq 443
access-group INSIDE in interface inside`;
  const checkpoint=JSON.stringify({objects:[{uid:'synthetic-client',type:'network',name:'CLIENTS',subnet4:'10.10.0.0','mask-length4':24},{uid:'synthetic-app',type:'host',name:'APP','ipv4-address':'10.20.0.10'},{uid:'synthetic-users',type:'group',name:'USERS',members:['synthetic-client']},{uid:'synthetic-tls',type:'service-tcp',name:'TLS',port:'443'},{uid:'synthetic-web',type:'service-group',name:'WEB',members:['synthetic-tls']}],total:5},null,2);
  const demos={fortinet,paloalto,asa,checkpoint};root.FirewallMigrationDemos=demos;if(typeof module==='object'&&module.exports)module.exports=demos;
})(typeof globalThis!=='undefined'?globalThis:this);
