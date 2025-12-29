import { useAppDispatch, useAppSelector } from '../store/store';
import { play, pause, stop } from '../store/transportSlice';
import { FaPlay, FaPause, FaStop, FaInfoCircle } from 'react-icons/fa';
import { v4 as uuidv4 } from 'uuid';
import { addTrack, loadTrackAudio, setAlbumArt } from '../store/tracksSlice';
import { toast } from 'react-toastify';
import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import * as musicMetadata from 'music-metadata-browser';

interface TransportControlsProps {
  onHelpClick: () => void;
}

export const TransportControls = ({ onHelpClick }: TransportControlsProps) => {
    const dispatch = useAppDispatch();
    const isPlaying = useAppSelector(state => state.transport.isPlaying);
    const rafRef = useRef<number>(0);
    
    // Use local state for timer to avoid Redux overhead
    const [displayTime, setDisplayTime] = useState(0);

    useEffect(() => {
        const updateTime = () => {
            const engine = AudioEngine.getInstance();
            setDisplayTime(engine.currentTime);
            rafRef.current = requestAnimationFrame(updateTime);
        };

        if (isPlaying) {
            rafRef.current = requestAnimationFrame(updateTime);
        } else {
            // Update once when stopped to show correct time
            setDisplayTime(AudioEngine.getInstance().currentTime);
        }

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [isPlaying]);

    const formatTime = (time: number) => {
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        const ms = Math.floor((time % 1) * 100);
        return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    };

    const extractAlbumArt = async (file: File, trackId: string) => {
        try {
            const metadata = await musicMetadata.parseBlob(file);
            const picture = metadata.common.picture?.[0];
            
            if (picture) {
                const base64 = btoa(
                    picture.data.reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                const dataUrl = `data:${picture.format};base64,${base64}`;
                dispatch(setAlbumArt({ id: trackId, albumArt: dataUrl }));
            }
        } catch (error) {
            console.log('Could not parse metadata:', error);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            const id = uuidv4();
            const name = file.name.replace(/\.[^/.]+$/, '');
            
            dispatch(addTrack({ id, name }));
            dispatch(loadTrackAudio({ id, url, name }));
            extractAlbumArt(file, id);
            
            toast.success(`"${name}" added`, {
                position: 'bottom-right',
                autoClose: 2000,
            });
        }
        e.target.value = '';
    };

    return (
        <div className="header">
            <div className="controls">
                {!isPlaying ? (
                    <button onClick={() => dispatch(play())} className="btn btn--primary btn--icon">
                        <FaPlay style={{ marginLeft: 2 }} />
                    </button>
                ) : (
                    <button onClick={() => dispatch(pause())} className="btn btn--primary btn--icon">
                        <FaPause />
                    </button>
                )}
                <button onClick={() => dispatch(stop())} className="btn btn--icon">
                     <FaStop />
                </button>
            </div>
            
            <div className="time-display">
                {formatTime(displayTime)}
            </div>

            <label className="btn" style={{ cursor: 'pointer' }}>
                + Add Track
                <input 
                    type="file" 
                    accept="audio/*" 
                    style={{ display: 'none' }} 
                    onChange={handleFileUpload}
                />
            </label>
            
            <div className="header-title">
                <img src="/logo.png" alt="AudioPad" className="header-logo" />
                Audio<span className="header-title-accent">Pad</span>
            </div>
            
            <button onClick={onHelpClick} className="btn btn--icon" title="Info">
                <FaInfoCircle />
            </button>
        </div>
    );
};
