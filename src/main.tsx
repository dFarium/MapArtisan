import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// React's development build emits User Timing measures for component tracks.
// Rapid slider commits can create tens of thousands of entries whose Blink-side
// payload is not represented by the live JS heap. Keep that diagnostic buffer
// bounded during normal development; Performance recordings still receive the
// events as they happen.
if (import.meta.env.DEV) {
  const MAX_DEV_USER_TIMING_ENTRIES = 250
  const clearDevelopmentUserTimingBuffer = () => {
    if (performance.getEntriesByType('measure').length >= MAX_DEV_USER_TIMING_ENTRIES) {
      performance.clearMeasures()
    }
    if (performance.getEntriesByType('mark').length >= MAX_DEV_USER_TIMING_ENTRIES) {
      performance.clearMarks()
    }
  }

  const userTimingCleanupInterval = window.setInterval(clearDevelopmentUserTimingBuffer, 250)
  import.meta.hot?.dispose(() => window.clearInterval(userTimingCleanupInterval))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Service Worker for texture caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
