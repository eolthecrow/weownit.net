import { ASSESSMENT_COPY } from './assessment-purchase-page.js';
// Guidance is specific to the delivered V3.1 vendor edition. Source labels and
// validation limits remain visible; no standalone platform or live tests implied.
const common = {
 en:{...ASSESSMENT_COPY.en,previews:['Hardening guide','Vendor procedure','Operational workflow'],sample:'',caption:'Actual pages from this vendor’s V3.1 package. Source documents may retain their v3.0 edition label. Procedures require environment-specific evidence and authorized validation.'},
 ro:{...ASSESSMENT_COPY.ro,previews:['Ghid de securizare','Procedură specifică furnizorului','Flux operațional'],sample:'',caption:'Pagini reale din pachetul V3.1 al acestui furnizor. Documentele pot păstra eticheta ediției v3.0. Procedurile necesită dovezi din mediul evaluat și validare autorizată.'},
 fr:{...ASSESSMENT_COPY.fr,previews:['Guide de durcissement','Procédure constructeur','Processus opérationnel'],sample:'',caption:'Pages réelles du package V3.1 de ce constructeur. Les documents peuvent conserver la mention v3.0. Les procédures nécessitent des preuves propres à votre environnement et une validation autorisée.'}
};
export const VENDOR_PAGES = {
 '6cde3094-a73a-4070-b27c-6bcbc10251c9': {
  title:'Fortinet FortiGate Security Hardening Toolkit 2026',
  copy:{
   en:{...common.en,outcome:'Turn FortiGate configuration evidence into a prioritized security review and a controlled hardening plan.',inputItems:['FortiGate model, FortiOS build, VDOM scope and HA topology','Configuration exports, policies, NAT and security-profile evidence','Remote-access, routing, SD-WAN and logging requirements','Authorized change owners, recovery access and rollback criteria'],result:'A scoped FortiGate review with traceable findings, target settings, prioritized remediation and recorded validation criteria.'},
   ro:{...common.ro,outcome:'Transformă dovezile de configurare FortiGate într-o evaluare prioritizată și un plan controlat de securizare.',inputItems:['Model FortiGate, versiune FortiOS, VDOM-uri și topologie HA','Exporturi de configurație, politici, NAT și profiluri de securitate','Cerințe de acces la distanță, rutare, SD-WAN și jurnalizare','Responsabili autorizați, acces de recuperare și criterii de revenire'],result:'O evaluare FortiGate cu scop definit, constatări trasabile, setări țintă, remediere prioritizată și criterii de validare documentate.'},
   fr:{...common.fr,outcome:'Transformez les preuves de configuration FortiGate en une évaluation priorisée et un plan de durcissement contrôlé.',inputItems:['Modèle FortiGate, version FortiOS, VDOM et topologie HA','Exports de configuration, politiques, NAT et profils de sécurité','Exigences d’accès distant, routage, SD-WAN et journaux','Responsables autorisés, accès de secours et critères de retour arrière'],result:'Une évaluation FortiGate au périmètre défini, avec constats traçables, réglages cibles, corrections priorisées et critères de validation documentés.'}
  }
 },
 'd8848e04-7369-42ca-ae98-da7c38a2dbe7': {
  title:'Palo Alto NGFW & Panorama Security Hardening Toolkit 2026',
  copy:{
   en:{...common.en,outcome:'Turn PAN-OS and associated Panorama evidence into a structured NGFW review and a prioritized hardening plan.',inputItems:['NGFW models, PAN-OS/Panorama versions and management scope','Policies, objects, NAT, profiles and decryption configuration','GlobalProtect, HA, routing and log-collection evidence','Device-group/template ownership and approved commit/push process'],result:'An evidence-led NGFW review with targeted Panorama governance checks, prioritized remediation and repeatable validation criteria.'},
   ro:{...common.ro,outcome:'Transformă dovezile PAN-OS și Panorama asociate într-o evaluare NGFW structurată și un plan de securizare prioritizat.',inputItems:['Modele NGFW, versiuni PAN-OS/Panorama și scopul administrării','Politici, obiecte, NAT, profiluri și configurația de decriptare','Dovezi GlobalProtect, HA, rutare și colectare a jurnalelor','Responsabili pentru Device Groups/Templates și fluxul aprobat de commit/push'],result:'O evaluare NGFW susținută de dovezi, cu verificări punctuale de guvernanță Panorama, remediere prioritizată și criterii repetabile de validare.'},
   fr:{...common.fr,outcome:'Transformez les preuves PAN-OS et Panorama associées en une évaluation NGFW structurée et un plan de durcissement priorisé.',inputItems:['Modèles NGFW, versions PAN-OS/Panorama et périmètre d’administration','Politiques, objets, NAT, profils et configuration du déchiffrement','Preuves GlobalProtect, HA, routage et collecte des journaux','Responsables des Device Groups/Templates et processus commit/push approuvé'],result:'Une évaluation NGFW fondée sur des preuves, avec contrôles ciblés de gouvernance Panorama, corrections priorisées et critères de validation reproductibles.'}
  }
 },
 '1d9d9ea8-9abf-484a-9634-72aa180d861e': {
  title:'Check Point Gateway & Management Security Hardening Toolkit 2026',
  copy:{
   en:{...common.en,outcome:'Turn Check Point Gateway and Management configuration evidence into a scoped security review and a prioritized hardening plan.',inputItems:['Gateway/Management inventory, Gaia release and installed updates','Policy packages, objects, NAT, VPN and administrator settings','SIC, ClusterXL, logging and change-history evidence','Approved change windows, recovery access and rollback requirements'],result:'A scoped Gateway and Management review with linked evidence, prioritized remediation and a documented validation record.'},
   ro:{...common.ro,outcome:'Transformă dovezile de configurare Check Point Gateway și Management într-o evaluare cu scop definit și un plan de securizare prioritizat.',inputItems:['Inventar Gateway/Management, versiune Gaia și actualizări instalate','Pachete de politici, obiecte, NAT, VPN și setări de administrare','Dovezi SIC, ClusterXL, jurnalizare și istoricul schimbărilor','Ferestre aprobate, acces de recuperare și cerințe de revenire'],result:'O evaluare Gateway și Management cu scop definit, dovezi corelate, remediere prioritizată și validare documentată.'},
   fr:{...common.fr,outcome:'Transformez les preuves de configuration Check Point Gateway et Management en une évaluation ciblée et un plan de durcissement priorisé.',inputItems:['Inventaire Gateway/Management, version Gaia et mises à jour installées','Packages de politiques, objets, NAT, VPN et administration','Preuves SIC, ClusterXL, journaux et historique des changements','Fenêtres approuvées, accès de secours et exigences de retour arrière'],result:'Une évaluation Gateway et Management au périmètre défini, avec preuves associées, corrections priorisées et validation documentée.'}
  }
 }
};
