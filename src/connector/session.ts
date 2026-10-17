/**
 * Console-driven connector session (stage 3 of docs/litematica-live-preview-spec.md):
 * connect with the token shown by /mapartisan start, then send the current section by hand.
 * Loaded only after `mapartisan.connector.enable()`.
 */
import { ConnectorClient, ConnectorError } from './client';
import { CONNECTOR_PATH, DEFAULT_CONNECTOR_PORT, type SessionInfo } from './protocol';
import { getConnectorSnapshotSource } from './snapshotSource';

const LOG_PREFIX = '[MapArtisan connector]';

let client: ConnectorClient | null = null;

export interface ConnectOptions {
    port?: number;
}

export interface SendResult {
    revision: number;
    repeated: boolean;
    section: { x: number; y: number };
    blocks: number;
    verifiedPositions?: number;
    timings: Record<string, number>;
}

export async function connect(token: string, options: ConnectOptions = {}): Promise<SessionInfo> {
    if (typeof token !== 'string' || token.length === 0) {
        throw new ConnectorError('BAD_TOKEN', 'Use the command that /mapartisan start copies: connect("<token>")');
    }
    const port = options.port ?? DEFAULT_CONNECTOR_PORT;
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new ConnectorError('BAD_PORT', `Invalid port: ${port}`);
    }
    client?.disconnect();
    const next = new ConnectorClient(`ws://127.0.0.1:${port}${CONNECTOR_PATH}`, token);
    client = next;
    try {
        const session = await next.connect();
        const { x, y, z } = session.origin;
        console.info(`${LOG_PREFIX} Connected to "${session.world}" (${session.dimension}), origin ${x} ${y} ${z}. `
            + `Mod ${next.versions?.mod}, Litematica ${next.versions?.litematica}. Use mapartisan.connector.send().`);
        return session;
    } catch (error) {
        if (client === next) client = null;
        throw error;
    }
}

/** Generates the snapshot of the current section and waits until the mod applies and verifies it. */
export async function send(): Promise<SendResult> {
    const current = client;
    if (!current?.connected) {
        throw new ConnectorError('NOT_CONNECTED', 'Not connected: use mapartisan.connector.connect("<token>")');
    }
    const source = getConnectorSnapshotSource();
    const generatedAt = performance.now();
    const response = source ? await source() : null;
    if (!response) {
        throw new ConnectorError('NO_IMAGE', 'Open the builder and load an image before sending');
    }
    if (response.status === 'rejected') {
        throw new ConnectorError(response.code, layoutHint(response.code, response.message));
    }
    const { snapshot } = response;
    const generateMs = Math.round(performance.now() - generatedAt);
    console.info(`${LOG_PREFIX} Sending section ${snapshot.section.x},${snapshot.section.y}: `
        + `${snapshot.count} blocks, ${snapshot.size.x}×${snapshot.size.y}×${snapshot.size.z}, hash ${snapshot.contentHash}`);

    const sentAt = performance.now();
    const applied = await current.send(snapshot, (progress) => {
        console.info(`${LOG_PREFIX} Revision ${progress.revision}: ${progress.phase}, `
            + `${progress.pendingChunks}/${progress.totalChunks} chunks pending`
            + (progress.blockedReason ? ` (${progress.blockedReason})` : ''));
    });
    const result: SendResult = {
        revision: applied.revision,
        repeated: applied.repeated,
        section: { x: snapshot.section.x, y: snapshot.section.y },
        blocks: snapshot.count,
        verifiedPositions: applied.verifiedPositions,
        timings: { generateMs, roundTripMs: Math.round(performance.now() - sentAt), ...applied.timings },
    };
    console.info(`${LOG_PREFIX} Revision ${applied.revision} applied and verified`
        + (applied.verifiedPositions ? ` (${applied.verifiedPositions} positions)` : ''), result.timings);
    return result;
}

export function disconnect(): void {
    client?.disconnect();
    client = null;
}

export function status(): string {
    if (!client) return 'disconnected';
    if (!client.connected) return 'connecting';
    const session = client.session;
    const applied = session?.lastApplied ? `applied revision ${session.lastApplied.revision}` : 'no revision applied';
    const busy = client.busyRevision ? `, sending revision ${client.busyRevision}` : '';
    return `connected to "${session?.world}", ${applied}${busy}`;
}

function layoutHint(code: string, message: string): string {
    if (code === 'UNSUPPORTED_LAYOUT') {
        return 'Use Multiple Files in Construction Model for maps larger than 1×1';
    }
    return message;
}
