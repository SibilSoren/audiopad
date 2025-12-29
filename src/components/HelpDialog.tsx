import { FaTimes } from 'react-icons/fa';

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpDialog = ({ isOpen, onClose }: HelpDialogProps) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="modal__title">AudioPad</h2>
          <button className="btn btn--icon btn--sm" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        
        <div className="modal__content">
          <h3>Quick Start</h3>
          <ul>
            <li>Click "+ Add Track" to upload audio files</li>
            <li>Use Play/Pause/Stop controls to manage playback</li>
            <li>Click on the waveform to seek</li>
          </ul>
          
          <h3>Track Controls</h3>
          <ul>
            <li><strong>M</strong> — Mute/unmute the track</li>
            <li><strong>S</strong> — Solo mode (plays only this track)</li>
            <li><strong>Slider</strong> — Adjust track volume</li>
          </ul>
          
          <h3>Keyboard Shortcuts</h3>
          <ul>
            <li><kbd>Space</kbd> Play / Pause</li>
            <li><kbd>Esc</kbd> Stop playback</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
