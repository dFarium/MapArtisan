/**
 * Diagnostic logger for MapArtisan.
 *
 * Centralizes production diagnostics behind an explicit opt-in.
 * Logs are suppressed by default and can be enabled via:
 * - URL parameter: `?debug=1` or `?debug=all`
 * - localStorage: `localStorage.setItem('mapartisan:debug', '1')`
 *
 * Usage:
 * ```ts
 * import { debug } from './diagnostic';
 * debug('Worker cache miss: no cached source available');
 * debug.warn('Export failed: No image data provided');
 * ```
 */

let debugEnabled = false;

function readBrowserPreference(): boolean {
    if (typeof window !== 'undefined') {
        if (new URL(window.location.href).searchParams.has('debug')) return true;
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
        debugEnabled = readBrowserPreference();
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
        debugEnabled = readBrowserPreference();
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
    return debugEnabled || readBrowserPreference();
}
