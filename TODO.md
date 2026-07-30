# TODO técnico de MapArtisan

Este documento reúne las mejoras detectadas durante la revisión de la tubería de procesamiento de imágenes. Las tareas están ordenadas por prioridad y deben marcarse únicamente cuando su criterio de aceptación y sus pruebas estén completos.

## P0 — Corrección funcional

- [x] Evitar resultados obsoletos entre procesamientos concurrentes.
  - [x] Incorporar un `requestId` monotónico o una clave de solicitud.
  - [x] Comprobar su vigencia después de cada operación asíncrona.
  - [x] Corregir la cancelación del procesamiento iniciado después del debounce.
  - [x] Garantizar que una solicitud antigua no pueda desactivar el estado de una nueva.
  - **Aceptación:** al cambiar rápidamente paleta, dithering o precisión, solo se muestra el resultado de la última configuración.

- [x] Crear una clave completa para la caché del worker.
  - [x] Incluir versión y dimensiones de imagen.
  - [x] Incluir modo de construcción y paleta seleccionada.
  - [x] Incluir precisión 3D, dithering y modo perceptual.
  - [x] Incluir fuerza híbrida e `independentMaps`.
  - [x] Reutilizar `packedResults` únicamente si coincide toda la clave.
  - **Aceptación:** preview, materiales y exportación nunca reutilizan datos de otra configuración.

- [x] Separar el mapa de tonos base de las ediciones manuales.
  - [x] Mantener `baseToneMap` inmutable en la caché del worker.
  - [x] Construir cada resultado editado desde el mapa base.
  - [x] Verificar correctamente borrar, deshacer y rehacer ediciones.
  - **Aceptación:** eliminar una edición restaura exactamente el tono y las estadísticas originales.

- [x] Recalcular y devolver `heightPath` después de una edición manual.
  - [x] Extender el resultado de `applyManualEdits` con la ruta actualizada.
  - [x] Actualizar `heightPath` dentro de `useProcessingPipeline`.
  - [x] Mantener sincronizados preview 3D, estadísticas y exportación.
  - **Aceptación:** una edición de brillo actualiza inmediatamente la geometría 3D correcta.

- [x] Respetar `independentMaps` durante las ediciones incrementales.
  - [x] Aplicar Smart Drop por segmentos verticales de 128 píxeles.
  - [x] Compartir la lógica de segmentación con el procesamiento completo.
  - **Aceptación:** los límites entre mapas producen los mismos resultados antes y después de editar.

## P0 — Backpressure y memoria crítica

- [x] Impedir la acumulación de procesamientos 2D pesados.
  - [x] Ejecutar como máximo una llamada `processMapart` simultánea.
  - [x] Conservar solo la configuración pendiente más reciente.
  - [x] Crear/copiar el buffer de entrada únicamente cuando la tarea vaya a ejecutarse.
  - **Aceptación:** durante una operación bloqueada, una ráfaga de cambios mantiene una solicitud activa y una pendiente, nunca una cola creciente.

- [x] Impedir la acumulación de construcciones de geometría 3D.
  - [x] Ejecutar como máximo una llamada de geometría simultánea.
  - [x] Reemplazar solicitudes pendientes obsoletas por la última entrada.
  - [x] Verificar que buffers de entradas intermedias nunca sean enviados al worker.
  - **Aceptación:** 25 actualizaciones mientras el worker está bloqueado producen solo dos RPC: la activa y la última.

## P0 — Pruebas de regresión

- [x] Cubrir cambios rápidos de paleta, dithering y precisión.
- [x] Simular dos solicitudes que terminan fuera de orden.
- [x] Probar exportación y cálculo de materiales durante el debounce.
- [x] Probar pintar, reemplazar, borrar, deshacer y rehacer tonos.
- [x] Probar ediciones a ambos lados del límite `y = 127/128`.
- [x] Comparar el resultado incremental con un reprocesamiento completo equivalente.
- [x] Verificar que preview, materiales y archivos exportados usan la misma configuración.

## P1 — Memoria y rendimiento

- [x] Eliminar las retenciones restantes detectadas en la auditoría de memoria.
  - [x] Reutilizar un único canvas de preprocessing y mantener una sola codificación `toBlob` activa.
  - [x] Limpiar cache del worker, resultados, estadísticas y buffers al cambiar o borrar la imagen.
  - [x] Limpiar resultados y cache cuando la selección de paleta quede vacía.
  - [x] Invalidar atlas 3D obsoletos y ejecutar `dispose()` si terminan tras desmontaje.
  - [x] Garantizar la liberación de atributos, geometrías y buffers WebGL reemplazados.
    - Implementar `renderer.properties.remove()` en `Mapart3DPreview.tsx` para liberar `instanceMatrix`, `instanceColor` y `aTexLayer`.
    - Cleanup explícito en unmount con captura de refs antes del efecto.
  - [x] Liberar `debounced3DImageData` al salir del modo 3D.
  - [x] Liberar explícitamente el proxy Comlink y anular refs al terminar el worker.
  - [x] Sustituir snapshots completos de undo/redo por deltas con presupuesto de memoria.
    - Cada entrada ahora es `{ added: Record<number, ManualEdit>, removed: number[] }` en vez de un snapshot completo.
    - Presupuesto de 2MB por entrada y límite de 50 entradas.
    - Replay de deltas para reconstruir `manualEdits` en undo/redo.
  - [x] Implementar caché LRU de texturas 3D con límite de 256 entradas.
    - `imageCache` en `textureAtlas.ts` ahora evicta la entrada más antigua al exceder el límite.
    - Exportar `clearTextureCache()` para limpieza explícita al cambiar imagen, grid o vaciar paleta.
  - [x] Cancelar timers de toast al desmontar.
    - `ToastProvider` rastrea todos los timers en `useRef<Map>` y los limpia en cleanup.
  - [x] Revocar `previewUrl` al desmontar el Builder.
    - `useEffect` en `Builder.tsx` revoca el Blob URL al navegar fuera del componente.
  - [x] Garantizar caché `precomputedPackedResults` en export y cálculo de materiales.
    - `generateMapartExport` y `calculateMaterialCounts` en el worker ahora siempre procesan y cachean antes de usar `imageDataToBlockStates`.
    - Elimina el doble procesamiento que ocurría cuando el caché no coincidía.
  - [x] Limitar la resolución por píxeles totales y mostrar una estimación preventiva de RAM.
    - Límite hard: `x * y <= 128` mapas totales (cualquier permutación, ej. 128×1, 16×8, 1×128).
    - Soft limit: 96 mapas — muestra toast de advertencia con estimación de RAM.
    - UI muestra resolución, píxeles totales, RAM estimada y barra de progreso de mapas.
    - Función `clampGridDimensions` reduce el eje cambiado para mantenerse dentro del límite.
  - **Aceptación:** cada recurso tiene propietario, límite y cleanup comprobado; tras volver al estado inicial no quedan buffers, URLs, tareas, texturas ni timers de la sesión anterior.

- [x] Añadir profiling automatizado de memoria y recursos.
  - [x] Contar máximo de RPC 2D y 3D activas/pendientes.
    - Tests en `Mapart3DPreview.profiling.test.tsx` verifican que 25 actualizaciones producen solo 2 RPC.
  - [x] Contar canvas, codificaciones y Blob URLs creadas/revocadas.
  - [x] Medir `renderer.info.memory.geometries` y `renderer.info.memory.textures` tras ciclos 3D.
    - Tests de ciclos mount/unmount verifican que no hay fuga de geometrías.
  - [x] Probar ciclos 1x1 → 5x5 → 1x1 y carga → borrado → nueva carga.
    - Tests en `memoryCycles.test.ts` cubren ambos escenarios.
  - [x] Registrar heap JS, memoria del worker y memoria GPU/nativa por separado.
    - `estimateMemoryUsage()` proporciona estimación por componente.
  - [x] Benchmark de `toBlob()` vs `toDataURL()` en grids 128×128, 256×256 y 512×512.
    - Tests en `toBlob.bench.ts` miden tiempos y tamaños de blob.
  - **Aceptación:** las curvas alcanzan una meseta y vuelven al rango base después del cleanup; no crecen linealmente con el número de ciclos.

- [x] Corregir acumulación de trabajo durante interacciones rápidas.
  - [x] Decodificar la imagen de origen una sola vez por archivo.
  - [x] Agrupar ráfagas de filtros y crop en un único preprocesamiento.
  - [x] Eliminar la preview secundaria de alta resolución del recorrido de crop/filtros: ambas vistas reutilizan el único PNG acotado a la resolución del map art.
  - [x] Serializar y agrupar ráfagas de ediciones manuales.
  - [x] Liberar la caché del worker al cambiar la resolución.
  - [x] Reducir buffers 3D sobredimensionados al volver a un grid pequeño.
  - [x] Añadir pruebas de profiling para cada límite de recursos.
  - [x] Eliminar por completo PNG, Blob URLs y decodificaciones `<img>` del hot path de sliders; renderizar `ImageData` en canvas DOM persistentes.
  - [x] Eliminar `CanvasFilter` del `drawImage` de la fuente y aplicar filtros in-place sobre el buffer de salida acotado.
  - [x] Limitar las entradas User Timing emitidas por React en desarrollo para impedir que Blink retenga miles de `PerformanceMeasure` durante ráfagas de sliders.
  - [x] Validar el mismo escenario en build de producción: peak 136 MB y retorno a 67 MB en reposo; el crecimiento de ~2 GB era instrumentación de React Dev/User Timing, no una fuga del pipeline productivo.

- [x] Gestionar el ciclo de vida de todas las Blob URLs.
  - [x] Revocar la URL procesada anterior al reemplazarla.
  - [x] Revocar URLs pendientes al desmontar componentes.
  - [x] Centralizar esta responsabilidad en el estado de preview.

- [x] Sustituir `canvas.toDataURL()` por una generación asíncrona con `toBlob()`.
  - [x] Medir la mejora en grids grandes.
    - Benchmark en `toBlob.bench.ts` compara tiempos para 128×128, 256×256 y 512×512.
  - [ ] Evaluar `createImageBitmap` y `OffscreenCanvas` con fallback compatible.

- [x] Limitar la caché global de conversiones OKLab.
  - [x] Medir cuántas entradas acumula en sesiones largas.
  - [x] Elegir entre limpieza por imagen, límite fijo o estrategia LRU.
  - [x] Añadir una prueba o benchmark de memoria reproducible.

## P2 — React y tipos

- [x] Mover las actualizaciones de estado ejecutadas durante render a efectos o estado derivado.
  - [x] Limpiar preview y resultados mediante `useEffect`.
  - [x] Reiniciar la interacción del canvas mediante `useEffect` al cambiar la imagen.
  - [x] Derivar las texturas solicitadas desde la caché sin copiar props a estado durante render.
  - [x] Reiniciar el editor local del bloque de soporte mediante identidad de componente (`key`).
  - [x] Verificar el cambio de imagen bajo React Strict Mode.

- [x] Tipar `dithering` como `DitheringMode` desde el store.
  - [x] Validar valores provenientes del DOM con `isDitheringMode`.
  - [x] Eliminar casts innecesarios en hooks y llamadas al worker.
  - [x] Consolidar en `ProcessingConfig` los parámetros que determinan el procesamiento.

## P3 — Documentación y observabilidad

- [x] Unificar la terminología de espacio de color: la implementación usa OKLab, no CIELAB.
  - Corregido en documentación, comentarios y APIs internas (`OKLab`, `rgbToOklab`, caché OKLab).
- [x] Documentar las invariantes y el formato de `packedResults`, `toneMap` y `heightPath`.
  - Creado `docs/DATA_STRUCTURES.md` con especificación completa de formatos binarios, layouts y invariantes.
  - Añadido JSDoc detallado en `processMapart()`, `packPixel()`, y estructuras relacionadas.
- [x] Documentar qué parámetros forman la clave de caché.
  - Añadido JSDoc en `createProcessingConfigKey()` con lista completa de parámetros incluidos/excluidos.
  - Documentado en `docs/DATA_STRUCTURES.md`.
- [x] Sustituir logs de producción por un mecanismo de diagnóstico activable.
  - Creado `src/utils/diagnostic.ts` con `debug()`, `debug.warn()`, `debug.error()`.
  - Logs suprimidos por defecto, activables con `?debug=1` en URL o `localStorage.setItem('mapartisan:debug', '1')`.
  - La preferencia se propaga por Comlink al Web Worker, que no tiene acceso a `localStorage`.
  - Todo el código de producción registra mensajes mediante el mecanismo centralizado.
  - Cobertura automatizada para modo desactivado, URL, `localStorage`, configuración del worker y errores.
- [x] Registrar benchmarks de referencia para 128×128, 512×512 y el grid máximo soportado.
  - Creado `src/utils/__tests__/referenceBenchmarks.bench.ts`, separado de la suite funcional.
  - El máximo oficial es 128 mapas totales; el escenario representativo usa 16×8 mapas (2048×1024).
  - Metodología y resultados documentados en `docs/PERFORMANCE_BASELINES.md`.
  - Resultados de referencia:
    - 128×128 (1×1): 8.4 ms
    - 512×512 (4×4): 46.8 ms
    - 2048×1024 (16×8, 128 mapas): 308.7 ms
    - 512×512 en 2D: 112.8 ms

## Futuro — Motor Rust/WASM

- [ ] Preparar la implementación TypeScript como referencia estable antes del port.
  - [ ] Completar la limpieza funcional y de recursos pendiente en TypeScript.
  - [x] Definir el límite oficial: 128 mapas, equivalentes a 2.097.152 píxeles, con benchmark representativo 16×8.
  - [x] Crear 320 fixtures dorados generados programáticamente para 1×1/2×2, 2D/3D valley, todos los dithering, RGB/OKLab, ediciones y mapas independientes.
  - [ ] Registrar resultados, latencia y memoria de referencia para 128×128, 512×512 y el máximo permitido.

- [ ] Diseñar una API de procesamiento independiente de React y basada en buffers.
  - [ ] Versionar las estructuras de solicitud, configuración y resultado.
  - [ ] Mantener la imagen fuente y los buffers de trabajo dentro del motor.
  - [ ] Enviar en cada interacción solo parámetros y devolver buffers transferibles.
  - [ ] Conservar semántica latest-wins, cancelación e invalidación por versión.

- [ ] Implementar el núcleo matemático como crate Rust puro.
  - [ ] Portar matching OKLab/RGB, dithering, resultados empaquetados y Smart Drop.
  - [ ] Separar el crate de cualquier dependencia del navegador, Electron o UI.
  - [ ] Verificar paridad exacta o documentar tolerancias numéricas explícitas.
  - [ ] Añadir pruebas Rust con los mismos fixtures utilizados por TypeScript.

- [ ] Integrar Rust compilado a WASM dentro del Web Worker actual.
  - [ ] Mantener despliegue frontend estático, offline y sin backend.
  - [ ] Inicializar el módulo WASM una sola vez por worker.
  - [ ] Minimizar copias entre `ArrayBuffer` y memoria WASM.
  - [ ] Conservar temporalmente el motor TypeScript como fallback y referencia de paridad.

- [ ] Evaluar reutilizar el mismo crate como motor nativo de escritorio.
  - [ ] Comparar Electron con sidecar Rust frente a Tauri.
  - [ ] Diseñar IPC binario, lifecycle, reinicio y límites de memoria del proceso nativo.
  - [ ] Evitar bifurcar los algoritmos entre web y escritorio.

- **Aceptación:** el motor Rust produce resultados equivalentes al motor TypeScript, reduce de forma medida la latencia o memoria en los escenarios objetivo, mantiene procesamiento local y no requiere un backend.

## Verificación obligatoria por fase

- [x] `vitest` completa sin fallos.
- [x] TypeScript compila sin errores.
- [x] ESLint termina sin errores.
- [x] Los benchmarks críticos no muestran una regresión relevante.
- [x] Se realiza una prueba manual de preview 2D, preview 3D, materiales y exportación.
- [x] Contrato independiente v1 implementado en `src/engine`; ver `docs/PROCESSING_CONTRACT.md`.
- [x] Adaptador inicial del Web Worker para `processV1`/`applyEditsV1`, manteniendo compatibilidad con la API legacy.
