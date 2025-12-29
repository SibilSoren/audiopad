import { type Middleware } from '@reduxjs/toolkit';
import { AudioEngine } from '../../audio/AudioEngine';
import { play, pause, stop, setCurrentTime } from '../transportSlice';
import { setVolume, toggleMute, toggleSolo, removeTrack } from '../tracksSlice';

// Define minimal state shape needed by middleware
interface TrackState {
  muted: boolean;
  solo: boolean;
  volume: number;
}

interface TracksSliceState {
  byId: Record<string, TrackState>;
  allIds: string[];
}

interface AppState {
  tracks: TracksSliceState;
}

export const audioMiddleware: Middleware<{}, AppState> = (store) => (next) => (action) => {
  const engine = AudioEngine.getInstance();
  
  // Process action first for state updates
  const result = next(action);
  
  // Then react to changes
  if (play.match(action)) {
    engine.play();
  } else if (pause.match(action)) {
    engine.pause();
  } else if (stop.match(action)) {
    engine.stop();
  } else if (setCurrentTime.match(action)) {
    engine.seek(action.payload);
  } else if (setVolume.match(action)) {
    const { id, volume } = action.payload;
    const track = store.getState().tracks.byId[id];
    // Apply volume only if not muted
    if (track && !track.muted) {
      engine.setTrackVolume(id, volume);
    }
  } else if (toggleMute.match(action)) {
    const id = action.payload;
    const track = store.getState().tracks.byId[id];
    if (track) {
      engine.muteTrack(id, track.muted);
    }
  } else if (toggleSolo.match(action)) {
    // Solo: mute all other tracks, unmute this one
    const state = store.getState().tracks;
    const hasSolo = Object.values(state.byId).some((t: TrackState) => t.solo);
    
    state.allIds.forEach((id: string) => {
      const track = state.byId[id];
      if (hasSolo) {
        // If any track is solo, mute tracks that are NOT solo
        engine.muteTrack(id, !track.solo);
      } else {
        // No solo active, restore based on mute state
        engine.muteTrack(id, track.muted);
      }
    });
  } else if (removeTrack.match(action)) {
    engine.removeTrack(action.payload);
  }

  return result;
};
