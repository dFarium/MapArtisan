/**
 * What the Live Preview controls show, as an external store React can subscribe to.
 *
 * The connector module publishes here and registers the actions; the builder reads it to
 * decide whether to load the controls at all. Null means no connection to show. Kept tiny
 * because it ships in the main bundle (docs/litematica-live-preview-spec.md, section 10.1).
 */
import type { AppliedTimings, PastePhase } from './protocol';

export type SyncStatus =
    /** No snapshot compared yet. */
    | 'unknown'
    /** The world holds the editor's construction. */
    | 'synced'
    /** Changes waiting because automatic sync is off or sending is paused. */
    | 'outdated'
    /** Generating, sending or pasting a revision. */
    | 'syncing'
    /** The File Layout does not allow syncing this map (spec section 10.2). */
    | 'blocked'
    /** The last revision failed or was rejected. */
    | 'error';

export interface ConnectorView {
    connection: 'connecting' | 'connected' | 'disconnected';
    /** Why the connection ended, when it did. */
    closeReason: string | null;
    world: string | null;
    dimension: string | null;
    origin: { x: number; y: number; z: number } | null;
    status: SyncStatus;
    autoSync: boolean;
    sendingPaused: boolean;
    needsResync: boolean;
    gamePaused: boolean;
    appliedRevision: number | null;
    /** The revision being sent or pasted, with its progress. */
    activeRevision: number | null;
    phase: PastePhase | null;
    pendingChunks: number | null;
    totalChunks: number | null;
    /** Why the File Layout blocks syncing, or why the last revision failed. */
    message: string | null;
    lastTimings: (AppliedTimings & { generateMs: number }) | null;
}

export interface ConnectorActions {
    reconnect(): Promise<void>;
    disconnect(): void;
    setAutoSync(enabled: boolean): void;
    setSendingPaused(paused: boolean): void;
    resync(): Promise<void>;
}

let view: ConnectorView | null = null;
let actions: ConnectorActions | null = null;
const listeners = new Set<() => void>();

export function getConnectorView(): ConnectorView | null {
    return view;
}

export function getConnectorActions(): ConnectorActions | null {
    return actions;
}

export function subscribeConnectorView(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function publishConnectorView(next: ConnectorView | null, nextActions: ConnectorActions | null = actions): void {
    view = next;
    actions = next ? nextActions : null;
    for (const listener of listeners) listener();
}
