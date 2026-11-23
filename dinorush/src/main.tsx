import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { App } from './ui/App';
import { store } from './state/store';
import { generateTrack } from './game/trackGenerator';

// Debug/testing handle (local game state only, no secrets).
(window as unknown as { __dinorush: unknown }).__dinorush = { store, generateTrack };

createRoot(document.getElementById('root')!).render(<App />);

// Service worker only in production builds (offline PWA).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support unavailable (e.g. plain http on LAN) */
    });
  });
}

// Prevent pinch / double-tap zoom gestures on iOS during play.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener(
  'dblclick',
  (e) => {
    e.preventDefault();
  },
  { passive: false },
);
