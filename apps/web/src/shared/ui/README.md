# Shared UI

Small Tailwind utility layer for reusable presentation patterns.

- `styles.ts` owns shared Tailwind class strings for buttons, panels, dialogs,
  timeline hosts, and repeated editor controls.
- `classNames.ts` exports `cx`, the local class-name combiner used by UI
  components for conditional Tailwind utilities.

Keep durable UI styling here when the same pattern appears in multiple
components. Feature-specific layout can stay beside the feature view. Global CSS
is limited to `src/index.css`, which imports Tailwind, defines theme color
tokens, and bridges unavoidable WaveSurfer `::part(...)` selectors.

The app shell now uses the dark `#141414` body color. Toolbar and timeline
styling have dedicated token families (`toolbar-*`, `timeline-*`) so the editor
chrome can keep a consistent Paper-inspired surface while light dialogs and the
caption rail are migrated in later passes.
