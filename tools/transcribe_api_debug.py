#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
from pathlib import Path
from typing import Any
from urllib import error, request


DEFAULT_API_BASE_URL = "http://127.0.0.1:8787"


def build_multipart_body(file_path: Path, language: str | None) -> tuple[bytes, str]:
    boundary = "capcut-caption-debug-boundary"
    content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    parts: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        parts.append(f"--{boundary}\r\n".encode())
        parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        parts.append(value.encode())
        parts.append(b"\r\n")

    if language:
        add_field("language", language)

    parts.append(f"--{boundary}\r\n".encode())
    parts.append(
        (
            f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode(),
    )
    parts.append(file_path.read_bytes())
    parts.append(b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())

    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def post_transcribe(api_base_url: str, file_path: Path, language: str | None) -> dict[str, Any]:
    body, content_type = build_multipart_body(file_path, language)
    endpoint = f"{api_base_url.rstrip('/')}/api/transcribe"
    http_request = request.Request(
        endpoint,
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=600) as response:
            payload = response.read().decode("utf-8")
    except error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API returned HTTP {exc.code}: {payload}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Could not reach API at {endpoint}: {exc.reason}") from exc

    return json.loads(payload)


def seconds(value: Any) -> float:
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return 0.0


def item_text(item: dict[str, Any]) -> str:
    return str(item.get("text") or item.get("word") or "").strip()


def print_rows(title: str, rows: list[dict[str, Any]], limit: int) -> None:
    visible_rows = rows[:limit] if limit > 0 else rows
    print(f"\n{title} ({len(rows)} total)")
    print("-" * 96)
    print(f"{'#':>4}  {'id':<10} {'start':>9} {'end':>9} {'dur':>8}  text")
    print("-" * 96)

    for index, item in enumerate(visible_rows, start=1):
        start = seconds(item.get("start"))
        end = seconds(item.get("end"))
        duration = round(max(0.0, end - start), 3)
        print(f"{index:>4}  {str(item.get('id', '')):<10} {start:>9.3f} {end:>9.3f} {duration:>8.3f}  {item_text(item)}")

    if len(visible_rows) < len(rows):
        print(f"... {len(rows) - len(visible_rows)} rows hidden by --limit")


def find_timing_issues(rows: list[dict[str, Any]]) -> list[str]:
    issues: list[str] = []

    for index, item in enumerate(rows):
        start = seconds(item.get("start"))
        end = seconds(item.get("end"))
        text = item_text(item)

        if end <= start:
            issues.append(f"row {index + 1}: non-positive duration {start:.3f}-{end:.3f} {text!r}")

        if index > 0:
            previous = rows[index - 1]
            previous_end = seconds(previous.get("end"))
            if start < previous_end:
                issues.append(
                    f"row {index + 1}: overlaps previous by {previous_end - start:.3f}s "
                    f"({item_text(previous)!r} -> {text!r})",
                )

            if text and text == item_text(previous) and abs(start - previous_end) < 0.001:
                issues.append(f"row {index + 1}: adjacent duplicate text {text!r}")

    return issues


def print_diagnostics(name: str, rows: list[dict[str, Any]]) -> None:
    issues = find_timing_issues(rows)
    print(f"\n{name} diagnostics")
    print("-" * 96)
    if not issues:
        print("No non-positive durations, overlaps, or adjacent duplicate text detected.")
        return

    for issue in issues:
        print(f"- {issue}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Call the local CapCut Caption API directly and print raw transcription data.",
    )
    parser.add_argument("file", type=Path, help="Audio/video file to send to /api/transcribe.")
    parser.add_argument("--language", "-l", default="uk", help="Language hint sent to the API. Use empty string for auto.")
    parser.add_argument("--api", default=DEFAULT_API_BASE_URL, help=f"API base URL. Default: {DEFAULT_API_BASE_URL}")
    parser.add_argument("--json", action="store_true", help="Print the full raw JSON response after the summary.")
    parser.add_argument("--limit", type=int, default=0, help="Limit printed word/group rows. Default: 0 means all rows.")
    args = parser.parse_args()

    file_path = args.file.expanduser().resolve()
    if not file_path.exists():
        print(f"File does not exist: {file_path}", file=sys.stderr)
        return 2

    language = args.language.strip() or None
    print("Transcribe API debug")
    print("-" * 96)
    print(f"endpoint: {args.api.rstrip('/')}/api/transcribe")
    print(f"file:     {file_path}")
    print(f"size:     {file_path.stat().st_size} bytes")
    print(f"language: {language or 'auto'}")

    try:
        result = post_transcribe(args.api, file_path, language)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    words = result.get("words") or []
    groups = result.get("groups") or []

    print("\nResponse summary")
    print("-" * 96)
    print(f"language: {result.get('language')}")
    print(f"duration: {result.get('duration')}")
    print(f"text chars: {len(str(result.get('text') or ''))}")
    print(f"words: {len(words)}")
    print(f"groups: {len(groups)}")
    print(f"text: {result.get('text')}")

    print_rows("Words returned by API", words, args.limit)
    print_diagnostics("Words", words)
    print_rows("Groups returned by API", groups, args.limit)
    print_diagnostics("Groups", groups)

    if args.json:
        print("\nRaw JSON")
        print("-" * 96)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
