import { FaDownload, FaSpinner } from 'react-icons/fa'
import { useExportMix } from '../hooks/useExportMix'

export const ExportButton = () => {
  const { exportMix, isExporting, canExport } = useExportMix()

  return (
    <button
      className="btn"
      onClick={() => void exportMix()}
      disabled={!canExport || isExporting}
      aria-label="Export the mix as a WAV file"
      title="Export WAV"
    >
      {isExporting ? (
        <>
          <FaSpinner className="spin" aria-hidden="true" /> Rendering
        </>
      ) : (
        <>
          <FaDownload aria-hidden="true" /> Export
        </>
      )}
      <span aria-live="polite" className="sr-only">
        {isExporting ? 'Rendering the mix' : ''}
      </span>
    </button>
  )
}
