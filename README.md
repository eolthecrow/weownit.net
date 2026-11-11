# weownit.net
Practical cybersecurity resources shaped by real-world network operations — assessments, incident response, hardening, troubleshooting, and automation made usable.
https://weownit.net/


## Script Content Security Policy

Every page carries a `<meta http-equiv="Content-Security-Policy" data-csp="scripts">` tag that allows inline scripts only by their SHA-256 hash. After editing any inline `<script>` or adding a page, run:

```
python tools/csp_meta.py
```

The briefing build applies it automatically. CI fails on stale hashes (`tests/test_csp_meta.py`) and on any CSP violation in Chromium (`tests/browser/csp.smoke.cjs`). New external script hosts must be added to `SCRIPT_HOSTS` in `tools/csp_meta.py` and to the Cloudflare header CSP.
