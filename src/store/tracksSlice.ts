import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { AudioTrack } from '../models/types';
import { AudioEngine } from '../audio/AudioEngine';
import { getPeakData } from '../audio/AudioUtils';

interface TracksState {
  byId: Record<string, AudioTrack>;
  allIds: string[];
  loading: Record<string, boolean>;
}

// Start with empty state - no demo tracks that fail
const initialState: TracksState = {
  byId: {},
  allIds: [],
  loading: {}
};

// Async thunk for loading track audio
export const loadTrackAudio = createAsyncThunk(
  'tracks/loadTrackAudio',
  async ({ id, url, name }: { id: string; url: string; name: string }, { dispatch }) => {
    try {
      const engine = AudioEngine.getInstance();
      const buffer = await engine.loadTrack(id, url);
      const peaks = getPeakData(buffer, 500); // Fewer samples for performance
      return { id, peaks, duration: buffer.duration };
    } catch (error) {
      console.error(`Failed to load track ${id}:`, error);
      throw error;
    }
  }
);

const tracksSlice = createSlice({
  name: 'tracks',
  initialState,
  reducers: {
    addTrack: (state, action: PayloadAction<{ id: string; name: string; color?: string }>) => {
      const { id, name, color } = action.payload;
      const newTrack: AudioTrack = {
        id,
        name,
        volume: 1.0,
        muted: false,
        solo: false,
        color: color || `hsl(${Math.random() * 360}, 70%, 60%)`
      };
      state.byId[id] = newTrack;
      if (!state.allIds.includes(id)) {
        state.allIds.push(id);
      }
    },
    removeTrack: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      delete state.byId[id];
      delete state.loading[id];
      state.allIds = state.allIds.filter(trackId => trackId !== id);
    },
    setVolume: (state, action: PayloadAction<{ id: string; volume: number }>) => {
      const track = state.byId[action.payload.id];
      if (track) track.volume = action.payload.volume;
    },
    toggleMute: (state, action: PayloadAction<string>) => {
      const track = state.byId[action.payload];
      if (track) track.muted = !track.muted;
    },
    toggleSolo: (state, action: PayloadAction<string>) => {
      const id = action.payload;
      const track = state.byId[id];
      if (track) {
        const newSoloState = !track.solo;
        
        // Exclusive solo: if turning ON, turn off all others
        if (newSoloState) {
          state.allIds.forEach(trackId => {
            if (state.byId[trackId] && trackId !== id) {
              state.byId[trackId].solo = false;
            }
          });
        }
        
        track.solo = newSoloState;
      }
    },
    setPeaks: (state, action: PayloadAction<{id: string, peaks: number[]}>) => {
      const track = state.byId[action.payload.id];
      if(track) track.peaks = action.payload.peaks;
    },
    setAlbumArt: (state, action: PayloadAction<{id: string, albumArt: string}>) => {
      const track = state.byId[action.payload.id];
      if(track) track.albumArt = action.payload.albumArt;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTrackAudio.pending, (state, action) => {
        state.loading[action.meta.arg.id] = true;
      })
      .addCase(loadTrackAudio.fulfilled, (state, action) => {
        const { id, peaks } = action.payload;
        state.loading[id] = false;
        if (state.byId[id]) {
          state.byId[id].peaks = peaks;
        }
      })
      .addCase(loadTrackAudio.rejected, (state, action) => {
        state.loading[action.meta.arg.id] = false;
      });
  }
});

export const { addTrack, removeTrack, setVolume, toggleMute, toggleSolo, setPeaks, setAlbumArt } = tracksSlice.actions;
export default tracksSlice.reducer;
