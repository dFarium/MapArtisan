/**
 * The connector session behind the console API and the Live Preview controls
 * (docs/litematica-live-preview-spec.md, sections 10 and 12.4). Loaded only after
 * `mapartisan.connector.enable()`.
 *
 * Connect with the command /mapartisan start copies; from then on the coordinator syncs
 * every construction change. The token is kept in sessionStorage, so reloading the tab
 * reconnects to the same game session; it is never logged in full.
 */
import { ConnectorClient, ConnectorError } from './client';
import { SyncCoordinator, type SyncState } from './coordinator';
import { publishConnectorView, type ConnectorActions, type ConnectorView } from './connectorView';
import { CONNECTOR_PATH, DEFAULT_CONNECTOR_PORT, type SessionInfo, type SessionState } from './protocol';
import { getConnectorSnapshotSource, subscribeConstructionChanges } from './snapshotSource';

const LOG_PREFIX = '[MapArtisan connector]';
const SAVED_SESSION_KEY = 'mapartisan:connector:session';
const AUTO_SYNC_KEY = 'mapartisan:connector:autosync';

interface SavedSession {
    token: string;
    port: number;
}

let client: ConnectorClient | null = null;
let coordinator: SyncCoordinator | null = null;
let stopListening: (() => void) | null = null;
let saved: SavedSession | null = readSaved();
let lastSession: SessionInfo | null = null;
let connection: ConnectorView['connection'] = 'disconnected';
let closeReason: string | null = null;
let autoSync = readAutoSync();
let sendingPaused = false;
let lastStatus: SyncState['status'] | null = null;

export interface ConnectOptions {
    port?: number;
}

export interface SendResult {
    revision: number | null;
    repeated: boolean;
    section: { x: number; y: number };
    blocks: number;
    verifiedPositions?: number;
    timings: Record<string, number>;
}

const actions: ConnectorActions = {
    reconnect: async () => {
        await reconnect();
    },
    disconnect: () => disconnect(),
    setAutoSync: (enabled) => {
        autoSync = enabled;
        try {
            localStorage.setItem(AUTO_SYNC_KEY, enabled ? '1' : '0');
        } catch { /* the default applies next time */ }
        coordinator?.setAutoSync(enabled);
        publish();
    },
    setSendingPaused: (paused) => {
        sendingPaused = paused;
        coordinator?.setSendingPaused(paused);
        publish();
    },
    resync: async () => {
        await send().catch(() => undefined);
    },
};

export async function connect(token: string, options: ConnectOptions = {}): Promise<SessionInfo> {
    if (typeof token !== 'string' || token.length === 0) {
        throw new ConnectorError('BAD_TOKEN', 'Use the command that /mapartisan start copies: connect("<token>")');
    }
    const port = options.port ?? DEFAULT_CONNECTOR_PORT;
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new ConnectorError('BAD_PORT', `Invalid port: ${port}`);
    }
    closeConnection();
    saved = { token, port };
    try {
        sessionStorage.setItem(SAVED_SESSION_KEY, JSON.stringify(saved));
    } catch { /* reloading the tab will need the command again */ }
    return open(saved);
}

/** Reconnects with the token of the last connect(). */
export async function reconnect(): Promise<SessionInfo> {
    if (!saved) throw new ConnectorError('NO_TOKEN', 'Connect first with the command /mapartisan start copies');
    closeConnection();
    return open(saved);
}

/** Called once the module loads: reconnects a tab that was connected before reloading. */
export function restore(): void {
    if (saved && !client) {
        open(saved).catch(() => undefined);
    }
}

/** Sends the current section now, even when the game already holds it. */
export async function send(): Promise<SendResult> {
    const sync = coordinator;
    if (!client?.connected || !sync) {
        throw new ConnectorError('NOT_CONNECTED', 'Not connected: use mapartisan.connector.connect("<token>")');
    }
    const result = await sync.syncNow(true);
    if (!result) {
        throw new ConnectorError(sync.current.status === 'blocked' ? 'UNSUPPORTED_LAYOUT' : 'NO_IMAGE',
            sync.current.message ?? 'Open the builder and load an image before sending');
    }
    const { snapshot, applied, generateMs } = result;
    return {
        revision: applied?.revision ?? null,
        repeated: applied?.repeated ?? false,
        section: { x: snapshot.section.x, y: snapshot.section.y },
        blocks: snapshot.count,
        verifiedPositions: applied?.verifiedPositions,
        timings: { generateMs, ...applied?.timings },
    };
}

/** Closes the session and hides the controls; blocks already placed stay in the world. */
export function disconnect(): void {
    closeConnection();
    saved = null;
    lastSession = null;
    try {
        sessionStorage.removeItem(SAVED_SESSION_KEY);
    } catch { /* nothing saved */ }
    publishConnectorView(null);
}

/** Asks the game for the session state when connected. */
export async function status(): Promise<string> {
    const current = client;
    if (!current) return saved ? `disconnected${closeReason ? ` (${closeReason})` : ''}` : 'disconnected';
    if (!current.connected) return 'connecting';
    const state = await current.queryStatus();
    const parts = [`connected to "${current.session?.world}"`,
        state.lastApplied ? `applied revision ${state.lastApplied.revision}` : 'no revision applied',
        `sync ${coordinator?.current.status ?? 'unknown'}${autoSync ? '' : ' (automatic sync off)'}${sendingPaused ? ' (sending paused)' : ''}`];
    if (state.pending) {
        parts.push(`revision ${state.pending.revision} ${state.pending.phase}`
            + (state.pending.totalChunks > 0 ? ` (${state.pending.pendingChunks}/${state.pending.totalChunks} chunks pending)` : ''));
    }
    if (state.needsResync) parts.push('needs resync');
    if (state.paused) parts.push('game paused');
    return parts.join(', ');
}

async function open(credentials: SavedSession): Promise<SessionInfo> {
    const next = new ConnectorClient(`ws://127.0.0.1:${credentials.port}${CONNECTOR_PATH}`, credentials.token);
    client = next;
    connection = 'connecting';
    closeReason = null;
    publish();

    let session: SessionInfo;
    try {
        session = await next.connect();
    } catch (error) {
        if (client === next) {
            client = null;
            connection = 'disconnected';
            closeReason = error instanceof Error ? error.message : String(error);
            if ((error as Partial<ConnectorError>).code === 'UNAUTHORIZED') {
                // The game session this token belonged to is over.
                disconnect();
            } else {
                publish();
            }
        }
        throw error;
    }

    lastSession = session;
    connection = 'connected';
    next.onClosed = (reason) => {
        if (client !== next) return;
        console.warn(`${LOG_PREFIX} Connection to the game closed${reason ? ` (${reason})` : ''}. Use Reconnect when the game is back.`);
        closeConnection();
        closeReason = reason ?? 'connection closed';
        publish();
    };
    const sync = new SyncCoordinator({
        client: next,
        source: () => getConnectorSnapshotSource()?.() ?? Promise.resolve(null),
        onChange: (state) => {
            reportStatus(state);
            publish();
        },
        autoSync,
    });
    sync.setSendingPaused(sendingPaused);
    coordinator = sync;
    stopListening = subscribeConstructionChanges(() => sync.constructionChanged());

    const { x, y, z } = session.origin;
    console.info(`${LOG_PREFIX} Connected to "${session.world}" (${session.dimension}), origin ${x} ${y} ${z}, `
        + `reserved area ${session.area.x}×${session.area.y}×${session.area.z}. `
        + `Mod ${next.versions?.mod}, Litematica ${next.versions?.litematica}.`);
    warnAboutState(session);
    const inFlight = next.inFlight;
    if (session.pending && inFlight) {
        // Adopted from an earlier connection: report its outcome when the game finishes it.
        console.info(`${LOG_PREFIX} Revision ${session.pending.revision} is still being applied in the game (${session.pending.phase}).`);
        inFlight.then(
            (applied) => console.info(`${LOG_PREFIX} Revision ${applied.revision} applied and verified`),
            (error: unknown) => logFailure(error),
        ).finally(publish);
    }
    sync.connected();
    publish();
    return session;
}

function closeConnection(): void {
    stopListening?.();
    stopListening = null;
    coordinator?.dispose();
    coordinator = null;
    const current = client;
    client = null;
    connection = 'disconnected';
    if (current) {
        current.onClosed = null;
        current.disconnect();
    }
}

function publish(): void {
    if (!saved && !client) {
        publishConnectorView(null);
        return;
    }
    const session = client?.session ?? lastSession;
    const sync = coordinator?.current;
    publishConnectorView({
        connection,
        closeReason: connection === 'disconnected' ? closeReason : null,
        world: session?.world ?? null,
        dimension: session?.dimension ?? null,
        origin: session?.origin ?? null,
        status: sync?.status ?? 'unknown',
        autoSync,
        sendingPaused,
        needsResync: client?.session?.needsResync ?? false,
        gamePaused: sync?.phase === 'paused' || (client?.session?.paused ?? false),
        appliedRevision: session?.lastApplied?.revision ?? null,
        activeRevision: sync?.activeRevision ?? client?.busyRevision ?? null,
        phase: sync?.phase ?? null,
        pendingChunks: sync?.pendingChunks ?? null,
        totalChunks: sync?.totalChunks ?? null,
        message: sync?.message ?? null,
        lastTimings: sync?.lastTimings ?? null,
    }, actions);
}

/** Logs each change of sync status once, so the console tells the same story as the panel. */
function reportStatus(state: SyncState): void {
    if (state.status === lastStatus) return;
    lastStatus = state.status;
    if (state.status === 'synced' && state.lastTimings) {
        const t = state.lastTimings;
        console.info(`${LOG_PREFIX} Synced revision ${client?.session?.lastApplied?.revision}: generate ${t.generateMs} ms, `
            + `paste ${t.pasteMs} ms, verify ${t.verifyMs} ms, total ${t.totalMs} ms`);
    } else if (state.status === 'blocked' || state.status === 'error') {
        console.warn(`${LOG_PREFIX} ${state.message}`);
        if (client?.session?.needsResync) {
            console.warn(`${LOG_PREFIX} The area may be partly pasted; the next change or Resync rewrites it.`);
        }
    }
}

function warnAboutState(state: SessionState): void {
    if (state.needsResync) {
        console.warn(`${LOG_PREFIX} The reserved area needs a resync: the next revision rewrites all of it.`);
    }
    if (state.paused) {
        console.warn(`${LOG_PREFIX} The game is paused; pastes wait until it resumes (F3 + P disables pause on lost focus).`);
    }
}

function logFailure(error: unknown): void {
    if (!(error instanceof ConnectorError)) return;
    console.error(`${LOG_PREFIX} ${error.code}: ${error.message}`, ...(error.samples.length ? [error.samples] : []));
}

function readSaved(): SavedSession | null {
    try {
        const raw = sessionStorage.getItem(SAVED_SESSION_KEY);
        const parsed = raw ? JSON.parse(raw) as Partial<SavedSession> : null;
        return parsed && typeof parsed.token === 'string' && typeof parsed.port === 'number'
            ? { token: parsed.token, port: parsed.port }
            : null;
    } catch {
        return null;
    }
}

function readAutoSync(): boolean {
    try {
        return localStorage.getItem(AUTO_SYNC_KEY) !== '0';
    } catch {
        return true;
    }
}
