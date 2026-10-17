import { useEffect, useRef } from 'react';
import type { WorkerRefs, ExportParams } from './types';
import { PROCESSING_PROTOCOL_VERSION } from '../engine';
import { toProcessingConfig } from './useProcessingPipeline';
import { transferableSource } from './useExportPipeline';
import { setConnectorSnapshotSource } from '../connector/snapshotSource';
import { useMapartStore } from '../store/useMapartStore';

export interface UseConnectorSnapshotSourceProps extends WorkerRefs {
    sourceImageDataRef: React.RefObject<ImageData | null>;
    sourceImageVersion: number;
    params: ExportParams;
}

/**
 * Lets the live preview connector request a snapshot of the current construction.
 * Registering is free: the worker only runs when the connector asks.
 */
export function useConnectorSnapshotSource({
    workerApiRef,
    sourceImageDataRef,
    sourceImageVersion,
    params,
}: UseConnectorSnapshotSourceProps): void {
    const paramsRef = useRef(params);
    const versionRef = useRef(sourceImageVersion);

    useEffect(() => {
        paramsRef.current = params;
        versionRef.current = sourceImageVersion;
    }, [params, sourceImageVersion]);

    useEffect(() => setConnectorSnapshotSource(async () => {
        const api = workerApiRef.current;
        const sourceImage = sourceImageDataRef.current;
        if (!api || !sourceImage) return null;

        return api.generateConstructionSnapshotV1({
            protocolVersion: PROCESSING_PROTOCOL_VERSION,
            requestId: Date.now(),
            sourceVersion: versionRef.current,
            config: toProcessingConfig(paramsRef.current, sourceImage.width, sourceImage.height),
            source: transferableSource(sourceImage),
            manualEdits: paramsRef.current.manualEdits,
            // Multiple Files always has a section selected; Single File has none (spec section 10.2).
            section: useMapartStore.getState().previewSection,
        });
    }), [workerApiRef, sourceImageDataRef]);
}
