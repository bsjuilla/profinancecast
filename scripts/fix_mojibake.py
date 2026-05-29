"""
One-shot mojibake repair. Some blog/content files were saved through a bad
UTF-8 -> Latin-1 -> UTF-8 round-trip, so characters like the arrows (<- ->),
curly quotes and em-dashes render as "a-hat" garbage (e.g. the up-arrow shows
as the 3-char sequence that looks like 'a' + dagger + quote).

ftfy.fix_encoding ONLY reverses encoding corruption — it does not touch
correct text, code, whitespace, or line endings — so it's safe to run across
HTML/JS. We write back only files that actually changed and print a report.
"""
import glob
import os
import ftfy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Scan all HTML at repo root + every JS under js/ (covers blog HTML + their
# inline JS + any app file that picked up the same corruption).
targets = []
targets += glob.glob(os.path.join(ROOT, "*.html"))
targets += glob.glob(os.path.join(ROOT, "js", "**", "*.js"), recursive=True)

changed = []
for path in sorted(set(targets)):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        orig = fh.read()
    fixed = ftfy.fix_encoding(orig)
    if fixed != orig:
        # Count and sample the differing characters for the report.
        diffs = sum(1 for a, b in zip(orig, fixed) if a != b) + abs(len(orig) - len(fixed))
        with open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(fixed)
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        changed.append((rel, diffs))

print(f"Scanned {len(set(targets))} files; fixed {len(changed)}:\n")
for rel, diffs in changed:
    print(f"  {rel}  (~{diffs} chars repaired)")
if not changed:
    print("  (nothing to fix)")
