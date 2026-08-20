#!/usr/bin/env python3
"""Synchronize and verify source GLBs against the Vite public directory."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "characters"
PUBLIC = ROOT / "client" / "public" / "assets" / "characters"


def glbs(directory: Path) -> dict[str, Path]:
    return {path.name: path for path in sorted(directory.glob("*.glb"))}


def runtime_glbs(directory: Path) -> dict[str, Path]:
    """Return only the smooth variants shipped to the browser.

    The regular variants remain in ``assets/characters`` for the full GLB audit
    and a possible future low-cost setting, but they are not runtime inputs.
    Keeping them out of ``client/public`` avoids doubling the Pages payload.
    """
    return {name: path for name, path in glbs(directory).items() if name.endswith("-smooth.glb")}


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def verify() -> bool:
    source = glbs(SOURCE)
    runtime_source = runtime_glbs(SOURCE)
    public = glbs(PUBLIC)
    errors: list[str] = []

    for missing in sorted(runtime_source.keys() - public.keys()):
        errors.append(f"public copy missing: {missing}")
    for extra in sorted(public.keys() - runtime_source.keys()):
        errors.append(f"non-runtime GLB in public: {extra}")
    for name in sorted(runtime_source.keys() & public.keys()):
        source_path = runtime_source[name]
        public_path = public[name]
        if source_path.stat().st_size != public_path.stat().st_size:
            errors.append(f"size mismatch: {name}")
        elif digest(source_path) != digest(public_path):
            errors.append(f"content mismatch: {name}")

    if errors:
        for error in errors:
            print(f"ERROR {error}", file=sys.stderr)
        return False

    print(f"PASS {len(runtime_source)} smooth runtime GLBs exactly match public copies; {len(source) - len(runtime_source)} regular audit-only GLBs stay out of public")
    return True


def synchronize() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    source = runtime_glbs(SOURCE)
    for name, path in glbs(PUBLIC).items():
        if name not in source:
            path.unlink()
    for name, path in source.items():
        shutil.copy2(path, PUBLIC / name)


def main() -> int:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true", help="fail if copies differ")
    action.add_argument("--sync", action="store_true", help="refresh public copies")
    args = parser.parse_args()

    if args.sync:
        synchronize()
    return 0 if verify() else 1


if __name__ == "__main__":
    raise SystemExit(main())
