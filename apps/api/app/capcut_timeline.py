from __future__ import annotations

import hashlib
import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .capcut_draft import (
    CapCutDraftError,
    capcut_us_to_seconds,
    read_capcut_json,
    resolve_capcut_draft_files,
)


CACHE_ROOT = Path(__file__).resolve().parents[1] / ".cache" / "capcut_imports"
MEDIA_TRACK_TYPES = {"audio", "video"}
MIN_RANGE_SECONDS = 0.001
SOURCE_CUT_TOLERANCE_SECONDS = 0.035
STEM_RENDER_VERSION = 4


@dataclass(frozen=True)
class CapCutStemRef:
    id: str
    label: str
    path: Path
    track_id: str


def build_capcut_timeline_map(project_path: str | Path) -> dict[str, Any]:
    files = resolve_capcut_draft_files(project_path)
    draft = read_capcut_json(files.draft_info)
    nested = read_capcut_json(files.timeline_draft_info)
    warnings: list[str] = []

    if draft != nested:
        warnings.append("Root and nested draft_info.json differ; import used the root draft_info.json.")

    materials = _material_index(draft)
    tracks = [_track_payload(track, index, materials) for index, track in enumerate(draft.get("tracks") or [])]
    duration = capcut_us_to_seconds(draft.get("duration", 0))
    media_segments = [
        segment
        for track in tracks
        if track["type"] in MEDIA_TRACK_TYPES
        for segment in track["segments"]
        if segment["hasAudio"] and segment["visible"]
    ]

    return {
        "version": 1,
        "projectPath": str(files.root),
        "mainTimelineId": files.main_timeline_id,
        "duration": duration,
        "durationUs": draft.get("duration", 0),
        "tracks": tracks,
        "materials": sorted(materials.values(), key=lambda item: (item["type"], item["path"], item["id"])),
        "markers": _timeline_markers(draft),
        "projectGaps": _find_project_gaps(media_segments, duration),
        "sourceCutBoundaries": _find_source_cut_boundaries(tracks),
        "warnings": warnings,
    }


def render_capcut_track_stems(project_path: str | Path) -> dict[str, Any]:
    timeline_map = build_capcut_timeline_map(project_path)
    cache_dir = _cache_dir(timeline_map)
    cache_dir.mkdir(parents=True, exist_ok=True)

    stems: list[dict[str, Any]] = []
    warnings = list(timeline_map["warnings"])

    for track in timeline_map["tracks"]:
        if track["type"] not in MEDIA_TRACK_TYPES:
            continue

        audible_segments = [
            segment
            for segment in track["segments"]
            if segment["hasAudio"] and segment["visible"] and segment["duration"] >= MIN_RANGE_SECONDS
        ]
        if not audible_segments:
            continue

        stem_path = cache_dir / f"{_safe_id(track['id'])}.wav"
        track_warnings = _render_track_stem(audible_segments, stem_path, timeline_map["duration"])
        warnings.extend(track_warnings)
        stems.append(
            {
                "id": f"stem_{track['id']}",
                "trackId": track["id"],
                "label": _track_label(track),
                "duration": timeline_map["duration"],
                "url": f"/api/capcut/imports/{cache_dir.name}/stems/{stem_path.name}",
                "warnings": track_warnings,
            }
        )

    if not stems:
        warnings.append("No audible CapCut video/audio tracks were found.")

    return {
        "timelineMap": timeline_map,
        "stems": stems,
        "warnings": warnings,
    }


def render_capcut_source_preview(
    *,
    media_path: str | Path,
    start: float,
    end: float,
) -> dict[str, Any]:
    source_path = Path(media_path).expanduser()
    if not source_path.exists():
        raise CapCutDraftError(f"Missing source media file: {source_path}")
    if end - start < MIN_RANGE_SECONDS:
        raise CapCutDraftError("Source preview range is too short.")

    cache_key = hashlib.sha256(f"{source_path}:{start:.6f}:{end:.6f}".encode("utf-8")).hexdigest()[:24]
    cache_dir = CACHE_ROOT / "source_previews" / cache_key
    cache_dir.mkdir(parents=True, exist_ok=True)
    preview_path = cache_dir / "preview.wav"

    if not preview_path.exists() or preview_path.stat().st_size == 0:
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{start:.6f}",
            "-t",
            f"{end - start:.6f}",
            "-i",
            str(source_path),
            "-vn",
            "-ac",
            "2",
            "-ar",
            "44100",
            str(preview_path),
        ]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True)
        except FileNotFoundError as error:
            raise CapCutDraftError("ffmpeg is required to render CapCut source previews.") from error
        except subprocess.CalledProcessError as error:
            detail = error.stderr.strip() or error.stdout.strip() or "ffmpeg failed to render a source preview."
            raise CapCutDraftError(detail) from error

    return {
        "mediaPath": str(source_path),
        "start": start,
        "end": end,
        "duration": end - start,
        "url": f"/api/capcut/imports/source_previews/stems/{cache_key}/preview.wav",
    }


def get_import_stem_path(import_id: str, filename: str) -> Path:
    if import_id == "source_previews":
        parts = Path(filename).parts
        if len(parts) != 2 or any(part in {"", ".", ".."} for part in parts):
            raise CapCutDraftError("Invalid CapCut source preview path.")
        path = CACHE_ROOT / import_id / filename
        if path.name != "preview.wav" or path.parent.parent != CACHE_ROOT / "source_previews":
            raise CapCutDraftError("Invalid CapCut source preview path.")
        if not path.exists():
            raise CapCutDraftError("CapCut source preview was not found. Re-render the preview.")
        return path

    if import_id != _safe_id(import_id) or filename != Path(filename).name:
        raise CapCutDraftError("Invalid CapCut import stem path.")

    path = CACHE_ROOT / import_id / filename
    if not path.exists():
        raise CapCutDraftError("CapCut import stem was not found. Re-import the project.")
    return path


def _material_index(draft: dict[str, Any]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    materials = draft.get("materials") or {}

    for material_type in ("videos", "audios"):
        source_type = "video" if material_type == "videos" else "audio"
        for material in materials.get(material_type) or []:
            material_id = str(material.get("id") or "")
            if not material_id or material_id in indexed:
                continue

            path = str(material.get("path") or material.get("media_path") or "")
            indexed[material_id] = {
                "id": material_id,
                "type": source_type,
                "path": path,
                "name": material.get("material_name") or Path(path).name or material_id,
                "duration": capcut_us_to_seconds(material.get("duration", 0)),
                "durationUs": material.get("duration", 0),
                "hasAudio": bool(material.get("has_audio", source_type == "audio")),
                "width": material.get("width"),
                "height": material.get("height"),
            }

    return indexed


def _track_payload(track: dict[str, Any], index: int, materials: dict[str, dict[str, Any]]) -> dict[str, Any]:
    segments = [
        _segment_payload(track, index, segment, segment_index, materials)
        for segment_index, segment in enumerate(track.get("segments") or [])
    ]

    return {
        "id": str(track.get("id") or f"track_{index}"),
        "index": index,
        "type": str(track.get("type") or "unknown"),
        "name": track.get("name") or "",
        "segments": segments,
        "segmentCount": len(segments),
        "renderIndex": track.get("render_index"),
        "flag": track.get("flag"),
        "attribute": track.get("attribute"),
    }


def _segment_payload(
    track: dict[str, Any],
    track_index: int,
    segment: dict[str, Any],
    segment_index: int,
    materials: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    source_timerange = segment.get("source_timerange") or {}
    target_timerange = segment.get("target_timerange") or {}
    material_id = str(segment.get("material_id") or "")
    material = materials.get(material_id)
    source_start = capcut_us_to_seconds(source_timerange.get("start", 0))
    source_duration = capcut_us_to_seconds(source_timerange.get("duration", 0))
    target_start = capcut_us_to_seconds(target_timerange.get("start", 0))
    target_duration = capcut_us_to_seconds(target_timerange.get("duration", 0))
    speed = _safe_float(segment.get("speed"), 1.0)

    return {
        "id": str(segment.get("id") or f"{track.get('id', track_index)}_{segment_index}"),
        "index": segment_index,
        "trackId": str(track.get("id") or f"track_{track_index}"),
        "trackIndex": track_index,
        "type": track.get("type") or "unknown",
        "materialId": material_id,
        "materialPath": material["path"] if material else "",
        "materialName": material["name"] if material else material_id,
        "hasAudio": bool(material and material.get("hasAudio")),
        "sourceStart": source_start,
        "sourceEnd": source_start + source_duration,
        "sourceDuration": source_duration,
        "targetStart": target_start,
        "targetEnd": target_start + target_duration,
        "duration": target_duration,
        "speed": speed,
        "volume": _safe_float(segment.get("volume"), 1.0),
        "visible": bool(segment.get("visible", True)),
        "reverse": bool(segment.get("reverse", False)),
        "renderIndex": segment.get("render_index"),
        "trackRenderIndex": segment.get("track_render_index"),
        "extraMaterialRefs": segment.get("extra_material_refs") or [],
    }


def _timeline_markers(draft: dict[str, Any]) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    top_level = draft.get("time_marks") or {}

    for item in top_level.get("mark_items") or []:
        time_range = item.get("time_range") or {}
        markers.append(
            {
                "id": str(item.get("id") or ""),
                "scope": "timeline",
                "time": capcut_us_to_seconds(time_range.get("start", 0)),
                "duration": capcut_us_to_seconds(time_range.get("duration", 0)),
                "title": item.get("title") or "",
                "color": item.get("color") or "#00c1cd",
            }
        )

    material_time_marks = {
        str(material.get("id") or ""): material
        for material in ((draft.get("materials") or {}).get("time_marks") or [])
    }
    material_beats = {
        str(material.get("id") or ""): material
        for material in ((draft.get("materials") or {}).get("beats") or [])
    }

    for track in draft.get("tracks") or []:
        for segment in track.get("segments") or []:
            refs = segment.get("extra_material_refs") or []
            source_timerange = segment.get("source_timerange") or {}
            target_timerange = segment.get("target_timerange") or {}
            source_start = capcut_us_to_seconds(source_timerange.get("start", 0))
            source_duration = capcut_us_to_seconds(source_timerange.get("duration", 0))
            target_start = capcut_us_to_seconds(target_timerange.get("start", 0))
            speed = _safe_float(segment.get("speed"), 1.0)

            for ref in refs:
                time_mark = material_time_marks.get(str(ref))
                if time_mark:
                    for mark in time_mark.get("mark_items") or []:
                        time_range = mark.get("time_range") or {}
                        source_time = capcut_us_to_seconds(time_range.get("start", 0))
                        if source_time < source_start or source_time > source_start + source_duration:
                            continue
                        markers.append(
                            {
                                "id": str(mark.get("id") or ""),
                                "scope": "source",
                                "segmentId": segment.get("id"),
                                "materialRefId": ref,
                                "sourceTime": source_time,
                                "projectTime": target_start + (source_time - source_start) / max(speed, MIN_RANGE_SECONDS),
                                "duration": capcut_us_to_seconds(time_range.get("duration", 0)),
                                "title": mark.get("title") or "",
                                "color": mark.get("color") or "#00c1cd",
                            }
                        )

                beat = material_beats.get(str(ref))
                if beat:
                    for beat_time_us in beat.get("user_beats") or []:
                        source_time = capcut_us_to_seconds(beat_time_us)
                        if source_time < source_start or source_time > source_start + source_duration:
                            continue
                        markers.append(
                            {
                                "id": f"{ref}:{beat_time_us}",
                                "scope": "source-beat",
                                "segmentId": segment.get("id"),
                                "materialRefId": ref,
                                "sourceTime": source_time,
                                "projectTime": target_start + (source_time - source_start) / max(speed, MIN_RANGE_SECONDS),
                                "duration": 0,
                                "title": "",
                                "color": "#00c1cd",
                            }
                        )

    markers.sort(key=lambda item: (item.get("projectTime", item.get("time", 0)), item["scope"], item["id"]))
    return markers


def _find_project_gaps(segments: list[dict[str, Any]], duration: float) -> list[dict[str, float | str]]:
    merged = _merge_ranges([(segment["targetStart"], segment["targetEnd"]) for segment in segments], duration)
    gaps: list[dict[str, float | str]] = []
    cursor = 0.0

    for start, end in merged:
        if start - cursor >= MIN_RANGE_SECONDS:
            gaps.append(_gap_payload("project_gap", cursor, start))
        cursor = max(cursor, end)

    if duration - cursor >= MIN_RANGE_SECONDS:
        gaps.append(_gap_payload("project_gap", cursor, duration))

    return gaps


def _find_source_cut_boundaries(tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    boundaries: list[dict[str, Any]] = []

    for track in tracks:
        if track["type"] not in MEDIA_TRACK_TYPES:
            continue

        segments = sorted(
            [segment for segment in track["segments"] if segment["visible"] and segment["sourceDuration"] > 0],
            key=lambda item: (item["targetStart"], item["targetEnd"]),
        )
        for left, right in zip(segments, segments[1:]):
            target_gap = right["targetStart"] - left["targetEnd"]
            if abs(target_gap) > SOURCE_CUT_TOLERANCE_SECONDS:
                continue
            if left["materialPath"] != right["materialPath"] or not left["materialPath"]:
                continue
            if left["reverse"] or right["reverse"]:
                continue
            if not math.isclose(left["speed"], right["speed"], rel_tol=0.001, abs_tol=0.001):
                continue

            hidden_start = left["sourceEnd"]
            hidden_end = right["sourceStart"]
            if hidden_end - hidden_start < SOURCE_CUT_TOLERANCE_SECONDS:
                continue

            boundaries.append(
                {
                    "id": f"source_cut_{left['id']}__{right['id']}",
                    "trackId": track["id"],
                    "leftSegmentId": left["id"],
                    "rightSegmentId": right["id"],
                    "mediaPath": left["materialPath"],
                    "materialName": left["materialName"],
                    "hiddenSourceStart": hidden_start,
                    "hiddenSourceEnd": hidden_end,
                    "hiddenDuration": hidden_end - hidden_start,
                    "projectPosition": left["targetEnd"],
                    "canRestore": True,
                }
            )

    return boundaries


def _merge_ranges(ranges: list[tuple[float, float]], duration: float) -> list[tuple[float, float]]:
    normalized = sorted(
        (max(0.0, min(start, duration)), max(0.0, min(end, duration))) for start, end in ranges if end - start >= MIN_RANGE_SECONDS
    )
    merged: list[tuple[float, float]] = []

    for start, end in normalized:
        if not merged or start > merged[-1][1] + MIN_RANGE_SECONDS:
            merged.append((start, end))
            continue
        merged[-1] = (merged[-1][0], max(merged[-1][1], end))

    return merged


def _gap_payload(prefix: str, start: float, end: float) -> dict[str, float | str]:
    return {
        "id": f"{prefix}_{round(start, 6)}_{round(end, 6)}",
        "start": round(start, 6),
        "end": round(end, 6),
        "duration": round(end - start, 6),
    }


def _render_track_stem(segments: list[dict[str, Any]], stem_path: Path, duration: float) -> list[str]:
    warnings: list[str] = []
    if stem_path.exists() and stem_path.stat().st_size > 0:
        return warnings

    usable_segments: list[dict[str, Any]] = []
    for segment in segments:
        path = Path(segment["materialPath"]).expanduser()
        if not path.exists():
            warnings.append(f"Missing media file for segment {segment['id']}: {path}")
            continue
        if segment["speed"] <= 0:
            warnings.append(f"Skipped segment {segment['id']} because speed must be positive.")
            continue
        usable_segments.append({**segment, "materialPath": str(path)})

    if not usable_segments:
        _render_silence(stem_path, duration)
        return warnings

    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    for segment in usable_segments:
        command.extend(["-i", segment["materialPath"]])

    filters: list[str] = []
    labels: list[str] = []
    for index, segment in enumerate(usable_segments):
        label = f"s{index}"
        delay_seconds = max(0.0, segment["targetStart"])
        source_duration = max(MIN_RANGE_SECONDS, segment["sourceDuration"])
        target_duration = max(MIN_RANGE_SECONDS, segment["duration"])
        clip_label = f"clip{index}"
        filter_chain = (
            f"[{index}:a]"
            f"atrim=start={segment['sourceStart']:.6f}:duration={source_duration:.6f},"
            "asetpts=PTS-STARTPTS,"
            "aresample=44100,"
            "aformat=sample_rates=44100:channel_layouts=stereo,"
        )
        if not math.isclose(segment["speed"], 1.0, rel_tol=0.001, abs_tol=0.001):
            filter_chain += _atempo_chain(segment["speed"]) + ","
            warnings.append(f"Applied approximate audio tempo for segment {segment['id']} at speed {segment['speed']}.")
        filter_chain += (
            f"atrim=0:{target_duration:.6f},"
            "asetpts=PTS-STARTPTS,"
            f"volume={segment['volume']:.6f},"
            f"aformat=sample_rates=44100:channel_layouts=stereo"
            f"[{clip_label}]"
        )
        filters.append(filter_chain)

        if delay_seconds >= MIN_RANGE_SECONDS:
            silence_label = f"silence{index}"
            filters.append(
                f"anullsrc=channel_layout=stereo:sample_rate=44100:d={delay_seconds:.6f},"
                f"aformat=sample_rates=44100:channel_layouts=stereo"
                f"[{silence_label}]"
            )
            filters.append(
                f"[{silence_label}][{clip_label}]"
                f"concat=n=2:v=0:a=1,"
                f"apad=whole_dur={duration:.6f},"
                f"atrim=0:{duration:.6f},"
                "asetpts=PTS-STARTPTS"
                f"[{label}]"
            )
        else:
            filters.append(
                f"[{clip_label}]"
                f"apad=whole_dur={duration:.6f},"
                f"atrim=0:{duration:.6f},"
                "asetpts=PTS-STARTPTS"
                f"[{label}]"
            )
        labels.append(f"[{label}]")

    if len(labels) == 1:
        filters.append(f"{labels[0]}atrim=0:{duration:.6f},asetpts=PTS-STARTPTS[out]")
    else:
        filters.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,atrim=0:{duration:.6f},asetpts=PTS-STARTPTS[out]")

    command.extend([
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-ac",
        "2",
        "-ar",
        "44100",
        str(stem_path),
    ])

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise CapCutDraftError("ffmpeg is required to render CapCut project audio stems.") from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() or error.stdout.strip() or "ffmpeg failed to render a CapCut stem."
        raise CapCutDraftError(detail) from error

    return warnings


def _render_silence(stem_path: Path, duration: float) -> None:
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-t",
        f"{max(duration, MIN_RANGE_SECONDS):.6f}",
        str(stem_path),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as error:
        raise CapCutDraftError("ffmpeg is required to render CapCut project audio stems.") from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.strip() or error.stdout.strip() or "ffmpeg failed to render a silent CapCut stem."
        raise CapCutDraftError(detail) from error


def _atempo_chain(speed: float) -> str:
    factors: list[float] = []
    remaining = speed
    while remaining > 2.0:
        factors.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        factors.append(0.5)
        remaining /= 0.5
    factors.append(remaining)
    return ",".join(f"atempo={factor:.6f}" for factor in factors)


def _cache_dir(timeline_map: dict[str, Any]) -> Path:
    signature_payload = {
        "stemRenderVersion": STEM_RENDER_VERSION,
        "durationUs": timeline_map["durationUs"],
        "projectPath": timeline_map["projectPath"],
        "tracks": [
            {
                "id": track["id"],
                "segments": [
                    {
                        "id": segment["id"],
                        "materialPath": segment["materialPath"],
                        "sourceStart": segment["sourceStart"],
                        "sourceDuration": segment["sourceDuration"],
                        "targetStart": segment["targetStart"],
                        "duration": segment["duration"],
                        "speed": segment["speed"],
                        "volume": segment["volume"],
                        "visible": segment["visible"],
                    }
                    for segment in track["segments"]
                ],
            }
            for track in timeline_map["tracks"]
        ],
    }
    digest = hashlib.sha256(json.dumps(signature_payload, sort_keys=True).encode("utf-8")).hexdigest()[:24]
    return CACHE_ROOT / digest


def _track_label(track: dict[str, Any]) -> str:
    name = str(track.get("name") or "").strip()
    if name:
        return name
    return f"{track['type'].title()} track {track['index'] + 1}"


def _safe_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_id(value: str) -> str:
    return "".join(char if char.isalnum() or char in "-_" else "_" for char in value)
