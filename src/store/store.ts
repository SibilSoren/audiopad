import { configureStore } from '@reduxjs/toolkit';
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import tracksReducer from './tracksSlice';
import transportReducer from './transportSlice';
import { audioMiddleware } from './middleware/audioMiddleware';

export const store = configureStore({
  reducer: {
    tracks: tracksReducer,
    transport: transportReducer
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(audioMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
