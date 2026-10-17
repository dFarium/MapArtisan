/**
 * `mapartisan.connector` in the DevTools console (docs/litematica-live-preview-spec.md, section 10.1).
 *
 * Disabled, the global holds only enable/disable/status and nothing else of the connector is
 * loaded. enable() persists the choice in localStorage and loads the session module lazily.
 * This is a visibility switch, not a security boundary: the mod checks the token and Origin.
 */
import type * as SessionModule from './session';

export const CONNECTOR_STORAGE_KEY = 'mapartisan:connector';

type Session = typeof SessionModule;

export interface ConnectorConsole {
    enable(): Promise<string>;
    disable(): Promise<string>;
    status(): Promise<{ enabled: boolean; connection: string }>;
    connect?: Session['connect'];
    send?: Session['send'];
    disconnect?: Session['disconnect'];
}

declare global {
    interface Window {
        mapartisan?: { connector?: ConnectorConsole };
    }
}

function storage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readEnabled(): boolean {
    try {
        return storage()?.getItem(CONNECTOR_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

export function installConnectorConsole(
    loadSession: () => Promise<Session> = () => import('./session')
): ConnectorConsole {
    let session: Session | null = null;

    const attach = async (): Promise<void> => {
        session ??= await loadSession();
        api.connect = session.connect;
        api.send = session.send;
        api.disconnect = session.disconnect;
        // A tab that was connected before reloading reconnects to the same game session.
        session.restore?.();
    };

    const api: ConnectorConsole = {
        async enable() {
            const store = storage();
            try {
                if (!store) throw new Error('unavailable');
                store.setItem(CONNECTOR_STORAGE_KEY, '1');
            } catch {
                return 'The connector needs localStorage, which is not available in this tab';
            }
            await attach();
            return 'Connector enabled. Run /mapartisan start in the game and paste the command it copies here.';
        },
        async disable() {
            session?.disconnect();
            delete api.connect;
            delete api.send;
            delete api.disconnect;
            try {
                storage()?.removeItem(CONNECTOR_STORAGE_KEY);
            } catch { /* nothing to persist */ }
            return 'Connector disabled; placed blocks stay in the world.';
        },
        async status() {
            return { enabled: readEnabled(), connection: session ? await session.status() : 'disconnected' };
        },
    };

    window.mapartisan = { ...window.mapartisan, connector: api };
    if (readEnabled()) {
        void attach().catch((error: unknown) => console.error('[MapArtisan connector] Could not load', error));
    }
    return api;
}
