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

- [ ] Eliminar las retenciones restantes detectadas en la auditoría de memoria.
  - [x] Reutilizar un único canvas de preprocessing y mantener una sola codificación `toBlob` activa.
  - [x] Limpiar cache del worker, resultados, estadísticas y buffers al cambiar o borrar la imagen.
  - [x] Limpiar resultados y cache cuando la selección de paleta quede vacía.
  - [x] Invalidar atlas 3D obsoletos y ejecutar `dispose()` si terminan tras desmontaje.
  - [ ] Garantizar la liberación de atributos, geometrías y buffers WebGL reemplazados.
  - [x] Liberar `debounced3DImageData` al salir del modo 3D.
  - [x] Liberar explícitamente el proxy Comlink y anular refs al terminar el worker.
  - [ ] Sustituir snapshots completos de undo/redo por deltas con presupuesto de memoria.
  - [ ] Limitar la resolución por píxeles totales y mostrar una estimación preventiva de RAM.
  - [ ] Eliminar el hook/cache 3D de texturas sin uso o implementar límite, referencias y `dispose()`.
  - [ ] Cancelar timers de toast y callbacks asíncronos de materiales/autodetección al desmontar.
  - [ ] Definir si la imagen subida debe persistir al salir del Builder; revocar su URL si no debe persistir.
  - **Aceptación:** cada recurso tiene propietario, límite y cleanup comprobado; tras volver al estado inicial no quedan buffers, URLs, tareas, texturas ni timers de la sesión anterior.

- [ ] Añadir profiling automatizado de memoria y recursos.
  - [ ] Contar máximo de RPC 2D y 3D activas/pendientes.
  - [x] Contar canvas, codificaciones y Blob URLs creadas/revocadas.
  - [ ] Medir `renderer.info.memory.geometries` y `renderer.info.memory.textures` tras ciclos 3D.
  - [ ] Probar ciclos 1x1 → 5x5 → 1x1 y carga → borrado → nueva carga.
  - [ ] Registrar heap JS, memoria del worker y memoria GPU/nativa por separado.
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
  - [ ] Medir la mejora en grids grandes.
  - [ ] Evaluar `createImageBitmap` y `OffscreenCanvas` con fallback compatible.

- [x] Limitar la caché global de conversiones OKLab.
  - [x] Medir cuántas entradas acumula en sesiones largas.
  - [x] Elegir entre limpieza por imagen, límite fijo o estrategia LRU.
  - [x] Añadir una prueba o benchmark de memoria reproducible.

## P2 — React y tipos

- [ ] Mover las actualizaciones de estado ejecutadas durante render a efectos.
  - [x] Limpiar preview y resultados mediante `useEffect`.
  - [ ] Verificar el comportamiento bajo React Strict Mode.

- [ ] Tipar `dithering` como `DitheringMode` desde el store.
  - [ ] Eliminar casts innecesarios en hooks y llamadas al worker.
  - [ ] Consolidar en un solo tipo los parámetros que determinan el procesamiento.

## P3 — Documentación y observabilidad

- [ ] Unificar la terminología de espacio de color: la implementación usa OKLab, no CIELAB.
- [ ] Documentar las invariantes y el formato de `packedResults`, `toneMap` y `heightPath`.
- [ ] Documentar qué parámetros forman la clave de caché.
- [ ] Sustituir logs de producción por un mecanismo de diagnóstico activable.
- [ ] Registrar benchmarks de referencia para 128×128, 512×512 y el grid máximo soportado.

## Verificación obligatoria por fase

- [x] `vitest` completa sin fallos.
- [x] TypeScript compila sin errores.
- [x] ESLint termina sin errores.
- [x] Los benchmarks críticos no muestran una regresión relevante.
- [x] Se realiza una prueba manual de preview 2D, preview 3D, materiales y exportación.
