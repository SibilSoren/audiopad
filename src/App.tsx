import { useEffect, useState, useCallback, useRef } from 'react';
import { ToastContainer } from 'react-toastify';
import { FaMusic } from 'react-icons/fa';

import { useAppDispatch, useAppSelector } from './store/store';
import { play, pause, stop, playbackEnded } from './store/transportSlice';
import { selectTrackIds } from './store/selectors';
import { AudioEngine } from './audio/AudioEngine';
import { useAudioFiles } from './hooks/useAudioFiles';
import { TransportControls } from './components/TransportControls';
import { TrackControls } from './components/TrackControls';
import { MasterControls } from './components/MasterControls';
import { WaveformCanvas } from './components/WaveformCanvas';
import { HelpDialog } from './components/HelpDialog';

import 'react-toastify/dist/ReactToastify.css';
import './styles/global.scss';

function App() {
  const dispatch = useAppDispatch();
  const isPlaying = useAppSelector((state) => state.transport.isPlaying);
  const trackIds = useAppSelector(selectTrackIds);
  const masterVolume = useAppSelector((state) => state.mixer.masterVolume);
  const { addFiles } = useAudioFiles();

  // Read during initialisation rather than setting state from an effect.
  const [showHelp, setShowHelp] = useState(
    () => !localStorage.getItem('audiowave-visited')
  );
  const [isDragging, setIsDragging] = useState(false);
  // Drag events fire for every child element, so nesting has to be counted.
  const dragDepth = useRef(0);

  useEffect(() => {
    localStorage.setItem('audiowave-visited', 'true');
  }, []);

  // The engine owns the clock, so it is what knows playback finished. Without
  // this the transport stayed "playing" forever once the audio ran out.
  useEffect(() => {
    const engine = AudioEngine.getInstance();
    engine.setOnEnded(() => dispatch(playbackEnded()));
    // The store starts at 0.8; without this the engine would sit at unity
    // until the fader is first moved.
    engine.setMasterVolume(masterVolume);
    return () => engine.setOnEnded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          dispatch(isPlaying ? pause() : play());
          break;
        case 'Escape':
          dispatch(stop());
          setShowHelp(false);
          break;
      }
    },
    [dispatch, isPlaying]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`app${isDragging ? ' app--dragging' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <TransportControls onHelpClick={() => setShowHelp(true)} />

      <div className="workspace">
        <div className="controls-panel">
          {trackIds.length === 0 ? (
            <div className="empty-state">
              <FaMusic className="empty-state__icon" aria-hidden="true" />
              <div className="empty-state__text">No tracks</div>
              <div className="empty-state__hint">Drop audio files anywhere</div>
            </div>
          ) : (
            trackIds.map((id) => <TrackControls key={id} id={id} />)
          )}

          <MasterControls />
        </div>

        <WaveformCanvas />
      </div>

      {isDragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__inner">Drop audio files to add tracks</div>
        </div>
      )}

      <HelpDialog isOpen={showHelp} onClose={() => setShowHelp(false)} />

      <ToastContainer theme="dark" />
    </div>
  );
}

export default App;
