import { expose } from 'comlink';
import { processMapart } from '../utils/mapartProcessing';
import { generateMapartExport } from '../utils/litematicaExport';

// Expose the processMapart function to the main thread
const api = {
    processMapart,
    generateMapartExport
};

export type MapartWorkerApi = typeof api;

expose(api);
