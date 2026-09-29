import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import type { AudioTrack, AudioSource, Clip } from '../models/types';
import { AudioEngine } from '../audio/AudioEngine';
import { getPeakData } from '../audio/AudioUtils';
import {
  splitClip,
  moveClip,
  trimStart,
  trimEnd,
  setFades,
} from '../audio/clipOps';

/** Fixed palette, so a track is the same colour everywhere it appears. */
export const TRACK_COLORS = [
  '#ff5b21',
  '#e8e0d0',
  '#d92e2e',
  '#3b82f6',
  '#4ade80',
  '#facc15',
] as const;

export interface TracksState {
  byId: Record<string, AudioTrack>;
  allIds: string[];
  /** Decoded files, keyed by source id and shared between clips. */
  sources: Record<string, AudioSource>;
  clips: Record<string, Clip>;
  clipIds: string[];
  loading: Record<string, boolean>;
}

const initialState: TracksState = {
  byId: {},
  allIds: [],
  sources: {},
  clips: {},
  clipIds: [],
  loading: {},
};

/**
 * Decode a dropped file and place it as a single full-length clip.
 *
 * One clip per track today; editing in a later phase just creates more of
 * them, which is why the clip model exists now rather than being retrofitted.
 */
export const addAudioFile = createAsyncThunk(
  'tracks/addAudioFile',
  async ({ file, color }: { file: File; color?: string }) => {
    const trackId = uuidv4();
    const sourceId = uuidv4();
    const clipId = uuidv4();
    const name = file.name.replace(/\.[^/.]+$/, '');

    const url = URL.createObjectURL(file);
    try {
      const engine = AudioEngine.getInstance();
      const buffer = await engine.loadSource(sourceId, url);
      const peaks = getPeakData(buffer, 800);

      return {
        trackId,
        sourceId,
        clipId,
        name,
        color,
        duration: buffer.duration,
        peaks,
      };
    } finally {
      // The decoded buffer is what we keep; the blob URL was only ever a
      // handle for fetch(). Leaving it alive pinned the whole file in memory.
      URL.revokeObjectURL(url);
    }
  }
);

const tracksSlice = createSlice({
  name: 'tracks',
  initialState,
  reducers: {
    removeTrack: (state, action: PayloadAction<string>) => {
      const trackId = action.payload;
      delete state.byId[trackId];
      delete state.loading[trackId];
      state.allIds = state.allIds.filter((id) => id !== trackId);

      const removed = state.clipIds.filter(
        (clipId) => state.clips[clipId]?.trackId === trackId
      );
      for (const clipId of removed) {
        const sourceId = state.clips[clipId]?.sourceId;
        delete state.clips[clipId];

        // Drop the decoded audio once nothing else cites it.
        const stillUsed = Object.values(state.clips).some(
          (c) => c.sourceId === sourceId
        );
        if (sourceId && !stillUsed) {
          delete state.sources[sourceId];
          AudioEngine.getInstance().releaseSource(sourceId);
        }
      }
      state.clipIds = state.clipIds.filter((id) => !removed.includes(id));
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
      const track = state.byId[action.payload];
      if (!track) return;

      const next = !track.solo;
      if (next) {
        // Exclusive solo.
        state.allIds.forEach((id) => {
          if (state.byId[id]) state.byId[id].solo = false;
        });
      }
      track.solo = next;
    },
    /** Replace the whole slice. Used by undo and redo, and not itself undoable. */
    restoreTracks: (_state, action: PayloadAction<TracksState>) => action.payload,

    setAlbumArt: (
      state,
      action: PayloadAction<{ id: string; albumArt: string }>
    ) => {
      const track = state.byId[action.payload.id];
      if (track) track.albumArt = action.payload.albumArt;
    },

    /*
     * Clip edits. The maths lives in clipOps so it can be tested on its own;
     * these reducers only deal with where the result is stored.
     */

    splitClipAt: {
      reducer: (
        state,
        action: PayloadAction<{ clipId: string; time: number; newId: string }>
      ) => {
        const { clipId, time, newId } = action.payload;
        const clip = state.clips[clipId];
        if (!clip) return;

        const halves = splitClip(clip, time, newId);
        if (!halves) return;

        const [left, right] = halves;
        state.clips[left.id] = left;
        state.clips[right.id] = right;
        state.clipIds.push(right.id);
      },
      // The id is generated here so the reducer itself stays pure.
      prepare: (clipId: string, time: number) => ({
        payload: { clipId, time, newId: uuidv4() },
      }),
    },

    removeClip: (state, action: PayloadAction<string>) => {
      const clipId = action.payload;
      const clip = state.clips[clipId];
      if (!clip) return;

      delete state.clips[clipId];
      state.clipIds = state.clipIds.filter((id) => id !== clipId);

      // Release the decoded audio once no clip cites it any more.
      const stillUsed = Object.values(state.clips).some(
        (c) => c.sourceId === clip.sourceId
      );
      if (!stillUsed) {
        delete state.sources[clip.sourceId];
        AudioEngine.getInstance().releaseSource(clip.sourceId);
      }
    },

    moveClipTo: (
      state,
      action: PayloadAction<{ clipId: string; start: number }>
    ) => {
      const clip = state.clips[action.payload.clipId];
      if (clip) state.clips[clip.id] = moveClip(clip, action.payload.start);
    },

    trimClipStart: (
      state,
      action: PayloadAction<{ clipId: string; start: number }>
    ) => {
      const clip = state.clips[action.payload.clipId];
      if (!clip) return;
      const source = state.sources[clip.sourceId];
      state.clips[clip.id] = trimStart(
        clip,
        action.payload.start,
        source?.duration ?? clip.duration
      );
    },

    trimClipEnd: (
      state,
      action: PayloadAction<{ clipId: string; end: number }>
    ) => {
      const clip = state.clips[action.payload.clipId];
      if (!clip) return;
      const source = state.sources[clip.sourceId];
      state.clips[clip.id] = trimEnd(
        clip,
        action.payload.end,
        source?.duration ?? clip.duration
      );
    },

    setClipFades: (
      state,
      action: PayloadAction<{ clipId: string; fadeIn: number; fadeOut: number }>
    ) => {
      const clip = state.clips[action.payload.clipId];
      if (clip) {
        state.clips[clip.id] = setFades(
          clip,
          action.payload.fadeIn,
          action.payload.fadeOut
        );
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(addAudioFile.pending, (state, action) => {
        state.loading[action.meta.arg.file.name] = true;
      })
      .addCase(addAudioFile.fulfilled, (state, action) => {
        const { trackId, sourceId, clipId, name, color, duration, peaks } =
          action.payload;

        delete state.loading[action.meta.arg.file.name];

        state.byId[trackId] = {
          id: trackId,
          name,
          volume: 1,
          muted: false,
          solo: false,
          color: color ?? TRACK_COLORS[state.allIds.length % TRACK_COLORS.length],
        };
        state.allIds.push(trackId);

        state.sources[sourceId] = { id: sourceId, name, duration, peaks };

        state.clips[clipId] = {
          id: clipId,
          trackId,
          sourceId,
          start: 0,
          offset: 0,
          duration,
          fadeIn: 0,
          fadeOut: 0,
          gain: 1,
        };
        state.clipIds.push(clipId);
      })
      .addCase(addAudioFile.rejected, (state, action) => {
        delete state.loading[action.meta.arg.file.name];
      });
  },
});

export const {
  restoreTracks,
  removeTrack,
  setVolume,
  toggleMute,
  toggleSolo,
  setAlbumArt,
  splitClipAt,
  removeClip,
  moveClipTo,
  trimClipStart,
  trimClipEnd,
  setClipFades,
} = tracksSlice.actions;
export default tracksSlice.reducer;
