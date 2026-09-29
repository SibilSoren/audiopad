import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ToastContainer } from 'react-toastify';
import { FaMusic } from 'react-icons/fa';

import { useAppDispatch, useAppSelector } from './store/store';
import { play, pause, stop, playbackEnded } from './store/transportSlice';
import { selectTracks, selectDuration } from './store/selectors';
import { splitClipAt, removeClip } from './store/tracksSlice';
import { selectClip, setView, markAutoFitted } from './store/uiSlice';
import { undo, redo } from './store/historySlice';
import { AudioEngine } from './audio/AudioEngine';
import { useAudioFiles } from './hooks/useAudioFiles';
import { useElementWidth } from './hooks/useElementWidth';
import { TransportControls } from './components/TransportControls';
import { TrackControls } from './components/TrackControls';
import { MasterControls } from './components/MasterControls';
import { TimelineRuler } from './components/TimelineRuler';
import { TrackLanes } from './components/TrackLanes';
import { TimelineScrollbar } from './components/TimelineScrollbar';
import { ZoomControls } from './components/ZoomControls';
import { UndoControls } from './components/UndoControls';
import { HelpDialog } from './components/HelpDialog';
import {
  fitZoom,
  clampViewStart,
  zoomAround,
  visibleDuration,
  RULER_HEIGHT,
  type Viewport,
} from './lib/viewport';

import 'react-toastify/dist/ReactToastify.css';
import './styles/global.scss';

function App() {
  const dispatch = useAppDispatch();
  const isPlaying = useAppSelector((state) => state.transport.isPlaying);
  const tracks = useAppSelector(selectTracks);
  const duration = useAppSelector(selectDuration);
  const masterVolume = useAppSelector((state) => state.mixer.masterVolume);
  const { selectedClipId, pixelsPerSecond, viewStart, hasAutoFitted } = useAppSelector(
    (state) => state.ui
  );
  const { addFiles } = useAudioFiles();

  const { ref: timelineRef, width } = useElementWidth<HTMLDivElement>();
  const view: Viewport = useMemo(
    () => ({ viewStart, pixelsPerSecond, width }),
    [viewStart, pixelsPerSecond, width]
  );

  const [showHelp, setShowHelp] = useState(
    () => !localStorage.getItem('audiowave-visited')
  );
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  // The strip and the lanes are separate scroll containers so the ruler and
  // the master section can stay pinned. Their scroll positions are mirrored
  // so a track's controls always sit beside its lane.
  const stripScrollRef = useRef<HTMLDivElement>(null);
  const lanesScrollRef = useRef<HTMLDivElement>(null);
  const syncingScroll = useRef(false);

  const syncScroll = (from: 'strip' | 'lanes') => {
    if (syncingScroll.current) return;
    const source = from === 'strip' ? stripScrollRef.current : lanesScrollRef.current;
    const target = from === 'strip' ? lanesScrollRef.current : stripScrollRef.current;
    if (!source || !target) return;

    syncingScroll.current = true;
    target.scrollTop = source.scrollTop;
    // Released on the next frame: assigning scrollTop fires a scroll event.
    requestAnimationFrame(() => {
      syncingScroll.current = false;
    });
  };

  useEffect(() => {
    localStorage.setItem('audiowave-visited', 'true');
  }, []);

  useEffect(() => {
    const engine = AudioEngine.getInstance();
    engine.setOnEnded(() => dispatch(playbackEnded()));
    engine.setMasterVolume(masterVolume);
    return () => engine.setOnEnded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Frame the arrangement once, when the first track arrives. Later additions
  // leave the view alone rather than yanking it around mid-edit.
  useEffect(() => {
    if (hasAutoFitted || tracks.length === 0 || width === 0) return;
    dispatch(setView({ pixelsPerSecond: fitZoom(duration, width), viewStart: 0 }));
    dispatch(markAutoFitted());
  }, [hasAutoFitted, tracks.length, width, duration, dispatch]);

  const scrollBy = useCallback(
    (seconds: number) => {
      dispatch(
        setView({ viewStart: clampViewStart(viewStart + seconds, duration, view) })
      );
    },
    [dispatch, viewStart, duration, view]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      // Undo and redo before the switch: they are modified keys and would
      // otherwise fall through to the plain-key cases.
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
        e.preventDefault();
        dispatch(e.shiftKey ? redo() : undo());
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          dispatch(isPlaying ? pause() : play());
          break;
        case 'Escape':
          dispatch(stop());
          dispatch(selectClip(null));
          setShowHelp(false);
          break;
        case 'KeyS':
          if (selectedClipId) {
            e.preventDefault();
            dispatch(splitClipAt(selectedClipId, AudioEngine.getInstance().currentTime));
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          scrollBy(-visibleDuration(view) * (e.shiftKey ? 0.9 : 0.1));
          break;
        case 'ArrowRight':
          e.preventDefault();
          scrollBy(visibleDuration(view) * (e.shiftKey ? 0.9 : 0.1));
          break;
        case 'Home':
          e.preventDefault();
          dispatch(setView({ viewStart: 0 }));
          break;
        case 'End':
          e.preventDefault();
          dispatch(setView({ viewStart: clampViewStart(duration, duration, view) }));
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedClipId) {
            e.preventDefault();
            dispatch(removeClip(selectedClipId));
            dispatch(selectClip(null));
          }
          break;
      }
    },
    [dispatch, isPlaying, selectedClipId, scrollBy, view, duration]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  /**
   * Ctrl or Cmd plus wheel zooms around the pointer. A horizontal gesture, or
   * shift plus wheel, scrolls the timeline.
   *
   * Plain vertical wheel is deliberately left alone so the browser can scroll
   * the lanes: mapping it to horizontal movement as well meant one gesture
   * moved both axes at once.
   */
  const onWheel = (e: React.WheelEvent) => {
    if (width === 0) return;

    if (e.ctrlKey || e.metaKey) {
      const rect = e.currentTarget.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      dispatch(setView(zoomAround(view, factor, e.clientX - rect.left, duration)));
      return;
    }

    const horizontal = e.shiftKey ? e.deltaY : e.deltaX;
    if (horizontal === 0) return;
    scrollBy(horizontal / pixelsPerSecond);
  };

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
      <TransportControls onHelpClick={() => setShowHelp(true)}>
        <UndoControls />
        <ZoomControls width={width} />
      </TransportControls>

      <div className="workspace">
        <div className="panel">
          <div className="panel__head" style={{ height: RULER_HEIGHT }}>
            <span className="panel__head-label">Tracks</span>
          </div>

          <div
            className="panel__scroll"
            ref={stripScrollRef}
            onScroll={() => syncScroll('strip')}
          >
            {tracks.length === 0 ? (
              <div className="empty-state">
                <FaMusic className="empty-state__icon" aria-hidden="true" />
                <div className="empty-state__text">No tracks</div>
                <div className="empty-state__hint">Drop audio files anywhere</div>
              </div>
            ) : (
              tracks.map((track) => <TrackControls key={track.id} id={track.id} />)
            )}
          </div>

          <MasterControls />
        </div>

        <div className="timeline" ref={timelineRef} onWheel={onWheel}>
          <TimelineRuler width={width} />
          <div
            className="timeline__scroll"
            ref={lanesScrollRef}
            onScroll={() => syncScroll('lanes')}
          >
            <TrackLanes width={width} />
          </div>
          <TimelineScrollbar width={width} />
        </div>
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
