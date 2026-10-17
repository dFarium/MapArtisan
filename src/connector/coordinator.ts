/**
 * Automatic sync (docs/litematica-live-preview-spec.md, sections 9 and 12.4).
 *
 * Construction changes are batched for about 200 ms. One revision is generated or sent at a
 * time; changes during it only mark the editor dirty, so the next run sends the latest state
 * and nothing older. A snapshot whose hash is already applied is not sent. A failed or lost
 * revision is never retried by itself: the next change or an explicit resync sends again.
 */
import type { ConstructionSnapshot } from '../utils/export';
import type { GenerateSnapshotResponseV1 } from '../engine';
import type { ConnectorError } from './client';
import type { AppliedTimings, PastePhase, ServerMessage, SessionInfo } from './protocol';
import type { SyncStatus } from './connectorView';

type Applied = Extract<ServerMessage, { type: 'applied' }>;
type Progress = Extract<ServerMessage, { type: 'progress' }>;

/** What the coordinator needs from ConnectorClient. */
export interface SyncClient {
    readonly connected: boolean;
    readonly session: SessionInfo | null;
    readonly inFlight: Promise<Applied> | null;
    send(snapshot: ConstructionSnapshot, onProgress?: (progress: Progress) => void): Promise<Applied>;
}

export interface SyncState {
    status: SyncStatus;
    autoSync: boolean;
    sendingPaused: boolean;
    activeRevision: number | null;
    phase: PastePhase | null;
    pendingChunks: number | null;
    totalChunks: number | null;
    message: string | null;
    lastTimings: (AppliedTimings & { generateMs: number }) | null;
}

export interface SyncResult {
    snapshot: ConstructionSnapshot;
    /** Null when the snapshot was already applied and nothing was sent. */
    applied: Applied | null;
    generateMs: number;
}

export interface CoordinatorOptions {
    client: SyncClient;
    source: () => Promise<GenerateSnapshotResponseV1 | null>;
    onChange: (state: SyncState) => void;
    autoSync?: boolean;
    debounceMs?: number;
    now?: () => number;
}

export const LAYOUT_HINT = 'Use Multiple Files in Construction Model for maps larger than 1×1';

export class SyncCoordinator {
    private readonly client: SyncClient;
    private readonly source: () => Promise<GenerateSnapshotResponseV1 | null>;
    private readonly onChange: (state: SyncState) => void;
    private readonly debounceMs: number;
    private readonly now: () => number;

    private state: SyncState;
    private dirty = true;
    private running: Promise<SyncResult | null> | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;

    constructor(options: CoordinatorOptions) {
        this.client = options.client;
        this.source = options.source;
        this.onChange = options.onChange;
        this.debounceMs = options.debounceMs ?? 200;
        this.now = options.now ?? (() => performance.now());
        this.state = {
            status: 'unknown',
            autoSync: options.autoSync ?? true,
            sendingPaused: false,
            activeRevision: null,
            phase: null,
            pendingChunks: null,
            totalChunks: null,
            message: null,
            lastTimings: null,
        };
    }

    get current(): SyncState {
        return this.state;
    }

    get busy(): boolean {
        return this.running !== null;
    }

    /** A construction input changed: sync it after the batching delay. */
    constructionChanged(): void {
        this.dirty = true;
        if (!this.canSendAutomatically()) {
            if (this.state.status === 'synced' || this.state.status === 'unknown') this.update({ status: 'outdated' });
            return;
        }
        this.schedule();
    }

    /** After (re)connecting: compare the editor with what the game holds. */
    connected(): void {
        this.dirty = true;
        if (this.canSendAutomatically()) this.schedule(0);
    }

    setAutoSync(enabled: boolean): void {
        this.update({ autoSync: enabled });
        if (enabled && this.dirty) this.constructionChanged();
    }

    setSendingPaused(paused: boolean): void {
        this.update({ sendingPaused: paused });
        if (!paused && this.dirty) this.constructionChanged();
    }

    /**
     * Sends the current construction now, whatever the automatic settings. With force, it is
     * sent even when the game already holds the same content, rewriting the whole area.
     */
    async syncNow(force: boolean): Promise<SyncResult | null> {
        if (this.running) {
            const error = new Error('A revision is already being synced; wait for it') as Error & { code: string };
            error.code = 'BUSY';
            throw error;
        }
        this.cancelTimer();
        return this.start(force, true);
    }

    dispose(): void {
        this.disposed = true;
        this.cancelTimer();
    }

    private canSendAutomatically(): boolean {
        return !this.disposed && this.state.autoSync && !this.state.sendingPaused && this.client.connected;
    }

    private schedule(delay = this.debounceMs): void {
        this.cancelTimer();
        this.timer = setTimeout(() => {
            this.timer = null;
            // A run in progress picks up the dirty flag when it finishes.
            if (!this.running && this.canSendAutomatically()) void this.start(false, false).catch(() => undefined);
        }, delay);
    }

    private cancelTimer(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
    }

    private start(force: boolean, rethrow: boolean): Promise<SyncResult | null> {
        const run = this.run(force, rethrow).finally(() => {
            this.running = null;
            // Changes that arrived while this revision was on its way: send the latest one.
            if (this.dirty && this.canSendAutomatically()) this.schedule();
        });
        this.running = run;
        return run;
    }

    private async run(force: boolean, rethrow: boolean): Promise<SyncResult | null> {
        this.dirty = false;
        this.update({ status: 'syncing', message: null });
        try {
            // A revision adopted on reconnect goes first; its outcome is reported by the session.
            await this.client.inFlight?.catch(() => undefined);

            const generatedAt = this.now();
            const response = await this.source();
            const generateMs = Math.round(this.now() - generatedAt);
            if (!response) {
                this.update({ status: 'unknown', message: 'Load an image to sync it' });
                return null;
            }
            if (response.status === 'rejected') {
                this.update({
                    status: 'blocked',
                    message: response.code === 'UNSUPPORTED_LAYOUT' ? LAYOUT_HINT : response.message,
                });
                return null;
            }
            const { snapshot } = response;
            const session = this.client.session;
            if (!force && !session?.needsResync && session?.lastApplied?.contentHash === snapshot.contentHash) {
                this.update({ status: 'synced' });
                return { snapshot, applied: null, generateMs };
            }
            if (!this.client.connected) throw Object.assign(new Error('Not connected to the game'), { code: 'NOT_CONNECTED' });

            const applied = await this.client.send(snapshot, (progress) => this.update({
                activeRevision: progress.revision,
                phase: progress.phase,
                pendingChunks: progress.pendingChunks,
                totalChunks: progress.totalChunks,
            }));
            this.update({
                status: this.dirty ? 'outdated' : 'synced',
                lastTimings: applied.timings ? { ...applied.timings, generateMs } : this.state.lastTimings,
                ...NO_PROGRESS,
            });
            return { snapshot, applied, generateMs };
        } catch (error) {
            const failure = error as Partial<ConnectorError>;
            this.update({
                status: 'error',
                message: failure.code ? `${failure.code}: ${failure.message}` : String(error),
                ...NO_PROGRESS,
            });
            if (rethrow) throw error;
            return null;
        }
    }

    private update(patch: Partial<SyncState>): void {
        this.state = { ...this.state, ...patch };
        this.onChange(this.state);
    }
}

const NO_PROGRESS = { activeRevision: null, phase: null, pendingChunks: null, totalChunks: null } as const;
