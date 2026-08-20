#!/usr/bin/env python3
"""Check the Vite output that is safe to publish under a project subpath.

The game is published as a GitHub Pages project site, so a successful Vite
build is not enough: every local HTML reference and every registered runtime
asset must also resolve inside ``dist/public``.  This check deliberately uses
only the Python standard library so it can run in CI before Pages is enabled.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML_REFERENCE = re.compile(r"(?:src|href)\s*=\s*([\"'])(.*?)\1", re.IGNORECASE)
RUNTIME_ASSET = re.compile(r'publicAssetUrl\(\s*["\']([^"\']+)["\']\s*\)')
ABSOLUTE_LOCAL = re.compile(r"[\"']/(?:assets|characters|src|fonts)/")
REMOTE_PREFIXES = ("http://", "https://", "//", "data:", "mailto:", "javascript:")


def local_reference(value: str) -> str | None:
    """Return a relative local path, or None for external/non-file URLs."""

    value = value.split("#", 1)[0].split("?", 1)[0].strip()
    if not value or value.startswith(("#", "/")) or value.startswith(REMOTE_PREFIXES):
        return None
    return value[2:] if value.startswith("./") else value


def registered_asset_paths() -> list[str]:
    source = (ROOT / "client/src/game/assets.ts").read_text(encoding="utf-8")
    return sorted({match.group(1).lstrip("/") for match in RUNTIME_ASSET.finditer(source)})


def check(dist: Path) -> list[str]:
    errors: list[str] = []
    index = dist / "index.html"
    if not index.is_file():
        return [f"missing build entry: {index}"]

    html = index.read_text(encoding="utf-8")
    if ABSOLUTE_LOCAL.search(html):
        errors.append("index.html contains a root-absolute local asset reference")

    for match in HTML_REFERENCE.finditer(html):
        reference = local_reference(match.group(2))
        if reference is None:
            if match.group(2).startswith("/"):
                errors.append(f"root-absolute local reference: {match.group(2)}")
            continue
        target = dist / reference
        if not target.is_file():
            errors.append(f"missing HTML asset: {match.group(2)} -> {target.relative_to(dist)}")

    for asset in registered_asset_paths():
        target = dist / asset
        if not target.is_file():
            errors.append(f"missing registered runtime asset: {asset}")

    for chunk in dist.rglob("*.js"):
        source = chunk.read_text(encoding="utf-8", errors="replace")
        if ABSOLUTE_LOCAL.search(source):
            errors.append(f"root-absolute local asset reference in {chunk.relative_to(dist)}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dist",
        type=Path,
        default=ROOT / "dist/public",
        help="Vite output directory (default: dist/public)",
    )
    args = parser.parse_args()
    dist = args.dist if args.dist.is_absolute() else ROOT / args.dist
    errors = check(dist)
    if errors:
        print("static output contract: FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"static output contract: OK ({len(registered_asset_paths())} registered assets, {dist})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
