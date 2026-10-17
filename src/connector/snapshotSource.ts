/**
 * Where the connector gets the current construction snapshot from.
 *
 * The builder registers a source while it is mounted; the connector module, loaded only
 * after `mapartisan.connector.enable()`, reads it. Kept tiny because it ships in the main
 * bundle (docs/litematica-live-preview-spec.md, section 10.1).
 */
import type { GenerateSnapshotResponseV1 } from '../engine';

/** Resolves to null when there is no image to build from. */
export type ConnectorSnapshotSource = () => Promise<GenerateSnapshotResponseV1 | null>;

let current: ConnectorSnapshotSource | null = null;

/** Registers the source and returns a function that unregisters it. */
export function setConnectorSnapshotSource(source: ConnectorSnapshotSource): () => void {
    current = source;
    return () => {
        if (current === source) current = null;
    };
}

export function getConnectorSnapshotSource(): ConnectorSnapshotSource | null {
    return current;
}
