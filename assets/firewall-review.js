(function () {
  'use strict';
  const core=window.FirewallReview,change=window.FirewallChangeWorkspace;
  const $=id=>document.getElementById(id);
  const names={fortinet:'Fortinet',paloalto:'Palo Alto Networks',checkpoint:'Check Point'};
  const dictionaries={
  "en": {
    "eyebrow": "03 / FIREWALL CONFIGURATION REVIEW",
    "lead": "Review policies, check device hardening and retest configurations. FortiGate, Palo Alto, Cisco IOS / IOS XE and Check Point; coverage varies by mode.",
    "privacy": "Local analysis · No configuration upload · No account required",
    "vendor": "Firewall vendor",
    "auto": "Detect automatically",
    "demo": "Try a synthetic lab",
    "input": "Paste configuration or open local files",
    "file": "Local files (maximum 5 MB in total)",
    "formatHint": "Fortinet: FortiOS policy/security-policy CLI or FortiOS REST API JSON. Palo Alto: config XML/JSON or a full CLI set listing. Check Point: Management API JSON, also exported using mgmt_cli. Select related Fortinet API or Check Point object JSON files together.",
    "compare": "Compare with an earlier configuration (optional)",
    "before": "Earlier configuration — same vendor",
    "beforeFile": "Earlier local files",
    "compareHint": "Compares policy fields; order changes are checked only when order is established. Cross-format comparison requires matching policy contexts. No routing, NAT or application simulation.",
    "analyze": "Review configuration",
    "clear": "Clear data",
    "exportHTML": "Download HTML report",
    "exportJSON": "JSON report + reusable snapshot",
    "coverage": "Coverage and analysis limits",
    "changes": "Configuration changes",
    "findings": "Findings to review",
    "allSeverities": "All priorities",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "policies": "Parsed policies",
    "tableLimit": "The table shows up to 100 policies. The JSON report includes all parsed policies.",
    "ctaText": "Turn these findings into a validated remediation plan: expert review, controlled changes and verification.",
    "cta": "Request a firewall review",
    "scope": "Static policy review, not a full security audit or a connectivity guarantee. Unsupported conditions and missing information are reported explicitly. Configurations are held in this page only until cleared or closed; reports are saved locally when requested.",
    "search": "Search rule name or ID",
    "rules": "Policies",
    "active": "Active",
    "disabled": "Disabled",
    "scopes": "Scopes",
    "review": "Policy review",
    "evidence": "Evidence",
    "remediation": "Recommended review",
    "source": "Source",
    "destination": "Destination",
    "service": "Service",
    "from": "From",
    "to": "To",
    "application": "Application",
    "users": "Users / groups",
    "urlCategories": "URL categories",
    "appCategories": "Application categories",
    "appGroups": "Application groups",
    "src6": "IPv6 source",
    "dst6": "IPv6 destination",
    "inspectionProfiles": "Inspection profile references",
    "action": "Action",
    "logging": "Logging",
    "protection": "Protection",
    "scopeLabel": "Scope",
    "rule": "Rule",
    "related": "Earlier policy",
    "added": "Added",
    "removed": "Removed",
    "changed": "Changed",
    "noChanges": "No policy-field differences detected.",
    "noFindings": "No findings within the supported checks. Review the coverage limits before drawing conclusions.",
    "noFilter": "No findings match this filter.",
    "limited": "Showing the first 200 findings. The downloaded report includes all findings.",
    "on": "Enabled",
    "off": "Disabled",
    "unknown": "Not established",
    "busy": "Analyzing locally…",
    "done": "Local review complete.",
    "cleared": "Configuration data cleared.",
    "selected": "Local files selected. File contents take precedence over pasted text.",
    "beforeSelected": "Earlier files selected. File contents take precedence over pasted text.",
    "generated": "Generated locally",
    "none": "None",
    "any": "Any",
    "errorPrefix": "Cannot analyze: ",
    "errors": {
      "empty": "provide a configuration.",
      "tooLarge": "maximum 5 MB per snapshot.",
      "tooManyRules": "maximum 5,000 policies per snapshot.",
      "tooComplex": "the JSON structure exceeds the analysis limit.",
      "unknownFormat": "use a supported native export or weownit review snapshot.",
      "oneFile": "use one CLI/XML/PAN-OS JSON/snapshot file, or related Fortinet API/Check Point JSON files.",
      "malformedCLI": "the CLI export has incomplete config/edit blocks. Use a complete export.",
      "malformedXML": "the XML is not well formed.",
      "unsafeXML": "XML entity declarations are not accepted.",
      "xmlUnavailable": "this browser cannot parse XML.",
      "malformedJSON": "the JSON is not valid.",
      "noFortinetRules": "no supported Fortinet firewall policies found.",
      "noPaloRules": "no supported PAN-OS security policies found.",
      "noCheckPointRules": "no Check Point access rules found. Include rulebase JSON.",
      "vendorMismatch": "both snapshots must use the same vendor.",
      "unexpected": "the input could not be processed. Verify the format.",
      "invalidSnapshot": "invalid weownit snapshot schema, version or policy fields.",
      "unsupportedFortinetJSON": "use FortiOS REST response wrappers with path, name, vdom and results; raw arrays and FortiManager JSON are unsupported.",
      "unsupportedPaloJSON": "use a supported PAN-OS configuration hierarchy or REST security-rule response.",
      "missingPaloContext": "the PAN-OS REST rules need location/context metadata. Panorama exports also need a resource field such as Policies/SecurityPreRules.",
      "malformedPaloCLI": "use a complete PAN-OS set-format listing with balanced quotes/lists. Change scripts are not accepted.",
      "apiFailure": "the file contains a failed API response.",
      "conflictingPages": "duplicate API pages contain conflicting policy data."
    },
    "warnings": {
      "fortinetNGFW": "Fortinet NGFW policy-based: application IDs, URL/application categories and users/groups are retained as exported. Missing service fields stay unknown. Broad-access and overlap checks are skipped; application-default ports, IPS/category matching, identity, IPv6 and pre-security-policy evaluation are not simulated.",
      "managerScope": "FortiManager: ADOM/package scopes are separate. Global objects, dynamic mappings and the effective installed policy are not reconstructed.",
      "staticScope": "No live connectivity, NAT, routing, firmware/CVE, hit-count or full compliance validation. Any source means any configured source, not proven Internet exposure.",
      "fortinetDefaults": "Fortinet: omitted logging/protection fields remain unknown. Interface groups, IPv6, VIP/NAT and policy-based NGFW are not fully modeled.",
      "paloDefaults": "PAN-OS: omitted logging settings remain unknown. Address/service groups are compared by literal name; IP-range containment and application-default ports are not expanded.",
      "panoramaScope": "Panorama: shared, device-group, pre/post and VSYS rulebases are reviewed separately. Inheritance, overrides and effective per-device policy are not reconstructed.",
      "checkpointScope": "Check Point: access-control rules only; no NAT or Threat Prevention audit. Ordered/inline layers, install targets, identity and VPN semantics are not reconstructed.",
      "unresolvedObjects": "Some Check Point UIDs cannot be resolved. Include the related objects-dictionary/objects JSON. Unresolved criteria are not treated as Any.",
      "pagination": "The Check Point export appears paginated. Include every page; results cover the supplied rules only.",
      "incompleteRules": "Some policies have missing or unresolved criteria. Broad-access and overlap checks are skipped for those policies.",
      "complexRules": "Negated or complex conditions are excluded from broad-access and overlap checks.",
      "pairLimit": "Overlap checks are skipped for scopes with more than 350 active policies. Per-policy checks still run.",
      "reviewSnapshot": "weownit review snapshot: normalized policy data only, not a complete vendor backup. Findings are recomputed; original coverage limits still apply.",
      "apiSnapshot": "API exports: analysis covers supplied fields/objects only. Filters, omitted data and context can limit coverage.",
      "apiPagination": "The API export indicates more results. Include every page; analysis covers supplied policies only.",
      "apiOrder": "Policy order is not established for this API snapshot. Order-dependent overlap findings and order-change comparisons are skipped.",
      "paloCLIContext": "PAN-OS relative CLI listing: assumed local VSYS vsys1. Export explicit vsys/device-group prefixes when comparing other contexts.",
      "paloCLIExport": "PAN-OS CLI: full set-format exports only. Definitions are combined by rule name; listing order is used. Change scripts and effective Panorama inheritance are unsupported."
    },
    "checks": {
      "anyAny": [
        "Allow policy with unrestricted source, destination and service",
        "Replace broad selectors with the approved sources, destinations and services; confirm the business requirement."
      ],
      "broadAllow": [
        "Broad allow policy",
        "Check whether the unrestricted selectors are necessary and restrict the policy to the required flows."
      ],
      "adminService": [
        "Administrative service from any source",
        "Review access to SSH, RDP, Telnet, VNC or FTP; restrict source objects and management paths."
      ],
      "noLogging": [
        "Logging explicitly disabled on an allow policy",
        "Enable appropriate traffic logging after checking storage capacity and operational requirements."
      ],
      "noProtection": [
        "No enabled security profiles identified",
        "Review which inspection profiles are appropriate for this traffic and validate their configuration."
      ],
      "noDescription": [
        "Policy lacks a description",
        "Document the owner, purpose and change reference."
      ],
      "potentialRedundancy": [
        "Possible redundant policy",
        "An earlier policy covers the literal selectors in this snapshot. Verify all conditions before removing anything."
      ],
      "potentialConflict": [
        "Earlier policy may override the intended action",
        "An earlier policy covers the literal selectors with a different action. Verify policy order and effective evaluation."
      ]
    },
    "exportXML": "XML review snapshot",
    "standard": "One review standard across vendors",
    "standardHint": "JSON and XML exported here share the Weownit review schema and can be reloaded for the same vendor. These are analysis snapshots, not device backups or migration configurations. Native XML/JSON formats are accepted only where listed below.",
    "nativeInputs": "Native inputs",
    "sharedInputs": "Shared review inputs",
    "fortFormats": "FortiOS policy/security-policy CLI · REST API JSON",
    "paloFormats": "Config XML · config JSON · CLI set · REST rule JSON",
    "cpFormats": "Management API JSON · mgmt_cli JSON output",
    "sharedFormats": "Weownit snapshot JSON / XML",
    "extraDemos": "More native lab formats",
    "inputPlaceholder": "Native CLI / XML / JSON, or a Weownit review snapshot",
    "nativeGuide": "Export guidance",
    "exportGuide": "Use a complete policy export with its scope and related objects. Check Point: export every access-rulebase page and object dictionary using mgmt_cli with --format json. Palo Alto: configuration-mode show output in set, json or xml format. Fortinet JSON: retain each REST response wrapper, including path, name, vdom and results."
  },
  "ro": {
    "eyebrow": "03 / REVIZIE CONFIGURAȚII FIREWALL",
    "lead": "Verifică politicile, hardening-ul dispozitivelor și configurațiile după modificare. FortiGate, Palo Alto, Cisco IOS / IOS XE și Check Point; acoperirea diferă între moduri.",
    "privacy": "Analiză locală · Configurația nu se încarcă pe server · Fără cont",
    "vendor": "Vendor firewall",
    "auto": "Detectare automată",
    "demo": "Încearcă un laborator demonstrativ",
    "input": "Lipește configurația sau deschide fișiere locale",
    "file": "Fișiere locale (maximum 5 MB în total)",
    "formatHint": "Fortinet: CLI FortiOS policy/security-policy sau JSON REST API FortiOS. Palo Alto: configurație XML/JSON sau export complet CLI set. Check Point: JSON Management API, inclusiv export prin mgmt_cli. Selectează împreună fișierele API Fortinet sau JSON-urile Check Point cu obiecte.",
    "compare": "Compară cu o configurație anterioară (opțional)",
    "before": "Configurația anterioară — același vendor",
    "beforeFile": "Fișiere locale anterioare",
    "compareHint": "Compară câmpurile politicilor; ordinea se compară numai când este stabilită. Comparația între formate necesită contexte identice. Fără simulare de rutare, NAT sau aplicații.",
    "analyze": "Analizează configurația",
    "clear": "Șterge datele",
    "exportHTML": "Descarcă raport HTML",
    "exportJSON": "Raport JSON + snapshot reutilizabil",
    "coverage": "Acoperire și limitele analizei",
    "changes": "Modificări de configurație",
    "findings": "Constatări de verificat",
    "allSeverities": "Toate prioritățile",
    "high": "Ridicată",
    "medium": "Medie",
    "low": "Scăzută",
    "policies": "Politici interpretate",
    "tableLimit": "Tabelul afișează maximum 100 de politici. Raportul JSON include toate politicile interpretate.",
    "ctaText": "Transformă constatările într-un plan de remediere validat: revizie de specialitate, modificări controlate și verificare.",
    "cta": "Solicită o revizie firewall",
    "scope": "Revizie statică a politicilor; nu reprezintă un audit complet sau o garanție a conectivității. Condițiile nesuportate și informațiile lipsă sunt semnalate. Configurațiile rămân în această pagină până la ștergere sau închidere; rapoartele se salvează local la cerere.",
    "search": "Caută după numele sau ID-ul regulii",
    "rules": "Politici",
    "active": "Active",
    "disabled": "Dezactivate",
    "scopes": "Contexte",
    "review": "Revizie politici",
    "evidence": "Dovezi",
    "remediation": "Verificare recomandată",
    "source": "Sursă",
    "destination": "Destinație",
    "service": "Serviciu",
    "from": "Din",
    "to": "Către",
    "application": "Aplicație",
    "users": "Utilizatori / grupuri",
    "urlCategories": "Categorii URL",
    "appCategories": "Categorii de aplicații",
    "appGroups": "Grupuri de aplicații",
    "src6": "Sursă IPv6",
    "dst6": "Destinație IPv6",
    "inspectionProfiles": "Referințe profiluri de inspecție",
    "action": "Acțiune",
    "logging": "Logging",
    "protection": "Protecție",
    "scopeLabel": "Context",
    "rule": "Regulă",
    "related": "Politica anterioară",
    "added": "Adăugate",
    "removed": "Eliminate",
    "changed": "Modificate",
    "noChanges": "Nu s-au detectat diferențe în câmpurile politicilor.",
    "noFindings": "Nu s-au identificat constatări în verificările suportate. Consultă limitele înainte de a trage concluzii.",
    "noFilter": "Nicio constatare nu corespunde filtrului.",
    "limited": "Se afișează primele 200 de constatări. Raportul descărcat le include pe toate.",
    "on": "Activat",
    "off": "Dezactivat",
    "unknown": "Nestabilit",
    "busy": "Se analizează local…",
    "done": "Revizia locală este finalizată.",
    "cleared": "Datele configurației au fost șterse.",
    "selected": "Fișiere locale selectate. Conținutul lor are prioritate față de textul lipit.",
    "beforeSelected": "Fișiere anterioare selectate. Conținutul lor are prioritate față de textul lipit.",
    "generated": "Generat local",
    "none": "Niciuna",
    "any": "Oricare",
    "errorPrefix": "Nu se poate analiza: ",
    "errors": {
      "empty": "introdu o configurație.",
      "tooLarge": "maximum 5 MB pentru fiecare configurație.",
      "tooManyRules": "maximum 5.000 de politici per configurație.",
      "tooComplex": "structura JSON depășește limita de analiză.",
      "unknownFormat": "folosește un export nativ suportat sau un snapshot weownit.",
      "oneFile": "folosește un fișier CLI/XML/JSON PAN-OS/snapshot sau fișiere JSON API Fortinet/Check Point aferente.",
      "malformedCLI": "exportul CLI are blocuri config/edit incomplete. Folosește un export complet.",
      "malformedXML": "XML-ul nu este valid.",
      "unsafeXML": "declarațiile de entități XML nu sunt acceptate.",
      "xmlUnavailable": "browserul nu poate interpreta XML.",
      "malformedJSON": "JSON-ul nu este valid.",
      "noFortinetRules": "nu s-au găsit politici firewall Fortinet suportate.",
      "noPaloRules": "nu s-au găsit politici PAN-OS suportate.",
      "noCheckPointRules": "nu s-au găsit reguli de acces Check Point. Include JSON-ul rulebase.",
      "vendorMismatch": "ambele configurații trebuie să fie de la același vendor.",
      "unexpected": "datele nu au putut fi procesate. Verifică formatul.",
      "invalidSnapshot": "schema, versiunea sau câmpurile snapshot-ului weownit nu sunt valide.",
      "unsupportedFortinetJSON": "folosește răspunsuri REST FortiOS cu path, name, vdom și results; listele simple și JSON FortiManager nu sunt suportate.",
      "unsupportedPaloJSON": "folosește ierarhia de configurație PAN-OS sau un răspuns REST cu reguli de securitate.",
      "missingPaloContext": "regulile REST PAN-OS necesită metadate de context. Exporturile Panorama necesită și resource, de exemplu Policies/SecurityPreRules.",
      "malformedPaloCLI": "folosește un export PAN-OS set complet, cu ghilimele și liste închise. Scripturile de modificare nu sunt acceptate.",
      "apiFailure": "fișierul conține un răspuns API eșuat.",
      "conflictingPages": "paginile API duplicate conțin date de politici contradictorii."
    },
    "warnings": {
      "fortinetNGFW": "Fortinet NGFW policy-based: se păstrează ID-urile aplicațiilor, categoriile URL/aplicații și utilizatorii/grupurile din export. Serviciile omise rămân necunoscute. Verificările de acces larg și suprapunere sunt omise; nu se simulează porturile application-default, IPS/categoriile, identitatea, IPv6 sau evaluarea pre-security-policy.",
      "managerScope": "FortiManager: ADOM-urile și pachetele sunt analizate separat. Obiectele globale, mapările dinamice și politica instalată efectiv nu sunt reconstruite.",
      "staticScope": "Nu validează conectivitatea, NAT, rutarea, firmware/CVE, hit count sau conformitatea completă. Sursa Any nu dovedește expunerea la Internet.",
      "fortinetDefaults": "Fortinet: câmpurile omise de logging/protecție rămân necunoscute. Grupurile de interfețe, IPv6, VIP/NAT și NGFW policy-based nu sunt modelate complet.",
      "paloDefaults": "PAN-OS: setările omise de logging rămân necunoscute. Grupurile de adrese/servicii se compară după nume; includerea intervalelor IP și porturile application-default nu sunt calculate.",
      "panoramaScope": "Panorama: shared, device-group, pre/post și VSYS sunt analizate separat. Moștenirea, override-urile și politica efectivă per dispozitiv nu sunt reconstruite.",
      "checkpointScope": "Check Point: numai reguli access-control; fără audit NAT sau Threat Prevention. Semantica layerelor, install targets, identității și VPN nu este reconstruită.",
      "unresolvedObjects": "Unele UID-uri Check Point nu pot fi rezolvate. Include objects-dictionary/JSON-ul cu obiecte. Criteriile nerezolvate nu sunt tratate drept Any.",
      "pagination": "Exportul Check Point pare paginat. Include toate paginile; rezultatele acoperă numai regulile furnizate.",
      "incompleteRules": "Unele politici au criterii lipsă sau nerezolvate. Verificările de acces larg și suprapunere sunt omise pentru ele.",
      "complexRules": "Condițiile negate sau complexe sunt excluse din verificările de acces larg și suprapunere.",
      "pairLimit": "Verificările de suprapunere sunt omise în contexte cu peste 350 de politici active. Verificările individuale se execută.",
      "reviewSnapshot": "Snapshot de revizie weownit: numai politici normalizate, nu backup complet al vendorului. Constatările se recalculează; limitele originale se păstrează.",
      "apiSnapshot": "Exporturi API: analiza acoperă numai câmpurile și obiectele furnizate. Filtrele, datele omise și contextul pot limita acoperirea.",
      "apiPagination": "Exportul API indică rezultate suplimentare. Include toate paginile; analiza acoperă numai politicile furnizate.",
      "apiOrder": "Ordinea politicilor nu este stabilită pentru acest snapshot API. Se omit constatările de suprapunere și comparațiile de ordine.",
      "paloCLIContext": "Export CLI PAN-OS relativ: se presupune contextul local VSYS vsys1. Folosește prefixe explicite vsys/device-group pentru alte contexte.",
      "paloCLIExport": "PAN-OS CLI: numai exporturi complete în format set. Câmpurile se reunesc după numele regulii; se folosește ordinea exportului. Fără scripturi de modificare sau moștenire efectivă Panorama."
    },
    "checks": {
      "anyAny": [
        "Politică allow cu sursă, destinație și serviciu nerestricționate",
        "Înlocuiește selectorii largi cu sursele, destinațiile și serviciile aprobate; confirmă necesitatea de business."
      ],
      "broadAllow": [
        "Politică allow cu acces larg",
        "Verifică necesitatea selectorilor nerestricționați și restrânge politica la fluxurile necesare."
      ],
      "adminService": [
        "Serviciu de administrare permis din orice sursă",
        "Revizuiește accesul SSH, RDP, Telnet, VNC sau FTP; restrânge sursele și căile de administrare."
      ],
      "noLogging": [
        "Logging dezactivat explicit pe o politică allow",
        "Activează logging adecvat după verificarea capacității de stocare și a cerințelor operaționale."
      ],
      "noProtection": [
        "Nu s-au identificat profiluri de securitate activate",
        "Verifică profilurile de inspecție potrivite pentru acest trafic și validează configurația lor."
      ],
      "noDescription": [
        "Politica nu are descriere",
        "Documentează responsabilul, scopul și referința modificării."
      ],
      "potentialRedundancy": [
        "Politică posibil redundantă",
        "O politică anterioară acoperă selectorii literali din export. Verifică toate condițiile înainte de eliminare."
      ],
      "potentialConflict": [
        "O politică anterioară poate anula acțiunea intenționată",
        "O politică anterioară acoperă selectorii literali cu altă acțiune. Verifică ordinea și evaluarea efectivă."
      ]
    },
    "exportXML": "Snapshot XML de revizie",
    "standard": "Un standard de revizie pentru toți vendorii",
    "standardHint": "JSON-ul și XML-ul exportate aici folosesc schema de revizie Weownit și pot fi reîncărcate pentru același vendor. Sunt snapshot-uri de analiză, nu backup-uri sau configurații de migrare. Formatele native acceptate sunt cele din tabel.",
    "nativeInputs": "Formate native",
    "sharedInputs": "Formate comune de revizie",
    "fortFormats": "CLI FortiOS policy/security-policy · JSON REST API",
    "paloFormats": "XML/JSON de configurație · CLI set · JSON REST reguli",
    "cpFormats": "JSON Management API · rezultat mgmt_cli JSON",
    "sharedFormats": "Snapshot Weownit JSON / XML",
    "extraDemos": "Alte formate native de laborator",
    "inputPlaceholder": "CLI / XML / JSON nativ sau snapshot de revizie Weownit",
    "nativeGuide": "Ghid pentru export",
    "exportGuide": "Folosește un export complet al politicilor, cu contextul și obiectele aferente. Check Point: exportă toate paginile access-rulebase și dicționarul de obiecte prin mgmt_cli cu --format json. Palo Alto: rezultatul show din modul de configurare, în format set, json sau xml. Fortinet JSON: păstrează wrapperul REST cu path, name, vdom și results."
  },
  "fr": {
    "eyebrow": "03 / REVUE DES CONFIGURATIONS PARE-FEU",
    "lead": "Examinez les politiques, le durcissement et les configurations après modification. FortiGate, Palo Alto, Cisco IOS / IOS XE et Check Point ; couverture selon le mode.",
    "privacy": "Analyse locale · Aucun envoi de configuration · Sans compte",
    "vendor": "Fournisseur du pare-feu",
    "auto": "Détection automatique",
    "demo": "Essayez un laboratoire de démonstration",
    "input": "Collez la configuration ou ouvrez des fichiers locaux",
    "file": "Fichiers locaux (5 Mo maximum au total)",
    "formatHint": "Fortinet : CLI FortiOS policy/security-policy ou JSON REST API FortiOS. Palo Alto : configuration XML/JSON ou export CLI set complet. Check Point : JSON Management API, également exporté par mgmt_cli. Sélectionnez ensemble les fichiers API Fortinet ou JSON Check Point associés.",
    "compare": "Comparer avec une configuration antérieure (facultatif)",
    "before": "Configuration antérieure — même fournisseur",
    "beforeFile": "Fichiers locaux antérieurs",
    "compareHint": "Compare les champs des politiques ; l’ordre est comparé uniquement lorsqu’il est établi. La comparaison entre formats exige des contextes identiques. Sans simulation du routage, du NAT ou des applications.",
    "analyze": "Analyser la configuration",
    "clear": "Effacer les données",
    "exportHTML": "Télécharger le rapport HTML",
    "exportJSON": "Rapport JSON + snapshot réutilisable",
    "coverage": "Couverture et limites de l’analyse",
    "changes": "Modifications de configuration",
    "findings": "Constats à examiner",
    "allSeverities": "Toutes les priorités",
    "high": "Élevée",
    "medium": "Moyenne",
    "low": "Faible",
    "policies": "Politiques interprétées",
    "tableLimit": "Le tableau affiche jusqu’à 100 politiques. Le rapport JSON comprend toutes les politiques interprétées.",
    "ctaText": "Transformez ces constats en plan de correction validé : revue experte, changements contrôlés et vérification.",
    "cta": "Demander une revue de pare-feu",
    "scope": "Revue statique des politiques, sans audit complet ni garantie de connectivité. Les conditions non prises en charge et les informations manquantes sont signalées. Les configurations restent dans cette page jusqu’à leur effacement ou sa fermeture ; les rapports sont enregistrés localement sur demande.",
    "search": "Rechercher un nom ou un ID de règle",
    "rules": "Politiques",
    "active": "Actives",
    "disabled": "Désactivées",
    "scopes": "Contextes",
    "review": "Revue des politiques",
    "evidence": "Preuves",
    "remediation": "Vérification recommandée",
    "source": "Source",
    "destination": "Destination",
    "service": "Service",
    "from": "Depuis",
    "to": "Vers",
    "application": "Application",
    "users": "Utilisateurs / groupes",
    "urlCategories": "Catégories URL",
    "appCategories": "Catégories d’applications",
    "appGroups": "Groupes d’applications",
    "src6": "Source IPv6",
    "dst6": "Destination IPv6",
    "inspectionProfiles": "Références des profils d’inspection",
    "action": "Action",
    "logging": "Journalisation",
    "protection": "Protection",
    "scopeLabel": "Contexte",
    "rule": "Règle",
    "related": "Politique précédente",
    "added": "Ajoutées",
    "removed": "Supprimées",
    "changed": "Modifiées",
    "noChanges": "Aucune différence détectée dans les champs des politiques.",
    "noFindings": "Aucun constat dans les contrôles pris en charge. Consultez les limites avant de conclure.",
    "noFilter": "Aucun constat ne correspond au filtre.",
    "limited": "Les 200 premiers constats sont affichés. Le rapport téléchargé comprend tous les constats.",
    "on": "Activée",
    "off": "Désactivée",
    "unknown": "Non établi",
    "busy": "Analyse locale en cours…",
    "done": "Revue locale terminée.",
    "cleared": "Données de configuration effacées.",
    "selected": "Fichiers locaux sélectionnés. Leur contenu est prioritaire sur le texte collé.",
    "beforeSelected": "Fichiers antérieurs sélectionnés. Leur contenu est prioritaire sur le texte collé.",
    "generated": "Généré localement",
    "none": "Aucune",
    "any": "Tous",
    "errorPrefix": "Analyse impossible : ",
    "errors": {
      "empty": "fournissez une configuration.",
      "tooLarge": "5 Mo maximum par configuration.",
      "tooManyRules": "5 000 politiques maximum par configuration.",
      "tooComplex": "la structure JSON dépasse la limite d’analyse.",
      "unknownFormat": "utilisez un export natif pris en charge ou un snapshot weownit.",
      "oneFile": "utilisez un fichier CLI/XML/JSON PAN-OS/snapshot ou les fichiers JSON Fortinet API/Check Point associés.",
      "malformedCLI": "l’export CLI contient des blocs config/edit incomplets. Utilisez un export complet.",
      "malformedXML": "le XML est mal formé.",
      "unsafeXML": "les déclarations d’entités XML ne sont pas acceptées.",
      "xmlUnavailable": "ce navigateur ne peut pas interpréter le XML.",
      "malformedJSON": "le JSON n’est pas valide.",
      "noFortinetRules": "aucune politique Fortinet prise en charge trouvée.",
      "noPaloRules": "aucune politique PAN-OS prise en charge trouvée.",
      "noCheckPointRules": "aucune règle d’accès Check Point trouvée. Incluez le JSON rulebase.",
      "vendorMismatch": "les deux configurations doivent concerner le même fournisseur.",
      "unexpected": "les données n’ont pas pu être traitées. Vérifiez le format.",
      "invalidSnapshot": "schéma, version ou champs du snapshot weownit invalides.",
      "unsupportedFortinetJSON": "utilisez les réponses REST FortiOS avec path, name, vdom et results ; listes simples et JSON FortiManager non pris en charge.",
      "unsupportedPaloJSON": "utilisez la hiérarchie PAN-OS ou une réponse REST de règles de sécurité.",
      "missingPaloContext": "les règles REST PAN-OS exigent les métadonnées de contexte. Panorama exige aussi resource, par exemple Policies/SecurityPreRules.",
      "malformedPaloCLI": "utilisez un export PAN-OS set complet avec guillemets et listes équilibrés. Scripts de modification non acceptés.",
      "apiFailure": "le fichier contient une réponse API en échec.",
      "conflictingPages": "les pages API dupliquées contiennent des politiques contradictoires."
    },
    "warnings": {
      "fortinetNGFW": "Fortinet NGFW policy-based : les ID d’applications, catégories URL/applications et utilisateurs/groupes sont conservés tels qu’exportés. Les services omis restent inconnus. Les contrôles d’accès large et de chevauchement sont ignorés ; ports application-default, IPS/catégories, identité, IPv6 et pre-security-policy ne sont pas simulés.",
      "managerScope": "FortiManager : ADOM/packages séparés. Objets globaux, mappings dynamiques et politique installée effective non reconstruits.",
      "staticScope": "Aucune validation de connectivité, NAT, routage, firmware/CVE, compteurs ou conformité complète. Une source Any ne prouve pas une exposition à Internet.",
      "fortinetDefaults": "Fortinet : les champs de journalisation/protection omis restent inconnus. Groupes d’interfaces, IPv6, VIP/NAT et NGFW policy-based ne sont pas entièrement modélisés.",
      "paloDefaults": "PAN-OS : la journalisation omise reste inconnue. Les groupes d’adresses/services sont comparés par nom ; les plages IP et les ports application-default ne sont pas développés.",
      "panoramaScope": "Panorama : shared, device-group, pre/post et VSYS sont examinés séparément. Héritage, overrides et politique effective par équipement non reconstruits.",
      "checkpointScope": "Check Point : règles access-control uniquement ; aucun audit NAT ou Threat Prevention. La sémantique des couches, install targets, identités et VPN n’est pas reconstruite.",
      "unresolvedObjects": "Certains UID Check Point ne sont pas résolus. Incluez objects-dictionary/JSON des objets. Les critères non résolus ne sont pas considérés comme Any.",
      "pagination": "L’export Check Point semble paginé. Incluez toutes les pages ; seuls les éléments fournis sont examinés.",
      "incompleteRules": "Certaines politiques ont des critères absents ou non résolus. Les contrôles d’accès large et de chevauchement sont ignorés pour celles-ci.",
      "complexRules": "Les conditions négatives ou complexes sont exclues des contrôles d’accès large et de chevauchement.",
      "pairLimit": "Les contrôles de chevauchement sont ignorés au-delà de 350 politiques actives par contexte. Les contrôles individuels restent exécutés.",
      "reviewSnapshot": "Snapshot de revue weownit : politiques normalisées uniquement, pas une sauvegarde complète. Les constats sont recalculés ; les limites initiales s’appliquent.",
      "apiSnapshot": "Exports API : seuls les champs et objets fournis sont analysés. Filtres, données omises et contexte peuvent limiter la couverture.",
      "apiPagination": "L’export API indique des résultats supplémentaires. Incluez toutes les pages ; seules les politiques fournies sont analysées.",
      "apiOrder": "L’ordre des politiques n’est pas établi pour ce snapshot API. Les constats de chevauchement et comparaisons d’ordre sont ignorés.",
      "paloCLIContext": "Export CLI PAN-OS relatif : contexte local VSYS vsys1 supposé. Utilisez les préfixes vsys/device-group explicites pour les autres contextes.",
      "paloCLIExport": "PAN-OS CLI : exports set complets uniquement. Champs regroupés par nom de règle ; ordre de l’export utilisé. Scripts de modification et héritage effectif Panorama non pris en charge."
    },
    "checks": {
      "anyAny": [
        "Politique allow sans restriction de source, destination ou service",
        "Remplacez les sélecteurs larges par les sources, destinations et services approuvés ; confirmez le besoin métier."
      ],
      "broadAllow": [
        "Politique allow à accès large",
        "Vérifiez la nécessité des sélecteurs non restreints et limitez la politique aux flux nécessaires."
      ],
      "adminService": [
        "Service d’administration accessible depuis toute source",
        "Examinez SSH, RDP, Telnet, VNC ou FTP ; restreignez les sources et chemins d’administration."
      ],
      "noLogging": [
        "Journalisation explicitement désactivée sur une politique allow",
        "Activez une journalisation adaptée après vérification du stockage et des besoins opérationnels."
      ],
      "noProtection": [
        "Aucun profil de sécurité activé identifié",
        "Examinez les profils d’inspection adaptés au trafic et validez leur configuration."
      ],
      "noDescription": [
        "Politique sans description",
        "Documentez le responsable, l’objectif et la référence du changement."
      ],
      "potentialRedundancy": [
        "Politique potentiellement redondante",
        "Une politique précédente couvre les sélecteurs littéraux. Vérifiez toutes les conditions avant toute suppression."
      ],
      "potentialConflict": [
        "Une politique précédente peut remplacer l’action souhaitée",
        "Une politique précédente couvre les sélecteurs avec une action différente. Vérifiez l’ordre et l’évaluation effective."
      ]
    },
    "exportXML": "Snapshot XML de revue",
    "standard": "Un standard de revue pour tous les fournisseurs",
    "standardHint": "Les exports JSON et XML utilisent le schéma de revue Weownit et peuvent être rechargés pour le même fournisseur. Ce sont des snapshots d’analyse, pas des sauvegardes ni des configurations de migration. Les formats natifs acceptés sont indiqués ci-dessous.",
    "nativeInputs": "Formats natifs",
    "sharedInputs": "Formats communs de revue",
    "fortFormats": "CLI FortiOS policy/security-policy · JSON REST API",
    "paloFormats": "Configuration XML/JSON · CLI set · JSON REST des règles",
    "cpFormats": "JSON Management API · sortie mgmt_cli JSON",
    "sharedFormats": "Snapshot Weownit JSON / XML",
    "extraDemos": "Autres formats natifs de laboratoire",
    "inputPlaceholder": "CLI / XML / JSON natif ou snapshot de revue Weownit",
    "nativeGuide": "Guide d’export",
    "exportGuide": "Utilisez un export complet des politiques avec leur contexte et les objets associés. Check Point : exportez toutes les pages access-rulebase et le dictionnaire d’objets via mgmt_cli avec --format json. Palo Alto : sortie show du mode configuration au format set, json ou xml. Fortinet JSON : conservez la réponse REST avec path, name, vdom et results."
  }
};
  const coverageLabels={"en": {"content": "Content", "contentDirection": "Content direction", "servicePorts": "TCP service ports", "evaluated": "Evaluated", "skipped": "Skipped", "coverageDetail": "Coverage per check", "overlap": "Literal overlap eligibility", "reason": "Reason", "line": "Line", "objectsTitle": "Object definitions", "disabled": "Disabled", "notAllow": "Not an allow policy", "unknownLogging": "Logging unknown", "unknownProtection": "Protection unknown", "negated": "Negated criteria", "complex": "Unsupported conditions", "incomplete": "Missing criteria", "unknownOrder": "Order unknown", "unknownContext": "Time / VPN unknown", "unknownAction": "Action unknown", "pairLimit": "Scope exceeds 350 active policies"}, "ro": {"content": "Conținut", "contentDirection": "Direcția conținutului", "servicePorts": "Porturi TCP ale serviciilor", "evaluated": "Evaluate", "skipped": "Omise", "coverageDetail": "Acoperire pentru fiecare verificare", "overlap": "Eligibilitate pentru suprapuneri literale", "reason": "Motiv", "line": "Linia", "objectsTitle": "Definiții ale obiectelor", "disabled": "Dezactivate", "notAllow": "Politică fără acțiune allow", "unknownLogging": "Jurnalizare necunoscută", "unknownProtection": "Protecție necunoscută", "negated": "Criterii negate", "complex": "Condiții nesimulate", "incomplete": "Criterii lipsă", "unknownOrder": "Ordine necunoscută", "unknownContext": "Timp / VPN necunoscut", "unknownAction": "Acțiune necunoscută", "pairLimit": "Context cu peste 350 de politici active"}, "fr": {"content": "Contenu", "contentDirection": "Direction du contenu", "servicePorts": "Ports TCP des services", "evaluated": "Évaluées", "skipped": "Ignorées", "coverageDetail": "Couverture par contrôle", "overlap": "Éligibilité aux chevauchements littéraux", "reason": "Motif", "line": "Ligne", "objectsTitle": "Définitions des objets", "disabled": "Désactivées", "notAllow": "Politique sans action allow", "unknownLogging": "Journalisation inconnue", "unknownProtection": "Protection inconnue", "negated": "Critères inversés", "complex": "Conditions non simulées", "incomplete": "Critères manquants", "unknownOrder": "Ordre inconnu", "unknownContext": "Temps / VPN inconnu", "unknownAction": "Action inconnue", "pairLimit": "Contexte de plus de 350 politiques actives"}};
  for(const lang of Object.keys(dictionaries)){const d=dictionaries[lang];Object.assign(d,{content:coverageLabels[lang].content,contentDirection:coverageLabels[lang].contentDirection,contentNegation:{en:'Negated content',ro:'Conținut negat',fr:'Contenu inversé'}[lang],servicePorts:coverageLabels[lang].servicePorts});d.warnings.objectDiffUnavailable={en:'Object comparison is unavailable for a legacy snapshot without object definitions. Policy-field comparison still runs.',ro:'Compararea obiectelor nu este disponibilă pentru un snapshot vechi fără definiții de obiecte. Câmpurile politicilor sunt comparate în continuare.',fr:'Comparaison des objets indisponible pour un ancien snapshot sans définitions. Les champs des politiques restent comparés.'}[lang];d.errors.malformedCLI={en:'unbalanced quotes or incomplete CLI blocks. Use a complete export.',ro:'ghilimele neînchise sau blocuri CLI incomplete. Folosește un export complet.',fr:'guillemets ou blocs CLI incomplets. Utilisez un export complet.'}[lang];d.errors.conflictingPages={en:'duplicate exports contain conflicting rule or object definitions.',ro:'exporturile duplicate conțin definiții contradictorii de reguli sau obiecte.',fr:'les exports dupliqués contiennent des règles ou objets contradictoires.'}[lang];d.compareHint={en:'Compares policy fields and supplied address/service/group definitions. Order changes are checked only when established. Cross-format comparison requires matching contexts. No routing, NAT or application simulation.',ro:'Compară câmpurile politicilor și definițiile furnizate pentru adrese, servicii și grupuri. Ordinea este comparată doar când este cunoscută. Formatele trebuie să aibă contexte compatibile. Fără simulare de rutare, NAT sau aplicații.',fr:'Compare les champs des politiques et les définitions fournies des adresses, services et groupes. Ordre comparé seulement s’il est établi. Contextes compatibles requis. Sans simulation de routage, NAT ou applications.'}[lang];}
  for(const l of Object.keys(dictionaries)){Object.assign(dictionaries[l],{
    input:{en:'After configuration / proposed change',ro:'Configurația după modificare / propunerea',fr:'Configuration après / changement proposé'}[l],
    analyze:{en:'Run local review',ro:'Rulează analiza locală',fr:'Lancer la revue locale'}[l]
  });}
  let language=['en','ro','fr'].includes(document.documentElement.lang)?document.documentElement.lang:'en';
  let result=null,currentModel=null,comparison=null,changeReport=null,beforeModel=null,created=null,statusKey='',errorCode='',errorLine=0,busy=false,generation=0,hardeningMode=false;
  const t=()=>dictionaries[language];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const display=v=>Array.isArray(v)?v.map(display).join(', '):v===core.ANY?t().any:['on','off','unknown'].includes(v)?t()[v]:String(v??'');
  const status=()=>{ $('fw-status').textContent=errorCode?t().errorPrefix+(change.error(errorCode)||t().errors[errorCode]||t().errors.unexpected)+(errorLine?' · '+coverageLabels[language].line+' '+errorLine:''):statusKey?t()[statusKey]:'';$('fw-status').dataset.error=String(!!errorCode); };
  function evidence(f) {return '<dl class="fw-evidence">'+Object.entries(f.evidence).map(([k,v])=>'<dt>'+esc(t()[k]||k)+'</dt><dd>'+esc(display(v))+'</dd>').join('')+'</dl>';}
  function findingHTML(f) {const c=t().checks[f.code];return '<details class="fw-finding"><summary><span class="fw-badge '+f.severity+'">'+esc(t()[f.severity])+'</span><span class="fw-finding-title">'+esc(c[0])+'</span><span class="fw-rule-ref">'+esc(f.ruleName)+' · '+esc(f.ruleId)+'</span></summary><div class="fw-finding-body"><p>'+esc(t().scopeLabel)+': '+esc(f.scope)+'</p>'+(f.relatedId?'<p>'+esc(t().related)+': '+esc(f.relatedName)+' · '+esc(f.relatedId)+'</p>':'')+evidence(f)+'<p><strong>'+esc(t().remediation)+':</strong> '+esc(c[1])+'</p></div></details>';}
  function renderFindings() {
    if(!result) return;const q=$('fw-search').value.toLowerCase(), severity=$('fw-severity').value;
    const matches=result.findings.filter(f=>(severity==='all'||f.severity===severity)&&[f.ruleId,f.ruleName,f.scope,t().checks[f.code][0]].join(' ').toLowerCase().includes(q));
    $('fw-findings').innerHTML=matches.length?matches.slice(0,200).map(findingHTML).join('')+(matches.length>200?'<p class="fw-hint">'+esc(t().limited)+'</p>':''):'<p class="fw-empty">'+esc(result.findings.length?t().noFilter:t().noFindings)+'</p>';
  }
  function coverageHTML(){
    const labels=coverageLabels[language];return '<h3>'+esc(labels.coverageDetail)+'</h3><table class="fw-table fw-coverage-table"><thead><tr><th>'+esc(t().review)+'</th><th>'+esc(labels.evaluated)+'</th><th>'+esc(labels.skipped)+'</th><th>'+esc(labels.reason)+'</th></tr></thead><tbody>'+Object.entries(result.coverage.checks).map(([code,c])=>'<tr><td>'+esc(code==='overlap'?labels.overlap:t().checks[code][0])+'</td><td>'+c.evaluated+'</td><td>'+c.skipped+'</td><td>'+Object.entries(c.reasons).map(([k,n])=>esc(labels[k]||k)+': '+n).join(' · ')+'</td></tr>').join('')+'</tbody></table>';
  }
  function policiesHTML(policies){
    const cols=['rule','source','destination','service','application','urlCategories','users','action','logging'];
    return '<table class="fw-table"><thead><tr>'+cols.map(k=>'<th>'+esc(t()[k])+'</th>').join('')+'</tr></thead><tbody>'+policies.map(r=>'<tr><td>'+esc(r.name)+'<br><small>'+esc(r.id)+(r.enabled?'':' · '+esc(t().disabled))+'<br>'+esc(r.scope)+'</small><details><summary>'+esc(t().evidence)+'</summary><dl class="fw-evidence">'+['from','to','content','contentDirection','contentNegation','servicePorts','inspectionProfiles','appCategories','appGroups','src6','dst6','schedule','vpn','protection','comment'].filter(k=>Array.isArray(r[k])?r[k].length:true).map(k=>'<dt>'+esc(t()[k]||k)+'</dt><dd>'+esc(display(r[k]))+'</dd>').join('')+'</dl></details></td><td>'+esc(display(r.src))+'</td><td>'+esc(display(r.dst))+'</td><td>'+esc(r.service.length?display(r.service):t().unknown)+'</td><td>'+esc(display(r.apps))+'</td><td>'+esc(r.urlCategories.length?display(r.urlCategories):'—')+'</td><td>'+esc(display(r.users))+'</td><td>'+esc(r.action)+'</td><td>'+esc(display(r.logging))+'</td></tr>').join('')+'</tbody></table>';
  }
  function diffHTML(limit=100) {
    if(!comparison) return '';
    const counts='<p class="fw-counts">'+esc(t().added)+': '+comparison.added.length+' · '+esc(t().removed)+': '+comparison.removed.length+' · '+esc(t().changed)+': '+comparison.changed.length+'</p>';
    if(!comparison.added.length&&!comparison.removed.length&&!comparison.changed.length&&!comparison.objectChanges) return counts+'<p>'+esc(t().noChanges)+'</p>';
    const items=[];
    for(const kind of ['added','removed']) for(const r of comparison[kind]) items.push('<div class="fw-diff-list"><strong>'+esc(t()[kind])+': '+esc(r.name)+'</strong><p>'+esc(r.scope)+' · '+esc(r.id)+'</p></div>');
    for(const r of comparison.changed) items.push('<div class="fw-diff-list"><strong>'+esc(t().changed)+': '+esc(r.name)+'</strong><p>'+esc(r.scope)+' · '+esc(r.id)+'</p>'+r.changes.map(c=>'<p>'+esc(t()[c.field]||c.field)+': '+esc(display(c.before))+' → '+esc(display(c.after))+'</p>').join('')+'</div>');
    if(comparison.objectChanges){items.push('<h3>'+esc(coverageLabels[language].objectsTitle)+'</h3>');for(const kind of ['added','removed','changed'])for(const d of comparison.objectChanges[kind])items.push('<div class="fw-diff-list"><strong>'+esc(t()[kind])+': '+esc(d.name)+'</strong><p>'+esc(d.scope)+' · '+esc(d.type)+'</p><pre>'+esc(JSON.stringify(kind==='changed'?{before:d.before,after:d.after}:d.fields,null,2))+'</pre></div>');}
    return counts+items.slice(0,limit).join('')+(items.length>limit?'<p class="fw-hint">'+limit+' / '+items.length+'</p>':'');
  }
  function renderResults() {
    change.render(result?changeReport:null);$('fw-results').hidden=hardeningMode||!result;if(!result){for(const id of ['fw-result-title','fw-counts','fw-summary','fw-warnings','fw-diff-content','fw-findings','fw-policy-table','fw-coverage'])$(id).textContent='';$('fw-diff').hidden=true;return;}
    $('fw-result-title').textContent=names[result.vendor]+' · '+t().review;
    const c=result.counts;
    $('fw-counts').textContent=result.format+' · '+t().active+': '+c.active+' · '+t().disabled+': '+c.disabled+' · '+t().scopes+': '+c.scopes;
    $('fw-summary').innerHTML=['rules','high','medium','low'].map(k=>'<div class="fw-stat" data-tone="'+k+'"><strong>'+c[k]+'</strong><span>'+esc(t()[k])+'</span></div>').join('');
    $('fw-warnings').innerHTML=result.warnings.map(w=>'<li>'+esc(t().warnings[w.code]||w.code)+(w.code==='pairLimit'&&w.detail?' — '+esc(w.detail):'')+'</li>').join('');
    $('fw-diff').hidden=!comparison;$('fw-diff-content').innerHTML=diffHTML();renderFindings();
    $('fw-coverage').innerHTML=coverageHTML();
    $('fw-policy-table').innerHTML=policiesHTML(result.policies.slice(0,100));
  }
  function translate() {
    document.querySelectorAll('[data-fw]').forEach(el=>{const value=t()[el.dataset.fw];if(typeof value==='string')el.textContent=value;});
    $('fw-input').placeholder=t().inputPlaceholder;$('fw-search').placeholder=t().search;$('fw-search').setAttribute('aria-label',t().search);$('fw-severity').setAttribute('aria-label',t().allSeverities);status();renderResults();
  }
  async function readInput(fileID,textID) {
    const files=Array.from($(fileID).files || []);
    if(files.length){if(files.reduce((n,f)=>n+f.size,0)>core.MAX_BYTES)throw Object.assign(new Error(),{code:'tooLarge'});return Promise.all(files.map(f=>f.text()));}
    return [$(textID).value];
  }
  async function analyze(event) {
    event?.preventDefault();if(busy)return;const ticket=++generation;busy=true;
    result=null;currentModel=null;comparison=null;changeReport=null;beforeModel=null;renderResults();errorCode='';errorLine=0;statusKey='busy';status();
    $('fw-form').querySelectorAll('button').forEach(b=>b.disabled=true);
    try {
      await new Promise(resolve=>setTimeout(resolve,25));
      const inputs=await readInput('fw-file','fw-input');
      const parsed=core.parse(inputs,$('fw-vendor').value);
      const report=core.analyze(parsed);
      let delta=null,earlier=null;
      if($('fw-before').value.trim()||$('fw-before-file').files.length) {earlier=core.parse(await readInput('fw-before-file','fw-before'),parsed.vendor);delta=core.diff(earlier,parsed);}
      if(ticket!==generation)return;
      change.scopes(earlier,parsed);
      const impact=await change.run(earlier,parsed,delta);
      if(ticket!==generation)return;
      changeReport=impact;beforeModel=earlier;result=report;currentModel=parsed;comparison=delta;created=new Date().toISOString();statusKey='done';renderResults();change.publish?.(changeReport,earlier,parsed);if(changeReport)$('fc-results').scrollIntoView?.({behavior:'smooth',block:'start'});
    } catch(e) {if(ticket===generation){errorCode=e.code||'unexpected';errorLine=e.line||0;statusKey='';}}
    finally {busy=false;$('fw-form').querySelectorAll('button').forEach(b=>b.disabled=false);status();}
  }
  function clear() {
    generation++;change.reset();result=null;currentModel=null;comparison=null;changeReport=null;beforeModel=null;created=null;errorCode='';errorLine=0;statusKey='cleared';
    for(const id of ['fw-input','fw-before','fw-file','fw-before-file','fw-search'])$(id).value='';
    $('fw-severity').value='all';$('fw-before-panel').open=false;renderResults();status();
  }
  function download(kind) {
    if(!result)return;
    let content,mime;
    const report={tool:'weownit Firewall Change Review',version:core.VERSION,generatedAt:created,language,scope:t().scope,...result,comparison,changeReview:changeReport,...(changeReport&&beforeModel?{beforeSnapshot:core.snapshot(beforeModel)}:{})};
    if(kind==='json') {content=JSON.stringify({...report,...core.snapshot(currentModel)},null,2);mime='application/json';}
    else if(kind==='xml') {content=core.snapshotXML(currentModel);mime='application/xml';}
    else {
      const c=result.counts;
      content='<!doctype html><html lang="'+language+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>weownit Firewall Change Review</title><style>body{font:15px/1.6 system-ui,sans-serif;color:#16313b;max-width:1000px;margin:40px auto;padding:0 20px}h1,h2{line-height:1.2}.fw-finding{border:1px solid #ccd8dc;margin:12px 0;padding:14px}.fw-finding summary{font-weight:650}.fw-finding-body{margin-top:10px}.fw-badge{font-size:12px;margin-right:10px}.fw-rule-ref{display:block;color:#536971}.fw-evidence{display:grid;grid-template-columns:130px 1fr;gap:5px;margin:12px 0;font:13px monospace}.fw-evidence dd{margin:0;overflow-wrap:anywhere}.fw-diff-list{border:1px solid #ccd8dc;padding:12px;margin:10px 0}.fw-table{border-collapse:collapse;width:100%;font-size:12px}.fw-table th,.fw-table td{border:1px solid #ccd8dc;padding:8px;vertical-align:top;overflow-wrap:anywhere}.fw-table-wrap{overflow-x:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#536971}li{margin:6px 0}.fc-stats,.fc-verdicts{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.fc-stat,.fc-verdicts>div,.fc-flow{border:1px solid #ccd8dc;padding:12px;margin:10px 0}.fc-stat strong{display:block;font-size:26px}.fc-stat span,.fc-label{font-size:12px}.fc-status{padding:4px 8px;background:#e9f1ee}.fc-flow.regression{border-left:4px solid #b64040}.fc-flow.pass{border-left:4px solid #218468}.fc-row-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.fc-flow h4{margin:0}.fc-demo-banner{padding:12px;background:#e9f1ee}.fc-flow-path{font:14px monospace}@media print{body{margin:0}.fw-finding{break-inside:avoid}details>div{display:block!important}}</style></head><body><h1>weownit · Firewall Change Review</h1><p>'+esc(names[result.vendor])+' · '+esc(result.format)+'</p><small>'+esc(t().generated)+': '+esc(created)+' · v'+core.VERSION+'</small><p>'+esc(t().rules)+': '+c.rules+' · '+esc(t().high)+': '+c.high+' · '+esc(t().medium)+': '+c.medium+' · '+esc(t().low)+': '+c.low+'</p><h2>'+esc(t().coverage)+'</h2><p>'+esc(t().scope)+'</p>'+coverageHTML()+'<ul>'+result.warnings.map(w=>'<li>'+esc(t().warnings[w.code]||w.code)+'</li>').join('')+'</ul>'+change.html(changeReport)+(comparison?'<h2>'+esc(t().changes)+'</h2>'+diffHTML(Infinity):'')+'<h2>'+esc(t().findings)+'</h2>'+result.findings.map(f=>findingHTML(f).replace('<details class="fw-finding">','<details class="fw-finding" open>')).join('')+(result.findings.length?'':'<p>'+esc(t().noFindings)+'</p>')+'<h2>'+esc(t().policies)+'</h2><div class="fw-table-wrap">'+policiesHTML(result.policies).replaceAll('<details>','<details open>')+'</div></body></html>';mime='text/html';
    }
    const url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');
    a.href=url;a.download='weownit_Firewall_Review_'+result.vendor+'_'+created.slice(0,10)+'.'+kind;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.addEventListener('fw:hardeningmode',()=>{hardeningMode=true;$('fw-results').hidden=true;});
  document.addEventListener('fw:policymode',()=>{hardeningMode=false;$('fw-results').hidden=!result;});
  document.addEventListener('fw:scenariochange',()=>{generation++;change.cancel();changeReport=null;result=null;currentModel=null;comparison=null;renderResults();statusKey='';errorCode='';status();});
  $('fw-form').addEventListener('submit',analyze);$('fw-clear').addEventListener('click',clear);
  document.querySelectorAll('[data-fw-demo]').forEach(b=>b.addEventListener('click',()=>{clear();$('fw-vendor').value=b.dataset.fwVendor||b.dataset.fwDemo;$('fw-input').value=window.FirewallReviewDemos[b.dataset.fwDemo];analyze();}));
  $('fw-file').addEventListener('change',()=>{generation++;change.cancel();changeReport=null;result=null;currentModel=null;comparison=null;renderResults();statusKey='selected';errorCode='';errorLine=0;status();});
  $('fw-before-file').addEventListener('change',()=>{generation++;change.cancel();changeReport=null;result=null;currentModel=null;comparison=null;renderResults();statusKey='beforeSelected';errorCode='';errorLine=0;status();});
  for(const id of ['fw-input','fw-before','fw-vendor']) $(id).addEventListener('input',()=>{generation++;change.cancel();result=null;currentModel=null;comparison=null;changeReport=null;beforeModel=null;renderResults();errorCode='';errorLine=0;statusKey='';status();});
  $('fw-severity').addEventListener('change',renderFindings);$('fw-search').addEventListener('input',renderFindings);
  $('fw-export-json').addEventListener('click',()=>download('json'));$('fw-export-xml').addEventListener('click',()=>download('xml'));$('fw-export-html').addEventListener('click',()=>download('html'));
  document.addEventListener('site:languagechange',e=>{language=dictionaries[e.detail.language]?e.detail.language:'en';translate();});
  translate();
})();

