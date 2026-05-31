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
            self.assertEqual(summary["captionSegments"], 4)
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


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
