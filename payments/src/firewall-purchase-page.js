import { ASSESSMENT_COPY } from './assessment-purchase-page.js';
export const FIREWALL_ID = '8d1c3dbd-33a5-44d5-8ba4-eb2cae5226cf';
export const FIREWALL_COPY = {
 en: { ...ASSESSMENT_COPY.en,
   outcome:'Turn firewall configuration evidence into a structured security review and a prioritized hardening plan.',
   previews:['Completed firewall report','Evidence-backed finding','Hardening & validation workflow'],
   sample:'',
   inputItems:['Agreed firewall and management scope','Configuration exports, policy rules, objects and NAT','Relevant traffic, VPN and security-profile evidence','Change owners, maintenance windows and rollback requirements'],
   result:'An evidence-backed firewall assessment with prioritized findings, approved hardening actions and repeatable validation criteria.',
   caption:'Actual pages from the Firewall V3.1 package. Northstar is fictional. Some source documents retain their v3.0 edition label.' },
 ro: { ...ASSESSMENT_COPY.ro,
   outcome:'Transformă dovezile de configurare firewall într-o evaluare structurată și un plan de securizare prioritizat.',
   previews:['Raport firewall completat','Constatare susținută de dovezi','Flux de securizare și validare'],
   sample:'',
   inputItems:['Scop agreat pentru firewall și management','Exporturi de configurație, politici, obiecte și NAT','Dovezi relevante de trafic, VPN și profiluri de securitate','Responsabili, ferestre de mentenanță și cerințe de revenire'],
   result:'O evaluare firewall susținută de dovezi, cu constatări prioritizate, acțiuni de securizare aprobate și criterii repetabile de validare.',
   caption:'Pagini reale din pachetul Firewall V3.1. Northstar este fictiv. Unele documente păstrează eticheta ediției v3.0.' },
 fr: { ...ASSESSMENT_COPY.fr,
   outcome:'Transformez les preuves de configuration firewall en une évaluation structurée et un plan de durcissement priorisé.',
   previews:['Rapport firewall complété','Constat étayé par des preuves','Processus de durcissement et validation'],
   sample:'',
   inputItems:['Périmètre convenu des firewalls et de leur administration','Exports de configuration, règles, objets et NAT','Preuves pertinentes de trafic, VPN et profils de sécurité','Responsables des changements, fenêtres de maintenance et retour arrière'],
   result:'Une évaluation firewall fondée sur des preuves, avec constats priorisés, actions de durcissement approuvées et critères de validation reproductibles.',
   caption:'Pages réelles du package Firewall V3.1. Northstar est fictif. Certains documents conservent la mention de l’édition v3.0.' }
};
