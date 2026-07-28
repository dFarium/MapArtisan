/**
 * Diagnostic logger for MapArtisan.
 *
 * Replaces console.log/console.warn in production with a toggleable mechanism.
 * Logs are suppressed by default and can be enabled via:
 * - URL parameter: `?debug=1` or `?debug=all`
 * - localStorage: `localStorage.setItem('mapartisan:debug', '1')`
 *
 * Usage:
 * ```ts
 * import { debug } from './diagnostic';
 * debug('Worker] Cache miss: No cached source available');
 * debug.warn('Export failed: No image data provided');
 * ```
 */

let debugEnabled = false;

function isDebugEnabled(): boolean {
    if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.has('debug')) return true;
        try {
            if (localStorage.getItem('mapartisan:debug') === '1') return true;
        } catch { /* localStorage may be unavailable */ }
    }
    return false;
}

/**
 * Logs a debug message if diagnostics are enabled.
 * In production (debug disabled), this is a no-op.
 */
export function debug(message: string, ...args: unknown[]): void {
    if (!debugEnabled) {
        debugEnabled = isDebugEnabled();
    }
    if (debugEnabled) {
        console.log(`[MapArtisan] ${message}`, ...args);
    }
}

/**
 * Logs a warning message if diagnostics are enabled.
 * In production (debug disabled), this is a no-op.
 */
debug.warn = function (message: string, ...args: unknown[]): void {
    if (!debugEnabled) {
        debugEnabled = isDebugEnabled();
    }
    if (debugEnabled) {
        console.warn(`[MapArtisan] ${message}`, ...args);
    }
};

/**
 * Logs an error message (always enabled, unlike debug/warn).
 */
debug.error = function (message: string, ...args: unknown[]): void {
    console.error(`[MapArtisan] ${message}`, ...args);
};

/**
 * Enables or disables debug logging programmatically.
 */
export function setDebugEnabled(enabled: boolean): void {
    debugEnabled = enabled;
}

/**
 * Returns whether debug logging is currently enabled.
 */
export function isDebugActive(): boolean {
    return debugEnabled || isDebugEnabled();
}
