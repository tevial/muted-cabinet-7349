#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from app.capcut_draft import (  # noqa: E402
    CaptionPatch,
    CapCutDraftError,
    TimeRange,
    inspect_capcut_draft,
    patch_capcut_draft,
    preview_capcut_patch,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect or patch a CapCut draft with caption skip zones.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser("inspect", help="Read a CapCut draft and print support details.")
    inspect_parser.add_argument("project_path")

    dry_run_parser = subparsers.add_parser("dry-run", help="Preview a CapCut patch without writing files.")
    dry_run_parser.add_argument("project_path")
    dry_run_parser.add_argument("manifest")

    patch_parser = subparsers.add_parser("patch", help="Patch the original CapCut draft after creating backups.")
    patch_parser.add_argument("project_path")
    patch_parser.add_argument("manifest")

    args = parser.parse_args()

    try:
        if args.command == "inspect":
            print_json(inspect_capcut_draft(args.project_path))
            return 0

        manifest = load_manifest(args.manifest)
        if args.command == "dry-run":
            print_json(preview_capcut_patch(args.project_path, **manifest))
            return 0
        if args.command == "patch":
            print_json(patch_capcut_draft(args.project_path, **manifest))
            return 0
    except CapCutDraftError as error:
        print(f"CapCut draft error: {error}", file=sys.stderr)
        return 2

    return 1


def load_manifest(path: str) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    captions_payload = payload.get("captions") or payload.get("groups") or []
    captions = [
        CaptionPatch(
            text=str(item.get("text", "")).strip(),
            start=float(item["start"]),
            end=float(item["end"]),
        )
        for item in captions_payload
    ]

    return {
        "captions": captions,
        "duration": payload.get("duration"),
        "kept_ranges": parse_ranges(payload.get("keptRanges") or payload.get("kept_ranges")),
        "skip_zones": parse_ranges(payload.get("skipZones") or payload.get("skip_zones")),
    }


def parse_ranges(payload: list[dict[str, Any]] | None) -> list[TimeRange] | None:
    if payload is None:
        return None
    return [
        TimeRange(
            start=float(item["start"]),
            end=float(item["end"]),
        )
        for item in payload
    ]


def print_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
