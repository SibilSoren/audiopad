import { FaUndo, FaRedo } from 'react-icons/fa'
import { useAppDispatch, useAppSelector } from '../store/store'
import { undo, redo } from '../store/historySlice'

export const UndoControls = () => {
  const dispatch = useAppDispatch()
  const canUndo = useAppSelector((state) => state.history.past.length > 0)
  const canRedo = useAppSelector((state) => state.history.future.length > 0)

  return (
    <div className="zoom">
      <button
        className="btn btn--icon"
        onClick={() => dispatch(undo())}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo"
      >
        <FaUndo aria-hidden="true" />
      </button>
      <button
        className="btn btn--icon"
        onClick={() => dispatch(redo())}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo"
      >
        <FaRedo aria-hidden="true" />
      </button>
    </div>
  )
}
