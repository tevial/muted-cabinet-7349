import type { CaptionGroup, CaptionWord, GroupingSettings } from '../types'

export const projectStorageKey = 'capcut-caption-project-v1'

export type SavedProject = {
  version: 1
  savedAt: string
  language: string
  words: CaptionWord[]
  groups: CaptionGroup[]
  settings: GroupingSettings
}

export const createSavedProject = (
  language: string,
  words: CaptionWord[],
  groups: CaptionGroup[],
  settings: GroupingSettings,
): SavedProject => ({
  version: 1,
  savedAt: new Date().toISOString(),
  language,
  words,
  groups,
  settings,
})

export const saveProject = (project: SavedProject) => {
  try {
    localStorage.setItem(projectStorageKey, JSON.stringify(project))
    return true
  } catch {
    return false
  }
}

export const loadProject = (): SavedProject | null => {
  try {
    const raw = localStorage.getItem(projectStorageKey)
    if (!raw) return null

    const project = JSON.parse(raw) as SavedProject
    if (project.version !== 1 || !Array.isArray(project.words) || !Array.isArray(project.groups)) {
      return null
    }
    return project
  } catch {
    return null
  }
}
