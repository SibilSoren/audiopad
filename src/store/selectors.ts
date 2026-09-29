import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import { arrangementEnd } from '../audio/scheduling';
import { hasAnySolo } from '../audio/mixing';
import { MIN_TIMELINE_SECONDS } from '../lib/time';
import type { Clip, AudioTrack } from '../models/types';

export const selectTrackIds = (state: RootState) => state.tracks.allIds;
export const selectTracksById = (state: RootState) => state.tracks.byId;
export const selectClipsById = (state: RootState) => state.tracks.clips;
export const selectClipIds = (state: RootState) => state.tracks.clipIds;
export const selectSources = (state: RootState) => state.tracks.sources;

export const selectTracks = createSelector(
  [selectTrackIds, selectTracksById],
  (ids, byId): AudioTrack[] => ids.map((id) => byId[id]).filter(Boolean)
);

export const selectClips = createSelector(
  [selectClipIds, selectClipsById],
  (ids, byId): Clip[] => ids.map((id) => byId[id]).filter(Boolean)
);

/**
 * The timeline length, derived from the arrangement.
 *
 * Replaces the hardcoded 120s that transport state used to carry and never
 * update. Being derived, it also self-corrects when a track is removed.
 */
export const selectDuration = createSelector([selectClips], (clips) =>
  Math.max(MIN_TIMELINE_SECONDS, arrangementEnd(clips))
);

export const selectAnySolo = createSelector([selectTracks], (tracks) =>
  hasAnySolo(tracks)
);
