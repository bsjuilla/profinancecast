"""Make SEO canonical signals consistent with the live www domain.

The site 301-redirects apex -> www (vercel.json), emails + operational config use
www, but the SEO tags (canonical/hreflang/og/twitter/JSON-LD) + sitemap + robots
used bare apex. Google was following the apex canonical THROUGH the redirect to
www, so it worked but split the signal. This aligns the canonical tags with the
actually-served URL (www).

SAFETY: touches ONLY .html SEO tags (by attribute/key prefix) + sitemap.xml +
robots.txt. Never touches .js (all operational code: APP_ORIGIN, CORS, PayPal,
Supabase auth redirects, email templates), never touches bare-mention comments
(e.g. the Supabase-setup instruction in auth.html), never touches visible <a>
link text. Already-www URLs are not matched (no double-www).
"""
import re, glob

BS = chr(92)
DOMAIN = 'https://profinancecast.com'
WWW = 'https://www.profinancecast.com'

# Only replace the apex domain when it is the value of one of these SEO signals.
prefixes = [
    r'rel=["\']canonical["\']\s+href=["\']',
    r'hreflang=["\'][a-zA-Z-]+["\']\s+href=["\']',
    r'type=["\']application/rss\+xml["\'][^>]*?href=["\']',
    r'property=["\']og:url["\']\s+content=["\']',
    r'property=["\']og:image["\']\s+content=["\']',
    r'name=["\']twitter:image["\']\s+content=["\']',
    r'name=["\']twitter:url["\']\s+content=["\']',
    r'["\'](?:url|@id|item|image|logo|mainEntityOfPage|urlTemplate)["\']\s*:\s*["\']',
]
combined = re.compile('(' + '|'.join(prefixes) + ')' + re.escape(DOMAIN))

html_files = []
for f in glob.glob('**/*.html', recursive=True):
    f = f.replace(BS, '/')
    if 'graphify-out' in f or f.startswith('docs/') or '/docs/' in f:
        continue
    html_files.append(f)

total = 0
touched = 0
for path in sorted(html_files):
    with open(path, 'r', encoding='utf-8', errors='replace', newline='') as fh:
        s = fh.read()
    new, n = combined.subn(lambda m: m.group(1) + WWW, s)
    assert 'www.www.' not in new, 'double-www in ' + path
    if n:
        with open(path, 'w', encoding='utf-8', newline='') as fh:
            fh.write(new)
        total += n
        touched += 1
print('HTML files touched: %d | SEO-tag replacements: %d' % (touched, total))

for path in ['sitemap.xml', 'robots.txt']:
    with open(path, 'r', encoding='utf-8', newline='') as fh:
        s = fh.read()
    new = s.replace(DOMAIN, WWW)
    assert 'www.www.' not in new
    if new != s:
        with open(path, 'w', encoding='utf-8', newline='') as fh:
            fh.write(new)
        print('  %s: rewritten to www' % path)
