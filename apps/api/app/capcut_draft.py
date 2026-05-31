from __future__ import annotations

import copy
import json
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


MICROSECONDS = 1_000_000
MIN_RANGE_SECONDS = 0.001
DEFAULT_TEXT_RENDER_INDEX = 14_000


class CapCutDraftError(RuntimeError):
    pass


@dataclass(frozen=True)
class TimeRange:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass(frozen=True)
class CaptionPatch:
    text: str
    start: float
    end: float


@dataclass(frozen=True)
class DraftFiles:
    root: Path
    draft_info: Path
    draft_meta_info: Path
    timelines_project: Path
    timeline_draft_info: Path
    root_template_2: Path | None
    timeline_template_2: Path | None
    main_timeline_id: str


def inspect_capcut_draft(project_path: str | Path) -> dict[str, Any]:
    files = _resolve_draft_files(project_path)
    draft = _read_json(files.draft_info)
    nested = _read_json(files.timeline_draft_info)
    meta = _read_json(files.draft_meta_info)
    warnings: list[str] = []

    if draft != nested:
        warnings.append("Root draft_info.json and nested timeline draft_info.json differ; patching will write both.")

    validation_errors = _validate_supported_draft(draft, allow_text=True)
    tracks = [
        {
            "id": track.get("id"),
            "type": track.get("type"),
            "segments": len(track.get("segments") or []),
            "name": track.get("name", ""),
        }
        for track in draft.get("tracks") or []
    ]
    material_counts = {
        key: len(value) if isinstance(value, list) else type(value).__name__
        for key, value in (draft.get("materials") or {}).items()
    }

    return {
        "projectPath": str(files.root),
        "mainTimelineId": files.main_timeline_id,
        "duration": _us_to_seconds(draft.get("duration", 0)),
        "durationUs": draft.get("duration", 0),
        "metaDurationUs": meta.get("tm_duration"),
        "tracks": tracks,
        "materialCounts": material_counts,
        "supported": not validation_errors,
        "errors": validation_errors,
        "warnings": warnings,
    }


def preview_capcut_patch(
    project_path: str | Path,
    *,
    captions: list[CaptionPatch],
    duration: float | None = None,
    kept_ranges: list[TimeRange] | None = None,
    skip_zones: list[TimeRange] | None = None,
) -> dict[str, Any]:
    files = _resolve_draft_files(project_path)
    draft = _read_json(files.draft_info)
    meta = _read_json(files.draft_meta_info)
    patch = _build_patch(draft, meta, captions, duration, kept_ranges, skip_zones)

    return _patch_summary(files, patch, write=False, backups=[])


def patch_capcut_draft(
    project_path: str | Path,
    *,
    captions: list[CaptionPatch],
    duration: float | None = None,
    kept_ranges: list[TimeRange] | None = None,
    skip_zones: list[TimeRange] | None = None,
) -> dict[str, Any]:
    files = _resolve_draft_files(project_path)
    draft = _read_json(files.draft_info)
    meta = _read_json(files.draft_meta_info)
    patch = _build_patch(draft, meta, captions, duration, kept_ranges, skip_zones)
    write_targets = _write_targets(files, patch["draft"], patch["meta"])
    backups = _backup_files(write_targets)

    for path, payload in write_targets:
        _write_json(path, payload)

    return _patch_summary(files, patch, write=True, backups=backups)


def resolve_capcut_draft_files(project_path: str | Path) -> DraftFiles:
    return _resolve_draft_files(project_path)


def read_capcut_json(path: str | Path) -> dict[str, Any]:
    return _read_json(Path(path))


def capcut_us_to_seconds(value: Any) -> float:
    return _us_to_seconds(value)


def capcut_seconds_to_us(seconds: float) -> int:
    return _seconds_to_us(seconds)


def _resolve_draft_files(project_path: str | Path) -> DraftFiles:
    root = Path(project_path).expanduser()
    draft_info = root / "draft_info.json"
    draft_meta_info = root / "draft_meta_info.json"
    timelines_project = root / "Timelines" / "project.json"

    for path in [draft_info, draft_meta_info, timelines_project]:
        if not path.exists():
            raise CapCutDraftError(f"Missing CapCut draft file: {path}")

    timelines = _read_json(timelines_project)
    main_timeline_id = str(timelines.get("main_timeline_id") or "")
    if not main_timeline_id:
        raise CapCutDraftError("Timelines/project.json is missing main_timeline_id.")

    timeline_root = root / "Timelines" / main_timeline_id
    timeline_draft_info = timeline_root / "draft_info.json"
    if not timeline_draft_info.exists():
        raise CapCutDraftError(f"Missing main timeline draft_info.json: {timeline_draft_info}")

    root_template_2 = root / "template-2.tmp"
    timeline_template_2 = timeline_root / "template-2.tmp"

    return DraftFiles(
        root=root,
        draft_info=draft_info,
        draft_meta_info=draft_meta_info,
        timelines_project=timelines_project,
        timeline_draft_info=timeline_draft_info,
        root_template_2=root_template_2 if root_template_2.exists() else None,
        timeline_template_2=timeline_template_2 if timeline_template_2.exists() else None,
        main_timeline_id=main_timeline_id,
    )


def _build_patch(
    draft: dict[str, Any],
    meta: dict[str, Any],
    captions: list[CaptionPatch],
    duration: float | None,
    kept_ranges: list[TimeRange] | None,
    skip_zones: list[TimeRange] | None,
) -> dict[str, Any]:
    validation_errors = _validate_supported_draft(draft, allow_text=True)
    if validation_errors:
        raise CapCutDraftError("; ".join(validation_errors))

    source_duration = duration if duration is not None else _us_to_seconds(draft.get("duration", 0))
    if source_duration <= 0:
        raise CapCutDraftError("Draft duration must be greater than zero.")

    normalized_kept_ranges = _resolve_kept_ranges(source_duration, kept_ranges, skip_zones)
    if not normalized_kept_ranges:
        raise CapCutDraftError("Patch would remove the entire timeline.")

    patched_draft = copy.deepcopy(draft)
    patched_meta = copy.deepcopy(meta)
    video_track = _get_primary_video_track(patched_draft)
    source_segment = video_track["segments"][0]
    video_track["segments"] = _build_video_segments(source_segment, normalized_kept_ranges)

    rendered_captions = _render_captions(captions, normalized_kept_ranges)
    _replace_text_captions(patched_draft, rendered_captions)

    output_duration_us = sum(_seconds_to_us(item.duration) for item in normalized_kept_ranges)
    patched_draft["duration"] = output_duration_us
    patched_meta["tm_duration"] = output_duration_us

    return {
        "draft": patched_draft,
        "meta": patched_meta,
        "keptRanges": normalized_kept_ranges,
        "captions": rendered_captions,
        "outputDurationUs": output_duration_us,
        "inputDuration": source_duration,
    }


def _validate_supported_draft(draft: dict[str, Any], *, allow_text: bool) -> list[str]:
    errors: list[str] = []
    tracks = draft.get("tracks")
    if not isinstance(tracks, list):
        return ["draft_info.json is missing tracks."]

    video_tracks = [track for track in tracks if track.get("type") == "video"]
    if len(video_tracks) != 1:
        errors.append(f"Expected exactly one video track, found {len(video_tracks)}.")
    elif len(video_tracks[0].get("segments") or []) != 1:
        errors.append("Expected the video track to contain exactly one segment.")
    elif video_tracks[0]["segments"][0].get("speed") != 1:
        errors.append("Only speed=1 video segments are supported.")

    unsupported_tracks = [
        track.get("type")
        for track in tracks
        if track.get("type") not in {"video", "text"}
    ]
    if unsupported_tracks:
        errors.append(f"Unsupported track types: {', '.join(map(str, unsupported_tracks))}.")

    text_tracks = [track for track in tracks if track.get("type") == "text"]
    if text_tracks and not allow_text:
        errors.append("Text tracks are not allowed in this patch mode.")
    if len(text_tracks) > 1:
        errors.append(f"Expected at most one text track, found {len(text_tracks)}.")

    material_ids = {
        segment.get("material_id")
        for track in text_tracks
        for segment in (track.get("segments") or [])
    }
    text_materials = {
        material.get("id"): material
        for material in ((draft.get("materials") or {}).get("texts") or [])
    }
    for material_id in material_ids:
        material = text_materials.get(material_id)
        if not material:
            errors.append(f"Text segment references missing material {material_id}.")
        elif material.get("type") != "subtitle":
            errors.append("Only subtitle text materials are supported.")

    return errors


def _get_primary_video_track(draft: dict[str, Any]) -> dict[str, Any]:
    return next(track for track in draft["tracks"] if track.get("type") == "video")


def _resolve_kept_ranges(
    duration: float,
    kept_ranges: list[TimeRange] | None,
    skip_zones: list[TimeRange] | None,
) -> list[TimeRange]:
    if kept_ranges:
        return _normalize_ranges(kept_ranges, duration)
    if skip_zones is not None:
        return _subtract_ranges(TimeRange(0, duration), _normalize_ranges(skip_zones, duration))
    return [TimeRange(0, duration)]


def _normalize_ranges(ranges: list[TimeRange], duration: float) -> list[TimeRange]:
    normalized = sorted(
        (
            TimeRange(max(0.0, min(item.start, duration)), max(0.0, min(item.end, duration)))
            for item in ranges
        ),
        key=lambda item: (item.start, item.end),
    )
    merged: list[TimeRange] = []

    for item in normalized:
        if item.duration < MIN_RANGE_SECONDS:
            continue
        if not merged or item.start > merged[-1].end:
            merged.append(item)
            continue
        merged[-1] = TimeRange(merged[-1].start, max(merged[-1].end, item.end))

    return merged


def _subtract_ranges(base: TimeRange, cuts: list[TimeRange]) -> list[TimeRange]:
    kept = [base]
    for cut in cuts:
        next_kept: list[TimeRange] = []
        for range_item in kept:
            if cut.end <= range_item.start or cut.start >= range_item.end:
                next_kept.append(range_item)
                continue
            if cut.start > range_item.start:
                next_kept.append(TimeRange(range_item.start, min(cut.start, range_item.end)))
            if cut.end < range_item.end:
                next_kept.append(TimeRange(max(cut.end, range_item.start), range_item.end))
        kept = next_kept
    return [item for item in kept if item.duration >= MIN_RANGE_SECONDS]


def _build_video_segments(source_segment: dict[str, Any], kept_ranges: list[TimeRange]) -> list[dict[str, Any]]:
    source_timerange = source_segment.get("source_timerange") or {}
    target_timerange = source_segment.get("target_timerange") or {}
    source_base = _us_to_seconds(source_timerange.get("start", 0))
    target_base = _us_to_seconds(target_timerange.get("start", 0))
    accumulated_us = 0
    segments: list[dict[str, Any]] = []

    for kept_range in kept_ranges:
        segment = copy.deepcopy(source_segment)
        duration_us = _seconds_to_us(kept_range.duration)
        segment["id"] = _uuid()
        segment["source_timerange"] = {
            "start": _seconds_to_us(source_base + kept_range.start - target_base),
            "duration": duration_us,
        }
        segment["target_timerange"] = {
            "start": accumulated_us,
            "duration": duration_us,
        }
        segment["render_timerange"] = {"start": 0, "duration": 0}
        segments.append(segment)
        accumulated_us += duration_us

    return segments


def _render_captions(captions: list[CaptionPatch], kept_ranges: list[TimeRange]) -> list[CaptionPatch]:
    rendered: list[CaptionPatch] = []

    for caption in captions:
        text = caption.text.strip()
        if not text:
            continue
        for kept_range in kept_ranges:
            start = max(caption.start, kept_range.start)
            end = min(caption.end, kept_range.end)
            if end - start < MIN_RANGE_SECONDS:
                continue
            rendered.append(
                CaptionPatch(
                    text=text,
                    start=_map_source_time_to_cut_time(start, kept_ranges),
                    end=_map_source_time_to_cut_time(end, kept_ranges),
                )
            )

    rendered.sort(key=lambda item: (item.start, item.end, item.text))
    return rendered


def _map_source_time_to_cut_time(seconds: float, kept_ranges: list[TimeRange]) -> float:
    elapsed = 0.0
    for kept_range in kept_ranges:
        if seconds <= kept_range.start:
            return elapsed
        if seconds <= kept_range.end:
            return elapsed + seconds - kept_range.start
        elapsed += kept_range.duration
    return elapsed


def _replace_text_captions(draft: dict[str, Any], captions: list[CaptionPatch]) -> None:
    materials = draft.setdefault("materials", {})
    materials.setdefault("texts", [])
    materials.setdefault("material_animations", [])

    existing_text_track = next((track for track in draft["tracks"] if track.get("type") == "text"), None)
    segment_template, text_template, animation_template = _get_text_templates(draft, existing_text_track)
    old_text_material_ids = {
        segment.get("material_id")
        for segment in ((existing_text_track or {}).get("segments") or [])
    }
    old_animation_ids = {
        ref
        for segment in ((existing_text_track or {}).get("segments") or [])
        for ref in (segment.get("extra_material_refs") or [])
    }

    draft["tracks"] = [track for track in draft["tracks"] if track.get("type") != "text"]
    materials["texts"] = [
        material
        for material in materials["texts"]
        if material.get("id") not in old_text_material_ids
    ]
    materials["material_animations"] = [
        material
        for material in materials["material_animations"]
        if material.get("id") not in old_animation_ids
    ]

    if not captions:
        return

    new_segments: list[dict[str, Any]] = []
    new_materials: list[dict[str, Any]] = []
    new_animations: list[dict[str, Any]] = []
    group_id = f"capcut_caption_export_{datetime.now().strftime('%Y%m%d%H%M%S')}"

    for index, caption in enumerate(captions):
        material_id = _uuid()
        animation_id = _uuid()
        new_materials.append(_build_text_material(text_template, material_id, caption.text, group_id))
        new_animations.append(_build_animation_material(animation_template, animation_id))
        new_segments.append(
            _build_text_segment(segment_template, caption, material_id, animation_id, index)
        )

    materials["texts"].extend(new_materials)
    materials["material_animations"].extend(new_animations)
    draft["tracks"].append(
        {
            "id": (existing_text_track or {}).get("id") if existing_text_track else _uuid(),
            "type": "text",
            "segments": new_segments,
            "flag": 1,
            "attribute": 0,
            "name": (existing_text_track or {}).get("name", ""),
            "is_default_name": True,
        }
    )


def _get_text_templates(
    draft: dict[str, Any],
    text_track: dict[str, Any] | None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if text_track and text_track.get("segments"):
        segment = copy.deepcopy(text_track["segments"][0])
        text_materials = {
            material.get("id"): material
            for material in ((draft.get("materials") or {}).get("texts") or [])
        }
        animation_materials = {
            material.get("id"): material
            for material in ((draft.get("materials") or {}).get("material_animations") or [])
        }
        text_material = text_materials.get(segment.get("material_id"))
        animation_id = (segment.get("extra_material_refs") or [None])[0]
        animation_material = animation_materials.get(animation_id)
        if text_material and animation_material:
            return segment, copy.deepcopy(text_material), copy.deepcopy(animation_material)

    return (
        copy.deepcopy(DEFAULT_TEXT_SEGMENT_TEMPLATE),
        copy.deepcopy(DEFAULT_TEXT_MATERIAL_TEMPLATE),
        copy.deepcopy(DEFAULT_TEXT_ANIMATION_TEMPLATE),
    )


def _build_text_segment(
    template: dict[str, Any],
    caption: CaptionPatch,
    material_id: str,
    animation_id: str,
    index: int,
) -> dict[str, Any]:
    segment = copy.deepcopy(template)
    segment["id"] = _uuid()
    segment["source_timerange"] = None
    segment["target_timerange"] = {
        "start": _seconds_to_us(caption.start),
        "duration": _seconds_to_us(caption.end - caption.start),
    }
    segment["render_timerange"] = {"start": 0, "duration": 0}
    segment["material_id"] = material_id
    segment["extra_material_refs"] = [animation_id]
    segment["render_index"] = DEFAULT_TEXT_RENDER_INDEX + index
    segment["track_render_index"] = 1
    segment["visible"] = True
    return segment


def _build_text_material(template: dict[str, Any], material_id: str, text: str, group_id: str) -> dict[str, Any]:
    material = copy.deepcopy(template)
    material["id"] = material_id
    material["type"] = "subtitle"
    material["group_id"] = group_id
    material["content"] = _build_text_content(material.get("content"), text)
    material["recognize_text"] = ""
    material["base_content"] = ""
    material["words"] = {"start_time": [], "end_time": [], "text": []}
    material["current_words"] = {"start_time": [], "end_time": [], "text": []}
    return material


def _build_animation_material(template: dict[str, Any], animation_id: str) -> dict[str, Any]:
    animation = copy.deepcopy(template)
    animation["id"] = animation_id
    animation.setdefault("type", "sticker_animation")
    animation.setdefault("animations", [])
    animation.setdefault("multi_language_current", "none")
    return animation


def _build_text_content(raw_content: str | None, text: str) -> str:
    try:
        content = json.loads(raw_content or "{}")
    except json.JSONDecodeError:
        content = {}
    styles = content.get("styles")
    if not isinstance(styles, list) or not styles:
        styles = copy.deepcopy(DEFAULT_TEXT_CONTENT["styles"])
    for style in styles:
        style["range"] = [0, len(text)]
    content["styles"] = styles
    content["text"] = text
    return json.dumps(content, ensure_ascii=False, separators=(",", ":"))


def _write_targets(files: DraftFiles, draft: dict[str, Any], meta: dict[str, Any]) -> list[tuple[Path, dict[str, Any]]]:
    targets = [
        (files.draft_info, draft),
        (files.timeline_draft_info, draft),
        (files.draft_meta_info, meta),
    ]
    if files.root_template_2:
        targets.append((files.root_template_2, draft))
    if files.timeline_template_2:
        targets.append((files.timeline_template_2, draft))
    return targets


def _backup_files(write_targets: list[tuple[Path, dict[str, Any]]]) -> list[str]:
    suffix = datetime.now().strftime("%Y%m%d-%H%M%S")
    backups: list[str] = []
    seen: set[Path] = set()
    for path, _ in write_targets:
        if path in seen or not path.exists():
            continue
        seen.add(path)
        backup_path = path.with_name(f"{path.name}.capcut-caption.{suffix}.bak")
        shutil.copy2(path, backup_path)
        backups.append(str(backup_path))
    return backups


def _patch_summary(files: DraftFiles, patch: dict[str, Any], *, write: bool, backups: list[str]) -> dict[str, Any]:
    kept_ranges = patch["keptRanges"]
    captions = patch["captions"]
    input_duration = patch["inputDuration"]
    output_duration = _us_to_seconds(patch["outputDurationUs"])
    return {
        "projectPath": str(files.root),
        "mainTimelineId": files.main_timeline_id,
        "write": write,
        "inputDuration": input_duration,
        "outputDuration": output_duration,
        "removedDuration": max(0.0, input_duration - output_duration),
        "keptRanges": [_range_payload(item) for item in kept_ranges],
        "videoSegments": len(kept_ranges),
        "captionSegments": len(captions),
        "backups": backups,
        "filesWritten": [str(path) for path, _ in _write_targets(files, patch["draft"], patch["meta"])] if write else [],
        "filesWouldWrite": [str(path) for path, _ in _write_targets(files, patch["draft"], patch["meta"])],
    }


def _range_payload(item: TimeRange) -> dict[str, float]:
    return {
        "start": round(item.start, 6),
        "end": round(item.end, 6),
        "duration": round(item.duration, 6),
    }


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise CapCutDraftError(f"Invalid JSON in {path}: {error}") from error


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _seconds_to_us(seconds: float) -> int:
    return max(0, round(seconds * MICROSECONDS))


def _us_to_seconds(value: Any) -> float:
    try:
        return float(value) / MICROSECONDS
    except (TypeError, ValueError):
        return 0.0


def _uuid() -> str:
    return str(uuid.uuid4()).upper()


DEFAULT_TEXT_CONTENT = {
    "styles": [
        {
            "fill": {
                "alpha": 1.0,
                "content": {
                    "render_type": "solid",
                    "solid": {
                        "alpha": 1.0,
                        "color": [1.0, 1.0, 1.0],
                    },
                },
            },
            "font": {
                "id": "",
                "path": "/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf",
            },
            "range": [0, 0],
            "size": 11.0,
        }
    ],
    "text": "",
}

DEFAULT_TEXT_ANIMATION_TEMPLATE = {
    "id": "",
    "type": "sticker_animation",
    "animations": [],
    "multi_language_current": "none",
}

DEFAULT_TEXT_SEGMENT_TEMPLATE = {
    "id": "",
    "source_timerange": None,
    "target_timerange": {"start": 0, "duration": 0},
    "render_timerange": {"start": 0, "duration": 0},
    "desc": "",
    "state": 0,
    "speed": 1,
    "is_loop": False,
    "is_tone_modify": False,
    "reverse": False,
    "intensifies_audio": False,
    "cartoon": False,
    "volume": 1,
    "last_nonzero_volume": 1,
    "clip": {
        "scale": {"x": 1, "y": 1},
        "rotation": 0,
        "transform": {"x": 0, "y": -0.8},
        "flip": {"vertical": False, "horizontal": False},
        "alpha": 1,
    },
    "uniform_scale": {"on": True, "value": 1},
    "material_id": "",
    "extra_material_refs": [],
    "render_index": DEFAULT_TEXT_RENDER_INDEX,
    "keyframe_refs": [],
    "enable_lut": False,
    "enable_adjust": False,
    "enable_hsl": False,
    "visible": True,
    "group_id": "",
    "enable_color_curves": True,
    "enable_hsl_curves": True,
    "track_render_index": 1,
    "hdr_settings": None,
    "enable_color_wheels": True,
    "track_attribute": 0,
    "is_placeholder": False,
    "template_id": "",
    "enable_smart_color_adjust": False,
    "template_scene": "default",
    "common_keyframes": [],
    "caption_info": None,
    "responsive_layout": {
        "enable": False,
        "target_follow": "",
        "size_layout": 0,
        "horizontal_pos_layout": 0,
        "vertical_pos_layout": 0,
    },
    "enable_color_match_adjust": False,
    "enable_color_correct_adjust": False,
    "enable_adjust_mask": False,
    "raw_segment_id": "",
    "lyric_keyframes": None,
    "enable_video_mask": True,
    "digital_human_template_group_id": "",
    "color_correct_alg_result": "",
    "source": "segmentsourcenormal",
    "enable_mask_stroke": False,
    "enable_mask_shadow": False,
    "enable_color_adjust_pro": False,
}

DEFAULT_TEXT_MATERIAL_TEMPLATE = {
    "recognize_task_id": "",
    "id": "",
    "name": "",
    "recognize_text": "",
    "recognize_model": "",
    "punc_model": "",
    "type": "subtitle",
    "content": json.dumps(DEFAULT_TEXT_CONTENT, ensure_ascii=False, separators=(",", ":")),
    "base_content": "",
    "words": {"start_time": [], "end_time": [], "text": []},
    "current_words": {"start_time": [], "end_time": [], "text": []},
    "global_alpha": 1,
    "combo_info": {"text_templates": []},
    "caption_template_info": {
        "resource_id": "",
        "third_resource_id": "",
        "resource_name": "",
        "category_id": "",
        "category_name": "",
        "effect_id": "",
        "request_id": "",
        "path": "",
        "is_new": False,
        "source_platform": 0,
    },
    "layer_weight": 1,
    "letter_spacing": 0,
    "text_curve": None,
    "text_loop_on_path": False,
    "offset_on_path": 0,
    "enable_path_typesetting": False,
    "text_exceeds_path_process_type": 0,
    "text_typesetting_paths": None,
    "text_typesetting_paths_file": "",
    "text_typesetting_path_index": 0,
    "line_spacing": 0.02,
    "has_shadow": False,
    "shadow_color": "",
    "shadow_alpha": 0.9,
    "shadow_smoothing": 0.45,
    "shadow_distance": 5,
    "shadow_point": {"x": 0.6363961030678928, "y": -0.6363961030678927},
    "shadow_angle": -45,
    "shadow_thickness_projection_enable": False,
    "shadow_thickness_projection_angle": 0,
    "shadow_thickness_projection_distance": 0,
    "border_alpha": 1,
    "border_color": "",
    "border_width": 0.08,
    "border_mode": 0,
    "style_name": "",
    "text_color": "#FFFFFF",
    "text_alpha": 1,
    "font_name": "",
    "font_title": "none",
    "font_size": 11,
    "font_path": "/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf",
    "font_id": "",
    "font_resource_id": "",
    "initial_scale": 1,
    "font_url": "",
    "typesetting": 0,
    "alignment": 1,
    "line_feed": 1,
    "use_effect_default_color": True,
    "is_rich_text": False,
    "shape_clip_x": False,
    "shape_clip_y": False,
    "ktv_color": "",
    "text_to_audio_ids": [],
    "bold_width": 0,
    "italic_degree": 0,
    "underline": False,
    "underline_width": 0.05,
    "underline_offset": 0.22,
    "sub_type": 0,
    "check_flag": 7,
    "text_size": 30,
    "font_category_name": "",
    "font_source_platform": 0,
    "font_third_resource_id": "",
    "font_category_id": "",
    "add_type": 2,
    "operation_type": 0,
    "recognize_type": 0,
    "fonts": [],
    "background_color": "",
    "background_alpha": 1,
    "background_style": 0,
    "background_round_radius": 0,
    "background_width": 0.14,
    "background_height": 0.14,
    "background_vertical_offset": 0,
    "background_horizontal_offset": 0,
    "background_fill": "",
    "single_char_bg_enable": False,
    "single_char_bg_color": "",
    "single_char_bg_alpha": 1,
    "single_char_bg_round_radius": 0.3,
    "single_char_bg_width": 0,
    "single_char_bg_height": 0,
    "single_char_bg_vertical_offset": 0,
    "single_char_bg_horizontal_offset": 0,
    "font_team_id": "",
    "tts_auto_update": False,
    "text_preset_resource_id": "",
    "group_id": "",
    "preset_id": "",
    "preset_name": "",
    "preset_category": "",
    "preset_category_id": "",
    "preset_index": 0,
    "preset_has_set_alignment": False,
    "force_apply_line_max_width": False,
    "language": "",
    "relevance_segment": [],
    "original_size": [],
    "fixed_width": -1,
    "fixed_height": -1,
    "line_max_width": 0.82,
    "oneline_cutoff": False,
    "cutoff_postfix": "",
    "subtitle_template_original_fontsize": 0,
    "subtitle_keywords": None,
    "inner_padding": -1,
    "multi_language_current": "none",
    "source_from": "",
    "is_lyric_effect": False,
    "lyric_group_id": "",
    "lyrics_template": {
        "resource_id": "",
        "resource_name": "",
        "panel": "",
        "effect_id": "",
        "path": "",
        "category_id": "",
        "category_name": "",
        "request_id": "",
    },
    "is_batch_replace": False,
    "is_words_linear": False,
    "ssml_content": "",
    "subtitle_keywords_config": None,
    "sub_template_id": -1,
    "translate_original_text": "",
}
