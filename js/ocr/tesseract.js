// Lazy loader for Tesseract.js (OCR engine, fetched on first OCR use).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.

// Lazy-load Tesseract.js (several MB) only when an OCR button is first used.
export const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
export let tesseractPromise = null;
export function loadTesseract() {
  if (typeof Tesseract !== 'undefined') return Promise.resolve(true);
  if (!tesseractPromise) {
    tesseractPromise = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = TESSERACT_SRC;
      s.onload = () => resolve(true);
      s.onerror = () => { tesseractPromise = null; s.remove(); resolve(false); }; // allow retry
      document.head.appendChild(s);
    });
  }
  return tesseractPromise;
}
