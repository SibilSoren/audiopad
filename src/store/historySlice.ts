import { createSlice, createAction, type PayloadAction } from '@reduxjs/toolkit';
import type { TracksState } from './tracksSlice';

/**
 * Undo as snapshots of the tracks slice.
 *
 * Snapshots rather than inverse operations: the state is small, and an
 * inverse for every edit is another thing to get wrong - a trim that clamped
 * against the source cannot be undone by simply trimming back the other way.
 */

/** Deep enough for a working session without holding the whole history. */
const LIMIT = 50;

interface HistoryState {
  past: TracksState[];
  future: TracksState[];
}

const initialState: HistoryState = { past: [], future: [] };

/** Intercepted by the middleware, which owns the ordering. */
export const undo = createAction('history/undo');
export const redo = createAction('history/redo');

const historySlice = createSlice({
  name: 'history',
  initialState,
  reducers: {
    /** Called just before an undoable action changes the tracks slice. */
    recorded: (state, action: PayloadAction<TracksState>) => {
      state.past.push(action.payload);
      if (state.past.length > LIMIT) state.past.shift();
      // A fresh edit abandons anything that was undone.
      state.future = [];
    },
    undone: (state, action: PayloadAction<TracksState>) => {
      state.past.pop();
      state.future.push(action.payload);
    },
    redone: (state, action: PayloadAction<TracksState>) => {
      state.future.pop();
      state.past.push(action.payload);
    },
  },
});

export const { recorded, undone, redone } = historySlice.actions;
export default historySlice.reducer;
