# Recuperarea accesului — exclusiv sandbox

Funcția folosește Stripe Checkout test, Worker-ul `weownit-payments`, D1 și Resend. Nu activează plăți live. Înainte de activare, expeditorul `updates@weownit.net` trebuie să fie verificat în contul Resend; cheia trebuie să aibă permisiunea de trimitere. Nu introduce cheia în Git sau în chat.

## Configurare

1. În `payments/wrangler.jsonc`, în obiectul `vars` existent, păstrează setările actuale și adaugă:

```json
"SANDBOX_RECOVERY_ENABLED": "true",
"SANDBOX_RECOVERY_ORIGIN": "https://weownit-payments.vlad-network-security.workers.dev"
```

Originea trebuie să corespundă exact domeniului folosit de cumpărător, fără cale. Funcția este oprită dacă lipsește oricare dintre aceste setări sau secretul următor.

2. Din `payments`, setează separat secretul Worker-ului:

```sh
npx wrangler secret put RESEND_RECOVERY_API_KEY --config ./wrangler.jsonc
```

Introdu cheia la prompt. Secretul este separat de configurația newsletterului; accesul acelui Worker nu îl partajează automat.

3. Nu rula deploymentul până la verificarea identității resurselor, restaurării și aprobarea explicită. `npm run deploy:catalog` face doar verificări locale; consultă [planul și manifestul de rollback](PR45_SANDBOX_E2E_PLAN.md). Păstrează D1 și R2 private și nu șterge tabelele sau datele de plată. Dezactivarea recuperării necesită o schimbare de configurație și deployment autorizate; poate afecta clienții sandbox existenți.

## Test manual cu o adresă de email pe care o controlezi

1. În `/admin`, cumpără un produs de test. La Stripe introdu adresa de email pe care o poți verifica și cardul de test; așteaptă confirmarea plății.
2. În pagina de confirmare copiază și păstrează **referința achiziției** (`cs_test_...`). Poți descărca o dată pentru a verifica păstrarea contorului.
3. Într-o fereastră privată sau pe alt dispozitiv, deschide `/recover`. Introdu referința și aceeași adresă. Răspunsul este identic și pentru date greșite; verifică Inbox și Spam.
4. Deschide linkul din email și apasă confirmarea. Deschiderea linkului în sine nu consumă tokenul. În browserul nou, reînnoiește accesul și descarcă ZIP-ul. Verifică numărul de încercări rămase; vechiul browser nu mai are acces la această achiziție.
5. Testează repetarea linkului, un email greșit și un link după 15 minute. Folosește o altă achiziție de test pentru rambursare și confirmă că accesul este refuzat.

## Limite și suport

- Accesul rămâne limitat la 24 de ore de la inițierea checkoutului și maximum trei porniri ale descărcării, inclusiv pornirile anterioare recuperării. O descărcare întreruptă poate consuma o încercare.
- Recuperarea necesită referința de pe pagina de confirmare și controlul asupra adresei folosite la plată. Dacă referința nu a fost salvată sau emailul nu poate fi primit, este necesar suport manual. Nu se trimite automat o confirmare care conține referința. Această limitare trebuie rezolvată înainte de lansarea comercială.
- În caz de rambursare, dispută, plată neeligibilă, eroare Stripe sau expirare, accesul este refuzat. Rezultatul generic al formularului nu confirmă că o achiziție există sau că emailul a fost livrat.
- Cererile sunt limitate global și per referință. Tokenurile sunt stocate ca hash, expiră după 15 minute și sunt consumate atomic prin POST; cererile vechi sunt curățate la următoarea solicitare. Nu stocăm adresele în D1; Stripe și Resend le procesează.
- Testele automate folosesc Stripe/Resend simulate. Un test real pe contul sandbox și verificarea UI pe mobil rămân necesare.
