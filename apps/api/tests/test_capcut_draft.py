from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.capcut_draft import CaptionPatch, TimeRange, patch_capcut_draft, preview_capcut_patch


class CapCutDraftPatchTest(unittest.TestCase):
    def test_preview_remaps_and_clips_captions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            summary = preview_capcut_patch(
                project,
                duration=10,
                skip_zones=[TimeRange(2, 4)],
                captions=[
                    CaptionPatch("before", 1, 3),
                    CaptionPatch("inside", 2.2, 3.2),
                    CaptionPatch("after", 5, 6),
                    CaptionPatch("bridge", 1, 5),
                ],
            )

            self.assertEqual(summary["videoSegments"], 2)
            self.assertEqual(summary["captionSegments"], 3)
            self.assertEqual(summary["captionSanitizer"]["trimmedOverlaps"], 1)
            self.assertEqual(summary["captionSanitizer"]["droppedAfterOverlapTrim"], 1)
            self.assertEqual(summary["outputDuration"], 8)
            self.assertEqual(summary["keptRanges"], [
                {"start": 0, "end": 2, "duration": 2},
                {"start": 4, "end": 10, "duration": 6},
            ])

    def test_patch_writes_video_segments_text_track_and_backups(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            summary = patch_capcut_draft(
                project,
                duration=10,
                skip_zones=[TimeRange(2, 4)],
                captions=[CaptionPatch("hello", 1, 3), CaptionPatch("world", 5, 6)],
            )
            draft = json.loads((project / "draft_info.json").read_text(encoding="utf-8"))
            meta = json.loads((project / "draft_meta_info.json").read_text(encoding="utf-8"))
            nested = json.loads((project / "Timelines" / "timeline-1" / "draft_info.json").read_text(encoding="utf-8"))
            video_track = next(track for track in draft["tracks"] if track["type"] == "video")
            text_track = next(track for track in draft["tracks"] if track["type"] == "text")

            self.assertTrue(summary["write"])
            self.assertGreaterEqual(len(summary["backups"]), 4)
            self.assertEqual(draft, nested)
            self.assertEqual(draft["duration"], 8_000_000)
            self.assertEqual(meta["tm_duration"], 8_000_000)
            self.assertEqual(len(video_track["segments"]), 2)
            self.assertEqual(video_track["segments"][0]["source_timerange"], {"start": 0, "duration": 2_000_000})
            self.assertEqual(video_track["segments"][1]["source_timerange"], {"start": 4_000_000, "duration": 6_000_000})
            self.assertEqual(len(text_track["segments"]), 2)
            self.assertEqual(draft["materials"]["texts"][0]["type"], "subtitle")
            self.assertIn("hello", draft["materials"]["texts"][0]["content"])

    def test_patch_remaps_existing_multi_segment_video_track(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            draft_path = project / "draft_info.json"
            nested_path = project / "Timelines" / "timeline-1" / "draft_info.json"
            template_path = project / "template-2.tmp"
            nested_template_path = project / "Timelines" / "timeline-1" / "template-2.tmp"
            draft = json.loads(draft_path.read_text(encoding="utf-8"))
            video_track = next(track for track in draft["tracks"] if track["type"] == "video")
            video_track["segments"] = [
                {
                    **video_track["segments"][0],
                    "id": "video-segment-a",
                    "source_timerange": {"start": 0, "duration": 4_000_000},
                    "target_timerange": {"start": 0, "duration": 4_000_000},
                },
                {
                    **video_track["segments"][0],
                    "id": "video-segment-b",
                    "source_timerange": {"start": 4_000_000, "duration": 6_000_000},
                    "target_timerange": {"start": 4_000_000, "duration": 6_000_000},
                },
            ]
            for path in [draft_path, nested_path, template_path, nested_template_path]:
                write_json(path, draft)

            summary = patch_capcut_draft(project, duration=10, skip_zones=[TimeRange(3, 5)], captions=[])
            patched_draft = json.loads(draft_path.read_text(encoding="utf-8"))
            patched_video_track = next(track for track in patched_draft["tracks"] if track["type"] == "video")
            patched_segments = patched_video_track["segments"]

            self.assertEqual(summary["videoSegments"], 2)
            self.assertEqual(patched_draft["duration"], 8_000_000)
            self.assertEqual(patched_segments[0]["source_timerange"], {"start": 0, "duration": 3_000_000})
            self.assertEqual(patched_segments[0]["target_timerange"], {"start": 0, "duration": 3_000_000})
            self.assertEqual(patched_segments[1]["source_timerange"], {"start": 5_000_000, "duration": 5_000_000})
            self.assertEqual(patched_segments[1]["target_timerange"], {"start": 3_000_000, "duration": 5_000_000})

    def test_patch_remaps_audio_tracks_and_replaces_plain_text_tracks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            draft_path = project / "draft_info.json"
            nested_path = project / "Timelines" / "timeline-1" / "draft_info.json"
            template_path = project / "template-2.tmp"
            nested_template_path = project / "Timelines" / "timeline-1" / "template-2.tmp"
            draft = json.loads(draft_path.read_text(encoding="utf-8"))
            draft["tracks"].append(create_audio_track())
            draft["materials"]["audios"] = [{"id": "audio-material", "duration": 10_000_000}]
            draft["tracks"].append(create_text_track("plain-text-track", "plain-text-material", "plain-animation"))
            draft["materials"]["texts"].append(create_text_material("plain-text-material", "old plain text", text_type="text"))
            draft["materials"]["material_animations"].append(
                {"id": "plain-animation", "type": "sticker_animation", "animations": []}
            )
            for path in [draft_path, nested_path, template_path, nested_template_path]:
                write_json(path, draft)

            summary = patch_capcut_draft(
                project,
                duration=10,
                skip_zones=[TimeRange(2, 4)],
                captions=[CaptionPatch("fresh", 1, 2)],
            )
            patched_draft = json.loads(draft_path.read_text(encoding="utf-8"))
            audio_track = next(track for track in patched_draft["tracks"] if track["type"] == "audio")

            self.assertEqual(summary["videoSegments"], 2)
            self.assertEqual(summary["audioSegments"], 2)
            self.assertEqual(summary["mediaSegments"], 4)
            self.assertEqual(audio_track["segments"][0]["source_timerange"], {"start": 0, "duration": 2_000_000})
            self.assertEqual(audio_track["segments"][1]["source_timerange"], {"start": 4_000_000, "duration": 6_000_000})
            self.assertFalse(any(material.get("id") == "plain-text-material" for material in patched_draft["materials"]["texts"]))
            self.assertTrue(any("fresh" in material["content"] for material in patched_draft["materials"]["texts"]))

    def test_patch_removes_tiny_caption_fragments_and_trims_overlaps(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            summary = patch_capcut_draft(
                project,
                duration=10,
                captions=[
                    CaptionPatch("first", 0, 1),
                    CaptionPatch("tiny", 1, 1.02),
                    CaptionPatch("second", 0.95, 2),
                ],
            )
            draft = json.loads((project / "draft_info.json").read_text(encoding="utf-8"))
            text_track = next(track for track in draft["tracks"] if track["type"] == "text")
            text_segments = text_track["segments"]
            text_materials = draft["materials"]["texts"]

            self.assertEqual(summary["captionSegments"], 2)
            self.assertEqual(summary["captionSanitizer"]["droppedShortSegments"], 1)
            self.assertEqual(summary["captionSanitizer"]["trimmedOverlaps"], 1)
            self.assertEqual(text_segments[0]["target_timerange"], {"start": 0, "duration": 950_000})
            self.assertEqual(text_segments[1]["target_timerange"], {"start": 950_000, "duration": 1_050_000})
            self.assertLessEqual(
                text_segments[0]["target_timerange"]["start"] + text_segments[0]["target_timerange"]["duration"],
                text_segments[1]["target_timerange"]["start"],
            )
            self.assertTrue(any("first" in material["content"] for material in text_materials))
            self.assertTrue(any("second" in material["content"] for material in text_materials))
            self.assertFalse(any("tiny" in material["content"] for material in text_materials))

    def test_patch_replaces_multiple_existing_subtitle_tracks(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            draft_path = project / "draft_info.json"
            nested_path = project / "Timelines" / "timeline-1" / "draft_info.json"
            template_path = project / "template-2.tmp"
            nested_template_path = project / "Timelines" / "timeline-1" / "template-2.tmp"
            draft = json.loads(draft_path.read_text(encoding="utf-8"))
            draft["tracks"].extend([
                create_text_track("old-text-track-1", "old-text-1", "old-animation-1"),
                create_text_track("old-text-track-2", "old-text-2", "old-animation-2"),
            ])
            draft["materials"]["texts"].extend([
                create_text_material("old-text-1", "old one"),
                create_text_material("old-text-2", "old two"),
            ])
            draft["materials"]["material_animations"].extend([
                {"id": "old-animation-1", "type": "sticker_animation", "animations": []},
                {"id": "old-animation-2", "type": "sticker_animation", "animations": []},
            ])
            for path in [draft_path, nested_path, template_path, nested_template_path]:
                write_json(path, draft)

            patch_capcut_draft(project, duration=10, captions=[CaptionPatch("fresh", 1, 2)])
            patched_draft = json.loads(draft_path.read_text(encoding="utf-8"))
            text_tracks = [track for track in patched_draft["tracks"] if track["type"] == "text"]
            text_material_ids = {material["id"] for material in patched_draft["materials"]["texts"]}
            animation_ids = {material["id"] for material in patched_draft["materials"]["material_animations"]}

            self.assertEqual(len(text_tracks), 1)
            self.assertNotIn("old-text-1", text_material_ids)
            self.assertNotIn("old-text-2", text_material_ids)
            self.assertNotIn("old-animation-1", animation_ids)
            self.assertNotIn("old-animation-2", animation_ids)
            self.assertTrue(any("fresh" in material["content"] for material in patched_draft["materials"]["texts"]))


def create_project(root: Path) -> Path:
    timeline_root = root / "Timelines" / "timeline-1"
    timeline_root.mkdir(parents=True)
    draft = {
        "id": "timeline-1",
        "duration": 10_000_000,
        "tracks": [
            {
                "id": "video-track",
                "type": "video",
                "segments": [
                    {
                        "id": "video-segment",
                        "source_timerange": {"start": 0, "duration": 10_000_000},
                        "target_timerange": {"start": 0, "duration": 10_000_000},
                        "render_timerange": {"start": 0, "duration": 0},
                        "speed": 1,
                        "material_id": "video-material",
                        "extra_material_refs": [],
                        "render_index": 0,
                        "track_render_index": 0,
                        "visible": True,
                    }
                ],
                "flag": 0,
                "attribute": 0,
                "name": "",
                "is_default_name": True,
            }
        ],
        "materials": {
            "videos": [{"id": "video-material", "duration": 10_000_000, "has_audio": True}],
            "texts": [],
            "material_animations": [],
        },
    }
    meta = {"tm_duration": 10_000_000}
    timelines_project = {"main_timeline_id": "timeline-1", "timelines": [{"id": "timeline-1"}]}

    write_json(root / "draft_info.json", draft)
    write_json(root / "draft_meta_info.json", meta)
    write_json(root / "template-2.tmp", draft)
    write_json(root / "Timelines" / "project.json", timelines_project)
    write_json(timeline_root / "draft_info.json", draft)
    write_json(timeline_root / "template-2.tmp", draft)
    return root


def create_text_track(track_id: str, material_id: str, animation_id: str) -> dict:
    return {
        "id": track_id,
        "type": "text",
        "segments": [
            {
                "id": f"{track_id}-segment",
                "source_timerange": None,
                "target_timerange": {"start": 0, "duration": 1_000_000},
                "render_timerange": {"start": 0, "duration": 0},
                "material_id": material_id,
                "extra_material_refs": [animation_id],
                "render_index": 14_000,
                "track_render_index": 1,
                "visible": True,
            }
        ],
    }


def create_audio_track() -> dict:
    return {
        "id": "audio-track",
        "type": "audio",
        "segments": [
            {
                "id": "audio-segment",
                "source_timerange": {"start": 0, "duration": 10_000_000},
                "target_timerange": {"start": 0, "duration": 10_000_000},
                "render_timerange": {"start": 0, "duration": 0},
                "speed": 1,
                "material_id": "audio-material",
                "extra_material_refs": [],
                "render_index": 0,
                "track_render_index": 0,
                "visible": True,
            }
        ],
        "flag": 0,
        "attribute": 0,
        "name": "",
        "is_default_name": True,
    }


def create_text_material(material_id: str, text: str, *, text_type: str = "subtitle") -> dict:
    return {
        "id": material_id,
        "type": text_type,
        "content": json.dumps({"text": text, "styles": []}, separators=(",", ":")),
    }


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
