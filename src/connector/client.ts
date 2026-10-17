/**
 * WebSocket client for the MapartisanConnector mod (docs/litematica-live-preview-spec.md, section 8).
 *
 * One revision at a time: send() resolves only on `applied`, and rejects on `rejected`,
 * `failed` or a lost connection. A lost connection never counts as success. A tab that
 * reconnects while the game is still pasting adopts that revision and gets its outcome
 * through `inFlight` (spec section 9).
 */
import type { ConstructionSnapshot } from '../utils/export';
import {
    clientMessage,
    encodeSnapshotParts,
    parseServerMessage,
    snapshotBeginFields,
    type ServerMessage,
    type SessionInfo,
    type SessionState,
} from './protocol';

type Applied = Extract<ServerMessage, { type: 'applied' }>;
type Progress = Extract<ServerMessage, { type: 'progress' }>;
type Welcome = Extract<ServerMessage, { type: 'welcome' }>;
type Status = Extract<ServerMessage, { type: 'status' }>;

/** The parts of WebSocket the client uses, so tests can pass a fake. */
export interface SocketLike {
    binaryType: BinaryType;
    readyState: number;
    send(data: string | ArrayBuffer): void;
    close(code?: number, reason?: string): void;
    onopen: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export class ConnectorError extends Error {
    readonly code: string;
    /** True when the world may hold part of the revision (spec section 9). */
    readonly partial: boolean;
    readonly samples: string[];

    constructor(code: string, message: string, partial = false, samples: string[] = []) {
        super(message);
        this.name = 'ConnectorError';
        this.code = code;
        this.partial = partial;
        this.samples = samples;
    }
}

interface PendingRevision {
    revision: number;
    contentHash: string;
    /** False while this tab is still transferring it. */
    accepted: boolean;
    result: Promise<Applied>;
    resolve: (applied: Applied) => void;
    reject: (error: ConnectorError) => void;
    onProgress?: (progress: Progress) => void;
}

interface Waiter {
    type: ServerMessage['type'];
    resolve: (message: ServerMessage) => void;
    reject: (error: ConnectorError) => void;
}

const OPEN = 1;

export class ConnectorClient {
    private socket: SocketLike | null = null;
    private welcome: Welcome | null = null;
    private sessionInfo: SessionInfo | null = null;
    private revision = 0;
    private pending: PendingRevision | null = null;
    private waiter: Waiter | null = null;
    private openFailed: (() => void) | null = null;
    /** Called once when an open connection ends, with the mod's reason if it gave one. */
    onClosed: ((reason: string | null) => void) | null = null;

    private readonly url: string;
    private readonly token: string;
    private readonly createSocket: SocketFactory;

    constructor(url: string, token: string, createSocket: SocketFactory = (u) => new WebSocket(u)) {
        this.url = url;
        this.token = token;
        this.createSocket = createSocket;
    }

    get session(): SessionInfo | null {
        return this.sessionInfo;
    }

    get versions(): Welcome | null {
        return this.welcome;
    }

    get connected(): boolean {
        return this.socket !== null && this.socket.readyState === OPEN && this.sessionInfo !== null;
    }

    get busyRevision(): number | null {
        return this.pending?.revision ?? null;
    }

    /** Outcome of the revision in progress, whether this tab sent it or adopted it on connect. */
    get inFlight(): Promise<Applied> | null {
        return this.pending?.result ?? null;
    }

    /** Opens the socket, authenticates and opens the session. */
    async connect(): Promise<SessionInfo> {
        if (this.socket) throw new ConnectorError('ALREADY_CONNECTED', 'A connection is already open');
        const socket = this.createSocket(this.url);
        socket.binaryType = 'arraybuffer';
        this.socket = socket;
        socket.onmessage = (event) => this.onMessage(event);
        socket.onclose = (event) => this.onClose(event);

        try {
            await new Promise<void>((resolve, reject) => {
                const failed = () => reject(new ConnectorError('CONNECTION_FAILED',
                    `Could not connect to ${this.url}. Did you run /mapartisan start in the game?`));
                socket.onopen = () => resolve();
                socket.onerror = failed;
                this.openFailed = failed;
            });
            this.openFailed = null;
            socket.onerror = null;
            socket.send(clientMessage('hello', { token: this.token, client: { name: 'MapArtisan' } }));
            this.welcome = await this.expect('welcome') as Welcome;
            socket.send(clientMessage('openSession'));
            const ready = await this.expect('sessionReady') as Extract<ServerMessage, { type: 'sessionReady' }>;
            this.sessionInfo = {
                sessionId: ready.sessionId,
                world: ready.world,
                dimension: ready.dimension,
                origin: ready.origin,
                area: ready.area,
                buildHeight: ready.buildHeight,
                lastRevision: ready.lastRevision,
                lastApplied: ready.lastApplied,
                needsResync: ready.needsResync,
                paused: ready.paused,
                pending: ready.pending,
            };
            // Revisions keep increasing across reconnections to the same game session.
            this.revision = Math.max(this.revision, ready.lastRevision);
            if (ready.pending) {
                this.track(ready.pending.revision, ready.pending.contentHash, true);
            }
            return this.sessionInfo;
        } catch (error) {
            this.disconnect();
            throw error;
        }
    }

    /** Sends a full snapshot as the next revision and waits until the mod applies and verifies it. */
    send(snapshot: ConstructionSnapshot, onProgress?: (progress: Progress) => void): Promise<Applied> {
        const socket = this.socket;
        const session = this.sessionInfo;
        if (!socket || !session || socket.readyState !== OPEN) {
            return Promise.reject(new ConnectorError('NOT_CONNECTED', 'Not connected to the game'));
        }
        if (this.pending) {
            return Promise.reject(new ConnectorError('BUSY', `Revision ${this.pending.revision} has not finished yet`));
        }

        const revision = this.revision + 1;
        const parts = encodeSnapshotParts(snapshot, revision);
        const pending = this.track(revision, snapshot.contentHash, false);
        pending.onProgress = onProgress;
        socket.send(clientMessage('snapshotBegin', snapshotBeginFields(session.sessionId, revision, snapshot, parts.length)));
        for (const part of parts) socket.send(part);
        socket.send(clientMessage('snapshotEnd', { sessionId: session.sessionId, revision }));
        return pending.result;
    }

    /** Asks the mod for the session state, also kept in `session`. */
    async queryStatus(): Promise<SessionState> {
        const socket = this.socket;
        const session = this.sessionInfo;
        if (!socket || !session || socket.readyState !== OPEN) {
            throw new ConnectorError('NOT_CONNECTED', 'Not connected to the game');
        }
        if (this.waiter) throw new ConnectorError('BUSY', 'Another request is waiting for the game');
        const answer = this.expect('status');
        socket.send(clientMessage('status', { sessionId: session.sessionId }));
        const status = await answer as Status;
        const state: SessionState = {
            lastRevision: status.lastRevision,
            lastApplied: status.lastApplied,
            needsResync: status.needsResync,
            paused: status.paused,
            pending: status.pending,
        };
        this.update(state);
        return state;
    }

    /** Closes the session; blocks already placed stay in the world. */
    disconnect(): void {
        const socket = this.socket;
        if (!socket) return;
        if (socket.readyState === OPEN && this.sessionInfo) {
            socket.send(clientMessage('closeSession'));
        }
        socket.close(1000, 'disconnect');
        this.onClose(null);
    }

    private track(revision: number, contentHash: string, accepted: boolean): PendingRevision {
        let resolve!: (applied: Applied) => void;
        let reject!: (error: ConnectorError) => void;
        const result = new Promise<Applied>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        // Nobody may await an adopted revision; its outcome is still recorded in `session`.
        result.catch(() => undefined);
        this.revision = Math.max(this.revision, revision);
        this.pending = { revision, contentHash, accepted, result, resolve, reject };
        return this.pending;
    }

    private update(state: Partial<SessionState>): void {
        if (this.sessionInfo) this.sessionInfo = { ...this.sessionInfo, ...state };
    }

    private expect(type: ServerMessage['type']): Promise<ServerMessage> {
        return new Promise((resolve, reject) => {
            this.waiter = { type, resolve, reject };
        });
    }

    private onMessage(event: MessageEvent): void {
        if (typeof event.data !== 'string') return;
        const message = parseServerMessage(event.data);
        if (!message) return;
        const pending = this.pending;

        if (this.waiter && message.type === this.waiter.type) {
            const waiter = this.waiter;
            this.waiter = null;
            waiter.resolve(message);
            return;
        }
        if (message.type === 'rejected') {
            // A rejection without a revision answers the transfer in flight (for example a bad part),
            // otherwise the request waiting for an answer.
            const transferring = pending && !pending.accepted;
            if (pending && (message.revision === pending.revision || (message.revision === undefined && transferring))) {
                this.pending = null;
                pending.reject(new ConnectorError(message.code, message.message));
            } else if (this.waiter && message.revision === undefined) {
                const waiter = this.waiter;
                this.waiter = null;
                waiter.reject(new ConnectorError(message.code, message.message));
            }
            return;
        }

        if (!pending || !('revision' in message) || message.revision !== pending.revision) return;
        switch (message.type) {
            case 'accepted':
                pending.accepted = true;
                break;
            case 'progress':
                this.update({
                    paused: message.phase === 'paused',
                    pending: {
                        revision: message.revision,
                        contentHash: pending.contentHash,
                        phase: message.phase,
                        pendingChunks: message.pendingChunks,
                        totalChunks: message.totalChunks,
                        blockedReason: message.blockedReason,
                    },
                });
                pending.onProgress?.(message);
                break;
            case 'applied':
                this.pending = null;
                this.update({
                    lastRevision: Math.max(this.sessionInfo?.lastRevision ?? 0, message.revision),
                    lastApplied: { revision: message.revision, contentHash: message.contentHash },
                    needsResync: message.needsResync,
                    pending: null,
                });
                pending.resolve(message);
                break;
            case 'failed':
                this.pending = null;
                this.update({
                    lastRevision: Math.max(this.sessionInfo?.lastRevision ?? 0, message.revision),
                    needsResync: message.needsResync,
                    pending: null,
                });
                pending.reject(new ConnectorError(message.code, message.message, message.partial, message.samples ?? []));
                break;
        }
    }

    private onClose(event: CloseEvent | null): void {
        if (!this.socket) return;
        this.socket.onmessage = null;
        this.socket.onclose = null;
        this.socket.onopen = null;
        this.socket.onerror = null;
        this.socket = null;
        this.sessionInfo = null;
        const reason = event?.reason ? ` (${event.reason})` : '';

        const openFailed = this.openFailed;
        this.openFailed = null;
        openFailed?.();

        const waiter = this.waiter;
        this.waiter = null;
        waiter?.reject(new ConnectorError('CONNECTION_CLOSED', `Connection closed${reason}`));

        const pending = this.pending;
        this.pending = null;
        // Once accepted, the paste may have started: its outcome is unknown, not a success.
        pending?.reject(new ConnectorError('CONNECTION_CLOSED',
            `Connection closed${reason} during revision ${pending.revision}; its outcome is unknown`, pending.accepted));
        this.onClosed?.(event?.reason || null);
    }
}
