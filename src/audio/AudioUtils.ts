import { computePeaks } from './peaks';

export const loadAudioBuffer = async (ctx: AudioContext, url: string): Promise<AudioBuffer> => {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
};

/** Waveform peaks for the first channel. See peaks.ts for the maths. */
export const getPeakData = (buffer: AudioBuffer, samples: number): number[] =>
  computePeaks(buffer.getChannelData(0), samples);
