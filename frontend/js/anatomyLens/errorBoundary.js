// frontend/js/anatomyLens/errorBoundary.js
// Wraps risky operations and decides: recover or fallback.

import { activateSVGFallback } from './fallback.js';

/**
 * Execute fn safely. On error: log + trigger SVG fallback.
 * @param {Function} fn - async function to execute
 * @param {string} context - label for logging
 * @returns {Promise<any>}
 */
export async function safeExec(fn, context = 'unknown') {
  try {
    return await fn();
  } catch (err) {
    console.error(`[AnatomyLens/${context}]`, err);
    activateSVGFallback();
    return null;
  }
}

/**
 * Wrap a highlight/camera operation that should NOT trigger full fallback on failure.
 * Logs and skips — the 3D viewer stays active, just this operation failed.
 * @param {Function} fn
 * @param {string} context
 */
export async function safeOp(fn, context = 'op') {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[AnatomyLens/${context}] skipped:`, err.message);
    return null;
  }
}
