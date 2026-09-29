import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface MixerState {
  masterVolume: number;
}

const initialState: MixerState = {
  masterVolume: 0.8,
};

const mixerSlice = createSlice({
  name: 'mixer',
  initialState,
  reducers: {
    setMasterVolume: (state, action: PayloadAction<number>) => {
      state.masterVolume = action.payload;
    },
  },
});

export const { setMasterVolume } = mixerSlice.actions;
export default mixerSlice.reducer;
