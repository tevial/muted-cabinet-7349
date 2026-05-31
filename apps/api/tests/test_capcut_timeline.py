from __future__ import annotations

import json
import math
import shutil
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.capcut_timeline import _render_track_stem, build_capcut_timeline_map


class CapCutTimelineMapTest(unittest.TestCase):
    def test_timeline_map_deduplicates_materials_and_finds_source_cut_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            timeline_map = build_capcut_timeline_map(project)

            self.assertEqual(timeline_map["duration"], 6)
            self.assertEqual(len(timeline_map["materials"]), 1)
            self.assertEqual(timeline_map["projectGaps"], [])
            self.assertEqual(len(timeline_map["sourceCutBoundaries"]), 1)

            boundary = timeline_map["sourceCutBoundaries"][0]
            self.assertEqual(boundary["hiddenSourceStart"], 2)
            self.assertEqual(boundary["hiddenSourceEnd"], 8)
            self.assertEqual(boundary["projectPosition"], 2)
            self.assertTrue(boundary["canRestore"])

    def test_timeline_map_projects_timeline_and_source_markers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project = create_project(Path(temp_dir))
            timeline_map = build_capcut_timeline_map(project)
            markers = timeline_map["markers"]

            self.assertEqual({marker["scope"] for marker in markers}, {"timeline", "source", "source-beat"})
            source_marker = next(marker for marker in markers if marker["scope"] == "source")
            beat_marker = next(marker for marker in markers if marker["scope"] == "source-beat")
            timeline_marker = next(marker for marker in markers if marker["scope"] == "timeline")

            self.assertEqual(source_marker["projectTime"], 1)
            self.assertEqual(beat_marker["projectTime"], 1)
            self.assertEqual(timeline_marker["time"], 3)

    @unittest.skipIf(shutil.which("ffmpeg") is None, "ffmpeg is required for stem rendering")
    def test_stem_render_places_segments_at_target_time(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source_path = root / "source.wav"
            stem_path = root / "stem.wav"
            write_stereo_probe_wav(source_path)

            warnings = _render_track_stem(
                [
                    render_segment("left", source_path, source_start=0, target_start=0),
                    render_segment("right", source_path, source_start=2, target_start=2),
                ],
                stem_path,
                3,
            )

            self.assertEqual(warnings, [])
            self.assertGreater(channel_rms(stem_path, 0.25, 0), 0.2)
            self.assertLess(channel_rms(stem_path, 0.25, 1), 0.02)
            self.assertLess(channel_rms(stem_path, 1.25, 0), 0.02)
            self.assertLess(channel_rms(stem_path, 1.25, 1), 0.02)
            self.assertLess(channel_rms(stem_path, 2.25, 0), 0.02)
            self.assertGreater(channel_rms(stem_path, 2.25, 1), 0.2)


def create_project(root: Path) -> Path:
    timeline_root = root / "Timelines" / "timeline-1"
    timeline_root.mkdir(parents=True)
    draft = {
        "id": "timeline-1",
        "duration": 6_000_000,
        "tracks": [
            {
                "id": "video-track",
                "type": "video",
                "segments": [
                    segment("left", 0, 2_000_000, 0, 2_000_000, ["source-mark", "beat-mark"]),
                    segment("right", 8_000_000, 4_000_000, 2_000_000, 4_000_000, []),
                ],
                "flag": 0,
                "attribute": 0,
                "name": "",
                "is_default_name": True,
            }
        ],
        "materials": {
            "videos": [
                {
                    "id": "video-material",
                    "duration": 12_000_000,
                    "has_audio": True,
                    "path": "/tmp/source.mp4",
                    "material_name": "source.mp4",
                    "type": "video",
                },
                {
                    "id": "video-material",
                    "duration": 12_000_000,
                    "has_audio": True,
                    "path": "/tmp/source.mp4",
                    "material_name": "source.mp4",
                    "type": "video",
                },
            ],
            "time_marks": [
                {
                    "id": "source-mark",
                    "mark_items": [
                        {
                            "id": "source-marker",
                            "time_range": {"start": 1_000_000, "duration": 0},
                            "title": "Source marker",
                            "color": "#00c1cd",
                        }
                    ],
                }
            ],
            "beats": [
                {
                    "id": "beat-mark",
                    "type": "beats",
                    "enable_ai_beats": False,
                    "user_beats": [1_000_000],
                    "ai_beats": {},
                }
            ],
        },
        "time_marks": {
            "id": "timeline-marks",
            "mark_items": [
                {
                    "id": "timeline-marker",
                    "time_range": {"start": 3_000_000, "duration": 0},
                    "title": "Timeline marker",
                    "color": "#00c1cd",
                }
            ],
        },
    }
    meta = {"tm_duration": 6_000_000}
    timelines_project = {"main_timeline_id": "timeline-1", "timelines": [{"id": "timeline-1"}]}

    write_json(root / "draft_info.json", draft)
    write_json(root / "draft_meta_info.json", meta)
    write_json(root / "template-2.tmp", draft)
    write_json(root / "Timelines" / "project.json", timelines_project)
    write_json(timeline_root / "draft_info.json", draft)
    write_json(timeline_root / "template-2.tmp", draft)
    return root


def segment(
    segment_id: str,
    source_start: int,
    source_duration: int,
    target_start: int,
    target_duration: int,
    refs: list[str],
) -> dict:
    return {
        "id": segment_id,
        "source_timerange": {"start": source_start, "duration": source_duration},
        "target_timerange": {"start": target_start, "duration": target_duration},
        "render_timerange": {"start": 0, "duration": 0},
        "speed": 1,
        "volume": 1,
        "material_id": "video-material",
        "extra_material_refs": refs,
        "render_index": 0,
        "track_render_index": 0,
        "visible": True,
    }


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def render_segment(segment_id: str, source_path: Path, *, source_start: float, target_start: float) -> dict:
    return {
        "id": segment_id,
        "materialPath": str(source_path),
        "sourceStart": source_start,
        "sourceDuration": 0.5,
        "targetStart": target_start,
        "duration": 0.5,
        "speed": 1,
        "volume": 1,
    }


def write_stereo_probe_wav(path: Path) -> None:
    sample_rate = 44_100
    amplitude = 0.5
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for sample_index in range(sample_rate * 4):
            timestamp = sample_index / sample_rate
            left = 0.0
            right = 0.0
            if 0 <= timestamp < 0.5:
                left = amplitude * math.sin(2 * math.pi * 440 * timestamp)
            if 2 <= timestamp < 2.5:
                right = amplitude * math.sin(2 * math.pi * 880 * timestamp)
            frames.extend(struct.pack("<hh", int(left * 32767), int(right * 32767)))
        wav.writeframes(frames)


def channel_rms(path: Path, timestamp: float, channel: int) -> float:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        window_frames = int(sample_rate * 0.1)
        start_frame = int(timestamp * sample_rate)
        wav.setpos(start_frame)
        frames = wav.readframes(window_frames)

    samples = struct.unpack("<" + "h" * (len(frames) // 2), frames)
    channel_samples = samples[channel::channels]
    if not channel_samples:
        return 0.0
    return math.sqrt(sum((sample / 32767) ** 2 for sample in channel_samples) / len(channel_samples))


if __name__ == "__main__":
    unittest.main()
