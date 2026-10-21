# weownit.net — Worker separat de plăți (SANDBOX, NEPUBLICAT)

Acest director conține un Worker nou numit `weownit-payments`. Nu modifică site-ul public, `network-security-assistant`, Stripe Checkout sau Lemon Squeezy.

## Ce este implementat acum

- `GET /health`: confirmă că Worker-ul răspunde; nu citește R2.
- `POST /admin/probe`: necesită token secret și verifică prin R2 HEAD existența `products/network-security-assessment-test.zip`. Returnează doar metadate, niciodată conținutul ZIP.
- Nu există rute de descărcare publică, Stripe webhooks sau plăți live.
- Operațiunile R2 efectuate de acest Worker sunt refuzate dacă D1 nu poate confirma rezerva.

## Praguri preventive agreate

| Resursă | Prag |
|---|---:|
| Stocare instantanee pentru încărcările viitoare ale aplicației | 8.000.000.000 bytes |
| R2 Class A (numai operațiuni prin Worker) | 700.000/lună UTC |
| R2 Class B (numai operațiuni prin Worker) | 7.000.000/lună UTC |

**Atenție:** limitele nu măsoară utilizarea întregului cont Cloudflare și nu garantează o factură de 0 USD. Cloudflare facturează stocarea în GB-month, nu în GB instantanee. D1 Free are un plafon zilnic separat, iar monitorizarea reală R2/alertele de buget trebuie configurate ulterior. Deocamdată numai probe-ul administrativ folosește contorul Class B; verificarea de stocare și Class A sunt helper-e, nu un control global activ.

## Ce există deja în Cloudflare (confirmat de utilizator)

- Bucket privat Standard: `weownit-toolkits`.
- Fișier test: `products/network-security-assessment-test.zip`.
- D1: `weownit_r2_budget` cu tabelul `r2_budget_monthly` creat.

## Publicare separată prin Wrangler (un singur deploy după configurare)

Clonează branch-ul separat și intră în directorul noului Worker:

```bash
git clone --branch feature/r2-preventive-limits-20261021 --single-branch https://github.com/eolthecrow/weownit.net.git weownit-payments-test
cd weownit-payments-test/payments
npm install
npm test
cp wrangler.jsonc.example wrangler.jsonc
```

În Cloudflare > D1 > `weownit_r2_budget` găsești UUID-ul complet al bazei. În fișierul local `wrangler.jsonc`, înlocuiește `REPLACE_WITH_REAL_D1_UUID` cu acel UUID. Păstrează numele binding-urilor `TOOLKITS_R2` și `R2_BUDGET_DB`. Dacă R2 a fost creat explicit cu jurisdicție UE, adaugă `"jurisdiction": "eu"` în obiectul din `r2_buckets`. Pentru bucket obișnuit nu adăuga jurisdicția.

Execută:

```bash
npx wrangler login
npx wrangler deploy
```

Primul deploy creează Worker-ul separat `weownit-payments` în Cloudflare. Nu schimbă domeniul public sau alte Workers.

Înainte de verificarea administrativă, generează local un token și înregistrează-l în Cloudflare. Nu publica și nu trimite tokenul în conversație:

```bash
ADMIN_PROBE_TOKEN="$(openssl rand -hex 32)"
printf %s "$ADMIN_PROBE_TOKEN" | npx wrangler secret put ADMIN_PROBE_TOKEN
```

Verifică înlocuind subdomeniul cu adresa reală afișată de Wrangler:

```bash
curl -i https://weownit-payments.<subdomain>.workers.dev/health
curl -i -X POST -H "Authorization: Bearer $ADMIN_PROBE_TOKEN" https://weownit-payments.<subdomain>.workers.dev/admin/probe
unset ADMIN_PROBE_TOKEN
```

Probe-ul trebuie să confirme `object_found: true`, mărimea ZIP-ului și creșterea contorului `class_b`. Verifică în consola D1:

```sql
SELECT * FROM r2_budget_monthly ORDER BY month DESC;
```

## Ce NU este implementat încă

1. Webhook Stripe cu validarea semnăturii și un registru al achizițiilor.
2. Autorizarea individuală a descărcărilor și emiterea de acces temporar.
3. Inventar atomic al stocării și reconciliere cu analytics R2 la nivel de cont.
4. Alerta Cloudflare de cost și modalitatea de livrare alternativă când limita e atinsă.
5. Validarea fiscală/legală pentru vânzări reale.

**Revert:** Totul este pe `feature/r2-preventive-limits-20261021`. Nu este integrat în `main`. Nu face merge și nu conecta Store-ul înaintea validării fluxului complet.
