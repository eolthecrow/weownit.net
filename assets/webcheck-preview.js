/* Cached public Web-Check observations. Opening this page starts no external scan. */
(() => {
  "use strict";
  const root = document.getElementById("webcheck-preview");
  if (!root) return;
  const translations = {
    en: {title:"weownit.net · public results",tag:"Recorded preview",loading:"Loading recorded results…",checked:"Captured",unavailable:"The recorded preview is unavailable. You can still open the full analysis.",note:"Recorded Web-Check observations, not a live scan or a security score.",stale:"This snapshot is over 48 hours old. Open Web-Check for current results.",future:"This snapshot’s timestamp could not be verified. Open Web-Check for current results.",labels:["DNS addresses","TLS certificate","Public edge","HTTP headers"],verified:"Verified at capture",unverified:"Not verified at capture",expired:"Recorded certificate expired",limited:"Cloudflare challenge",unknown:"Unavailable",evidence:"Evidence & sources",ipv4:"IPv4",ipv6:"IPv6",nameservers:"Nameservers",issuer:"Certificate issuer",expires:"Certificate expiry",edge:"Observed server",challenge:"Web-Check received a Cloudflare challenge. Its headers describe the challenge, so the website’s security headers were not assessed.",headers:"Recorded response headers",scope:"The public edge does not identify the origin server.",sources:"Web-Check sources",full:"Open full weownit.net analysis ↗",privacy:"The full analysis opens an external service in a new tab."},
    ro: {title:"weownit.net · rezultate publice",tag:"Previzualizare salvată",loading:"Se încarcă rezultatele salvate…",checked:"Verificat la",unavailable:"Previzualizarea salvată nu este disponibilă. Poți deschide în continuare analiza completă.",note:"Observații Web-Check salvate; nu reprezintă o scanare live sau un scor de securitate.",stale:"Acest instantaneu are peste 48 de ore. Deschide Web-Check pentru rezultate actualizate.",future:"Data acestui instantaneu nu a putut fi verificată. Deschide Web-Check pentru rezultate actualizate.",labels:["Adrese DNS","Certificat TLS","Infrastructură publică","Antete HTTP"],verified:"Validat la verificare",unverified:"Nevalidat la verificare",expired:"Certificatul salvat a expirat",limited:"Verificare Cloudflare",unknown:"Indisponibil",evidence:"Dovezi și surse",ipv4:"IPv4",ipv6:"IPv6",nameservers:"Servere DNS",issuer:"Emitent certificat",expires:"Expirare certificat",edge:"Server observat",challenge:"Web-Check a primit pagina de verificare Cloudflare. Antetele sale descriu acea pagină, astfel că antetele de securitate ale site-ului nu au fost evaluate.",headers:"Antete de răspuns salvate",scope:"Infrastructura publică nu identifică serverul de origine.",sources:"Surse Web-Check",full:"Deschide analiza completă weownit.net ↗",privacy:"Analiza completă deschide un serviciu extern într-o filă nouă."},
    fr: {title:"weownit.net · résultats publics",tag:"Aperçu enregistré",loading:"Chargement des résultats enregistrés…",checked:"Vérifié le",unavailable:"L’aperçu enregistré est indisponible. Vous pouvez ouvrir l’analyse complète.",note:"Observations Web-Check enregistrées ; ni analyse en direct ni score de sécurité.",stale:"Cet aperçu date de plus de 48 heures. Ouvrez Web-Check pour des résultats à jour.",future:"La date de cet aperçu n’a pas pu être vérifiée. Ouvrez Web-Check pour des résultats à jour.",labels:["Adresses DNS","Certificat TLS","Infrastructure publique","En-têtes HTTP"],verified:"Validé lors du contrôle",unverified:"Non validé lors du contrôle",expired:"Certificat enregistré expiré",limited:"Vérification Cloudflare",unknown:"Indisponible",evidence:"Preuves et sources",ipv4:"IPv4",ipv6:"IPv6",nameservers:"Serveurs DNS",issuer:"Émetteur du certificat",expires:"Expiration du certificat",edge:"Serveur observé",challenge:"Web-Check a reçu la page de vérification Cloudflare. Ses en-têtes décrivent cette page ; les en-têtes de sécurité du site n’ont donc pas été évalués.",headers:"En-têtes de réponse enregistrés",scope:"L’infrastructure publique n’identifie pas le serveur d’origine.",sources:"Sources Web-Check",full:"Ouvrir l’analyse complète weownit.net ↗",privacy:"L’analyse complète ouvre un service externe dans un nouvel onglet."}
  };
  let snapshot = null, failed = false;
  function text(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
  function formatDate(value, withTime = false) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    const locale = {en:"en-GB",ro:"ro-RO",fr:"fr-FR"}[document.documentElement.lang] || "en-GB";
    return new Intl.DateTimeFormat(locale, {year:"numeric",month:"short",day:"numeric",...(withTime ? {hour:"2-digit",minute:"2-digit",timeZoneName:"short"} : {}),timeZone:"UTC"}).format(date);
  }
  function render() {
    const d = translations[document.documentElement.lang] || translations.en;
    root.querySelectorAll("[data-wcp]").forEach(el => { if (d[el.dataset.wcp]) el.textContent = d[el.dataset.wcp]; });
    const loading = document.getElementById("wc-preview-loading");
    loading.hidden = Boolean(snapshot);
    loading.textContent = failed ? d.unavailable : d.loading;
    const results = document.getElementById("wc-preview-results");
    results.hidden = !snapshot;
    if (!snapshot) return;
    const captured = document.getElementById("wc-preview-time");
    captured.dateTime = snapshot.generatedAt;
    captured.textContent = formatDate(snapshot.generatedAt, true);
    const age = Date.now() - Date.parse(snapshot.generatedAt);
    const stale = document.getElementById("wc-preview-stale");
    stale.hidden = age <= 48 * 3600000 && age >= -300000;
    stale.textContent = age < -300000 ? d.future : d.stale;
    const {dns, tls, headers} = snapshot.checks;
    const dnsData = dns.state === "ok" ? dns.data : null;
    const tlsData = tls.state === "ok" ? tls.data : null;
    const headerData = ["ok", "challenge"].includes(headers.state) ? headers.data : null;
    const expiry = tlsData ? Date.parse(tlsData.validTo) : NaN;
    const expired = Number.isFinite(expiry) && expiry <= Date.now();
    const values = [dnsData ? `${dnsData.ipv4.length} IPv4 · ${dnsData.ipv6.length} IPv6` : d.unknown, tlsData ? (expired ? d.expired : tlsData.verifiedAtCapture ? d.verified : d.unverified) : d.unknown, headerData?.server || d.unknown, headers.state === "challenge" ? d.limited : headerData ? d.headers : d.unknown];
    root.querySelectorAll(".wc-preview-card").forEach((card, index) => {
      card.querySelector(".wc-preview-label").textContent = d.labels[index];
      card.querySelector(".wc-preview-value").textContent = values[index];
      card.dataset.state = index === 1 && tlsData?.verifiedAtCapture && !expired ? "verified" : index === 3 && headers.state === "challenge" || index === 1 && expired ? "limited" : "neutral";
    });
    text("wc-preview-ipv4", dnsData?.ipv4.join(" · ") || "—");
    text("wc-preview-ipv6", dnsData?.ipv6.join(" · ") || "—");
    text("wc-preview-ns", dnsData?.nameservers.join(" · ") || "—");
    text("wc-preview-issuer", tlsData?.issuer || "—");
    text("wc-preview-expiry", tlsData ? formatDate(tlsData.validTo) + " (UTC)" : "—");
    text("wc-preview-edge", headerData?.server || "—");
    document.getElementById("wc-preview-challenge").hidden = headers.state !== "challenge";
    const recordedHeaders = document.getElementById("wc-preview-headers");
    recordedHeaders.textContent = headers.state === "ok" && headerData.securityHeaders ? Object.entries(headerData.securityHeaders).map(([key, value]) => `${key}: ${value || "—"}`).join("\n") : "";
    recordedHeaders.hidden = !recordedHeaders.textContent;
    // These are fixed, allowlisted links in HTML; response data never becomes a URL or HTML.
  }
  function validSnapshot(value) {
    if (!value || value.schema !== "weownit.webcheck.preview.v1" || value.domain !== "weownit.net" || !Number.isFinite(Date.parse(value.generatedAt))) return false;
    const checks = value.checks;
    if (!checks || !["dns", "tls", "headers"].every(key => checks[key] && ["ok", "unavailable", "challenge"].includes(checks[key].state))) return false;
    const dns = checks.dns;
    if (dns.state !== "unavailable" && (dns.state !== "ok" || !dns.data || !["ipv4", "ipv6", "nameservers"].every(key => Array.isArray(dns.data[key]) && dns.data[key].length <= 32 && dns.data[key].every(item => typeof item === "string" && item.length <= 253)))) return false;
    const tls = checks.tls;
    if (tls.state !== "unavailable" && (tls.state !== "ok" || !tls.data || typeof tls.data.issuer !== "string" || typeof tls.data.verifiedAtCapture !== "boolean" || !Number.isFinite(Date.parse(tls.data.validTo)))) return false;
    const headers = checks.headers;
    if (headers.state !== "unavailable" && (!headers.data || typeof headers.data.server !== "string" || headers.data.server.length > 100)) return false;
    if (headers.state === "challenge" && headers.data.securityHeaders !== null) return false;
    if (headers.state === "ok" && (!headers.data.securityHeaders || typeof headers.data.securityHeaders !== "object" || Array.isArray(headers.data.securityHeaders) || Object.keys(headers.data.securityHeaders).length > 6 || !Object.values(headers.data.securityHeaders).every(value => value === null || typeof value === "string" && value.length <= 4000))) return false;
    return true;
  }
  document.addEventListener("site:languagechange", render);
  render();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  fetch("assets/webcheck-weownit-snapshot.json", {cache:"no-cache",credentials:"omit",signal:controller.signal})
    .then(response => { if (!response.ok) throw new Error("Preview unavailable"); return response.json(); })
    .then(value => { if (!validSnapshot(value)) throw new Error("Invalid preview"); snapshot = value; })
    .catch(() => { failed = true; })
    .finally(() => { clearTimeout(timer); render(); });
})();
