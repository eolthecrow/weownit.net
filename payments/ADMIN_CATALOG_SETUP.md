# Administrare produse — sandbox

Catalogul se administrează în browser, la `/admin` pe Worker-ul separat.
Nu mai modifici codul, Price ID-ul sau moneda în Wrangler pentru fiecare produs.
Versiunea este pregătită în PR #22; trebuie instalată prin pașii de mai jos.

## Instalare inițială în WSL

Din directorul existent `weownit-payments-sandbox/payments`:

```bash
git status --short
git fetch origin feature/r2-preventive-limits-20261021
git merge --ff-only origin/feature/r2-preventive-limits-20261021
npm ci
npm run deploy:catalog
```

Dacă există modificări locale și Git refuză actualizarea, nu le suprascrie.
Fișierul local ignorat `wrangler.jsonc` cu UUID-ul D1 este păstrat.

`deploy:catalog` validează că ținta este exclusiv `weownit-payments`, rulează
testele unitare și de integrare, verifică construirea, aplică cele trei scheme
D1 additive și publică Worker-ul. Nu face merge sau modificări la site-ul public.
Are nevoie de autentificarea Wrangler deja configurată; dacă aceasta a expirat,
rulează `npx wrangler login` înainte. Scriptul se oprește la primul pas eșuat.

Schema păstrează produsul existent de test, la prețul de 10 RON:
`price_1UPpuVGt8pl3xCihZrxwZEnZ` →
`products/network-security-assessment-test.zip`. Nu resetează contoarele R2,
plățile sau editările anterioare. Rularea repetată nu reactivează intrările șterse.

În `vars` mai este necesar doar:

```json
"vars": {
  "STRIPE_WEBHOOK_ENABLED": "true"
},
```

Vechile `STRIPE_TEST_PRICE_ID` și `STRIPE_TEST_CURRENCY` pot fi eliminate;
noua versiune le ignoră și citește catalogul din D1. Binding-urile rămân identice.

## Acces și configurare o singură dată

Cheia API Stripe sandbox trebuie să fie deja salvată ca secret
`STRIPE_SECRET_KEY`. Dacă nu este, folosește promptul ascuns:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

Sunt acceptate chei `sk_test_...` sau `rk_test_...`. Pentru o cheie restricționată,
sunt necesare citirea Checkout Sessions/line items și citirea Prices/Products
pentru lista de prețuri. Nu acorda permisiuni de scriere: această interfață nu
creează sau șterge obiecte în Stripe.

Deschide, după deployment:

https://weownit-payments.vlad-network-security.workers.dev/admin

Folosește tokenul salvat anterior în `ADMIN_PROBE_TOKEN`. Acum acesta permite
și modificarea catalogului; nu este un token pentru clienți. Pagina de conectare
este publică, însă toate datele și operațiunile catalogului necesită token.
Tokenul este ținut numai în memoria paginii: fără cookies, localStorage sau URL.

Dacă nu ai păstrat tokenul, îl poți înlocui o singură dată din WSL:

```bash
ADMIN_PROBE_TOKEN="$(openssl rand -hex 32)"
printf '%s' "$ADMIN_PROBE_TOKEN" | npx wrangler secret put ADMIN_PROBE_TOKEN
printf '%s' "$ADMIN_PROBE_TOKEN" | clip.exe
unset ADMIN_PROBE_TOKEN
```

`clip.exe` copiază tokenul în clipboard-ul Windows; lipește-l în câmpul de
autentificare și păstrează-l în managerul tău de parole. Noul token înlocuiește
tokenul vechi și pentru probe-ul administrativ. Nu-l publica în chat sau Git.
Reîncărcarea paginii necesită din nou conectarea; Deconectare elimină datele
și tokenul din pagina curentă, dar nu revocă secretul din Cloudflare.

## Adăugarea fiecărui produs

1. În **Stripe sandbox**, creează produsul și un preț fix, pentru o plată unică.
   Dacă vrei să testezi cumpărarea, creează și Payment Link-ul în sandbox.
2. În **Cloudflare R2**, încarcă ZIP-ul în bucket-ul privat `weownit-toolkits`,
   sub `products/`. Folosește nume cu litere, cifre, cratimă, underscore sau punct,
   de exemplu `products/firewall-hardening-v1.zip`.
3. În `/admin`, apasă **Actualizează prețurile** și **Actualizează arhivele**.
4. Alege produsul/prețul și ZIP-ul din liste. Numele, suma și moneda sunt preluate
   automat. Poți ajusta numele afișat.
5. Apasă **Adaugă produs**. Intrarea este salvată imediat în D1 și webhook-ul o
   folosește fără redeploy sau modificarea destinației Stripe.

Prețurile live, recurente, variabile și gratuite nu apar în listă. Listele au
paginare, cu butoane pentru încărcarea următoarelor rezultate. Un preț deja activ
este dezactivat în formular pentru a evita dublurile. Dacă produsul a fost retras,
prețul este selectabil și marcat **poate fi readăugat**: alege numele și ZIP-ul,
apoi **Adaugă produs**. Produsul revine în catalog păstrând aceeași identitate și
istoricul; nu trebuie să deschizi lista produselor șterse.

## Editare, ștergere și restaurare

- **Editează** schimbă numele sau arhiva asociată. Prețul rămâne fixat pentru
  păstrarea istoricului; pentru un preț nou, adaugă o asociere nouă.
- **Șterge din catalog** retrage reversibil asocierea. Nu șterge ZIP-ul, produsul
  Stripe, Payment Link-urile sau plățile deja înregistrate.
- Poți readăuga un produs retras direct din formularul din stânga, prin
  **Adaugă produs**. Alternativ, bifează **Arată și produsele șterse**, apoi
  **Restaurează** pentru reactivare cu numele și ZIP-ul păstrate.
- Ștergerea nu dezactivează Payment Link-ul în Stripe. Dacă nu mai dorești
  checkout-uri de test pentru acel preț, dezactivează separat linkul în Stripe.
  Webhook-ul nu va înregistra achiziții noi pentru o asociere retrasă.
- Numele și fișierul unei plăți deja înregistrate rămân cele de la procesare;
  editările ulterioare ale catalogului nu rescriu acea înregistrare.
- Două editări simultane nu se suprascriu: pagina cere actualizarea listei.

## Ce rămâne separat

Catalogul nu creează automat produse/prețuri în Stripe, nu încarcă sau șterge
fișiere în R2 și nu publică produse în Store. Aceste operațiuni rămân în
dashboard-urile lor; pagina elimină copierea identificatorilor și editarea codului.

Worker-ul și interfața acceptă exclusiv sandbox. Rămâne un produs, o unitate și
un preț fix per Checkout Session; catalogul poate avea mai multe produse/monede.
Descărcările, emailurile, drepturile de acces și reconcilierea refund/dispute nu
sunt încă implementate. Continuă configurarea/testul webhook-ului din
[STRIPE_SANDBOX_SETUP.md](STRIPE_SANDBOX_SETUP.md).

Operațiunile administrative de listare R2 consumă rezervări Class A; verificările
HEAD la adăugare/editare/restaurare consumă rezervări Class B. Sunt refuzate
înainte de R2 dacă D1 sau cota nu permit operația. Nu sunt plafoane pentru
întregul cont și nu impun limita de stocare pentru încărcări făcute în dashboard.

Nu face merge sau activare live. Punctul de revenire înaintea catalogului este
`aa5feb53ee5d0351036632faa160565d20ac6feb`; tabelele adăugate pot rămâne la revert.
