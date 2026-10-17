import { lazy, Suspense, useSyncExternalStore } from 'react';
import { getConnectorActions, getConnectorView, subscribeConnectorView } from '../../../connector/connectorView';

// Loaded only while the connector has a connection to show (spec section 10.1).
const ConnectorPanel = lazy(() => import('../../../connector/ConnectorPanel'));

/** Live Preview controls; renders nothing unless the connector was enabled and connected. */
export const ConnectorSlot = () => {
    const view = useSyncExternalStore(subscribeConnectorView, getConnectorView);
    if (!view) return null;
    return (
        <Suspense fallback={null}>
            <ConnectorPanel view={view} actions={getConnectorActions()} />
        </Suspense>
    );
};
