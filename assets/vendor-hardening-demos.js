/* Synthetic local fixtures. Commands describe snapshots; the page never executes them. */
(function(root){
  const forti=`# Synthetic FortiOS snapshot
config system global
 set hostname "LAB-FGT"
 set admin-https-ssl-versions tlsv1-0 tlsv1-2
 set admintimeout 0
 set admin-lockout-threshold 0
end
config system interface
 edit "mgmt"
  set allowaccess ping https ssh http telnet
 next
end
config system admin
 edit "lab-admin"
  set trusthost1 0.0.0.0 0.0.0.0
 next
end
config system ntp
 set ntpsync disable
end
config log syslogd setting
 set status disable
end
config firewall policy
 edit 10
  set action accept
  set logtraffic disable
  set utm-status disable
 next
end`;
  const palo=`# Synthetic PAN-OS set snapshot
set deviceconfig system hostname LAB-PA
set deviceconfig system service disable-http no
set deviceconfig system service disable-telnet no
set deviceconfig system permitted-ip 0.0.0.0/0
set vsys vsys1 rulebase security rules Lab-Web action allow
set vsys vsys1 rulebase security rules Lab-Web log-end no
set vsys vsys1 rulebase security rules Lab-Web profile-setting group none
set vsys vsys1 rulebase security rules Lab-Web log-setting none`;
  const cisco=`! Synthetic IOS / IOS XE running configuration
version 17.6
hostname LAB-IOS
ip ssh version 1
no aaa new-model
snmp-server community synthetic-secret RO
line vty 0 4
 transport input ssh telnet
 exec-timeout 0 0
!
end`;
  const gaia=`# Synthetic Gaia Clish snapshot
set hostname LAB-CP
set net-access telnet on
set snmp agent on
set snmp agent-version any
set ntp active off`;
  const demos={
    fortinet:{reference:'LAB-FGT',before:forti,after:forti.replace('tlsv1-0 tlsv1-2','tlsv1-2 tlsv1-3').replace('admintimeout 0','admintimeout 10').replace('admin-lockout-threshold 0','admin-lockout-threshold 3').replace('https ssh http telnet','https ssh').replace('trusthost1 0.0.0.0 0.0.0.0','trusthost1 192.0.2.10 255.255.255.255').replace('ntpsync disable','ntpsync enable').replace('status disable','status enable').replace('logtraffic disable','logtraffic all').replace('utm-status disable','utm-status enable\n  set ips-sensor "Lab-IPS"')},
    paloalto:{reference:'LAB-PA',before:palo,after:palo.replace('disable-http no','disable-http yes').replace('disable-telnet no','disable-telnet yes').replace('0.0.0.0/0','192.0.2.10/32').replace('log-end no','log-end yes').replace('group none','group Lab-Protection').replace('log-setting none','log-setting Lab-Forwarding')},
    cisco:{reference:'LAB-IOS',before:cisco,after:cisco.replace('ip ssh version 1','ip ssh version 2').replace('no aaa new-model','aaa new-model').replace('snmp-server community synthetic-secret RO','snmp-server group Lab-Monitoring v3 priv\nlogging host 192.0.2.20\nntp server 192.0.2.30').replace('transport input ssh telnet','transport input ssh').replace('exec-timeout 0 0','exec-timeout 10 0\n access-class MGMT-SOURCES in')},
    checkpoint:{reference:'LAB-CP',before:gaia,after:gaia.replace('telnet on','telnet off').replace('agent-version any','agent-version v3-Only').replace('ntp active off','ntp active on')+'\nset syslog log-remote-address 192.0.2.20 level all'}
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=demos;else root.VendorHardeningDemos=demos;
})(typeof window!=='undefined'?window:globalThis);
