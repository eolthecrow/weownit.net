import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('csp_meta', ROOT / 'tools/csp_meta.py')
csp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(csp)


class ScriptCspTest(unittest.TestCase):
    def test_every_page_has_current_policy(self):
        pages = csp.pages()
        self.assertGreaterEqual(len(pages), 10)
        for path in pages:
            html = path.read_text(encoding='utf-8')
            with self.subTest(page=str(path.relative_to(ROOT))):
                self.assertEqual(html, csp.apply(html), 'run python tools/csp_meta.py')
                self.assertEqual(html.count('data-csp="scripts"'), 1)
                self.assertNotIn("'unsafe-inline'", csp.policy(html))

    def test_policy_precedes_first_script(self):
        for path in csp.pages():
            html = path.read_text(encoding='utf-8')
            with self.subTest(page=path.name):
                self.assertLess(html.index('data-csp="scripts"'), html.index('<script'))

    def test_apply_is_idempotent_and_tracks_edits(self):
        page = '<html><head>\n  <meta charset="utf-8">\n  <title>x</title><script>a()</script></head></html>'
        once = csp.apply(page)
        self.assertEqual(once, csp.apply(once))
        edited = once.replace('a()', 'b()')
        self.assertNotEqual(csp.policy(once), csp.policy(edited))
        self.assertEqual(csp.apply(edited).count('data-csp="scripts"'), 1)

    def test_external_and_data_scripts_are_not_hashed(self):
        page = ('<meta charset="utf-8"><script src="x.js"></script>'
                '<script type="application/ld+json">{"a":1}</script><script>run()</script>')
        self.assertEqual(len(csp.inline_hashes(page)), 1)

    def test_known_hash(self):
        # sha256 of "alert(1)" in base64, as browsers compute it
        self.assertEqual(csp.inline_hashes('<script>alert(1)</script>'),
                         ["'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"])


if __name__ == '__main__':
    unittest.main()
