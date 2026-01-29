/// <reference lib="webworker" />
import { expose } from 'comlink';
import { processMapart } from '../utils/mapartProcessing';

// Expose the processMapart function to the main thread
const api = {
    processMapart
};

export type MapartWorkerApi = typeof api;

expose(api);
