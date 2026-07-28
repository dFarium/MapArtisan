import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug, isDebugActive, setDebugEnabled } from '../diagnostic';

describe('diagnostic logger', () => {
    beforeEach(() => {
        setDebugEnabled(false);
        localStorage.removeItem('mapartisan:debug');
        window.history.replaceState({}, '', '/');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        setDebugEnabled(false);
    });

    it('suppresses informational diagnostics by default', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        debug('hidden');
        debug.warn('hidden warning');

        expect(logSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(isDebugActive()).toBe(false);
    });

    it('reads the browser URL preference', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        window.history.replaceState({}, '', '/?debug=1');

        debug('visible');

        expect(logSpy).toHaveBeenCalledWith('[MapArtisan] visible');
        expect(isDebugActive()).toBe(true);
    });

    it('reads the localStorage preference', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        localStorage.setItem('mapartisan:debug', '1');

        debug.warn('visible warning');

        expect(warnSpy).toHaveBeenCalledWith('[MapArtisan] visible warning');
    });

    it('supports explicit configuration for worker contexts', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        setDebugEnabled(true);
        debug('worker message');
        setDebugEnabled(false);
        debug('hidden again');

        expect(logSpy).toHaveBeenCalledTimes(1);
        expect(logSpy).toHaveBeenCalledWith('[MapArtisan] worker message');
    });

    it('always reports errors', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        debug.error('failure', { code: 1 });

        expect(errorSpy).toHaveBeenCalledWith('[MapArtisan] failure', { code: 1 });
    });
});
