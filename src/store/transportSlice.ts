import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TransportState } from '../models/types';

const initialState: TransportState = {
  isPlaying: false,
  currentTime: 0,
  duration: 120, // Default 2 mins
  tempo: 120
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
    setCurrentTime: (state, action: PayloadAction<number>) => {
      state.currentTime = action.payload;
    },
    setDuration: (state, action: PayloadAction<number>) => {
        state.duration = action.payload;
    }
  }
});

export const { play, pause, stop, setCurrentTime, setDuration } = transportSlice.actions;
export default transportSlice.reducer;
