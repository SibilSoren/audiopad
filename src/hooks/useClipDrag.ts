import { useCallback, useRef, useState } from 'react'
import { useAppDispatch } from '../store/store'
import {
  moveClipTo,
  trimClipStart,
  trimClipEnd,
  setClipFades,
} from '../store/tracksSlice'
import { applyDrag, clipEnd } from '../audio/clipOps'
import type { HitZone } from '../lib/clipHit'
import type { Clip, AudioSource } from '../models/types'

interface Session {
  zone: HitZone
  original: Clip
  /** Timeline position where the pointer went down. */
  anchorTime: number
  sourceDuration: number
  moved: boolean
}

/** Movement below this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3

/**
 * A clip drag, from pointer down to commit.
 *
 * The preview is recomputed from the original clip on every move rather than
 * applied cumulatively, so it cannot drift from the value finally committed -
 * what you see while dragging is exactly what lands in the store. Only one
 * action is dispatched, at the end, which also keeps the undo history to one
 * entry per gesture rather than one per frame.
 */
export function useClipDrag() {
  const dispatch = useAppDispatch()
  const [session, setSession] = useState<Session | null>(null)
  const [delta, setDelta] = useState(0)
  const pointerStartX = useRef(0)

  const draft: Clip | null = session
    ? applyDrag(session.original, session.zone, delta, session.sourceDuration)
    : null

  const begin = useCallback(
    (clip: Clip, zone: HitZone, time: number, clientX: number, source?: AudioSource) => {
      pointerStartX.current = clientX
      setDelta(0)
      setSession({
        zone,
        original: clip,
        anchorTime: time,
        sourceDuration: source?.duration ?? clipEnd(clip),
        moved: false,
      })
    },
    []
  )

  const move = useCallback(
    (time: number, clientX: number) => {
      setSession((current) => {
        if (!current) return current
        const moved =
          current.moved || Math.abs(clientX - pointerStartX.current) > DRAG_THRESHOLD_PX
        return moved === current.moved ? current : { ...current, moved }
      })
      setDelta(time - (session?.anchorTime ?? time))
    },
    [session?.anchorTime]
  )

  /** Commits the drag. Returns true if it was a real drag rather than a click. */
  const end = useCallback((): boolean => {
    if (!session || !draft) {
      setSession(null)
      return false
    }

    const wasDrag = session.moved
    if (wasDrag) {
      const clipId = session.original.id
      switch (session.zone) {
        case 'body':
          dispatch(moveClipTo({ clipId, start: draft.start }))
          break
        case 'trim-start':
          dispatch(trimClipStart({ clipId, start: draft.start }))
          break
        case 'trim-end':
          dispatch(trimClipEnd({ clipId, end: clipEnd(draft) }))
          break
        case 'fade-in':
        case 'fade-out':
          dispatch(
            setClipFades({ clipId, fadeIn: draft.fadeIn, fadeOut: draft.fadeOut })
          )
          break
      }
    }

    setSession(null)
    setDelta(0)
    return wasDrag
  }, [session, draft, dispatch])

  return {
    draft,
    draggingClipId: session?.original.id ?? null,
    zone: session?.zone ?? null,
    isDragging: session !== null,
    begin,
    move,
    end,
  }
}
