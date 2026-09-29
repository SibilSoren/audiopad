import { useEffect, useRef, useState } from 'react';
import { FaPlay, FaPause, FaStop, FaInfoCircle } from 'react-icons/fa';

import { useAppDispatch, useAppSelector } from '../store/store';
import { play, pause, stop } from '../store/transportSlice';
import { AudioEngine } from '../audio/AudioEngine';
import { useAudioFiles } from '../hooks/useAudioFiles';
import { formatTime } from '../lib/time';

interface TransportControlsProps {
  onHelpClick: () => void;
  /** Slot for the zoom controls, which need the timeline's measured width. */
  children?: React.ReactNode;
}

export const TransportControls = ({ onHelpClick, children }: TransportControlsProps) => {
  const dispatch = useAppDispatch();
  const isPlaying = useAppSelector((state) => state.transport.isPlaying);
  const { addFiles } = useAudioFiles();

  const rafRef = useRef<number>(0);
  // Local state rather than Redux: this ticks at 60fps and nothing else needs it.
  const [displayTime, setDisplayTime] = useState(0);

  useEffect(() => {
    const updateTime = () => {
      setDisplayTime(AudioEngine.getInstance().currentTime);
      rafRef.current = requestAnimationFrame(updateTime);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateTime);
    } else {
      rafRef.current = requestAnimationFrame(() => {
        setDisplayTime(AudioEngine.getInstance().currentTime);
      });
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="header">
      <div className="controls">
        {!isPlaying ? (
          <button
            onClick={() => dispatch(play())}
            className="btn btn--primary btn--icon"
            aria-label="Play"
          >
            <FaPlay style={{ marginLeft: 2 }} aria-hidden="true" />
          </button>
        ) : (
          <button
            onClick={() => dispatch(pause())}
            className="btn btn--primary btn--icon"
            aria-label="Pause"
          >
            <FaPause aria-hidden="true" />
          </button>
        )}
        <button
          onClick={() => dispatch(stop())}
          className="btn btn--icon"
          aria-label="Stop"
        >
          <FaStop aria-hidden="true" />
        </button>
      </div>

      <div className="time-display" aria-live="off">
        {formatTime(displayTime)}
      </div>

      <label className="btn" style={{ cursor: 'pointer' }}>
        + Add Tracks
        <input
          type="file"
          accept="audio/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {children}

      <div className="header-title">
        <img src="/logo.png" alt="" className="header-logo" />
        Audio<span className="header-title-accent">Pad</span>
      </div>

      <button onClick={onHelpClick} className="btn btn--icon" aria-label="About AudioPad">
        <FaInfoCircle aria-hidden="true" />
      </button>
    </div>
  );
};
