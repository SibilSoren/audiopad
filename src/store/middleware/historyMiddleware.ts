import { type Middleware } from '@reduxjs/toolkit';
import {
  splitClipAt,
  removeClip,
  moveClipTo,
  trimClipStart,
  trimClipEnd,
  setClipFades,
  removeTrack,
  restoreTracks,
  type TracksState,
} from '../tracksSlice';
import { undo, redo, recorded, undone, redone } from '../historySlice';

interface HistoryAwareState {
  tracks: TracksState;
  history: { past: TracksState[]; future: TracksState[] };
}

/**
 * Actions worth being able to take back.
 *
 * Adding a file is deliberately absent: undoing it would have to re-decode
 * audio the store no longer holds a handle to.
 */
const UNDOABLE = new Set<string>([
  splitClipAt.type,
  removeClip.type,
  moveClipTo.type,
  trimClipStart.type,
  trimClipEnd.type,
  setClipFades.type,
  removeTrack.type,
]);

/**
 * Orchestrates undo and redo.
 *
 * The snapshot has to be taken before the action reaches the reducer, and
 * restoring one is a second dispatch, so this lives in middleware rather
 * than in either slice.
 */
export const historyMiddleware: Middleware<object, HistoryAwareState> =
  (store) => (next) => (action) => {
    if (undo.match(action)) {
      const { tracks, history } = store.getState();
      if (history.past.length === 0) return next(action);

      const previous = history.past[history.past.length - 1];
      store.dispatch(undone(tracks));
      store.dispatch(restoreTracks(previous));
      return next(action);
    }

    if (redo.match(action)) {
      const { tracks, history } = store.getState();
      if (history.future.length === 0) return next(action);

      const upcoming = history.future[history.future.length - 1];
      store.dispatch(redone(tracks));
      store.dispatch(restoreTracks(upcoming));
      return next(action);
    }

    // Middleware sees actions as unknown; narrow before reading the type.
    const type =
      typeof action === 'object' && action !== null && 'type' in action
        ? String((action as { type: unknown }).type)
        : '';

    if (UNDOABLE.has(type)) {
      store.dispatch(recorded(store.getState().tracks));
    }

    return next(action);
  };
