const buttonBase =
  'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-bold transition-[border-color,background,color,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Shared Tailwind presentation primitives used by workbench UI components.
 * Keep repeated visual patterns here so component files stay declarative.
 */
export const ui = {
  appShell:
    'min-h-screen bg-page text-text',
  topbar:
    'sticky top-0 z-20 flex max-w-[100vw] items-center justify-between gap-6 bg-toolbar-bg p-2 text-xs leading-4 antialiased max-[760px]:flex-col max-[760px]:items-stretch max-[760px]:overflow-visible',
  brand: 'flex min-w-60 items-center gap-3',
  brandMark: 'grid size-9 place-items-center rounded-lg bg-accent-ink text-white',
  brandTitle: 'block font-[750] text-heading',
  brandSubtitle: 'block text-xs text-muted',
  toolbar:
    'relative flex w-full items-center justify-between gap-6 max-[760px]:grid max-[760px]:grid-cols-1 max-[760px]:gap-3',
  toolbarGroup: 'flex items-start gap-2 max-[760px]:flex-wrap',
  toolbarActions: 'flex items-start gap-2 max-[760px]:flex-wrap max-[760px]:justify-end',
  toolbarCenterActions:
    'absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-start gap-1 max-[760px]:static max-[760px]:order-3 max-[760px]:translate-x-0 max-[760px]:translate-y-0 max-[760px]:justify-center',
  toolbarPopoverAnchor: 'relative inline-flex max-[760px]:block max-[760px]:min-w-0',
  toolbarButtonMobile: 'max-[760px]:w-full max-[760px]:min-w-0 max-[760px]:overflow-hidden max-[760px]:px-2 max-[760px]:text-xs max-[760px]:whitespace-nowrap',
  toolbarPrimaryButton:
    'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-toolbar-primary px-3 py-2 text-[13px] font-bold text-toolbar-primary-ink transition-colors duration-150 hover:bg-toolbar-primary-hover disabled:cursor-not-allowed disabled:opacity-50',
  toolbarSecondaryButton:
    'inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border-0 bg-toolbar-secondary px-3 py-2 text-[13px] font-bold text-toolbar-ink transition-colors duration-150 hover:bg-toolbar-secondary-hover disabled:cursor-not-allowed disabled:opacity-50',
  toolbarIconButton:
    'inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-toolbar-secondary p-0 text-toolbar-ink transition-colors duration-150 hover:bg-toolbar-secondary-hover disabled:cursor-not-allowed disabled:opacity-50',
  toolbarMenu:
    'absolute right-0 top-[calc(100%+8px)] z-40 grid min-w-48 gap-1 rounded-lg border border-toolbar-menu-border bg-toolbar-menu p-1.5 shadow-popover',
  toolbarMenuItem:
    'inline-flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[13px] font-bold text-toolbar-ink transition-colors duration-150 hover:bg-toolbar-secondary-hover disabled:cursor-not-allowed disabled:opacity-50',
  sourceFileInput: 'hidden',

  primaryButton: `${buttonBase} border border-accent-dark bg-accent text-white enabled:hover:-translate-y-px enabled:hover:bg-accent-dark`,
  ghostButton: `${buttonBase} border border-border bg-white text-heading enabled:hover:border-soft-border-strong enabled:hover:bg-soft-hover`,
  iconButton:
    'inline-flex size-[30px] items-center justify-center rounded-lg border border-border bg-white p-0 text-heading hover:border-soft-border-strong hover:bg-soft-hover disabled:cursor-not-allowed disabled:opacity-50',
  compactAction: 'min-h-8 px-2.5 text-xs',

  settingsPopover:
    'absolute right-0 top-[calc(100%+10px)] z-30 max-h-[calc(100vh-96px)] w-[min(360px,calc(100vw-36px))] overflow-auto rounded-lg border border-border bg-surface p-3.5 shadow-popover max-[760px]:fixed max-[760px]:left-[18px] max-[760px]:right-[18px] max-[760px]:top-[88px] max-[760px]:max-h-[calc(100vh-110px)] max-[760px]:w-auto',
  popoverTitleRow: 'mb-3 flex items-center justify-between gap-3 text-heading',
  settingsPopoverPanel: 'border-0 bg-transparent p-0 shadow-none',

  modalBackdrop: 'fixed inset-0 z-40 grid place-items-center bg-[rgba(20,31,28,0.34)] p-[18px]',
  dialog:
    'grid max-h-[calc(100vh-48px)] w-[min(760px,calc(100vw-36px))] gap-3.5 overflow-auto rounded-lg border border-border bg-surface p-[18px] shadow-dialog',
  agentRow: 'flex items-center justify-between gap-2.5',
  agentStatus:
    'inline-flex min-h-[30px] items-center rounded-lg border border-soft-border bg-soft px-2.5 text-xs font-extrabold text-soft-ink',
  projectList: 'grid max-h-[250px] grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 overflow-auto',
  projectCard:
    'grid min-h-[66px] min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-[9px] rounded-lg border border-border bg-white p-2 text-left text-heading hover:border-accent hover:bg-soft',
  projectCardSelected: 'border-accent bg-soft',
  projectThumb: 'h-[42px] w-[58px] rounded-md bg-[#e9f3f0] object-cover',
  projectPlaceholder: 'grid h-[42px] w-[58px] place-items-center rounded-md bg-[#e9f3f0] text-soft-ink',
  truncateBlock: 'block overflow-hidden text-ellipsis whitespace-nowrap',
  projectName: 'block overflow-hidden text-ellipsis whitespace-nowrap text-[13px]',
  projectMeta: 'mt-[3px] block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold not-italic text-muted',
  errorText: 'm-0 text-[13px] leading-[1.4] text-danger',
  noteText: 'm-0 text-[13px] leading-[1.4] text-muted',
  patchSummary: 'm-0 grid grid-cols-4 gap-2',
  patchSummaryCard: 'min-w-0 rounded-lg border border-border bg-offwhite p-[9px]',
  patchSummaryTerm: 'mb-1 text-[10px] font-extrabold uppercase text-muted',
  patchSummaryValue: 'm-0 text-base font-extrabold text-heading',
  actionsRow: 'flex items-center justify-between gap-2.5',

  workspace:
    'grid min-h-[calc(100vh-52px)] grid-cols-[minmax(0,1fr)_minmax(320px,30vw)] items-stretch gap-2 bg-page p-2 max-[1180px]:grid-cols-1',
  panel: 'rounded-lg border border-border bg-surface p-4 shadow-panel',
  editorPanel: 'grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-2xl bg-[#262626] text-white',
  panelHeading: 'mb-4',
  panelKicker: 'm-0 mb-[5px] text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent',
  title: 'm-0 text-lg leading-[1.2] text-heading',
  rightRail:
    'sticky top-[60px] grid h-[calc(100vh-68px)] min-h-[420px] items-stretch gap-4 self-stretch max-[1180px]:static max-[1180px]:h-auto max-[1180px]:min-h-0 max-[1180px]:grid-cols-1',
  field: 'mt-3.5 grid gap-[7px] text-[13px] font-bold text-heading',
  fieldInput:
    'box-border w-full rounded-lg border border-border bg-white px-[11px] py-2.5 text-heading outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/[0.12]',
  checkboxField: 'mt-3.5 mb-2.5 flex items-center gap-[9px] text-heading font-[750]',
  checkboxInput: 'size-4 accent-accent',
  callout: 'mt-4 rounded-lg border border-soft-border bg-soft p-3 text-[13px] leading-[1.45] text-soft-ink',

  mainStage:
    'grid h-[calc(100vh-68px)] min-h-[520px] min-w-0 grid-rows-[56px_minmax(0,1fr)] self-stretch overflow-hidden rounded-2xl bg-[#262626] px-px',
  playbackPanel:
    'flex h-14 min-w-0 items-center justify-between gap-3 border-b border-[#141414] px-3 py-2',
  timelineToolbarActions: 'flex items-center gap-2',
  timelineToolbarDraft: 'ml-auto flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  timelineToolButton:
    'inline-flex size-10 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35',
  playButton: 'w-[132px] flex-[0_0_132px]',
  playbackRateControl: 'flex flex-[0_0_auto] items-center gap-1.5 whitespace-nowrap text-xs font-[750] text-muted',
  playbackRateInput: 'w-24 accent-accent',
  playbackRateValue: 'min-w-9 text-right text-heading',
  inlineControls: 'inline-flex items-center gap-1.5',
  silenceSettingControl: 'inline-flex items-center gap-1 text-[11px] font-[750] text-white/60',
  silenceSettingInput: 'h-7 w-[66px] rounded-md border border-white/10 bg-white/10 px-1.5 text-white outline-none',
  silenceNormalizeControl: 'inline-flex items-center gap-1 text-[11px] font-[750] text-white/60',
  silenceNormalizeInput: 'accent-accent',
  silenceTuneControl: 'inline-flex items-center',
  silenceTuneInput: 'w-[108px] accent-toolbar-primary',
  zoomControl: 'ml-auto flex min-w-[220px] flex-[1_1_auto] items-center justify-end gap-2 text-xs font-[750] text-muted',
  zoomInput: 'w-[min(300px,28vw)] accent-accent',
  zoomValue: 'min-w-[72px] text-right text-heading',
  timelineStack: 'relative flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-2xl bg-[#262626] px-px',
  timelineTransport:
    'pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2',
  timelinePlayButton:
    'pointer-events-auto inline-flex size-12 items-center justify-center rounded-full border-0 bg-toolbar-primary p-0 text-toolbar-primary-ink shadow-[0_10px_30px_rgba(42,193,205,0.2)] transition-colors duration-150 hover:bg-toolbar-primary-hover disabled:cursor-not-allowed disabled:opacity-40',
  timelineSpeedPicker:
    'pointer-events-auto inline-flex items-center gap-0.5 rounded-md bg-white/10 p-0.5 text-[12px] font-bold leading-none text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]',
  timelineSpeedOption:
    'min-h-6 rounded-[4px] border-0 bg-white/10 px-1.5 text-white transition-colors duration-150 hover:bg-white/20 data-[selected=true]:bg-toolbar-primary data-[selected=true]:text-toolbar-primary-ink data-[selected=true]:hover:bg-toolbar-primary disabled:cursor-not-allowed disabled:opacity-40',
  timelineSpeedOptionSelected: '',
  importSummary:
    'absolute left-3 right-3 top-3 z-10 flex min-h-[28px] flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1 text-xs font-[750] text-white/70',
  importSummaryPill: 'inline-flex min-h-[20px] items-center rounded-full bg-white/10 px-2 text-white/70',

  timelineObjectPanel: 'grid gap-2.5 rounded-lg border p-3',
  captionGapPanel: 'border-[#cddde4] bg-[#f7fbfd] text-[#315a73]',
  sourceCutPanel: 'border-[#d7cceb] bg-[#fbf8ff] text-[#382c55]',
  timelineObjectHeader: 'flex items-center justify-between gap-3',
  timelineObjectHeaderInfo: 'flex items-baseline gap-2',
  timelineObjectLabel: 'text-[11px] font-[850] uppercase text-[var(--timeline-object-accent)]',
  timelineObjectTime: 'text-sm text-heading',
  timelineObjectDetails: 'm-0 grid grid-cols-3 gap-2',
  timelineObjectDetailCard: 'min-w-0 rounded-lg border border-[var(--timeline-object-detail-border)] bg-white p-2',
  timelineObjectDetailTerm: 'mb-1 text-[10px] font-[850] uppercase text-muted',
  timelineObjectDetailValue: 'm-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-[750] text-heading',
  timelineObjectActions: 'flex gap-2',
  sourceCutAudio: 'h-[34px] w-full',
  sourceCutNote: 'm-0 text-[11px] text-muted',

  multitrackPreview: 'grid gap-2 rounded-lg border border-[#d7e3df] bg-white p-2.5',
  multitrackTitle: 'flex items-center justify-between gap-2.5 text-xs font-extrabold text-heading',
  multitrackTitleMeta: 'text-[11px] text-muted',
  multitrackHost: 'min-h-[120px] overflow-hidden rounded-lg border border-[#d7e3df] bg-offwhite',

  wavesurferTimeline:
    'relative grid min-h-[520px] min-w-0 flex-[1_1_auto] content-center gap-0 overflow-hidden',
  timelineGridFadeTop:
    'pointer-events-none absolute inset-x-0 top-0 z-[1] h-[34%] bg-gradient-to-b from-[#262626] to-transparent',
  timelineGridFadeBottom:
    'pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[34%] bg-gradient-to-t from-[#262626] to-transparent',
  timelineHoverGuide:
    'pointer-events-none absolute bottom-0 top-7 left-0 z-[30] w-px bg-white/35 opacity-0 transition-opacity duration-75',
  timelineHoverLabel:
    'absolute left-1/2 top-[35%] -translate-x-1/2 rounded-[3px] bg-[#173f39] px-1 py-0.5 text-[11px] font-bold leading-none text-white shadow-[0_4px_10px_rgba(0,0,0,0.24)]',
  wavesurferTimeAxis: 'relative z-[2] min-h-7 overflow-hidden text-[#6c6c6c]',
  wavesurferLane: 'relative z-[2] min-w-0 overflow-hidden',
  wavesurferMinimapLane: 'relative z-[2] min-h-7 min-w-0 overflow-hidden',
  wavesurferMinimapHost: 'min-h-7 min-w-0 pointer-events-none opacity-70',
  wavesurferMinimapControl:
    'absolute inset-0 z-[3] cursor-crosshair touch-none [&.is-panning]:cursor-grabbing [&.is-panning_.wavesurfer-minimap-viewport]:cursor-grabbing',
  wavesurferMinimapViewport:
    'absolute top-0 bottom-0 block box-border rounded border border-accent-dark/70 bg-accent/[0.12] pointer-events-auto cursor-grab',
  wavesurferMinimapSelection:
    'absolute top-0 bottom-0 hidden box-border rounded border border-accent-ink/75 bg-accent-ink/[0.12] pointer-events-none',
  wavesurferHost: 'min-h-[inherit] min-w-0 empty:min-h-[inherit]',

  sectionTitleRow: 'flex h-14 items-center justify-between gap-3 border-b border-[#141414] px-3 py-2',
  sectionKicker: 'sr-only',
  sectionTitle: 'm-0 text-base font-bold leading-[1.2] text-white',
  captionHeaderControls: 'flex items-center gap-2.5',
  captionCount: 'text-xs font-medium text-white/40',
  maxCharsControl: 'inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.16px] text-white/40',
  maxCharsInput: 'min-h-7 w-[52px] rounded-sm border-0 bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none',
  captionDraftActions: 'flex items-center gap-2 border-b border-[#141414] bg-[#262626] px-3 py-2',
  captionDraftLabel: 'mr-auto text-xs font-bold text-white/40',
  captionDraftButton: 'min-h-[30px] border-0 bg-white/10 px-[9px] text-xs text-white hover:bg-white/15',
  groupList: 'grid min-h-0 content-start overflow-auto bg-[#262626] py-2 max-[760px]:max-h-none',
  captionRow:
    'group/caption-row relative grid min-h-8 grid-cols-[56px_minmax(0,1fr)] items-center gap-4 overflow-hidden bg-transparent pl-3 pr-0 py-0 transition-colors duration-150 hover:bg-white/[0.03] max-[760px]:grid-cols-1 max-[760px]:gap-1 max-[760px]:pr-3',
  captionRowSelected: 'bg-white/[0.04]',
  captionRowPending: 'animate-selection-progress bg-[linear-gradient(90deg,rgba(42,193,205,0.04),rgba(42,193,205,0.14),rgba(42,193,205,0.04))] bg-[length:220%_100%]',
  captionRowTime: 'relative z-[1] flex items-center gap-1 text-[11px] text-white/40',
  captionTextInput:
    'relative z-[1] min-w-0 rounded-md border border-transparent bg-transparent px-0 py-[5px] text-base font-medium tracking-[0.16px] text-white outline-none read-only:cursor-default',
  captionPendingInput: 'text-toolbar-primary italic',
  captionTimeInput:
    'w-[56px] [appearance:textfield] rounded-md border border-transparent bg-transparent px-0 py-[5px] text-left text-[11px] font-medium tracking-[0.16px] text-white/40 outline-none disabled:bg-transparent disabled:text-white/30',
  captionRowFade:
    'pointer-events-none absolute inset-y-0 right-0 z-[2] w-16 bg-[linear-gradient(90deg,rgb(38_38_38/0%)_0%,#262626_72%)] transition-[width] duration-150 group-hover/caption-row:w-[154px] group-focus-within/caption-row:w-[154px]',
  rowActions:
    'invisible pointer-events-none absolute right-3 top-1/2 z-[3] flex -translate-y-1/2 justify-end gap-0 opacity-0 transition-[opacity,visibility] duration-150 group-hover/caption-row:visible group-hover/caption-row:pointer-events-auto group-hover/caption-row:opacity-100 group-focus-within/caption-row:visible group-focus-within/caption-row:pointer-events-auto group-focus-within/caption-row:opacity-100',
  rowActionButton:
    'inline-flex size-[27px] items-center justify-center gap-2 rounded-lg border-0 bg-white/10 p-0 text-white backdrop-blur transition-colors duration-150 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50',

  miniStats: 'mb-4 grid grid-cols-2 gap-2',
  miniStatCard: 'min-w-0 rounded-lg border border-border bg-offwhite px-[9px] py-2',
  miniStatValue: 'block overflow-hidden text-ellipsis whitespace-nowrap text-base font-extrabold leading-[1.1] text-heading',
  miniStatLabel: 'm-0 mt-[3px] overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-[750] uppercase text-muted',
}
