# WaveSurfer Refactor Plan

Date: 2026-05-30

This document captures the WaveSurfer.js documentation audit and the refactor
plan for replacing custom timeline/waveform behavior with official WaveSurfer
APIs and plugins wherever possible.

## Sources Reviewed

- Main examples index: <https://wavesurfer-js.pages.dev/>
- TypeDoc root/API: <https://wavesurfer-js.pages.dev/docs/>
- Current official docs mirror: <https://wavesurfer.xyz/docs/>
- Core API: `WaveSurfer`, `WaveSurferOptions`, `WaveSurferEvents`
- Official plugins: `Zoom`, `Regions`, `Timeline`, `Hover`, `Minimap`,
  `Envelope`, `Record`, `Spectrogram`
- Official examples: basic, options, zoom, regions, hover, timeline, timeline x2,
  minimap, envelope, spectrogram, record, video, speed, bars, styling, gradient,
  SoundCloud, Web Audio, silence, pitch, split channels, custom render, React,
  pre-decoded, multi-track, vowels, FM synth
- Local installed package: `wavesurfer.js@7.12.7`, BSD-3-Clause
- Local package type definitions under `apps/web/node_modules/wavesurfer.js/dist`

## High-Level Conclusion

We should treat WaveSurfer as the owner of waveform rendering, scrolling,
zooming, hover cursor, timeline ticks, minimap navigation, region hit-testing,
and region drag/resize. Our current custom canvas timeline duplicates too much
of that behavior and is the main reason zoom, scroll, large-scale rendering, and
hit-testing feel fragile.

The right architecture is a thin React/controller layer around WaveSurfer and
its plugins. Caption domain logic should remain ours, but visual media timeline
behavior should come from WaveSurfer first.

## What We Did Poorly

1. We used WaveSurfer only as a passive waveform renderer.
   `AudioWaveform` creates a WaveSurfer instance, but disables interaction,
   hides the scrollbar, omits official plugins, and drives zoom externally.

2. We created a separate native `<audio>` element for playback.
   The app now has one media element for playback and another WaveSurfer-owned
   audio/media layer for drawing. This splits the source of truth for time,
   seek, playback, and ready state.

3. We duplicated WaveSurfer's timeline system.
   `CaptionTimeline` manually renders ticks and labels on canvas, even though
   `TimelinePlugin` already recalculates notches and labels based on zoom.

4. We duplicated WaveSurfer's zoom anchoring.
   `timelineScale.ts` and `handleTimelineWheel` implemented our own wheel
   threshold, pointer anchoring, and scroll restoration. `ZoomPlugin` already
   supports wheel zoom, delta thresholds, exponential zooming, max zoom, touch
   pinch, horizontal-wheel guarding, and pointer-time anchoring.

5. We duplicated WaveSurfer's interactive regions.
   Caption groups are currently custom canvas chips with custom hit boxes.
   `RegionsPlugin` already supports regions with ids, start/end, HTML content,
   color, drag, resize, min/max length, click/double-click, update/update-end,
   and region playback.

6. We rendered a fragile custom canvas layer.
   WaveSurfer internally splits waveform drawing across multiple canvases and
   lazily renders visible chunks. Our canvas layer had to invent viewport
   drawing, transforms, scroll measurements, and hit boxes. That is the exact
   class of behavior WaveSurfer's renderer already handles better.

7. We missed built-in navigation affordances.
   `HoverPlugin` gives cursor-following time labels. `MinimapPlugin` gives a
   compact navigation waveform and viewport overlay. These should replace our
   custom hover/title and manual scroll mental model.

8. We treated silence detection as a product-only domain feature.
   WaveSurfer has an official silence example built on `getDecodedData()` and
   `RegionsPlugin`. It is an example, not a packaged `silence` plugin in
   `wavesurfer.js@7.12.7`, but the library-supported pattern is clear.

## Useful WaveSurfer Capabilities

### Core Options

Use these as the single source of visual timeline behavior:

- `height`
- `width`
- `waveColor`
- `progressColor`
- `cursorColor`
- `cursorWidth`
- `barWidth`
- `barGap`
- `barRadius`
- `barHeight`
- `barAlign`
- `barMinHeight`
- `minPxPerSec`
- `fillParent`
- `interact`
- `dragToSeek`
- `hideScrollbar`
- `autoScroll`
- `autoCenter`
- `sampleRate`
- `splitChannels`
- `normalize`
- `maxPeak`
- `peaks`
- `duration`
- `media`
- `mediaControls`
- `renderFunction`

Important current-version notes from local types:

- `play(start?: number, end?: number)` can replace much of our segment loop
  playback plumbing.
- `setTime(time)` and `setScrollTime(time)` are better integration points than
  computing scroll positions from DOM widths.
- `exportPeaks()` can feed a second visual WaveSurfer instance without decoding
  the same audio twice.
- `loadBlob()` exists in `7.12.7`, so local files can be loaded without object
  URL handoffs if we want that later.
- `setOptions()` is the supported way to change visual options after creation.

### Zoom Plugin

Use `wavesurfer.js/dist/plugins/zoom.esm.js`.

What it gives:

- Wheel zoom on the WaveSurfer container.
- Ignores horizontal gestures when `abs(deltaX) >= abs(deltaY)`.
- Anchors zoom to the timestamp under the pointer.
- `deltaThreshold` to control trackpad/wheel sensitivity.
- `scale` for linear zoom step size.
- `exponentialZooming` and `iterations` for smoother perceived scaling.
- `maxZoom`.
- Pinch-to-zoom support through touch events.

This should replace:

- `timelineZoomWheelThreshold`
- `normalizeTimelineWheelDeltaY`
- `getTimelineZoomStep`
- `getAnchoredTimelineScrollLeft`
- `handleTimelineWheel`
- most of `timelineScale.ts`

### Timeline Plugin

Use `wavesurfer.js/dist/plugins/timeline.esm.js`.

What it gives:

- Time notches and labels under the waveform.
- Automatic redraw on zoom/scroll.
- `container` option for placing the timeline outside the default waveform
  container.
- `insertPosition: 'beforebegin'` for top timelines.
- `height`
- `timeInterval`
- `primaryLabelInterval`
- `secondaryLabelInterval`
- `primaryLabelSpacing`
- `secondaryLabelSpacing`
- `timeOffset`
- `formatTimeCallback`
- custom inline `style`

This should replace:

- `getTimelineTicks`
- canvas-drawn ruler labels in `CaptionTimeline`
- CSS grid ruler backgrounds when they try to duplicate time ticks

### Regions Plugin

Use `wavesurfer.js/dist/plugins/regions.esm.js`.

What it gives:

- `addRegion({ id, start, end, content, color, drag, resize, minLength,
  maxLength, resizeStart, resizeEnd, channelIdx, contentEditable })`
- `clearRegions()`
- `getRegions()`
- `enableDragSelection()`
- `region-clicked`
- `region-double-clicked`
- `region-update`
- `region-updated`
- `region-in`
- `region-out`
- `region-removed`
- per-region `play(stopAtEnd?: boolean)`
- per-region `setOptions({ start, end, color, content, drag, resize })`

This should replace:

- custom group hit boxes
- custom group canvas chips
- custom drag/resize code if we add direct timeline timing edits
- much of the "loop selected group" boundary watcher

### Hover Plugin

Use `wavesurfer.js/dist/plugins/hover.esm.js`.

What it gives:

- Cursor-following vertical hover line.
- Timestamp label.
- `lineColor`, `lineWidth`, `labelColor`, `labelSize`, `labelBackground`.
- `labelPreferLeft`.
- `formatTimeCallback`.

This should replace:

- custom hover cursor/title behavior on the canvas timeline.

### Minimap Plugin

Use `wavesurfer.js/dist/plugins/minimap.esm.js`.

What it gives:

- A small waveform overview.
- Viewport overlay.
- Same WaveSurfer visual options as the main waveform.
- Useful navigation affordance for long audio.

This should replace:

- any future custom overview/scrollbar UI.

### Split Channels

Use the core `splitChannels` option.

This gives separate channel waveforms with per-channel color/height options.
The docs note that a channel can be hidden by setting its height to `0`.

### Video

Use the core `media` option with an existing `<video>` element when the source is
video. WaveSurfer can render the waveform for the video element instead of
owning an independent audio element.

### Pre-Decoded Peaks

Use `peaks` plus `duration` for large media or for duplicated visual lanes.
The docs explicitly recommend pre-decoded peaks for large files because browser
decode can be memory-heavy and streaming needs peaks/duration.

### Silence Detection

There is no packaged `silence` plugin in `wavesurfer.js@7.12.7`. The official
example uses:

- `wavesurfer.getDecodedData()`
- channel data from `decodedData.getChannelData(0)`
- threshold-based silent-region extraction
- `RegionsPlugin` to render detected non-silent/silent segments

Our current `emptyZones.ts` is not the same thing: it infers empty zones from
word gaps in transcription data. That is still useful for caption grouping, but
real audio silence detection should be implemented as a WaveSurfer-backed
feature using decoded audio data and Regions.

### React Integration

The official React package is `@wavesurfer/react`.

Important rule from its README: plugin arrays must be memoized with `useMemo` or
defined outside React components, because WaveSurfer mutates plugin instances
during initialization.

We can either:

- install `@wavesurfer/react` and use `useWavesurfer`, or
- keep our own hook, but it must follow the same lifecycle rule: stable plugin
  instances, explicit cleanup, minimal React state writes during playback.

Using the official React package is preferred unless it blocks plugin access.

## Target Architecture

### Ownership

- Caption domain remains the source of truth for `CaptionWord`,
  `CaptionGroup`, grouping, SRT export, and keyboard/document editing.
- WaveSurfer becomes the source of truth for media playback, waveform rendering,
  scroll, zoom, hover cursor, timeline ticks, minimap, and region interaction.
- React components coordinate domain state with WaveSurfer plugin state; they do
  not redraw waveform/timeline primitives themselves.

### Proposed Feature Components

```text
CaptionWorkbench
  owns words/groups/settings/file/transcription/cache/export
  uses WaveSurfer timeline model

WaveSurferTimeline
  owns WaveSurfer instance(s), plugins, lifecycle, plugin event subscriptions
  emits typed events: select group, update group timing, play group, seek

WaveformLane
  top clean waveform with Timeline/Hover/Zoom/Minimap

CaptionRegionLane
  bottom time-synchronized waveform/region lane for caption groups

CaptionEditor
  right rail document-like text editor
```

### Two-Lane Layout

The user-facing layout should be:

```text
top lane:
  clean audio waveform
  timeline ticks
  hover cursor
  minimap/overview if useful

bottom lane:
  separate caption lane
  same time scale and scroll position
  caption groups represented as WaveSurfer Regions
  text content inside region DOM or styled region labels
```

We should not overlay caption groups on the only visible waveform. The clean
audio lane should remain inspectable.

### One Playback Owner

Avoid two independent playback engines.

Preferred approach:

1. Top WaveSurfer instance owns playback and media element.
2. Bottom caption-lane WaveSurfer is visual/synchronized only.
3. Bottom lane uses pre-decoded peaks from the top instance via `exportPeaks()`
   and `duration`, or is created after `decode` with the same peaks.
4. Zoom/scroll/time are synchronized through WaveSurfer events:
   - `zoom`
   - `scroll`
   - `timeupdate`
   - `seeking`
   - `interaction`

Fallback if duplicated visual instances prove problematic:

- Use one WaveSurfer instance for top waveform, then render caption Regions in
  the same WaveSurfer wrapper only temporarily.
- Revisit whether custom DOM labels under the waveform are necessary, but only
  after validating that `RegionsPlugin` cannot be positioned/styled into a
  separate lane.

## Refactor Plan

### Phase 1: Build A WaveSurfer Spike

Create an isolated prototype component or branch, not a broad rewrite.

Goals:

- One WaveSurfer instance with `Timeline`, `Hover`, `Zoom`, `Minimap`,
  `Regions`.
- Load local audio/video.
- Confirm smooth zoom with plugin configuration.
- Confirm large zoom does not blank the waveform.
- Confirm `splitChannels` and `normalize`.
- Confirm region drag/resize updates start/end as expected.
- Confirm `region.play(true)` or `wavesurfer.play(start, end)` can replace the
  current loop segment watcher.

Spike success criteria:

- Zoom feels as good as the official example.
- Plain horizontal trackpad scroll pans.
- Caption-region timing can be updated via `region-updated`.
- No custom canvas is needed for group chips or ruler ticks.

### Phase 2: Introduce A WaveSurfer Timeline Model

Add a feature-owned model, likely under:

```text
apps/web/src/features/caption-workbench/model/useWaveSurferTimeline.ts
```

Responsibilities:

- create/destroy WaveSurfer instance(s)
- create stable plugin instances
- expose current time, duration, ready state, playing state
- expose commands:
  - `playPause`
  - `playTimeline`
  - `playGroup(groupId)`
  - `seek(time)`
  - `zoom(minPxPerSec)`
  - `setScrollTime(time)`
- subscribe to plugin events and emit domain-level callbacks

Do not put grouping rules or storage here.

### Phase 3: Replace AudioWaveform

Replace `AudioWaveform` with a plugin-backed WaveSurfer lane.

Use options:

```ts
{
  height: 88,
  waveColor: '#c4d4cf',
  progressColor: '#14927f',
  cursorColor: '#173f39',
  cursorWidth: 2,
  barWidth: 2,
  barGap: 2,
  minPxPerSec,
  normalize: true,
  autoScroll: true,
  autoCenter: true,
  dragToSeek: { debounceTime: 80 },
  plugins: [
    Timeline.create(...),
    Hover.create(...),
    Zoom.create(...),
    Minimap.create(...),
  ],
}
```

Keep exact values adjustable, but the important rule is that the options live in
one typed config object instead of scattered CSS/React constants.

### Phase 4: Replace CaptionTimeline Canvas With Regions

Remove or deprecate `CaptionTimeline.tsx`.

Map groups to regions:

```ts
regions.addRegion({
  id: group.id,
  start: group.start,
  end: group.end,
  content: group.textOverride ?? group.text,
  color: selected ? selectedRegionColor : defaultRegionColor,
  drag: true,
  resize: true,
  minLength: timingNudgeStep,
})
```

Event mapping:

- `region-clicked` -> select group
- `region-double-clicked` -> play group
- `region-update` -> optional visual-only update
- `region-updated` -> commit timing through caption domain
- `region-in`/`region-out` -> optional active playback state

Update strategy:

- On React group changes, reconcile regions by id instead of clearing and
  recreating everything when possible.
- Commit region changes to the domain on `region-updated`, not every mousemove,
  unless live editor feedback is needed.
- Use `resizeStart`/`resizeEnd` if we need to lock one side for some commands.

### Phase 5: Replace Custom Zoom State

Remove:

- `timelineScalePresets`
- `timelineScaleIndex`
- `timelineContentStyle`
- custom wheel handler
- canvas tick calculation
- CSS `--minor-grid` / `--major-grid` dependency

Use:

- `ZoomPlugin`
- `wavesurfer.zoom(minPxPerSec)` for the slider
- `zoom` event to update a small label if needed
- plugin options for wheel smoothness:
  - `deltaThreshold`
  - `scale`
  - `maxZoom`
  - `exponentialZooming`
  - `iterations`

### Phase 6: Rework Playback

Stop using a standalone `<audio>` element as the primary playback surface.

Use WaveSurfer:

- `wavesurfer.play()`
- `wavesurfer.pause()`
- `wavesurfer.playPause()`
- `wavesurfer.play(start, end)` for segment playback
- `region.play(true)` for selected group playback when using Regions
- `wavesurfer.setTime(time)` for seek
- `timeupdate`, `audioprocess`, `finish`, `seeking`, `interaction`

Keep only the caption-specific decisions in `useTimelinePlayback`, or merge the
playback model into the new WaveSurfer timeline model.

### Phase 7: Silence And Empty Zones

Split the concepts:

- Transcript gap zones: derived from word timestamps and useful for captions.
- Audio silence zones: derived from decoded audio channel data and useful for
  crop suggestions.

Use the WaveSurfer silence example pattern:

1. On `decode`, call `wavesurfer.getDecodedData()`.
2. Analyze channel data with threshold/min-duration/merge settings.
3. Render silence/crop suggestions as non-editable Regions.
4. Keep transcript gap logic in the caption domain.

Do not call this a built-in plugin unless we add our own wrapper plugin.

### Phase 8: Documentation And Catalog Updates

Update:

- `docs/catalog/modules.md`
- `docs/catalog/ui-components.md`
- `apps/web/src/features/caption-workbench/README.md`
- `docs/product/runtime-view.md`
- `docs/product/workflows.md`

Document that WaveSurfer owns:

- waveform rendering
- zoom
- scroll
- timeline ticks
- minimap
- hover cursor
- region interaction

Document that our domain owns:

- word timestamps
- group boundaries
- grouping rules
- keyboard editing
- export

## Proposed Technical Decisions

1. Prefer official plugins over custom UI logic.
   Any custom timeline code needs a written reason: "plugin cannot support X".

2. Use Regions for caption groups.
   A caption group is a region with caption content and domain id.

3. Use ZoomPlugin for wheel/pinch zoom.
   The slider, if kept, should call `wavesurfer.zoom()` rather than setting a
   React preset index.

4. Use TimelinePlugin for ticks.
   No canvas-drawn ruler labels.

5. Use HoverPlugin for hover cursor.
   No custom title/cursor hover code for the timeline.

6. Use MinimapPlugin for overview.
   No custom mini overview until the plugin proves insufficient.

7. Use `splitChannels` and `normalize`.
   Do not implement our own channel rendering.

8. Use pre-decoded peaks for duplicated lanes and long files.
   Do not decode the same large source repeatedly if `exportPeaks()` can feed a
   second lane.

9. Avoid custom canvas for interactive timeline elements.
   WaveSurfer uses canvas internally, but it owns chunking, pixel ratio, lazy
   render, scroll containers, progress masks, and cursor rendering.

## Risks And Open Questions

- Can two WaveSurfer visual lanes be synchronized without perceptible drift?
- Can the bottom caption lane use exported peaks from the top lane immediately
  after decode, or do we need an intermediate peaks cache in app state?
- Can Regions content be styled cleanly enough for multi-word caption chips?
- Can Regions be placed in a visually separate bottom lane without fighting the
  plugin's internal wrapper? If not, use a second visual WaveSurfer instance.
- Does `@wavesurfer/react` simplify lifecycle enough to justify adding the
  dependency? It is official and BSD-3-Clause, but we should verify plugin
  instance access during the spike.
- For video sources, should WaveSurfer use the actual `<video>` element through
  `media`, or should audio extraction/transcription stay separate?
- How much silence detection should be audio-based versus transcript-gap-based?

## Implementation Status

The custom canvas timeline has been replaced by a WaveSurfer-owned model:

- `apps/web/src/features/caption-workbench/model/useWaveSurferTimeline.ts`
  owns WaveSurfer instances, official plugins, playback commands, caption region
  reconciliation, editable manual/automatic empty-zone skip overlays,
  temporary range selections, non-destructive caption masking, and two-lane
  zoom/scroll sync.
- `apps/web/src/features/caption-workbench/model/waveSurferTimelineConfig.ts`
  owns WaveSurfer visual options, zoom limits, timeline formatting, and caption
  region colors.
- `apps/web/src/components/WaveSurferTimeline.tsx` renders only DOM hosts for
  the time axis, clean waveform lane, and caption region lane.
- Removed the old canvas/DOM timeline path:
  - `AudioWaveform.tsx`
  - `CaptionTimeline.tsx`
  - `EmptyZoneOverlay.tsx`
  - `useTimelinePlayback.ts`
  - `timelineScale.ts`

The remaining custom logic is intentionally domain/control code:

- mapping `CaptionGroup` records to WaveSurfer Regions
- committing `region-updated` events back to caption timing
- keeping two WaveSurfer visual lanes synchronized
- translating the external Timeline plugin wrapper with the main waveform scroll
  so the shared time axis stays aligned at every zoom level
- scrolling the caption list and timeline to the same `selectedGroupId`
- preserving the project shortcut rule that wheel zoom requires
  `Ctrl`/`Command`
- skipping transcript-derived empty zones during full playback, using the
  adjusted skip regions when the user drags/resizes them
- deriving visible caption regions from source groups minus the active skip
  zones, so moving or deleting a skip zone restores the underlying captions
- using `RegionsPlugin.enableDragSelection(...)` for one temporary range
  selection. The range can be converted into a skip zone or sent to the local
  API for selected-segment transcription.

## Follow-Up Checks

The next product check should use real media and confirm:

1. Zoom feels like the official WaveSurfer Zoom example on trackpad and mouse.
2. Plain horizontal two-finger scrolling pans both lanes without zooming.
3. Caption region drag/resize commits cleanly to group timing and preserves
   keyboard shortcut behavior.
4. Segment loop playback starts and stops exactly on the selected group region.
5. The lower caption lane remains visually separate from the clean waveform lane.
6. Edited empty-zone skip regions are visually clear and playback skips the
   adjusted intervals.
7. Selecting a region scrolls the right list to that group, and selecting a row
   scrolls the timeline back to the region.
