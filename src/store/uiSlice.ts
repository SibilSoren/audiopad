import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { clampZoom, MIN_PPS } from '../lib/viewport';

interface UISliceState {
  selectedClipId: string | null;
  /** Horizontal scale. */
  pixelsPerSecond: number;
  /** Leftmost visible time, in seconds. */
  viewStart: number;
  /** Set once after the first track loads, so the arrangement starts framed. */
  hasAutoFitted: boolean;
}

const initialState: UISliceState = {
  selectedClipId: null,
  pixelsPerSecond: MIN_PPS,
  viewStart: 0,
  hasAutoFitted: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    selectClip: (state, action: PayloadAction<string | null>) => {
      state.selectedClipId = action.payload;
    },
    /** Zoom and scroll move together, so an anchored zoom is one action. */
    setView: (
      state,
      action: PayloadAction<{ pixelsPerSecond?: number; viewStart?: number }>
    ) => {
      if (action.payload.pixelsPerSecond !== undefined) {
        state.pixelsPerSecond = clampZoom(action.payload.pixelsPerSecond);
      }
      if (action.payload.viewStart !== undefined) {
        state.viewStart = Math.max(0, action.payload.viewStart);
      }
    },
    markAutoFitted: (state) => {
      state.hasAutoFitted = true;
    },
  },
});

export const { selectClip, setView, markAutoFitted } = uiSlice.actions;
export default uiSlice.reducer;
