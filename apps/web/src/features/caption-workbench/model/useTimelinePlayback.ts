import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type SetStateAction,
} from 'react'

import type { CaptionGroup, CaptionWord, GroupingSettings } from '../../../contracts/captions'
import { formatSeconds, getEmptyZoneCuts } from '../../../domain/captions'

type ActiveSegment = {
  groupId: string
  start: number
  end: number
  loop: boolean
}

type UseTimelinePlaybackOptions = {
  audioUrl?: string
  contentDuration: number
  groups: CaptionGroup[]
  selectedGroupId?: string
  setSelectedGroupId: Dispatch<SetStateAction<string | undefined>>
  setStatus: (message: string) => void
  settings: GroupingSettings
  words: CaptionWord[]
}

export const useTimelinePlayback = ({
  audioUrl,
  contentDuration,
  groups,
  selectedGroupId,
  setSelectedGroupId,
  setStatus,
  settings,
  words,
}: UseTimelinePlaybackOptions) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [loopedGroupId, setLoopedGroupId] = useState<string | undefined>()
  const [audioDuration, setAudioDuration] = useState(0)
  const [playheadTime, setPlayheadTime] = useState(0)
  const activeSegmentRef = useRef<ActiveSegment | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)
  const timelineDuration = Math.max(contentDuration, audioDuration, playheadTime, 1)
  const emptyZoneCuts = useMemo(
    () => getEmptyZoneCuts(words, timelineDuration, settings),
    [settings, timelineDuration, words],
  )

  const playheadStyle = useMemo(
    () =>
      ({
        left: `${Math.min(Math.max(playheadTime / timelineDuration, 0), 1) * 100}%`,
      }) as CSSProperties,
    [playheadTime, timelineDuration],
  )

  const keepPlayheadInView = useCallback((time: number) => {
    const scroller = timelineScrollRef.current
    if (!scroller) return

    const playheadX = (time / timelineDuration) * scroller.scrollWidth
    const leftEdge = scroller.scrollLeft
    const rightEdge = leftEdge + scroller.clientWidth
    const margin = Math.min(160, scroller.clientWidth * 0.2)

    if (playheadX < leftEdge + margin || playheadX > rightEdge - margin) {
      scroller.scrollLeft = Math.max(0, playheadX - scroller.clientWidth * 0.35)
    }
  }, [timelineDuration])

  const clearSegmentPlayback = useCallback(() => {
    activeSegmentRef.current = null
    setLoopedGroupId(undefined)
  }, [])

  const stopPlayback = useCallback(() => {
    audioRef.current?.pause()
    clearSegmentPlayback()
    setIsPlaying(false)
  }, [clearSegmentPlayback])

  const resetPlaybackPosition = useCallback(() => {
    clearSegmentPlayback()
    setAudioDuration(0)
    setPlayheadTime(0)
  }, [clearSegmentPlayback])

  const syncAudioPosition = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (Number.isFinite(audio.duration)) {
      setAudioDuration(audio.duration)
    }
    setPlayheadTime(audio.currentTime)
  }, [])

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current
    const audioLimit = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : undefined
    const maxTime = audioLimit ?? timelineDuration
    const nextTime = Math.min(Math.max(time, 0), Math.max(maxTime, 0))

    if (audio && audioUrl) {
      audio.currentTime = nextTime
    }
    setPlayheadTime(nextTime)
    keepPlayheadInView(nextTime)
    return nextTime
  }, [audioUrl, keepPlayheadInView, timelineDuration])

  const playFrom = useCallback(async (start: number, end?: number, groupId?: string) => {
    const audio = audioRef.current
    if (!audioUrl || !audio) {
      setStatus('Upload audio or video to audition timing.')
      return
    }

    setLoopedGroupId(undefined)
    activeSegmentRef.current = end && groupId ? { groupId, start, end, loop: false } : null
    seekTo(start)
    await audio.play()
    setIsPlaying(true)
  }, [audioUrl, seekTo, setStatus])

  const startLoopGroup = useCallback(async (groupId: string) => {
    const audio = audioRef.current
    const group = groups.find((item) => item.id === groupId)
    if (!audioUrl || !audio || !group) {
      setStatus('Upload audio or video to loop the selected group.')
      return
    }

    setSelectedGroupId(group.id)
    setLoopedGroupId(group.id)
    activeSegmentRef.current = { groupId: group.id, start: group.start, end: group.end, loop: true }
    seekTo(group.start)
    await audio.play()
    setIsPlaying(true)
    setStatus('Looping selected group. Space stops playback.')
  }, [audioUrl, groups, seekTo, setSelectedGroupId, setStatus])

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current
    if (!audioUrl || !audio) {
      setStatus('Upload audio or video to play the timeline.')
      return
    }

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      return
    }

    clearSegmentPlayback()
    if (audio.ended || audio.currentTime >= audio.duration) {
      seekTo(0)
    }
    await audio.play()
    setIsPlaying(true)
  }, [audioUrl, clearSegmentPlayback, isPlaying, seekTo, setStatus])

  const playGroup = useCallback((groupId: string) => {
    const group = groups.find((item) => item.id === groupId)
    if (!group) return
    setSelectedGroupId(groupId)
    void playFrom(group.start, group.end, group.id)
  }, [groups, playFrom, setSelectedGroupId])

  const handleTimelineGroupSelect = useCallback((groupId: string) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(undefined)
      if (loopedGroupId === groupId || activeSegmentRef.current?.groupId === groupId) {
        clearSegmentPlayback()
      }
      setStatus('Group deselected. Space plays the full timeline from the playhead.')
      return
    }

    setSelectedGroupId(groupId)
    if (loopedGroupId) {
      void startLoopGroup(groupId)
      return
    }
    activeSegmentRef.current = null
    setStatus('Group selected. Space loops this group.')
  }, [
    clearSegmentPlayback,
    loopedGroupId,
    selectedGroupId,
    setSelectedGroupId,
    setStatus,
    startLoopGroup,
  ])

  const handleTimelineSeek = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width) return

    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const nextTime = seekTo((x / rect.width) * timelineDuration)
    clearSegmentPlayback()
    setSelectedGroupId(undefined)
    setStatus(`Playhead moved to ${formatSeconds(nextTime)}. Space plays the full timeline from here.`)
  }, [clearSegmentPlayback, seekTo, setSelectedGroupId, setStatus, timelineDuration])

  const handleAudioTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (audio) setPlayheadTime(audio.currentTime)

    const activeSegment = activeSegmentRef.current
    if (!audio) return

    if (!activeSegment) {
      const cut = emptyZoneCuts.find((item) => audio.currentTime >= item.start && audio.currentTime < item.end)
      if (cut) {
        seekTo(cut.end)
      }
      return
    }

    if (audio.currentTime >= activeSegment.end) {
      if (activeSegment.loop) {
        audio.currentTime = activeSegment.start
        setPlayheadTime(activeSegment.start)
        void audio.play()
        return
      }

      audio.pause()
      setIsPlaying(false)
      setPlayheadTime(activeSegment.end)
      activeSegmentRef.current = null
    }
  }, [emptyZoneCuts, seekTo])

  const handleAudioPause = useCallback(() => {
    setIsPlaying(false)
    syncAudioPosition()
  }, [syncAudioPosition])

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false)
    clearSegmentPlayback()
    syncAudioPosition()
  }, [clearSegmentPlayback, syncAudioPosition])

  useEffect(() => {
    if (!isPlaying) return

    let animationFrame = 0
    let lastSync = 0
    const syncPlayhead = (timestamp: number) => {
      const audio = audioRef.current
      if (audio && timestamp - lastSync > 33) {
        setPlayheadTime(audio.currentTime)
        keepPlayheadInView(audio.currentTime)
        lastSync = timestamp
      }
      animationFrame = requestAnimationFrame(syncPlayhead)
    }

    animationFrame = requestAnimationFrame(syncPlayhead)
    return () => cancelAnimationFrame(animationFrame)
  }, [isPlaying, keepPlayheadInView])

  useEffect(() => {
    if (!loopedGroupId) return

    const group = groups.find((item) => item.id === loopedGroupId)
    const audio = audioRef.current
    if (!group || !audio) {
      activeSegmentRef.current = null
      setLoopedGroupId(undefined)
      return
    }

    activeSegmentRef.current = { groupId: group.id, start: group.start, end: group.end, loop: true }
    audio.currentTime = group.start
    void audio.play()
    setIsPlaying(true)
  }, [groups, loopedGroupId])

  return {
    audioDuration,
    audioRef,
    clearSegmentPlayback,
    emptyZoneCuts,
    handleAudioEnded,
    handleAudioPause,
    handleAudioTimeUpdate,
    handleTimelineGroupSelect,
    handleTimelineSeek,
    isPlaying,
    loopedGroupId,
    playGroup,
    playheadStyle,
    playheadTime,
    resetPlaybackPosition,
    seekTo,
    startLoopGroup,
    stopPlayback,
    syncAudioPosition,
    timelineDuration,
    timelineScrollRef,
    togglePlayback,
  }
}
