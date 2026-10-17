import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTOR_STORAGE_KEY, installConnectorConsole } from '../console';
import type * as SessionModule from '../session';

function fakeSession() {
    return {
        connect: vi.fn(),
        send: vi.fn(),
        disconnect: vi.fn(),
        status: vi.fn(async () => 'connected'),
    } as unknown as typeof SessionModule & { disconnect: ReturnType<typeof vi.fn> };
}

describe('mapartisan.connector console API', () => {
    beforeEach(() => {
        localStorage.removeItem(CONNECTOR_STORAGE_KEY);
        delete window.mapartisan;
    });

    it('exposes only enable, disable and status, and loads nothing while disabled', async () => {
        const load = vi.fn(async () => fakeSession());
        const api = installConnectorConsole(load);

        expect(window.mapartisan?.connector).toBe(api);
        expect(Object.keys(api).sort()).toEqual(['disable', 'enable', 'status']);
        expect(await api.status()).toEqual({ enabled: false, connection: 'disconnected' });
        expect(load).not.toHaveBeenCalled();
    });

    it('enable persists the flag and attaches the session functions without reloading', async () => {
        const session = fakeSession();
        const api = installConnectorConsole(async () => session);

        await api.enable();

        expect(localStorage.getItem(CONNECTOR_STORAGE_KEY)).toBe('1');
        expect(api.connect).toBe(session.connect);
        expect(api.send).toBe(session.send);
        expect(await api.status()).toEqual({ enabled: true, connection: 'connected' });
    });

    it('disable disconnects, detaches and clears the flag', async () => {
        const session = fakeSession();
        const api = installConnectorConsole(async () => session);
        await api.enable();

        await api.disable();

        expect(session.disconnect).toHaveBeenCalled();
        expect(Object.keys(api).sort()).toEqual(['disable', 'enable', 'status']);
        expect(localStorage.getItem(CONNECTOR_STORAGE_KEY)).toBeNull();
    });

    it('restores an enabled connector after a reload', async () => {
        localStorage.setItem(CONNECTOR_STORAGE_KEY, '1');
        const session = fakeSession();
        const api = installConnectorConsole(async () => session);

        await vi.waitFor(() => expect(api.connect).toBe(session.connect));
    });

    it('keeps other globals under window.mapartisan', () => {
        window.mapartisan = { other: true } as unknown as Window['mapartisan'];
        installConnectorConsole(async () => fakeSession());

        expect((window.mapartisan as Record<string, unknown>).other).toBe(true);
    });
});
