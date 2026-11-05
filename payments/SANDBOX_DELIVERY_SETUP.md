# Descărcare securizată după plata sandbox

Această versiune este pregătită în PR #22. Instalarea pe Cloudflare și testul
manual cu contul real de sandbox rămân de efectuat. Nu face merge sau activare live.

## Ce primești

Din `/admin`, **Testează cumpărarea** deschide o pagină simplă pe Worker. Alegi
1–3 unități, apoi Worker-ul creează Stripe Checkout. Stripe revine automat la
pagina de confirmare. După înregistrarea webhook-ului semnat, apare butonul
**Descarcă produsul**. Pagina și acțiunile sunt disponibile în RO/EN/FR.

Cookie-ul `__Host-wit_buyer` este aleatoriu, Secure, HttpOnly, SameSite=Lax și
valabil 24 de ore. D1 păstrează numai hash-ul său. ID-ul Checkout din URL este
un identificator de confirmare, nu o autorizație: fără cookie-ul browserului
cumpărător nu se poate obține acces.

Accesul la fișier folosește un token aleatoriu, cu hash în D1 și expirare la
10 minute. Tokenul este trimis prin POST, nu în URL. Se permite reînnoirea în
același browser până la 24 de ore de la inițiere, fără resetarea limitei de
3 încercări de descărcare per achiziție. Cantitatea cumpărată nu mărește această
limită și nu emite automat licențe pentru persoane diferite.

Worker-ul reverifică PaymentIntent și Charge în Stripe înainte să emită acces
și înainte să pornească descărcarea. Refuză rambursările inclusiv parțiale,
disputele, obiectele live, plățile neîncasate sau datele care nu corespund
achiziției. O eroare Stripe/D1 refuză accesul. Nu se garantează oprirea unui
stream deja pornit dacă plata se modifică ulterior.

## Instalare în WSL

Din directorul existent:

```bash
cd /mnt/c/Users/Orange/OneDrive/Documents/Site/weownit-payments-sandbox/payments
git fetch origin
git merge --ff-only origin/feature/r2-preventive-limits-20261021
npm ci
```

În obiectul `vars` existent din `wrangler.jsonc`, păstrează celelalte setări și
adaugă activarea explicită pentru sandbox:

```json
"vars": {
  "STRIPE_WEBHOOK_ENABLED": "true",
  "SANDBOX_FULFILLMENT_ENABLED": "true"
},
```

Nu suprascrie binding-urile sau UUID-ul D1. Nu introduce chei în acest fișier.
Bucket-ul trebuie să rămână privat: accesul public prin `r2.dev` sau un domeniu
public ar permite ocolirea autorizării din Worker.
Secretul `STRIPE_SECRET_KEY` trebuie să fie din același sandbox, iar
`STRIPE_WEBHOOK_SECRET` să corespundă destinației deja configurate. Nu sunt
necesare chei suplimentare pentru cookie-uri sau tokenuri de descărcare.

O cheie restricționată are nevoie acum și de crearea Checkout Sessions, plus
citirea PaymentIntents/Charges. Citirea Checkout Sessions/line items și
Prices/Products rămâne necesară. Cheia de test standard configurată anterior
permite aceste operațiuni, dacă este încă validă.

```bash
npm run deploy:catalog
```

Scriptul verifică ținta `weownit-payments`, rulează testele backend și build-ul,
aplică schemele existente, migrarea condiționată `quantity` și noua schemă
`sandbox-delivery-schema.sql`, apoi publică Worker-ul. Migrarea este aditivă și
repetabilă: nu resetează achizițiile, catalogul, tokenurile sau contoarele R2.

În `/health` trebuie să apară:

```json
{
  "checkout": "sandbox-browser-bound",
  "sandbox_fulfillment": "browser-bound-configured",
  "stripe_webhook": "sandbox-configured",
  "public_downloads": "disabled"
}
```

Aceasta confirmă prezența configurației, nu o plată/descărcare reușită.
`public_downloads: disabled` se referă la acces fără autorizație.

## Pagina de pornire

După instalare, deschide `/admin` și **Testează cumpărarea**. Produsul inițial
are și URL direct:

https://weownit-payments.vlad-network-security.workers.dev/buy/network-security-assessment-test?lang=ro

Înlocuiește `lang=ro` cu `lang=en` sau `lang=fr`, sau schimbă limba din pagină.
Noile produse folosesc propriul ID din catalog, afișat în linkul administrativ.

Checkout-ul nou este creat de Worker și legat de browser înainte de plată.
**Payment Link-urile vechi rămân pentru verificarea registrului, fără acces la
descărcare**, deoarece nu au dovada inițierii în browser. Nu seta pe ele un simplu
redirect către `/complete`: ID-ul sesiunii nu este suficient. Nu modifica Store-ul
public sau checkout-ul actual pentru această etapă.

## Verificări manuale ulterioare

Utilizatorul a cerut continuarea implementării, cu aceste verificări ulterior.
Testele locale folosesc Stripe simulat, D1/R2 reale locale și un browser real.

1. Din pagina Worker-ului, alege 1, 2 sau 3 unități și continuă în Stripe sandbox.
2. Folosește cardul de test `4242 4242 4242 4242`, expirare viitoare și CVC de
   trei cifre. Revino în același browser; nu șterge cookie-urile.
3. Confirmarea așteaptă webhook-ul: verifică automat cel mult șase ori, apoi
   poți apăsa **Verifică / reînnoiește accesul**. O simplă vizită nu creează plăți
   sau drepturi de descărcare.
4. Descarcă ZIP-ul și verifică fișierul primit. Arhiva de test existentă are
   799 bytes; pentru produse reale pregătește și verifică arhivele finale separat.
5. Pentru a inspecta noul flux în D1:

```bash
npx wrangler d1 execute weownit_r2_budget --remote --config ./wrangler.jsonc \
  --command "SELECT quantity, amount_total, currency, fulfillment_status, download_attempts FROM sandbox_delivery_status ORDER BY observed_at DESC LIMIT 10;"
```

`ready` arată un acces emis. `download-started` arată pornirea stream-ului,
nu dovada că browserul l-a primit integral. `download-limit`, `renew-required`,
`expired` și `revoked` explică limitele. `legacy-no-browser` identifică plățile
vechi făcute prin Payment Link-uri fără legare de browser.

Coloana istorică `stripe_test_purchases.delivery_status` rămâne `disabled`:
registrul vechi nu este o autorizație. Pentru noul flux folosește view-ul de mai
sus, `sandbox_checkout_attempts` și `sandbox_download_grants`.

## Limite și comportamente de recuperare

- Catalogul poate fi editat ulterior fără schimbarea cheii ZIP alese de un
  checkout deja inițiat. Arhivarea oprește inițierea de checkout-uri noi din
  pagina Worker. Cele acceptate anterior pot fi finalizate și livrate din
  snapshot. Payment Link-urile vechi pentru produse retrase rămân în afara
  acestui flux și nu primesc drepturi noi de descărcare.
- Fișierul este citit prin binding-ul R2 privat și transmis ca stream, fără
  copierea întregului ZIP în memoria Worker-ului. Clientul nu alege cheia R2.
- Fiecare R2 GET rezervă Class B înaintea accesului. D1/cota refuză operația
  înainte de R2. Cererile concurente pierdute pot păstra o rezervare conservatoare.
- O încercare este consumată înainte de R2 GET și rămâne consumată dacă fișierul
  lipsește, R2 eșuează sau utilizatorul întrerupe transferul. Reînnoirea accesului
  invalidează tokenul precedent și păstrează numărul încercărilor rămase.
- Limitele de creare Checkout sunt 20/minut și 100/24h pentru acest Worker, plus
  5/oră per cookie. Confirmarea permite 30 de verificări per checkout, la minimum
  3 secunde distanță. Acestea sunt limite de sandbox, nu protecție pentru vânzări live.
- Nu există recuperare prin email, cont de client, acces pe alt dispozitiv,
  reluare Range, licențe multi-user sau reconciliere completă refund/dispute.
  Starea curentă a Stripe este verificată la cererile de acces, fără a rambursa
  automat sau a modifica plata. Datele de card/email nu sunt stocate în D1.
- Publicarea Store-ului, înlocuirea checkout-ului public și plățile live rămân
  etape distincte. Această versiune acceptă doar chei/obiecte Stripe de test.

## Dezactivare și revenire

Setează `SANDBOX_FULFILLMENT_ENABLED` la `false` și publică pentru a opri toate
noile pagini/rute de cumpărare și descărcare. Webhook-ul și catalogul pot continua.
Sesiunile Stripe deja create rămân plătibile până la expirarea lor (o oră);
dezactivarea acestui flag nu le anulează automat în Stripe.
Tabelele/view-ul pot rămâne. Revenirea sursei este commit-ul
`4d6b197d5ffdaef825d485c0eea2e32fea45d52d` (înaintea livrării).

## Referințe

- https://docs.stripe.com/api/checkout/sessions/create
- https://docs.stripe.com/payment-links/post-payment
- https://docs.stripe.com/api/payment_intents/object
- https://docs.stripe.com/api/charges/object
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
