#!/usr/bin/env python3
"""Capture three public Web-Check observations for the fixed weownit.net preview.

No credentials, arbitrary targets, active scans or third-party code are executed.
Run from the repository root: python tools/refresh_webcheck_preview.py
"""
import concurrent.futures
import argparse
import datetime as dt
import json
import pathlib
import shlex
import socket
import ssl
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
    if kind == "connection":
        if raw.get("protocol") not in ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"]:
            raise ValueError("No negotiated TLS protocol")
        cipher = raw.get("cipher") or {}
        return "ok", {"protocol": raw["protocol"], "cipher": bounded_text(cipher.get("standardName") or cipher.get("name"), 100), "authorized": raw.get("authorized") is True, "observedVersions": [v for v in raw.get("versions", []) if v in ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"]]}
    raise ValueError("Unknown preview check")


def capture(kind, direct=False):
    if direct:
        if kind == "dns":
            # Built from the validating resolver answers after concurrent collection.
            return kind, {"state": "unavailable", "checkedAt": utc_now(), "data": None}
        return kind, capture_direct(kind)
    endpoint = {"dns": "dns", "tls": "ssl", "headers": "headers", "connection": "tls-connection"}[kind]
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
    if result["state"] == "unavailable" and kind in ["tls", "connection", "headers"]:
        # Independently observe our own fixed public endpoint. This does not retry
        # or bypass the unavailable Web-Check service, and never evades a challenge.
        direct = capture_direct(kind)
        if direct["state"] != "unavailable":
            direct["webCheckUnavailable"] = True
            result = direct
    result["checkedAt"] = utc_now()
    return kind, result


def capture_direct(kind):
    result = {"state": "unavailable", "checkedAt": utc_now(), "source": "https://" + DOMAIN + "/", "data": None, "method": "direct-https" if kind == "headers" else "direct-tls"}
    try:
        if kind == "headers":
            request = urllib.request.Request(result["source"], headers={"User-Agent": "weownit-public-overview/2.0"})
            try:
                response = urllib.request.urlopen(request, timeout=15)
            except urllib.error.HTTPError as error:
                # Header evidence on errors is only retained for a declared challenge.
                if error.headers.get("cf-mitigated") == "challenge":
                    result["state"], result["data"] = normalize("headers", dict(error.headers.items()))
                return result
            with response:
                result["state"], result["data"] = normalize("headers", dict(response.headers.items()))
            return result
        context = ssl.create_default_context()
        with socket.create_connection((DOMAIN, 443), timeout=8) as sock:
            with context.wrap_socket(sock, server_hostname=DOMAIN) as connection:
                cert = connection.getpeercert()
                protocol = connection.version()
                cipher = connection.cipher()[0]
        if kind == "tls":
            issuer = dict(item for group in cert.get("issuer", []) for item in group)
            subject = dict(item for group in cert.get("subject", []) for item in group)
            raw = {"subject": {"CN": subject.get("commonName")}, "issuer": {"O": issuer.get("organizationName"), "CN": issuer.get("commonName")}, "subjectaltname": ", ".join("DNS:" + value for key, value in cert.get("subjectAltName", []) if key == "DNS"), "valid_from": cert.get("notBefore"), "valid_to": cert.get("notAfter"), "isValid": True}
            result["state"], result["data"] = normalize("tls", raw)
        elif kind == "connection":
            # Only negotiated versions are reported. Failed probes are inconclusive.
            versions = [protocol]
            for name, version in [("TLSv1", ssl.TLSVersion.TLSv1), ("TLSv1.1", ssl.TLSVersion.TLSv1_1), ("TLSv1.2", ssl.TLSVersion.TLSv1_2)]:
                try:
                    probe = ssl.create_default_context()
                    probe.minimum_version = probe.maximum_version = version
                    # A diagnostic client only, for observing legacy server acceptance.
                    probe.set_ciphers("DEFAULT:@SECLEVEL=0")
                    with socket.create_connection((DOMAIN, 443), timeout=5) as sock:
                        with probe.wrap_socket(sock, server_hostname=DOMAIN) as connection:
                            versions.append(connection.version())
                except (OSError, ssl.SSLError):
                    pass
            result["state"], result["data"] = normalize("connection", {"protocol": protocol, "cipher": {"name": cipher}, "authorized": True, "versions": sorted(set(versions))})
    except Exception as exc:
        result["error"] = type(exc).__name__
    finally:
        result["checkedAt"] = utc_now()
    return result


def dns_query(name, record_type):
    """A validating public resolver; NXDOMAIN/NODATA differ from request failure."""
    url = "https://dns.google/resolve?" + urllib.parse.urlencode({"name": name, "type": record_type, "do": "true", "cd": "false"})
    result = {"state": "unavailable", "checkedAt": utc_now(), "source": url, "records": [], "authenticated": False}
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "weownit-public-overview/2.0"})
        with urllib.request.urlopen(request, timeout=18) as response:
            body = response.read(262145)
            if len(body) > 262144:
                raise ValueError("DNS response too large")
            raw = json.loads(body)
        if raw.get("Status") not in (0, 3):
            raise ValueError("Resolver did not return a usable answer")
        answers = [x for x in raw.get("Answer", []) if x.get("type") == record_type]
        values = []
        for answer in answers[:32]:
            value = bounded_text(answer.get("data"), 4000)
            if record_type == 16 and value.startswith('"'):
                value = "".join(shlex.split(value))
            values.append(value)
        result.update(state="ok", records=sorted(set(values)), authenticated=raw.get("AD") is True)
    except Exception as exc:
        result["error"] = type(exc).__name__
    result["checkedAt"] = utc_now()
    return result


def capture_records():
    queries = {"mx": (DOMAIN, 15), "txt": (DOMAIN, 16), "dmarc": ("_dmarc." + DOMAIN, 16), "caa": (DOMAIN, 257), "dnskey": (DOMAIN, 48), "ds": (DOMAIN, 43), "validatedA": (DOMAIN, 1), "aaaa": (DOMAIN, 28), "ns": (DOMAIN, 2), "mtaSts": ("_mta-sts." + DOMAIN, 16), "tlsRpt": ("_smtp._tls." + DOMAIN, 16)}
    # Selectors are explicitly scoped. A negative result is never "no DKIM".
    queries.update({"dkim:" + selector: (selector + "._domainkey." + DOMAIN, 16) for selector in ["selector1", "selector2", "google", "default", "dkim"]})
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = dict(zip(queries, pool.map(lambda q: dns_query(*q), queries.values())))
    caa = results["caa"]
    caa["effectiveDomain"] = DOMAIN
    if caa["state"] == "ok" and not caa["records"]:
        parent = dns_query("net", 257)
        caa = {**parent, "effectiveDomain": "net", "apexSource": caa["source"]}
        results["caa"] = caa
    return {"state": "ok" if any(v["state"] == "ok" for v in results.values()) else "unavailable", "checkedAt": utc_now(), "data": results}


def capture_mta_policy(records):
    result = {"state": "unavailable", "checkedAt": utc_now(), "source": "https://mta-sts." + DOMAIN + "/.well-known/mta-sts.txt", "data": None}
    marker = records.get("data", {}).get("mtaSts", {})
    if marker.get("state") == "ok" and not any(x.startswith("v=STSv1;") for x in marker.get("records", [])):
        result["state"] = "not-published"
        return result
    if marker.get("state") != "ok":
        return result
    try:
        # No retries or alternative user agents when an access challenge is returned.
        request = urllib.request.Request(result["source"], headers={"User-Agent": "weownit-public-overview/2.0"})
        with urllib.request.urlopen(request, timeout=18) as response:
            if response.headers.get("cf-mitigated") == "challenge":
                result["state"] = "challenge"
                return result
            if not response.headers.get("content-type", "").startswith("text/plain"):
                raise ValueError("Not a plain text policy")
            body = response.read(16385).decode("utf-8")
            if len(body) > 16384:
                raise ValueError("Policy too large")
        fields = {}
        for line in body.splitlines():
            key, sep, value = line.partition(":")
            if sep:
                fields.setdefault(key.strip().lower(), []).append(value.strip())
        if fields.get("version") != ["STSv1"] or fields.get("mode") not in [["enforce"], ["testing"], ["none"]] or not fields.get("max_age", [""])[0].isdigit() or not fields.get("mx"):
            raise ValueError("Incomplete MTA-STS policy")
        result.update(state="ok", data={"mode": fields["mode"][0], "maxAge": int(fields["max_age"][0]), "mx": fields["mx"][:32]})
    except Exception as exc:
        result["error"] = type(exc).__name__
    result["checkedAt"] = utc_now()
    return result


def observations(checks):
    """Stable evidence only: volatile resolver TTLs and request times are excluded."""
    values = {}
    for key in ["dns", "tls", "headers", "connection"]:
        item = checks.get(key, {})
        if item.get("state") == "ok":
            data = item["data"]
            if key == "tls":
                data = {k: data[k] for k in ["issuer", "validTo", "verifiedAtCapture"]}
            elif key == "connection":
                # Upstream and direct clients can use different cipher preferences
                # and protocol probe capabilities; do not call that a config change.
                data = {"authorized": data["authorized"]}
            values[key] = data
    for key, item in checks.get("records", {}).get("data", {}).items():
        if item.get("state") == "ok":
            if key not in ["dnskey", "ds", "validatedA"]:
                values[key] = item["records"]
            elif key == "validatedA":
                values["dnssecAuthenticated"] = item["authenticated"]
    policy = checks.get("mtaPolicy", {})
    if policy.get("state") == "ok":
        values["mtaPolicy"] = policy["data"]
    return values


def add_history(snapshot, previous):
    current = observations(snapshot["checks"])
    snapshot["baseline"] = current
    snapshot["history"] = []
    if not isinstance(previous, dict) or previous.get("domain") != DOMAIN:
        snapshot["comparison"] = {"state": "baseline", "changes": []}
        return
    old = previous.get("baseline") or observations(previous.get("checks", {}))
    changed = [{"check": key, "before": old[key], "after": current[key]} for key in current if key in old and old[key] != current[key]]
    snapshot["comparison"] = {"state": "compared", "previousAt": previous.get("generatedAt"), "changes": changed, "comparableChecks": len(set(current) & set(old))}
    entry = {"capturedAt": previous.get("generatedAt"), "changes": previous.get("comparison", {}).get("changes", [])[:20]}
    snapshot["history"] = ([entry] + previous.get("history", []))[:7]


def main():
    parser = argparse.ArgumentParser(description="Collect public observations for the fixed weownit.net target")
    parser.add_argument("--direct", action="store_true", help="Use direct TLS/HTTPS and public DNS instead of the external Web-Check API")
    args = parser.parse_args()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = {kind: pool.submit(capture, kind, args.direct) for kind in ["dns", "tls", "headers", "connection"]}
        records_future = pool.submit(capture_records)
        checks = {kind: future.result()[1] for kind, future in futures.items()}
        checks["records"] = records_future.result()
    checks["mtaPolicy"] = capture_mta_policy(checks["records"])
    if checks["dns"]["state"] == "unavailable":
        records = checks["records"].get("data", {})
        a = records.get("validatedA", {})
        if a.get("state") == "ok" and a.get("records"):
            raw = {"A": a["records"], "AAAA": records.get("aaaa", {}).get("records", []), "NS": records.get("ns", {}).get("records", [])}
            state, data = normalize("dns", raw)
            checks["dns"] = {"state": state, "data": data, "checkedAt": checks["records"]["checkedAt"], "source": a["source"], "method": "dns-over-https"}
    if all(check["state"] == "unavailable" for check in checks.values()):
        raise SystemExit("No usable observation; existing preview was preserved.")
    previous = None
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pass
    snapshot = {"schema": "weownit.webcheck.preview.v2", "domain": DOMAIN, "generatedAt": utc_now(), "checks": checks}
    add_history(snapshot, previous)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print("Captured weownit.net: " + ", ".join(key + "=" + value["state"] for key, value in checks.items()))


if __name__ == "__main__":
    main()
