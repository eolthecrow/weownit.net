const test=require('node:test'),assert=require('node:assert/strict');
const facts=require('../assets/site-assistant-facts.js');
for(const [language,question,expected] of [
 ['en','What consulting services does weownit.net offer?',['firewall','assessment','architecture','troubleshooting','automation']],
 ['ro','Ce servicii de consultanță oferi pe weownit.net?',['firewall','evaluarea','arhitectură','troubleshooting','automatizare']],
 ['fr','Quels services de conseil propose weownit.net ? Réponds en une phrase.',['pare-feu','évaluation','architecture','dépannage','automatisation']]
])test('published service scope is used for '+language,()=>{const a=facts.answer(question,language);for(const term of expected)assert(a.includes(term));assert(!/forensic|forensique|gestion des risques/i.test(a));});
test('questions about unadvertised services return the published scope',()=>{for(const q of ['Does weownit.net provide digital forensics?','Does weownit.net offer vCISO and 24/7 response?','Can you do penetration testing?']){const a=facts.answer(q,'en');assert(a.includes('published offer'));assert(a.includes('does not advertise'));}});
test('commercial prices are not invented',()=>{for(const q of ['What prices do you charge?','How much does your firewall review cost?']){const a=facts.answer(q,'en');assert(a.includes('quotation'));assert(!/\d|€|\$/.test(a));}});
test('catalogue availability does not promise active checkout',()=>{for(const language of ['en','ro','fr'])assert(facts.answer('Can I buy your products?',language));for(const q of ['Can I buy your products?','What do you sell?'])assert(facts.answer(q,'en').includes('checkout is not currently active'));});
test('basic site introduction stays within published consulting',()=>{assert(facts.answer('What does weownit.net do?','en').includes('firewall review'));});
test('technical questions still reach the technical assistant',()=>{for(const q of ['How do you configure a Fortinet service object?','What is a service object in Palo Alto?','How do you calculate OSPF cost?','Explain incident response and forensic evidence','What services does Cisco offer?'])assert.equal(facts.answer(q,'en'),null,q);});
test('missing question is ignored and unsupported language falls back to English',()=>{assert.equal(facts.answer(null,'en'),null);assert(facts.answer('What services do you offer?','de').startsWith('weownit.net'));});
