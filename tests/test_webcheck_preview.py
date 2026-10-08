import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / "tools" / "refresh_webcheck_preview.py"
spec = importlib.util.spec_from_file_location("preview", path)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewEvidenceTests(unittest.TestCase):
    def test_tls_capture_uses_the_documented_ssl_endpoint(self):
        with patch.object(preview.urllib.request, "urlopen", side_effect=OSError("offline")) as request, patch.object(preview, "capture_direct", return_value={"state": "unavailable", "data": None}):
            kind, result = preview.capture("tls")
        self.assertEqual(kind, "tls")
        self.assertEqual(request.call_args.args[0].full_url, "https://web-check.xyz/api/ssl?url=https%3A%2F%2Fweownit.net")
        self.assertEqual(result["state"], "unavailable")

    def test_direct_mode_does_not_request_the_unavailable_api(self):
        with patch.object(preview.urllib.request, "urlopen") as request, patch.object(preview, "capture_direct", return_value={"state": "ok", "data": {"protocol": "TLSv1.3"}}) as direct:
            _, result = preview.capture("connection", direct=True)
        request.assert_not_called()
        direct.assert_called_once_with("connection")
        self.assertEqual(result["state"], "ok")

    def test_direct_challenge_is_not_ordinary_response_evidence(self):
        from email.message import Message
        headers = Message();headers["cf-mitigated"] = "challenge";headers["content-security-policy"] = "challenge-policy"
        error = preview.urllib.error.HTTPError("https://weownit.net/", 403, "challenge", headers, None)
        with patch.object(preview.urllib.request, "urlopen", side_effect=error) as request:
            result = preview.capture_direct("headers")
        self.assertEqual(result["state"], "challenge")
        self.assertIsNone(result["data"]["securityHeaders"])
        self.assertEqual(request.call_count, 1)

    def test_challenge_headers_are_not_website_security_evidence(self):
        state, data = preview.normalize("headers", {"Server": "cloudflare", "CF-Mitigated": "challenge", "Content-Security-Policy": "challenge-page-policy", "strict-transport-security": "max-age=63072000"})
        self.assertEqual(state, "challenge")
        self.assertIsNone(data["securityHeaders"])
        self.assertEqual(data["server"], "cloudflare")

    def test_missing_headers_are_not_invented(self):
        state, data = preview.normalize("headers", {"Server": "cloudflare"})
        self.assertEqual(state, "ok")
        self.assertTrue(all(value is None for value in data["securityHeaders"].values()))

    def test_wildcard_does_not_prove_apex_certificate_match(self):
        with self.assertRaises(ValueError):
            preview.normalize("tls", {"subject": {"CN": "*.weownit.net"}, "issuer": {}, "subjectaltname": "DNS:*.weownit.net", "isValid": True})

    def test_certificate_failure_does_not_become_verified(self):
        state, data = preview.normalize("tls", {"subject": {"CN": "weownit.net"}, "issuer": {"O": "Example CA"}, "valid_from": "Sep 28 12:39:35 2026 GMT", "valid_to": "Dec 27 12:39:34 2026 GMT", "isValid": True, "authError": "CERT_HAS_EXPIRED"})
        self.assertEqual(state, "ok")
        self.assertFalse(data["verifiedAtCapture"])
        self.assertEqual(data["validTo"], "2026-12-27T12:39:34Z")

    def test_invalid_dns_data_is_rejected(self):
        with self.assertRaises(ValueError):
            preview.normalize("dns", {"A": ["not-an-ip"]})

    def test_failed_upstream_response_is_rejected(self):
        with self.assertRaises(ValueError):
            preview.normalize("dns", {"error": "upstream timeout"})

    def test_dns_txt_preserves_unquoted_spaces(self):
        answer = {"Status": 0, "Answer": [{"type": 16, "data": "v=spf1 include:example.net ~all"}]}
        with patch.object(preview.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(answer).encode())):
            result = preview.dns_query("weownit.net", 16)
        self.assertEqual(result["records"], ["v=spf1 include:example.net ~all"])

    def test_dns_txt_joins_quoted_chunks(self):
        answer = {"Status": 0, "Answer": [{"type": 16, "data": '"v=spf1 " "include:example.net ~all"'}]}
        with patch.object(preview.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(answer).encode())):
            result = preview.dns_query("weownit.net", 16)
        self.assertEqual(result["records"], ["v=spf1 include:example.net ~all"])

    def test_resolver_failure_is_not_an_absent_record(self):
        with patch.object(preview.urllib.request, "urlopen", return_value=io.BytesIO(b'{"Status":2}')):
            result = preview.dns_query("weownit.net", 16)
        self.assertEqual(result["state"], "unavailable")

    def test_successful_empty_dns_answer_is_distinct(self):
        with patch.object(preview.urllib.request, "urlopen", return_value=io.BytesIO(b'{"Status":0,"AD":false}')):
            result = preview.dns_query("weownit.net", 48)
        self.assertEqual(result["state"], "ok")
        self.assertEqual(result["records"], [])
        self.assertFalse(result["authenticated"])

    def test_partial_failure_does_not_become_a_configuration_removal(self):
        old = {"domain": preview.DOMAIN, "generatedAt": "2026-10-07T00:00:00Z", "checks": {"dns": {"state": "ok", "data": {"ipv4": ["1.1.1.1"]}}}}
        current = {"checks": {"dns": {"state": "unavailable", "data": None}}}
        preview.add_history(current, old)
        self.assertEqual(current["comparison"]["changes"], [])
        self.assertEqual(current["comparison"]["comparableChecks"], 0)

    def test_real_change_is_recorded_without_timestamps(self):
        old = {"domain": preview.DOMAIN, "generatedAt": "2026-10-07T00:00:00Z", "checks": {"dns": {"state": "ok", "checkedAt": "earlier", "data": {"ipv4": ["1.1.1.1"]}}}}
        current = {"checks": {"dns": {"state": "ok", "checkedAt": "later", "data": {"ipv4": ["8.8.8.8"]}}}}
        preview.add_history(current, old)
        self.assertEqual(current["comparison"]["changes"][0]["check"], "dns")
        self.assertNotIn("checkedAt", current["comparison"]["changes"][0]["after"])


if __name__ == "__main__":
    unittest.main()
