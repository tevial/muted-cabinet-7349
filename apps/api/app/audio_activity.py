from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path


TimeWindow = tuple[float, float]

_SILENCE_START_RE = re.compile(r"silence_start:\s*(?P<time>\d+(?:\.\d+)?)")
_SILENCE_END_RE = re.compile(r"silence_end:\s*(?P<time>\d+(?:\.\d+)?)")


def _run_command(command: list[str]) -> subprocess.CompletedProcess[str] | None:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            check=False,
            text=True,
        )
    except FileNotFoundError:
        return None


def _probe_duration(path: Path) -> float | None:
    result = _run_command([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(path),
    ])
    if result is None or result.returncode != 0:
        return None

    try:
        duration = float(json.loads(result.stdout)["format"]["duration"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None

    return duration if duration > 0 else None


def _detect_silence_windows(
    path: Path,
    duration: float,
    silence_db: int,
    min_silence_duration: float,
) -> list[TimeWindow]:
    result = _run_command([
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        str(path),
        "-af",
        f"silencedetect=n={silence_db}dB:d={min_silence_duration}",
        "-f",
        "null",
        "-",
    ])
    if result is None or result.returncode != 0:
        return []

    windows: list[TimeWindow] = []
    current_start: float | None = None

    for line in result.stderr.splitlines():
        start_match = _SILENCE_START_RE.search(line)
        if start_match:
            current_start = float(start_match.group("time"))
            continue

        end_match = _SILENCE_END_RE.search(line)
        if end_match and current_start is not None:
            silence_end = float(end_match.group("time"))
            if silence_end > current_start:
                windows.append((current_start, silence_end))
            current_start = None

    if current_start is not None and duration > current_start:
        windows.append((current_start, duration))

    return windows


def _invert_windows(
    duration: float,
    silence_windows: list[TimeWindow],
    padding: float,
) -> list[TimeWindow]:
    if duration <= 0:
        return []

    speech_windows: list[TimeWindow] = []
    cursor = 0.0

    for silence_start, silence_end in sorted(silence_windows):
        speech_start = max(0.0, cursor - padding)
        speech_end = min(duration, silence_start + padding)
        if speech_end > speech_start:
            speech_windows.append((speech_start, speech_end))
        cursor = max(cursor, silence_end)

    if cursor < duration:
        speech_windows.append((max(0.0, cursor - padding), duration))

    return speech_windows


def detect_speech_windows(
    audio_bytes: bytes,
    filename: str,
    *,
    silence_db: int = -35,
    min_silence_duration: float = 0.55,
    padding: float = 0.16,
) -> list[TimeWindow]:
    suffix = Path(filename).suffix or ".audio"
    with tempfile.NamedTemporaryFile(suffix=suffix) as temp_file:
        temp_file.write(audio_bytes)
        temp_file.flush()
        path = Path(temp_file.name)
        duration = _probe_duration(path)
        if duration is None:
            return []

        silence_windows = _detect_silence_windows(path, duration, silence_db, min_silence_duration)
        if not silence_windows:
            return [(0.0, duration)]

        return _invert_windows(duration, silence_windows, padding)


def time_is_in_windows(time: float, windows: list[TimeWindow]) -> bool:
    return any(start <= time <= end for start, end in windows)
