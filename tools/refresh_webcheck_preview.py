#!/usr/bin/env python3
"""Capture three public Web-Check observations for the fixed weownit.net preview.

No credentials, arbitrary targets, active scans or third-party code are executed.
Run from the repository root: python tools/refresh_webcheck_preview.py
"""
import concurrent.futures
import datetime as dt
import json
import pathlib
import urllib.parse
import urllib.request

DOMAIN = "weownit.net"
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "webcheck-weownit-snapshot.json"


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def bounded_text(value, limit=500):
    return value[:limit] if isinstance(value, str) else ""


def normalize(kind, raw):
    if not isinstance(raw, dict) or raw.get("error"):
        raise ValueError("Web-Check returned no usable observation")
    if kind == "dns":
        import ipaddress
        def addresses(key, version):
            values = raw.get(key, [])
            if not isinstance(values, list):
                raise ValueError("Unexpected DNS response")
            result = []
            for value in values[:32]:
                address = ipaddress.ip_address(value)
                if address.version == version:
                    result.append(str(address))
            return sorted(set(result))
        ipv4, ipv6 = addresses("A", 4), addresses("AAAA", 6)
        if not ipv4 and not ipv6:
            raise ValueError("No IP addresses returned")
        ns = raw.get("NS", [])
        return "ok", {"ipv4": ipv4, "ipv6": ipv6, "nameservers": [bounded_text(x, 253) for x in ns[:16]] if isinstance(ns, list) else []}
    if kind == "tls":
        subject = raw.get("subject", {})
        issuer = raw.get("issuer", {})
        if not isinstance(subject, dict) or not isinstance(issuer, dict):
            raise ValueError("Unexpected certificate response")
        names = [x.removeprefix("DNS:").strip() for x in bounded_text(raw.get("subjectaltname"), 4000).split(",")]
        # A wildcard alone does not cover the apex domain.
        if DOMAIN not in names and subject.get("CN") != DOMAIN:
            raise ValueError("Certificate does not name the preview domain")
        def iso_time(value):
            return dt.datetime.strptime(value, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=dt.timezone.utc).isoformat().replace("+00:00", "Z")
        return "ok", {"subject": bounded_text(subject.get("CN")), "issuer": bounded_text(issuer.get("O") or issuer.get("CN")), "validFrom": iso_time(raw.get("valid_from", "")), "validTo": iso_time(raw.get("valid_to", "")), "verifiedAtCapture": raw.get("isValid") is True and not raw.get("authError")}
    if kind == "headers":
        headers = {str(k).lower(): v for k, v in raw.items()}
        challenge = headers.get("cf-mitigated") == "challenge"
        selected = ["strict-transport-security", "content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"]
        # A Cloudflare challenge has its own headers. Never score them as site headers.
        return "challenge" if challenge else "ok", {"server": bounded_text(headers.get("server"), 100), "securityHeaders": None if challenge else {key: bounded_text(headers.get(key), 4000) or None for key in selected}}
    raise ValueError("Unknown preview check")


def capture(kind):
    endpoint = {"dns": "dns", "tls": "ssl", "headers": "headers"}[kind]
    url = "https://web-check.xyz/api/" + endpoint + "?" + urllib.parse.urlencode({"url": "https://" + DOMAIN})
    result = {"state": "unavailable", "checkedAt": utc_now(), "source": url, "data": None}
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "weownit-public-preview/1.0"})
        with urllib.request.urlopen(request, timeout=25) as response:
            body = response.read(262145)
            if len(body) > 262144:
                raise ValueError("Preview response too large")
            raw = json.loads(body)
        result["state"], result["data"] = normalize(kind, raw)
    except Exception as exc:
        # Do not expose exception contents in the public snapshot.
        result["error"] = type(exc).__name__
    result["checkedAt"] = utc_now()
    return kind, result


def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        checks = dict(pool.map(capture, ["dns", "tls", "headers"]))
    if all(check["state"] == "unavailable" for check in checks.values()):
        raise SystemExit("No usable observation; existing preview was preserved.")
    snapshot = {"schema": "weownit.webcheck.preview.v1", "domain": DOMAIN, "generatedAt": utc_now(), "checks": checks}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print("Captured weownit.net: " + ", ".join(key + "=" + value["state"] for key, value in checks.items()))


if __name__ == "__main__":
    main()
