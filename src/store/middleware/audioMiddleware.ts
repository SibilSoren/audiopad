import { type Middleware } from '@reduxjs/toolkit';
import { AudioEngine } from '../../audio/AudioEngine';
import { effectiveMute, hasAnySolo } from '../../audio/mixing';
import { play, pause, stop, seek } from '../transportSlice';
import {
  setVolume,
  toggleMute,
  toggleSolo,
  removeTrack,
  addAudioFile,
} from '../tracksSlice';
import { setMasterVolume } from '../mixerSlice';
import type { AudioTrack, Clip } from '../../models/types';

interface TracksSliceState {
  byId: Record<string, AudioTrack>;
  allIds: string[];
  clips: Record<string, Clip>;
  clipIds: string[];
}

interface AppState {
  tracks: TracksSliceState;
}

/**
 * Push the whole mixer state at the engine rather than trying to apply each
 * action incrementally.
 *
 * The old middleware nudged individual gains per action, which is how mute,
 * solo and volume ended up disagreeing: solo wrote to every track's gain,
 * volume was skipped entirely while muted, and neither restored the other.
 * Recomputing from state is cheap and cannot drift.
 */
function syncMixer(state: AppState) {
  const engine = AudioEngine.getInstance();
  const tracks = state.tracks.allIds
    .map((id) => state.tracks.byId[id])
    .filter(Boolean);
  const anySolo = hasAnySolo(tracks);

  for (const track of tracks) {
    engine.ensureTrack(track.id);
    engine.setTrackVolume(track.id, track.volume);
    engine.setTrackMuted(track.id, effectiveMute(track, anySolo));
  }
}

function syncClips(state: AppState) {
  const clips = state.tracks.clipIds
    .map((id) => state.tracks.clips[id])
    .filter(Boolean);
  AudioEngine.getInstance().setClips(clips);
}

export const audioMiddleware: Middleware<object, AppState> =
  (store) => (next) => (action) => {
    const result = next(action);
    const engine = AudioEngine.getInstance();
    const state = store.getState();

    if (play.match(action)) {
      engine.play();
    } else if (pause.match(action)) {
      engine.pause();
    } else if (stop.match(action)) {
      engine.stop();
    } else if (seek.match(action)) {
      engine.seek(action.payload);
    } else if (
      setVolume.match(action) ||
      toggleMute.match(action) ||
      toggleSolo.match(action)
    ) {
      syncMixer(state);
    } else if (addAudioFile.fulfilled.match(action)) {
      // Order matters: the track's nodes have to exist before its clip is
      // scheduled onto them.
      syncMixer(state);
      syncClips(state);
    } else if (setMasterVolume.match(action)) {
      engine.setMasterVolume(action.payload);
    } else if (removeTrack.match(action)) {
      engine.removeTrack(action.payload);
      syncClips(state);
      syncMixer(state);
    }

    return result;
  };
