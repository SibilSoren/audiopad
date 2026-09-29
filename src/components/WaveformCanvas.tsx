import { useRef, useEffect, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../store/store';
import { AudioEngine } from '../audio/AudioEngine';
import { seek } from '../store/transportSlice';
import {
  selectClips,
  selectTracks,
  selectSources,
  selectDuration,
} from '../store/selectors';

const RULER_HEIGHT = 24;

export const WaveformCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();

  const tracks = useAppSelector(selectTracks);
  const clips = useAppSelector(selectClips);
  const sources = useAppSelector(selectSources);
  const duration = useAppSelector(selectDuration);
  const isPlaying = useAppSelector((state) => state.transport.isPlaying);

  const requestRef = useRef<number>(0);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || duration <= 0) return;

      const rect = canvas.getBoundingClientRect();
      // rect.width, not canvas.width: the backing store is scaled by the
      // device pixel ratio and would map clicks to the wrong time.
      const ratio = (e.clientX - rect.left) / rect.width;
      dispatch(seek(Math.max(0, Math.min(ratio, 1)) * duration));
    },
    [dispatch, duration]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // CSS pixels - the context is already scaled for the device ratio.
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    if (tracks.length === 0) {
      ctx.fillStyle = '#737373';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Drop audio files here', width / 2, height / 2);
      return;
    }

    // Ruler
    ctx.fillStyle = '#242424';
    ctx.fillRect(0, 0, width, RULER_HEIGHT);
    ctx.fillStyle = '#737373';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';

    const step = Math.max(1, Math.ceil(duration / 20));
    for (let t = 0; t <= duration; t += step) {
      const x = (t / duration) * width;
      ctx.fillRect(x, RULER_HEIGHT - 8, 1, 8);
      const min = Math.floor(t / 60);
      const sec = Math.floor(t % 60);
      ctx.fillText(`${min}:${sec.toString().padStart(2, '0')}`, x, RULER_HEIGHT - 12);
    }

    const laneHeight = (height - RULER_HEIGHT) / tracks.length;

    tracks.forEach((track, index) => {
      const y = RULER_HEIGHT + index * laneHeight;
      const centerY = y + laneHeight / 2;

      if (index > 0) {
        ctx.fillStyle = '#404040';
        ctx.fillRect(0, y, width, 1);
      }

      // Clips are drawn where they sit on the timeline, so this already
      // supports more than one clip per track.
      const trackClips = clips.filter((c) => c.trackId === track.id);

      for (const clip of trackClips) {
        const source = sources[clip.sourceId];
        const clipX = (clip.start / duration) * width;
        const clipW = (clip.duration / duration) * width;

        ctx.fillStyle = `${track.color}22`;
        ctx.fillRect(clipX, y + 2, clipW, laneHeight - 4);

        if (!source?.peaks?.length) {
          ctx.fillStyle = '#525252';
          ctx.font = '12px Inter, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText('Loading...', clipX + 8, centerY);
          continue;
        }

        // The clip covers a window of its source, so take the matching slice
        // of the source's peaks rather than the whole array.
        const peaks = source.peaks;
        const from = Math.floor((clip.offset / source.duration) * peaks.length);
        const to = Math.ceil(
          ((clip.offset + clip.duration) / source.duration) * peaks.length
        );
        const slice = peaks.slice(Math.max(0, from), Math.min(peaks.length, to));

        ctx.fillStyle = track.color;
        const barWidth = Math.max(1, clipW / Math.max(1, slice.length));

        for (let i = 0; i < slice.length; i++) {
          const barHeight = Math.max(2, slice[i] * (laneHeight * 0.7));
          ctx.fillRect(
            clipX + i * barWidth,
            centerY - barHeight / 2,
            Math.max(0.5, barWidth - 0.5),
            barHeight
          );
        }
      }

      // Label last, so it sits above the waveform.
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      const labelWidth = ctx.measureText(track.name).width + 16;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(8, y + 8, labelWidth, 18);
      ctx.fillStyle = track.color;
      ctx.fillText(track.name.toUpperCase(), 16, y + 21);
    });

    // Playhead
    const playheadX = (AudioEngine.getInstance().currentTime / duration) * width;
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(playheadX - 1, 0, 2, height);
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();
  }, [tracks, clips, sources, duration]);

  // Size the backing store to the device pixel ratio. Without this the canvas
  // was one CSS pixel per device pixel and every waveform was soft on a
  // retina display.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = container;

    canvas.style.width = `${clientWidth}px`;
    canvas.style.height = `${clientHeight}px`;
    canvas.width = Math.round(clientWidth * dpr);
    canvas.height = Math.round(clientHeight * dpr);

    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

    draw();
  }, [draw]);

  useEffect(() => {
    resize();
    const observer = new ResizeObserver(resize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [resize]);

  useEffect(() => {
    draw();
    if (!isPlaying) return;

    const tick = () => {
      draw();
      requestRef.current = requestAnimationFrame(tick);
    };
    requestRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, draw]);

  return (
    <div ref={containerRef} className="timeline-canvas">
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'pointer' }}
        onClick={handleCanvasClick}
        role="slider"
        tabIndex={0}
        aria-label="Timeline position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(AudioEngine.getInstance().currentTime)}
      />
    </div>
  );
};
