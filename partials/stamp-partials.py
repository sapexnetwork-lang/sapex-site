#!/usr/bin/env python3
"""
stamp-partials.py: copy partials/header.html and partials/footer.html into the pages.

Run it from the Main folder:
    python partials/stamp-partials.py              # stamp every page in PAGES
    python partials/stamp-partials.py --check      # only report what would change
    python partials/stamp-partials.py about.html   # stamp named pages only

How it works
- The header goes between <!-- NAV:START --> and <!-- NAV:END -->, the footer between
  <!-- FOOTER:START --> and <!-- FOOTER:END -->.
- First run on a page that has no markers yet: it finds the old <header class="nav" ...> and
  <footer class="footer"> blocks, replaces them, and adds the markers. After that a menu change is
  one edit to the partial and one run of this script.
- A page whose header or footer cannot be found is reported and left alone, never guessed at.
- Before a page is changed for the first time its original is copied to
  _backup-homepage-before-redesign/stamp/ (an existing copy is never overwritten).
Only the standard library is used.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # the Main folder
PARTIALS = ROOT / "partials"
BACKUP = ROOT / "_backup-homepage-before-redesign" / "stamp"

PAGES = [
    "index.html",
    "ai-trading-signals.html", "geopolitical-risk-ai.html", "market-size-ai.html",
    "digital-assets-ai.html", "prediction-arena.html", "conflict-map.html",
    "wanted-list.html", "event-forecasts.html", "economic-calendar.html",
    "about.html", "blog.html", "methodology.html", "risk-disclosure.html",
]

NAV_MARK = re.compile(r"<!-- NAV:START.*?-->.*?<!-- NAV:END -->", re.S)
FOOT_MARK = re.compile(r"<!-- FOOTER:START.*?-->.*?<!-- FOOTER:END -->", re.S)
NAV_BARE = re.compile(r'<header class="nav"[^>]*>.*?</header>', re.S)
FOOT_BARE = re.compile(r'<footer class="footer"[^>]*>.*?</footer>', re.S)


def wrap(kind, body, src):
    return f"<!-- {kind}:START (copy of partials/{src}) -->\n{body.strip()}\n<!-- {kind}:END -->"


def stamp_one(html, header, footer):
    """Return (new_html, notes). Raises ValueError when a block cannot be found."""
    notes = []
    nav_block = wrap("NAV", header, "header.html")
    foot_block = wrap("FOOTER", footer, "footer.html")

    if NAV_MARK.search(html):
        html = NAV_MARK.sub(lambda m: nav_block, html, count=1)
        notes.append("header refreshed")
    elif NAV_BARE.search(html):
        html = NAV_BARE.sub(lambda m: nav_block, html, count=1)
        notes.append("header replaced, markers added")
    else:
        raise ValueError("no header found")

    if FOOT_MARK.search(html):
        html = FOOT_MARK.sub(lambda m: foot_block, html, count=1)
        notes.append("footer refreshed")
    elif FOOT_BARE.search(html):
        html = FOOT_BARE.sub(lambda m: foot_block, html, count=1)
        notes.append("footer replaced, markers added")
    else:
        raise ValueError("no footer found")
    return html, notes


def main(argv):
    check = "--check" in argv
    names = [a for a in argv if not a.startswith("--")] or PAGES
    header = (PARTIALS / "header.html").read_text(encoding="utf-8")
    footer = (PARTIALS / "footer.html").read_text(encoding="utf-8")
    skipped = 0
    for name in names:
        path = ROOT / name
        if not path.exists():
            print(f"MISSING  {name}")
            skipped += 1
            continue
        original = path.read_text(encoding="utf-8")
        try:
            new, notes = stamp_one(original, header, footer)
        except ValueError as err:
            print(f"SKIPPED  {name}: {err}. Structure differs, edit this page by hand.")
            skipped += 1
            continue
        if new == original:
            print(f"OK       {name}: already up to date")
            continue
        if check:
            print(f"WOULD    {name}: {', '.join(notes)}")
            continue
        BACKUP.mkdir(parents=True, exist_ok=True)
        saved = BACKUP / name
        if not saved.exists():
            shutil.copy2(path, saved)
        path.write_text(new, encoding="utf-8", newline="")
        print(f"STAMPED  {name}: {', '.join(notes)}")
    if skipped:
        print(f"\n{skipped} page(s) need attention (see above).")


if __name__ == "__main__":
    main(sys.argv[1:])
