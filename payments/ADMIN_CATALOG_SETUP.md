# Administrare produse — sandbox

Catalogul se administrează în browser, la `/admin` pe Worker-ul separat.
Nu mai modifici codul, Price ID-ul sau moneda în Wrangler pentru fiecare produs.
Versiunea de bază este în PR #22; încărcarea ZIP este în Draft PR #44. Funcțiile suplimentare Stripe Product/Price, Draft/Published, preview și revocări sunt în branch-ul de dezvoltare `feature/admin-full-catalog-20261106`. **Nu sunt instalate pe Cloudflare.**

**Stop înainte de producție:** Nu rula `deploy:catalog`, nu face merge în `main`, nu activa Stripe Live și nu modifica Store-ul public până după validarea CI, verificări sandbox și o aprobare de lansare separată. Comenzile de mai jos sunt documentate pentru acel moment, nu pentru executare acum.

## Instalare inițială în WSL

Din directorul existent `weownit-payments-sandbox/payments`:

```bash
git status --short
git fetch origin feature/admin-full-catalog-20261106
git merge --ff-only origin/feature/admin-full-catalog-20261106
npm ci
npm run deploy:catalog
```

Dacă există modificări locale și Git refuză actualizarea, nu le suprascrie.
Fișierul local ignorat `wrangler.jsonc` cu UUID-ul D1 este păstrat.

`deploy:catalog` validează că ținta este exclusiv `weownit-payments`, rulează
testele unitare și de integrare, verifică construirea, aplică schemele D1 additive, adaugă coloana `quantity` dacă lipsește din registrul de plăți, creează tabelul aditiv `sandbox_admin_upload_budget` și
publică Worker-ul. Verificarea coloanei permite repetarea instalării fără a
reseta plățile. Nu face merge sau modificări la site-ul public.
Are nevoie de autentificarea Wrangler deja configurată; dacă aceasta a expirat,
rulează `npx wrangler login` înainte. Scriptul se oprește la primul pas eșuat.

Schema păstrează produsul existent de test, la prețul de 10 RON:
`price_1UPpuVGt8pl3xCihZrxwZEnZ` →
`products/network-security-assessment-test.zip`. Nu resetează contoarele R2,
plățile sau editările anterioare. Rularea repetată nu reactivează intrările șterse.

În `vars` mai este necesar doar:

```json
"vars": {
  "STRIPE_WEBHOOK_ENABLED": "true",
  "SANDBOX_ADMIN_UPLOAD_ENABLED": "true",
  "SANDBOX_ADMIN_PRICE_CREATE_ENABLED": "true",
  "SANDBOX_PUBLIC_CATALOG_ENABLED": "false"
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

Sunt acceptate numai chei `sk_test_...` sau `rk_test_...`. Pentru o cheie restricționată,
sunt necesare citirea Checkout Sessions/line items și citirea Prices/Products;
**dacă activezi `SANDBOX_ADMIN_PRICE_CREATE_ENABLED`**, cheia sandbox trebuie să
permită și crearea de Products și Prices. Nu acorda acces de scriere în Stripe Live.

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

1. Din `/admin`, deschide **Creează produs și preț Stripe**, introdu numele și prețul RON, apoi confirmă. Opțiunea există doar dacă `SANDBOX_ADMIN_PRICE_CREATE_ENABLED` este `true`. Alternativ, creează Price-ul în Stripe sandbox și actualizează lista.
2. În `/admin`, la **Încarcă un ZIP nou**, selectează arhiva și apasă **Încarcă ZIP în R2**. Limita este de **20 MB**. Fișierul este scris într-un nume nou, unic, în bucket-ul privat `weownit-toolkits/products/`. Nu șterge și nu suprascrie arhive existente.
3. Apasă **Actualizează prețurile**, dacă prețul creat în Stripe nu este încă vizibil. ZIP-ul tocmai încărcat este selectat automat. Pentru arhive mai mari de 20 MB, încarcă-le în Cloudflare Dashboard, apoi apasă **Actualizează arhivele**.
4. Alege prețul și arhiva din liste. Numele, suma și moneda sunt preluate automat din Stripe sandbox; poți ajusta numele afișat.
5. Apasă **Adaugă produs**. Asocierea este salvată în D1 în starea **Draft**, fără redeploy. Produsele rămân doar în Worker-ul sandbox, nu în Store-ul public.

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
  Webhook-ul nu va înregistra achiziții noi din Payment Link pentru o asociere
  retrasă. Checkout-urile legate de browser și acceptate anterior retragerii pot
  fi finalizate și livrate din snapshot-ul lor.
- Numele și fișierul unei plăți deja înregistrate rămân cele de la procesare;
  editările ulterioare ale catalogului nu rescriu acea înregistrare.
- Două editări simultane nu se suprascriu: pagina cere actualizarea listei.

## Preview, publicare sandbox și livrări

- **Previzualizează** afișează numele, prețul, mărimea ZIP-ului și linkuri de checkout test pentru RO/EN/FR dacă livrarea sandbox este activă. Nu expune conținutul ZIP.
- **Publish · staging** marchează produsul ca pregătit pentru catalogul sandbox. Se verifică din nou Price-ul Stripe și existența ZIP-ului. **Unpublish** îl readuce în Draft. Orice modificare, arhivare ori restaurare reface Draft-ul automat.
- `GET /sandbox/catalog` este o interfață de citire cu date publice minime (ID, titlu, monedă, sumă). **Returnează 404 implicit**: trebuie activat explicit `SANDBOX_PUBLIC_CATALOG_ENABLED=true` în Worker-ul sandbox. Când e activ, doar produsele Published pot iniția checkout-uri sandbox noi; Store-ul real nu folosește încă această rută.
- Panoul **Livrări de test și descărcări** afișează până la 50 de plăți sandbox recente. **Revocă descărcarea** blochează ireversibil sesiunea de test, inclusiv când tichetul nu a fost generat încă; nu emite refund în Stripe. Registrul și datele din R2 se păstrează.
- Migrarea aditivă `sandbox-admin-management-schema.sql` păstrează catalogul, plățile și contoarele existente. În caz de rollback, dezactivează mai întâi `SANDBOX_PUBLIC_CATALOG_ENABLED`, apoi revino la versiunea Worker anterioară; nu șterge tabelele sau fișierele R2.

## Ce rămâne separat

Catalogul poate crea Products/Prices Stripe doar în sandbox, dar **nu le publică în Store-ul de pe weownit.net**. Poate încărca ZIP-uri private de cel mult 20 MB, fără a șterge fișierele existente. Stripe Live și Store-ul public rămân neatinse.

Worker-ul și interfața acceptă exclusiv sandbox. Rămâne un produs și un preț fix
per Checkout Session, cu 1–3 unități; catalogul poate avea mai multe produse/monede.
Cantitatea se alege în Stripe Checkout, activând **Let customers adjust quantity**
în Payment Link-ul sandbox, cu minimum 1 și maximum 3. Catalogul nu este stoc și
nu necesită intrări duplicate pentru două sau trei unități din același produs.
Livrarea sandbox este acum pregătită separat, cu activare explicită: vezi
[SANDBOX_DELIVERY_SETUP.md](SANDBOX_DELIVERY_SETUP.md). După activare, fiecare
produs activ afișează **Testează cumpărarea**, care deschide fluxul de test într-o
filă nouă, păstrând administrarea deschisă. Fără activare, linkul nu apare.
Emailurile, accesul pe alte dispozitive și reconcilierea completă refund/dispute
rămân neimplementate. Continuă configurarea/testul webhook-ului din
[STRIPE_SANDBOX_SETUP.md](STRIPE_SANDBOX_SETUP.md).

Operațiunile administrative de listare R2 consumă rezervări Class A; verificările
HEAD la adăugare/editare/restaurare consumă rezervări Class B. Sunt refuzate
înainte de R2 dacă D1 sau cota nu permit operația. Nu sunt plafoane pentru
întregul cont și nu impun limita de stocare pentru încărcări făcute în dashboard.

Nu face merge sau activare live. Punctul de revenire înaintea catalogului este
`aa5feb53ee5d0351036632faa160565d20ac6feb`; tabelele adăugate pot rămâne la revert.


## Încărcare sigură: limite și revenire

- Funcția rămâne **dezactivată implicit**. Doar `SANDBOX_ADMIN_UPLOAD_ENABLED: "true"` o activează în Worker-ul izolat de sandbox; nu folosește chei Stripe Live.
- Același token administrativ este obligatoriu pentru fiecare upload; sunt refuzate cererile cross-origin. Tokenul nu este stocat în browser.
- Sunt acceptate doar arhive cu extensia .zip, marcaj ZIP și structură finală de arhivă detectabilă. Este o verificare minimală, **nu scanare antivirus**; verifică separat conținutul înainte de distribuție.
- Limita unui upload este de 20 MB, iar noile uploaduri efectuate prin această rută au împreună un buget preventiv de 1 GB, contabilizat în D1. Obiectele preexistente și uploadurile Cloudflare Dashboard/S3 nu intră în acest total; **nu este o limită de facturare pentru cont**.
- O încărcare întreruptă sau eșuată poate păstra rezervarea preventivă; nu șterge automat nimic. Rutele de descărcare publică rămân dezactivate.
- Pentru a opri uploadurile, setează flagul la `false` și redeploy `weownit-payments`; schema aditivă și obiectele deja încărcate pot rămâne în R2.
- CI trebuie să confirme testele, iar o încărcare reală de ZIP în Cloudflare rămâne necesară înainte de activare comercială.
