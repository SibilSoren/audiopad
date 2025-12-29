import { useEffect, useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from './store/store';
import { play, pause, stop } from './store/transportSlice';
import { TransportControls } from './components/TransportControls';
import { TrackControls } from './components/TrackControls';
import { WaveformCanvas } from './components/WaveformCanvas';
import { HelpDialog } from './components/HelpDialog';
import { ToastContainer } from 'react-toastify';
import { FaMusic } from 'react-icons/fa';
import 'react-toastify/dist/ReactToastify.css';
import './styles/global.scss';

function App() {
  const dispatch = useAppDispatch();
  const isPlaying = useAppSelector(state => state.transport.isPlaying);
  const trackIds = useAppSelector(state => state.tracks.allIds);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const hasVisited = localStorage.getItem('audiowave-visited');
    if (!hasVisited) {
      setShowHelp(true);
      localStorage.setItem('audiowave-visited', 'true');
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (isPlaying) {
          dispatch(pause());
        } else {
          dispatch(play());
        }
        break;
      case 'Escape':
        dispatch(stop());
        setShowHelp(false);
        break;
    }
  }, [dispatch, isPlaying]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="app">
      <TransportControls onHelpClick={() => setShowHelp(true)} />
      
      <div className="workspace">
        {/* Left: Track Controls Panel */}
        <div className="controls-panel">
          {trackIds.length === 0 ? (
            <div className="empty-state">
              <FaMusic className="empty-state__icon" />
              <div className="empty-state__text">No tracks</div>
              <div className="empty-state__hint">Click "+ Add Track"</div>
            </div>
          ) : (
            trackIds.map((id) => (
              <TrackControls key={id} id={id} />
            ))
          )}
        </div>
        
        {/* Right: Shared Timeline Canvas */}
        <WaveformCanvas />
      </div>
      
      <HelpDialog isOpen={showHelp} onClose={() => setShowHelp(false)} />
      
      <ToastContainer theme="dark" />
    </div>
  );
}

export default App;
