/* tslint:disable */
/* eslint-disable */

export class WasmProcessingResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    height_map(): Int32Array;
    height_path(): Int32Array | undefined;
    packed_results(): Uint32Array;
    rgba(): Uint8Array;
    tone_map(): Int8Array | undefined;
    readonly height: number;
    readonly max_height: number;
    readonly min_height: number;
    readonly protocol_version: number;
    readonly request_id: bigint;
    readonly source_version: bigint;
    readonly width: number;
}

export function process_v1(source: Uint8Array, config: any, palette: any, edits: any): WasmProcessingResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmprocessingresult_free: (a: number, b: number) => void;
    readonly process_v1: (a: number, b: number, c: any, d: any, e: any) => [number, number, number];
    readonly wasmprocessingresult_height: (a: number) => number;
    readonly wasmprocessingresult_height_map: (a: number) => any;
    readonly wasmprocessingresult_height_path: (a: number) => any;
    readonly wasmprocessingresult_max_height: (a: number) => number;
    readonly wasmprocessingresult_min_height: (a: number) => number;
    readonly wasmprocessingresult_packed_results: (a: number) => any;
    readonly wasmprocessingresult_protocol_version: (a: number) => number;
    readonly wasmprocessingresult_request_id: (a: number) => bigint;
    readonly wasmprocessingresult_rgba: (a: number) => any;
    readonly wasmprocessingresult_source_version: (a: number) => bigint;
    readonly wasmprocessingresult_tone_map: (a: number) => any;
    readonly wasmprocessingresult_width: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
