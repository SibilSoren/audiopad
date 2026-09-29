import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TransportState } from '../models/types';

/**
 * `duration` deliberately does not live here. It is derived from the clips in
 * selectors.ts - the old transport state carried a hardcoded 120s that was
 * never updated, so the ruler, the playhead and click-to-seek were all wrong
 * for any track that was not exactly two minutes long.
 */
const initialState: TransportState = {
  isPlaying: false,
  currentTime: 0,
  tempo: 120,
};

const transportSlice = createSlice({
  name: 'transport',
  initialState,
  reducers: {
    play: (state) => {
      state.isPlaying = true;
    },
    pause: (state) => {
      state.isPlaying = false;
    },
    stop: (state) => {
      state.isPlaying = false;
      state.currentTime = 0;
    },
    /** Reached the end of the arrangement on its own. */
    playbackEnded: (state) => {
      state.isPlaying = false;
    },
    seek: (state, action: PayloadAction<number>) => {
      state.currentTime = action.payload;
    },
  },
});

export const { play, pause, stop, playbackEnded, seek } = transportSlice.actions;
export default transportSlice.reducer;
