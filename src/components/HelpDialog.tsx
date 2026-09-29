import { FaTimes } from 'react-icons/fa';

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpDialog = ({ isOpen, onClose }: HelpDialogProps) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2 className="modal__title" id="help-title">
            AudioPad
          </h2>
          <button className="btn btn--icon" onClick={onClose} aria-label="Close">
            <FaTimes aria-hidden="true" />
          </button>
        </div>

        <div className="modal__content">
          <h3>Quick start</h3>
          <ul>
            <li>Drop audio files anywhere in the window, or use <strong>+ Add Tracks</strong></li>
            <li>Several files at once is fine</li>
            <li>Click the timeline to seek</li>
          </ul>

          <h3>Track controls</h3>
          <ul>
            <li><strong>M</strong> — mute</li>
            <li><strong>S</strong> — solo, silencing everything else</li>
            <li><strong>Fader</strong> — track level, independent of mute</li>
          </ul>

          <h3>Editing</h3>
          <ul>
            <li>Click a clip to select it</li>
            <li>Split it at the playhead, or delete it outright</li>
            <li>A split copies no audio — both halves share one buffer</li>
          </ul>

          <h3>Keyboard</h3>
          <ul>
            <li><kbd>Space</kbd> play / pause</li>
            <li><kbd>S</kbd> split the selected clip at the playhead</li>
            <li><kbd>Del</kbd> remove the selected clip</li>
            <li><kbd>Esc</kbd> stop and deselect</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
