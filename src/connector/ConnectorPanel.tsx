/**
 * Live Preview controls inside Construction Model (docs/litematica-live-preview-spec.md,
 * sections 9 and 10.3). Loaded only while the connector has a connection to show.
 */
import { useId } from 'react';
import { Radio } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FieldLabel } from '@/components/controls/FieldLabel';
import type { ConnectorActions, ConnectorView } from './connectorView';

interface ConnectorPanelProps {
    view: ConnectorView;
    actions: ConnectorActions | null;
}

const hintClass = 'px-1 text-xs text-muted-foreground';

function statusLabel(view: ConnectorView): { text: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
    if (view.connection === 'connecting') return { text: 'Connecting…', variant: 'secondary' };
    if (view.connection === 'disconnected') return { text: 'Disconnected', variant: 'destructive' };
    if (view.gamePaused && view.status === 'syncing') return { text: 'Game paused', variant: 'secondary' };
    switch (view.status) {
        case 'synced': return { text: 'Synced', variant: 'default' };
        case 'syncing': return { text: 'Syncing…', variant: 'secondary' };
        case 'outdated': return { text: 'Changes not sent', variant: 'outline' };
        case 'blocked': return { text: 'Unavailable', variant: 'outline' };
        case 'error': return { text: 'Error', variant: 'destructive' };
        default: return { text: 'Waiting', variant: 'outline' };
    }
}

function progressText(view: ConnectorView): string | null {
    if (view.status !== 'syncing') return null;
    if (view.activeRevision === null) return 'Generating the construction…';
    if (view.phase === 'paused') return `Revision ${view.activeRevision}: waiting for the game to resume`;
    if (view.phase === 'waiting') return `Revision ${view.activeRevision}: waiting for the area to load`;
    if (view.totalChunks && view.totalChunks > 0 && view.pendingChunks !== null) {
        return `Revision ${view.activeRevision}: ${view.totalChunks - view.pendingChunks}/${view.totalChunks} chunks pasted`;
    }
    return `Revision ${view.activeRevision}: sending`;
}

export default function ConnectorPanel({ view, actions }: ConnectorPanelProps) {
    const autoSyncId = useId();
    const pauseId = useId();
    const status = statusLabel(view);
    const connected = view.connection === 'connected';
    const progress = progressText(view);
    const timings = view.lastTimings;

    return (
        <div className="space-y-2 border-t pt-2" data-testid="connector-panel">
            <div className="flex items-center justify-between">
                <FieldLabel icon={<Radio />}>Live Preview</FieldLabel>
                <Badge variant={status.variant}>{status.text}</Badge>
            </div>

            <div className="space-y-1 rounded-lg border bg-muted/30 p-2 text-xs">
                {view.world && (
                    <p>
                        <span className="font-medium">{view.world}</span>
                        {view.dimension && <span className="text-muted-foreground"> · {view.dimension.replace('minecraft:', '')}</span>}
                        {view.origin && (
                            <span className="text-muted-foreground"> · origin {view.origin.x} {view.origin.y} {view.origin.z}</span>
                        )}
                    </p>
                )}
                <p className="text-muted-foreground">
                    {view.appliedRevision !== null ? `Revision ${view.appliedRevision} in the world` : 'Nothing applied yet'}
                    {timings && ` · last paste ${timings.totalMs} ms`}
                </p>
                {progress && <p>{progress}</p>}
                {view.connection === 'disconnected' && view.closeReason && (
                    <p className="text-destructive">{view.closeReason}</p>
                )}
                {connected && view.message && (
                    <p className={view.status === 'error' ? 'text-destructive' : ''}>{view.message}</p>
                )}
                {connected && view.needsResync && (
                    <p>The area may be partly pasted; the next revision rewrites it.</p>
                )}
                {connected && view.gamePaused && (
                    <p>The game is paused, so pastes wait for it. F3 + P disables pause on lost focus.</p>
                )}
            </div>

            {connected && (
                <>
                    <div className="flex items-center justify-between">
                        <FieldLabel htmlFor={autoSyncId}>Automatic sync</FieldLabel>
                        <Switch
                            id={autoSyncId}
                            checked={view.autoSync}
                            onCheckedChange={(checked) => actions?.setAutoSync(checked)}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <FieldLabel htmlFor={pauseId}>Pause sending</FieldLabel>
                        <Switch
                            id={pauseId}
                            checked={view.sendingPaused}
                            disabled={!view.autoSync}
                            onCheckedChange={(checked) => actions?.setSendingPaused(checked)}
                        />
                    </div>
                    {(!view.autoSync || view.sendingPaused) && (
                        <p className={hintClass}>Changes stay in the editor until you resync.</p>
                    )}
                </>
            )}

            <div className="flex gap-2">
                {connected ? (
                    <Button
                        variant="outline"
                        className="flex-1"
                        disabled={view.status === 'syncing'}
                        onClick={() => void actions?.resync()}
                    >
                        Resync
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        className="flex-1"
                        disabled={view.connection === 'connecting'}
                        onClick={() => void actions?.reconnect().catch(() => undefined)}
                    >
                        Reconnect
                    </Button>
                )}
                <Button variant="ghost" className="flex-1" onClick={() => actions?.disconnect()}>
                    {connected ? 'Disconnect' : 'Close'}
                </Button>
            </div>
            <p className={hintClass}>Blocks already placed stay in the world when you disconnect.</p>
        </div>
    );
}
