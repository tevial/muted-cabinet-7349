# CapCut Cut Export Plan

## Goal

Support two export levels:

1. SRT export for captions only.
2. CapCut draft rewrite export for timeline cuts and styled captions.

Skip zones are the source of truth for cut intent. A skip zone means the media
range should be removed from the final edit, while the caption data remains
recoverable inside the editor if the skip zone is moved or deleted.

## Current Reliable Path

The current reliable export remains SRT:

- User imports source video into CapCut.
- User imports the exported `.srt`.
- CapCut creates timed text blocks from the SRT cues.
- Video cutting is manual in CapCut.

SRT does not contain media edit instructions, clip splits, or delete ranges.

## Draft Rewrite Path

The direct-cut path should be implemented as a separate exporter, not as a
replacement for SRT.

1. User selects or drops a CapCut project folder.
2. App verifies a supported draft structure and makes a timestamped backup.
3. App reads draft metadata and identifies the main video/audio/text tracks.
4. App converts editor skip zones into kept ranges.
5. App rewrites track segments so media inside skip zones is removed.
6. App imports or updates caption text segments from the editor groups.
7. App writes the active draft files after timestamped backups are created.
8. User reopens the project in CapCut and verifies the timeline.

## CapCut Project Import Path

CapCut project import uses two separate artifacts:

1. `CapCutTimelineMap` is the source of truth.
2. Rendered audio stems are derived playback artifacts.

The editor must never infer project structure from waveform pixels or rendered
audio. It reads structure from the timeline map, then uses WaveSurfer only for
playback, waveform rendering, zoom, and interaction.

### CapCutTimelineMap

The timeline map normalizes the draft into:

- `tracks`: all timeline tracks with typed segment arrays.
- `segments`: source and target timing, material refs, speed, volume,
  visibility, render indexes, and marker refs.
- `materials`: deduplicated source media references by material id.
- `markers`: timeline markers plus source/beat markers projected into project
  time when possible.
- `projectGaps`: true empty target-time ranges where no audible media segment
  exists.
- `sourceCutBoundaries`: zero-duration project-time boundaries where neighboring
  segments from the same source media hide a recoverable source range.

### Audio Stems

For UI playback, the backend renders one stem per audible CapCut video/audio
track:

- Video segments with embedded audio contribute to their track stem.
- Audio tracks contribute to their own stems.
- Per-track target-time gaps remain silence inside that stem.
- Track stems are derived cache files and can be regenerated from the timeline
  map.
- Each segment must be physically placed at `targetStart` before mixdown by
  prefixing real silence, clamping the clip to `target_timerange.duration`, and
  padding the per-segment stream to project duration. Do not rely on PTS-only
  delay behavior before `amix`; it can collapse trimmed segments toward the
  beginning of the rendered stem.

`wavesurfer-multitrack` should be the primary UI foundation once the project
import UI replaces the temporary single-stem compatibility path. It supports
synced tracks, `startPosition`, cue ranges, markers, volume, zoom, and a shared
cursor. A master mix can still be generated later for final-result
transcription, but it is not the editor's source of truth.

### Timeline Object Types

The UI should keep visually and semantically separate timeline objects:

- `manualSkipZone`: user-created removal intent; editable and exported.
- `detectedSilenceZone`: waveform-derived silence suggestion; editable before
  confirmation.
- `projectGap`: empty target-time range imported from CapCut; displayed with a
  project-origin style.
- `sourceCutBoundary`: point boundary where CapCut already collapsed a hidden
  source range; opens a source preview/restoration flow instead of behaving like
  a wide skip zone.

### Source Cut Boundary Flow

A source cut boundary is restore-capable only when adjacent segments:

- are in the same track;
- reference the same source media path;
- are target-adjacent within a small tolerance;
- are not reversed;
- have compatible speed.

Clicking a source cut boundary should open a source preview panel. The backend
can render the hidden source range on demand with `ffmpeg`, letting the user
restore the whole hidden range or a selected subrange. Restoring inserts a new
segment into the timeline map between the neighboring segments and shifts later
target ranges. Hiding it again removes that inserted segment and recreates a
source cut boundary.

### Implementation Status, 2026-05-31

Implemented foundation:

- Backend `CapCutTimelineMap` extraction from draft folders.
- Backend per-track audio stem rendering with `ffmpeg`.
- Backend source-cut hidden-range preview rendering.
- Browser CapCut import/source-preview client contracts.
- Workbench import dialog with Local Agent project picker fallback to manual
  project path.
- Read-only project-gap/source-cut/marker overlays on the existing WaveSurfer
  timeline.
- Read-only `wavesurfer-multitrack` preview for imports that return multiple
  stems.

Verification run:

- `python3 -m unittest discover -s apps/api/tests`
- `python3 -m compileall apps/api/app`
- live API checks for `/api/capcut/timeline-map`, `/api/capcut/import`, and
  source-preview rendering against project `0531`
- `npm --prefix apps/web run lint`
- `npm --prefix apps/web run build`

Remaining work:

- Replace the single-stem compatibility playback path with a full multitrack
  timeline adapter while preserving caption Regions and skip-zone editing.
- Add the source-cut restore/hide editor flow that mutates the timeline map.
- Validate imports against a fixture with truly separate overlapping media
  tracks. The current `0531` sample still renders as one audible media stem.

## Observed CapCut 8.7.5 Mac Draft Shape

Sample inspected:
`/Users/tevial/Movies/CapCut/User Data/Projects/com.lveditor.draft/0530 (1)`.

- Main timeline id lives in `Timelines/project.json` as `main_timeline_id`.
- The active timeline payload is duplicated in root `draft_info.json` and
  `Timelines/<main_timeline_id>/draft_info.json`.
- In this sample, root `template-2.tmp`, nested `template-2.tmp`, and both
  `draft_info.json.bak` files are byte-identical to `draft_info.json`.
- Project timing is microsecond-based. `duration: 281466666` means
  `281.466666s`.
- The draft has one `video` track with one segment.
- The segment points at `materials.videos[0]` through `material_id`.
- The source video has `has_audio: true`, so splitting the video segment also
  removes the embedded audio for this simple project shape.
- The relevant segment timing fields are:
  - `source_timerange.start` / `source_timerange.duration`: range inside the
    original source media.
  - `target_timerange.start` / `target_timerange.duration`: range on the edited
    CapCut timeline.
- `draft_meta_info.json.tm_duration` mirrors the timeline duration and must be
  updated with the shortened duration.

After importing an SRT into the same sample project:

- CapCut added a second track with `type: "text"`.
- The text track has `201` `segments`.
- `materials.texts` has one material per text segment.
- `materials.material_animations` has one empty `sticker_animation` material per
  text segment.
- Each text segment has:
  - `source_timerange: null`;
  - `target_timerange.start` and `target_timerange.duration` in microseconds;
  - `material_id` pointing to one `materials.texts[]` item;
  - `extra_material_refs` with one id pointing to one
    `materials.material_animations[]` item;
  - `clip.transform.y: -0.8`, which places the imported subtitle near the
    bottom of the portrait canvas.
- Each subtitle material has:
  - `type: "subtitle"`;
  - `content` as a JSON string with `{ "text": "...", "styles": [...] }`;
  - a single style range `[0, text.length]`;
  - white solid fill and system font
    `/Applications/CapCut.app/Contents/Resources/Font/SystemFont/en.ttf`;
  - `font_size: 11`, `text_size: 30`, `line_max_width: 0.82`;
  - `words` and `current_words` present but empty arrays for imported SRT.
- `draft_meta_info.json.draft_materials` gained a `type: 2` entry pointing to
  the imported `.srt` file. This appears to be asset-library metadata, not the
  timeline subtitle source of truth.
- CapCut rewrote `.bak` and `template-2.tmp` to match current `draft_info.json`
  after SRT import, so they cannot be treated as immutable before-state
  backups.

Updated sample inspected:
`/Users/tevial/Movies/CapCut/User Data/Projects/com.lveditor.draft/0531`.

- The active timeline is still duplicated across root `draft_info.json`, nested
  `Timelines/<main_timeline_id>/draft_info.json`, root `template-2.tmp`, and
  nested `template-2.tmp`.
- The project duration is `133733333us` (`133.733333s`).
- The sample currently has three tracks in `tracks[]`:
  - one `video` track with `42` segments;
  - one imported caption `text` track with `206` segments;
  - one additional `text` track with `8` segments.
- Although the editor view was used to add another video source, this specific
  draft still serializes media as one `video` track. The added source appears as
  additional video segments in that same track.
- The primary source video appears in the first `37` video segments. The second
  source video appears in the final `5` video segments.
- `materials.videos` may contain repeated entries for the same material id, so
  import code must deduplicate by id and avoid assuming a one-to-one
  material-entry-to-source-file relationship.
- Video segment identity and media timing are still driven by:
  - `segment.material_id` -> `materials.videos[].id`;
  - `segment.source_timerange` for source media time;
  - `segment.target_timerange` for project timeline time;
  - `segment.speed`, `segment.volume`, `segment.visible`,
    `segment.track_render_index`, and `segment.render_index` for playback and
    layering-related metadata.

## Observed CapCut Markers

The updated `0531` sample includes user-created markers.

- Timeline-level markers live at top-level `draft_info.time_marks`.
  - Shape: `{ id, mark_items: [{ id, time_range, color, title }] }`.
  - `time_range.start` is timeline time in microseconds.
  - The sample contains `Marker 02` at `119166666us`.
- Segment/source markers are stored as materials and then referenced by video
  segments through `segment.extra_material_refs`.
  - Visual marker metadata lives in `materials.time_marks[]`.
  - Beat marker metadata lives in `materials.beats[]`.
  - Each marked segment contains both referenced ids in
    `extra_material_refs`.
- `materials.time_marks[]` shape:
  - `{ id, mark_items: [{ id, time_range, color, title }] }`.
  - `time_range.start` is source/material time in microseconds for that marker.
  - Marker duration is `0` for point markers in the inspected sample.
- `materials.beats[]` shape:
  - `{ id, type: "beats", enable_ai_beats, user_beats, ai_beats, ... }`.
  - `user_beats[]` mirrors the marker time in microseconds, sometimes with a
    one-microsecond rounding difference from `materials.time_marks`.
- When cutting or remapping segments, marker refs should be preserved only when
  the marker still falls inside the kept source slice. For a marker that remains
  valid after a split, its source/material time should remain attached to the
  cloned segment's refs; for a marker that falls inside a removed range, the
  cloned segment should not keep that marker ref.

## First Supported Patch Shape

Start with the narrow shape seen in the sample:

- one main timeline;
- one primary `video` track;
- one source video material;
- one original segment;
- `speed === 1`;
- no transitions or overlays;
- at most one existing text track, which can be replaced with app-generated
  subtitles.

For each kept range `[start, end]` from the editor:

1. Clone the original video segment.
2. Assign a new segment id.
3. Set `source_timerange.start` to `start * 1_000_000`.
4. Set `source_timerange.duration` to `(end - start) * 1_000_000`.
5. Set `target_timerange.start` to the accumulated kept duration.
6. Set `target_timerange.duration` to the same kept duration.
7. Keep `material_id` and visual/audio properties unchanged.

Then set `draft_info.duration` and `draft_meta_info.tm_duration` to the sum of
all kept durations.

For captions, prefer a template-clone strategy:

1. If a text track already exists, remove or replace app-managed subtitle
   segments and app-managed subtitle materials.
2. Clone the first existing imported subtitle segment, text material, and
   material animation as style templates.
3. Generate one text segment per exported caption group.
4. Remap each caption group's original source time into the cut timeline by
   subtracting the durations of skip zones before it.
5. Drop captions that fall fully inside skip zones.
6. Clip captions that partially overlap kept ranges.
7. Update `content` JSON text and style range to match the generated caption
   text.
8. Add the new text materials and one empty `sticker_animation` material for
   each caption.

## Implementation Phases

### Phase 1: Inspect Only

- Add a local draft reader for `draft_info.json`, `Timelines/project.json`,
  nested timeline `draft_info.json`, and related metadata files.
- Display project duration, tracks, media references, and segment counts.
- Do not write files yet.
- Capture anonymized schema samples for our own test fixtures.

### Phase 2: Export Cut Manifest

- Export a simple JSON manifest from this app:
  - source media fingerprint/name
  - kept ranges
  - caption groups
- This gives the CLI and API a stable internal contract before touching CapCut
  files.

### Phase 3: Safe Draft Patch Prototype

- Patch the original test project folder after creating timestamped backups of
  every file that will be rewritten.
- Patch only one simple project shape first: one primary video track with
  embedded audio.
- Convert seconds to CapCut's microsecond-based timing.
- Preserve media source offsets while closing timeline gaps.
- Write patched timeline payloads to root `draft_info.json`, nested timeline
  `draft_info.json`, `draft_meta_info.json`, and `template-2.tmp` files when
  they exist. Do not update CapCut's own `.bak` files.
- Add validation that segment durations, target ranges, and material references
  remain positive and linked.

### Phase 4: Captions In Draft

- Import captions into a text track by cloning an existing CapCut subtitle
  segment/material/animation as the style template when available.
- Keep SRT export as fallback.
- Add a preview/report of created text segment count and timing range.

### Phase 5: Broader Project Support

- Support separate audio tracks, multi-clip timelines, overlays, linked effects,
  transitions, and projects with existing captions.
- Add compatibility checks by CapCut version/platform.
- Keep a project backup and rollback path mandatory.

## Safety Rules

- For test projects, patch the original draft folder only after timestamped
  backups are created next to each rewritten file.
- For irreplaceable projects, duplicate the project before patching.
- Require CapCut to be closed before writing draft files.
- Preserve original files and write backups before every patch.
- Start with inspect-only and explicit user confirmation before destructive
  rewrite behavior.
- Treat CapCut draft files as undocumented and version-sensitive.

## Open Questions

- Which CapCut Desktop version and platform should be the first supported target?
- How should audio-only source files map back to the original video file?
- Should captions be imported as plain SRT-style text segments first, or should
  we require a styled text template segment in the CapCut project?
