import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UISliceState {
  selectedClipId: string | null;
}

const initialState: UISliceState = {
  selectedClipId: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    selectClip: (state, action: PayloadAction<string | null>) => {
      state.selectedClipId = action.payload;
    },
  },
});

export const { selectClip } = uiSlice.actions;
export default uiSlice.reducer;
