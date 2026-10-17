/**
 * Where the connector gets the current construction snapshot from, and when it changes.
 *
 * The builder registers a source while it is mounted and reports every change of a
 * construction input; the connector module, loaded only after `mapartisan.connector.enable()`,
 * reads both. Kept tiny because it ships in the main bundle
 * (docs/litematica-live-preview-spec.md, section 10.1).
 */
import type { GenerateSnapshotResponseV1 } from '../engine';

/** Resolves to null when there is no image to build from. */
export type ConnectorSnapshotSource = () => Promise<GenerateSnapshotResponseV1 | null>;

let current: ConnectorSnapshotSource | null = null;
const changeListeners = new Set<() => void>();

/** Registers the source and returns a function that unregisters it. */
export function setConnectorSnapshotSource(source: ConnectorSnapshotSource): () => void {
    current = source;
    notifyConstructionChanged();
    return () => {
        if (current === source) current = null;
    };
}

export function getConnectorSnapshotSource(): ConnectorSnapshotSource | null {
    return current;
}

/** Called by the builder whenever a construction input may have changed. Cheap when nobody listens. */
export function notifyConstructionChanged(): void {
    for (const listener of changeListeners) listener();
}

export function subscribeConstructionChanges(listener: () => void): () => void {
    changeListeners.add(listener);
    return () => {
        changeListeners.delete(listener);
    };
}
