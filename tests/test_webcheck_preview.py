import importlib.util
import pathlib
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / "tools" / "refresh_webcheck_preview.py"
spec = importlib.util.spec_from_file_location("preview", path)
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewEvidenceTests(unittest.TestCase):
    def test_tls_capture_uses_the_documented_ssl_endpoint(self):
        with patch.object(preview.urllib.request, "urlopen", side_effect=OSError("offline")) as request:
            kind, result = preview.capture("tls")
        self.assertEqual(kind, "tls")
        self.assertEqual(request.call_args.args[0].full_url, "https://web-check.xyz/api/ssl?url=https%3A%2F%2Fweownit.net")
        self.assertEqual(result["state"], "unavailable")

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


if __name__ == "__main__":
    unittest.main()
