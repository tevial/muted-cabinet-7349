import type { CapCutPatchManifest } from '../../domain/captions'
import type {
  CapCutAudioStem,
  CapCutProjectImport,
  CapCutSourcePreview,
  CapCutTimelineMap,
} from '../../contracts/capcut'
import { flowLog, flowWarn } from '../../shared/observability/flowLogger'
import { apiBase } from '../api/apiConfig'

export type CapCutLocalAgentStatus = {
  enabled: boolean
  projectsRoot: string
  rootExists: boolean
}

export type CapCutProjectTrackSummary = {
  id?: string
  name?: string
  segments: number
  type: string
}

export type CapCutProjectSummary = {
  id: string
  name: string
  projectPath: string
  relativePath: string
  duration?: number
  durationUs?: number
  updatedAt?: string
  coverUrl?: string
  supported: boolean
  errors: string[]
  warnings: string[]
  tracks: CapCutProjectTrackSummary[]
}

export type CapCutProjectListResponse = {
  agent: CapCutLocalAgentStatus
  projects: CapCutProjectSummary[]
}

export type CapCutPatchSummary = {
  projectPath: string
  mainTimelineId: string
  write: boolean
  inputDuration: number
  outputDuration: number
  removedDuration: number
  videoSegments: number
  captionSegments: number
  keptRanges: Array<{ start: number; end: number; duration: number }>
  backups: string[]
  filesWritten: string[]
  filesWouldWrite: string[]
}

export type CapCutInspectSummary = {
  projectPath: string
  mainTimelineId: string
  duration: number
  durationUs: number
  metaDurationUs?: number
  tracks: CapCutProjectTrackSummary[]
  materialCounts: Record<string, number | string>
  supported: boolean
  errors: string[]
  warnings: string[]
}

type CapCutPatchPayload = Omit<CapCutPatchManifest, 'source' | 'version'> & {
  projectPath: string
}

const asCapCutPatchPayload = (projectPath: string, manifest: CapCutPatchManifest): CapCutPatchPayload => ({
  projectPath,
  duration: manifest.duration,
  keptRanges: manifest.keptRanges,
  captions: manifest.captions,
})

const readErrorMessage = async (response: Response, fallback: string) => {
  const message = await response.text()
  if (!message) return fallback

  try {
    const parsed = JSON.parse(message) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    return message
  }

  return message
}

const postJson = async <T>(path: string, payload: unknown, fallbackError: string): Promise<T> => {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackError))
  }

  return response.json() as Promise<T>
}

const getSafeStemFileName = (stem: CapCutAudioStem) => {
  const label = stem.label || stem.id || 'capcut-stem'
  const safeLabel = label.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')

  return `${safeLabel || 'capcut-stem'}.wav`
}

export const listCapCutProjects = async (limit = 120): Promise<CapCutProjectListResponse> => {
  flowLog('api: GET /api/capcut/projects', { baseUrl: apiBase, limit })
  const response = await fetch(`${apiBase}/api/capcut/projects?limit=${limit}`)

  if (!response.ok) {
    const message = await readErrorMessage(response, 'CapCut project scan failed.')
    flowWarn('api: capcut projects error', { status: response.status, message })
    throw new Error(message)
  }

  const result = (await response.json()) as CapCutProjectListResponse
  flowLog('api: capcut projects ok', {
    enabled: result.agent.enabled,
    projects: result.projects.length,
    rootExists: result.agent.rootExists,
  })

  return {
    ...result,
    projects: result.projects.map((project) => ({
      ...project,
      coverUrl: project.coverUrl ? `${apiBase}${project.coverUrl}` : undefined,
    })),
  }
}

export const inspectCapCutProject = async (projectPath: string): Promise<CapCutInspectSummary> =>
  postJson('/api/capcut/inspect', { projectPath }, 'CapCut project inspect failed.')

export const loadCapCutTimelineMap = async (projectPath: string): Promise<CapCutTimelineMap> =>
  postJson('/api/capcut/timeline-map', { projectPath }, 'CapCut timeline map failed.')

export const importCapCutProject = async (projectPath: string): Promise<CapCutProjectImport> => {
  const result = await postJson<CapCutProjectImport>(
    '/api/capcut/import',
    { projectPath },
    'CapCut project import failed.',
  )

  return {
    ...result,
    stems: result.stems.map((stem) => ({
      ...stem,
      url: `${apiBase}${stem.url}`,
    })),
  }
}

export const loadCapCutStemFile = async (stem: CapCutAudioStem): Promise<File> => {
  flowLog('api: GET CapCut stem file', {
    label: stem.label,
    trackId: stem.trackId,
    url: stem.url,
  })
  const response = await fetch(stem.url)

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'CapCut audio stem download failed.'))
  }

  const blob = await response.blob()
  return new File([blob], getSafeStemFileName(stem), {
    type: blob.type || 'audio/wav',
  })
}

export const loadCapCutSourcePreview = async (
  mediaPath: string,
  start: number,
  end: number,
): Promise<CapCutSourcePreview> => {
  const result = await postJson<CapCutSourcePreview>(
    '/api/capcut/source-preview',
    { mediaPath, start, end },
    'CapCut source preview failed.',
  )

  return {
    ...result,
    url: `${apiBase}${result.url}`,
  }
}

export const dryRunCapCutPatch = async (
  projectPath: string,
  manifest: CapCutPatchManifest,
): Promise<CapCutPatchSummary> =>
  postJson('/api/capcut/patch-dry-run', asCapCutPatchPayload(projectPath, manifest), 'CapCut patch preview failed.')

export const patchCapCutProject = async (
  projectPath: string,
  manifest: CapCutPatchManifest,
): Promise<CapCutPatchSummary> =>
  postJson('/api/capcut/patch', asCapCutPatchPayload(projectPath, manifest), 'CapCut project patch failed.')
