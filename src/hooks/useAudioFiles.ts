import { useCallback } from 'react';
import { toast } from 'react-toastify';
import { useAppDispatch } from '../store/store';
import { addAudioFile, setAlbumArt } from '../store/tracksSlice';

const AUDIO_PATTERN = /^audio\//;

/**
 * Adding audio files, shared by the file picker and the drop target so both
 * routes behave identically.
 */
export function useAudioFiles() {
  const dispatch = useAppDispatch();

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter(
        (file) => AUDIO_PATTERN.test(file.type) || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(file.name)
      );

      if (files.length === 0) {
        toast.error('No audio files in that drop', {
          position: 'bottom-right',
          autoClose: 3000,
        });
        return;
      }

      for (const file of files) {
        try {
          const result = await dispatch(addAudioFile({ file })).unwrap();

          toast.success(`"${result.name}" added`, {
            position: 'bottom-right',
            autoClose: 2000,
          });

          // Artwork is cosmetic and the parser is heavy, so it is loaded on
          // demand and never blocks the track appearing.
          void extractAlbumArt(file).then((art) => {
            if (art) dispatch(setAlbumArt({ id: result.trackId, albumArt: art }));
          });
        } catch {
          // Previously a failed decode set loading=false and said nothing, so
          // a bad file just silently never appeared.
          toast.error(`Could not decode "${file.name}"`, {
            position: 'bottom-right',
            autoClose: 4000,
          });
        }
      }
    },
    [dispatch]
  );

  return { addFiles };
}

async function extractAlbumArt(file: File): Promise<string | null> {
  try {
    const musicMetadata = await import('music-metadata-browser');
    const metadata = await musicMetadata.parseBlob(file);
    const picture = metadata.common.picture?.[0];
    if (!picture) return null;

    let binary = '';
    for (const byte of picture.data) {
      binary += String.fromCharCode(byte);
    }
    return `data:${picture.format};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
