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
    - Cada entrada es `{ before, after }`: el valor de cada píxel que tocó el trazo antes y después (`null` = sin edición). Undo escribe `before` y redo escribe `after`, solo sobre los píxeles de ese paso (2026-10-16; antes era `{ added, removed }` reconstruido desde cero, y al descartar la entrada más vieja se perdían sus ediciones).
    - Presupuesto de 2MB por entrada y límite de 50 entradas. Un trazo que excede el presupuesto se aplica pero reinicia el historial.
    - `applyStroke` aplica el trazo y lo registra en un solo `set`; un trazo que no cambia nada no se registra.
  - [x] Implementar caché LRU de texturas 3D con límite de 256 entradas.
    - `imageCache` en `textureAtlas.ts` ahora evicta la entrada más antigua al exceder el límite.
    - Exportar `clearTextureCache()` para limpieza explícita al cambiar imagen, grid o vaciar paleta.
  - [x] Cancelar timers de toast al desmontar.
    - Desde la etapa 5 del revamp los toasts son de `sonner`, que maneja sus propios timers; `ToastProvider` ya no existe.
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

## P1 — Revamp de UI con shadcn/ui

Objetivo: controles consistentes, una escala tipográfica legible y colores por tokens en lugar de clases `zinc-*`/`blue-*` escritas a mano. Modo oscuro forzado, sin modo claro.

### Decisiones tomadas

- Preset `b1a1cZZmi` ([abrir en shadcn/create](https://ui.shadcn.com/create?preset=b1a1cZZmi&base=radix)): estilo `mira`, base color `mist`, tema y gráficos `blue`, íconos `lucide`, fuente `inter` (títulos `inherit`), radio `default`, menús `subtle`/`default`.
- Primitivas Radix (`radix-ui`). Componentes copiados en `src/components/ui` mediante el CLI.
- Un solo acento primario (azul). Los colores verde, morado y cian que hoy marcan secciones (crop, límite de altura, sliders) pasan a `primary`; los colores quedan reservados para estados (error, advertencia, éxito).
- Modo oscuro: `class="dark"` en `<html>` de `index.html`. Los tokens claros de `:root` se conservan solo porque es la estructura estándar de shadcn; nunca se aplican.
- El canvas, el editor de píxeles, la vista 3D y la grilla de texturas de la paleta siguen siendo componentes propios; solo adoptan tokens de color.

### Hecho (2026-10-16)

- [x] Alias de imports `@/` → `src/` en `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts` y `vitest.config.ts`.
- [x] `pnpm dlx shadcn@latest init --preset b1a1cZZmi --base radix --no-monorepo`: `components.json`, `src/lib/utils.ts`, tokens en `src/index.css`, dependencias `radix-ui`, `class-variance-authority`, `tw-animate-css`, `@fontsource-variable/inter`, `shadcn` (CSS) y `cn` (paquete oficial de shadcn que reemplaza clsx + tailwind-merge).
- [x] Modo oscuro forzado con `class="dark"` en `<html>`; suite, tsc, eslint y build en verde; captura sin cambios visuales.

### Inventario de partida

Conteo del 2026-10-16. "Colores" cuenta clases `bg-`/`text-`/`border-`/`ring-`/`from-`/`to-`/`shadow-`… con `zinc`, `blue`, `emerald`, `purple`, `cyan`, `red`, `green`, `amber`, `white`, `black` y similares. Ninguno de estos colores representa un color real de Minecraft: todos son de interfaz.

**Componentes de `builder/` y páginas** (rutas relativas a `src/components/` salvo `App.tsx` y `pages/`):

| Archivo | `<button>` | Colores | `text-[Npx]` | `title=` | Etapa | Notas |
|---|---|---|---|---|---|---|
| `builder/PixelEditor.tsx` | 11 | 60 | 3 | 12 | 3 | Herramientas del editor |
| `builder/canvas/CanvasToolbar.tsx` | 7 | 55 | 1 | 7 | 3 | Toolbar principal; importa `clsx` directo; tiene test |
| `builder/MaterialList.tsx` | 3 | 55 | 0 | 0 | 4 | Modal hecho a mano (`fixed inset-0`) → `Dialog` |
| `builder/control-panel/ConstructionSettingsSection.tsx` | 5 | 54 | 10 | 1 | 2 | 2 `<input type="radio">`; 2 grupos segmentados |
| `builder/control-panel/ImageSettingsSection.tsx` | 2 | 48 | 1 | 5 | 2 | 2 grupos segmentados, 7 sliders |
| `builder/palette/PresetsToolbar.tsx` | 7 | 34 | 0 | 1 | 4 | Tiene test |
| `builder/palette/PaletteGroup.tsx` | 2 | 24 | 0 | 4 | 4 | Tiene test |
| `builder/BrushSelector.tsx` | 2 | 21 | 1 | 1 | 3 | Modal hecho a mano con `createPortal` → `Dialog` |
| `builder/PaletteSidebar.tsx` | 2 | 16 | 0 | 0 | 4 | Buscador propio |
| `builder/canvas/CanvasStatusBar.tsx` | 0 | 15 | 0 | 1 | 3 | Importa `clsx` directo |
| `builder/ControlPanel.tsx` | 1 | 13 | 0 | 2 | 2 | Encabezado y botón de copiar configuración |
| `builder/canvas/ImageUploader.tsx` | 0 | 12 | 0 | 0 | 3 | Importa `twMerge` directo |
| `builder/control-panel/ProcessingSettingsSection.tsx` | 0 | 11 | 0 | 2 | 2 | Usa `Select`, `Checkbox` y `PrecisionSlider` viejos |
| `builder/MainCanvas.tsx` | 0 | 10 | 3 | 0 | 3 | |
| `builder/canvas/InteractionHints.tsx` | 0 | 10 | 0 | 0 | 3 | |
| `builder/3d/Mapart3DPreview.tsx` | 0 | 8 | 0 | 0 | 3 | Overlay de carga y controles sobre el canvas 3D; tiene tests de memoria y profiling |
| `pages/About.tsx` | 0 | 64 | 0 | 9 | 5 | |
| `App.tsx` | 0 | 16 | 0 | 0 | 5 | Fallback de `Suspense` (spinner) y `NotFound` |
| `pages/Builder.tsx` | 0 | 3 | 0 | 0 | 3 | Contenedor del layout |

**Componentes viejos** (hoy en `src/components/legacy/`; al hacer el inventario estaban en `src/components/ui`):

| Archivo | Usado por | Reemplazo |
|---|---|---|
| `Button.tsx` | Construction, Image, Processing | `button` de shadcn |
| `Input.tsx` | Construction, Image | `input` |
| `Label.tsx` | Construction, Image, Processing | `label` |
| `Select.tsx` (`<select>` nativo) | Construction, Processing | `select` |
| `Checkbox.tsx` (`<input type="checkbox">`) | Processing | `switch` (OKLab) o `checkbox` |
| `PrecisionSlider.tsx` (`<input type="range">`) | Construction, Image, Processing | Reimplementar sobre `slider` |
| `CollapsibleSection.tsx` | Construction, Image, Processing | Reimplementar sobre `collapsible` |
| `Toast.tsx` (+ `ToastContext`) | `App.tsx`, `PresetsToolbar.test.tsx` | `sonner` |
| `Card.tsx`, `PaletteGroup.tsx`, `PaletteSearch.tsx` | Nadie | Borrar (código muerto) |

**Totales:** 42 `<button>` sueltos en `builder/` (49 contando los de `ui/`) contra 6 usos de `Button`; 77 `text-xs`, 19 `text-[10px]`, 1 `text-[9px]`, 1 `text-[11px]`; 48 `title=`.

**Diálogos nativos:** `prompt('Enter a name for this preset:')` y `confirm('Delete this preset?')` en `src/utils/usePalettePresets.ts`.

**Código muerto:** `src/components/ui/PaletteGroup.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/PaletteSearch.tsx` (sin imports) y `src/App.css` (no se importa).

**Tests de UI que habrá que actualizar:** `CanvasToolbar.test.tsx`, `PresetsToolbar.test.tsx`, `PaletteGroup.test.tsx` y los dos de `Mapart3DPreview` (solo si cambia el overlay).

### Etapa 1 — Fundación

- [x] Unificar `cn`: los 8 imports de `src/utils/cn.ts` y los usos directos de `clsx` (`CanvasStatusBar`, `CanvasToolbar`) y `twMerge` (`ImageUploader`) pasan a `@/lib/utils`. Se borró `src/utils/cn.ts` y se quitaron `clsx` y `tailwind-merge` de `package.json` (`clsx` sigue instalado como dependencia de `class-variance-authority`).
- [x] Limpiar `src/index.css`: se quitaron de `:root` `font-family`, `line-height`, `font-weight`, `color` y `background-color`, y las reglas globales de `a`, `h1` y `button` de la plantilla de Vite. Esas reglas no estaban en ninguna capa (`@layer`), así que pisaban todas las utilidades de Tailwind: cada `<button>` tenía `padding: 0.6em 1.2em` y fondo `#1a1a1a` sin importar sus clases, y los `<h1>`/`<a>` ignoraban sus tamaños y colores. Efectos visibles: el estado activo de los selectores segmentados (ADJUST/SMOOTH) ahora se ve en azul; los botones usan el padding de sus clases; la fuente pasa a ser Inter Variable (antes caía en la fuente del sistema); el `404` y el título de About usan su tamaño real (`text-[10rem]`, `md:text-8xl`; revisar About en la etapa 5). Se importó `@fontsource-variable/inter/wght-italic.css` porque con `font-synthesis: none` el logo y "PARAMETERS" perdían la itálica. Se quitó el `!text-white` de `NotFound`, que solo existía para ganarle a la regla de `a`.
- [x] Borrar el código muerto listado arriba.
- [x] Mover los componentes viejos de `src/components/ui` a `src/components/legacy/` (imports con `@/components/legacy/...`). En Windows `Button.tsx` y `button.tsx` son el mismo archivo, así que el CLI de shadcn los habría pisado; ahora `ui/` contiene solo componentes de shadcn.
- [x] Definir la escala tipográfica y de controles. Se adopta la densidad del estilo `mira` tal como la genera el CLI (decidido 2026-10-16), sin editar los archivos de `ui/` para que `shadcn apply` siga siendo seguro:
  - Controles (botones, inputs, selects, toggles, labels): `text-xs` (12 px), altura `h-7` (tamaño `default`). `size="sm"` (`h-6`) solo donde el espacio lo exija; `size="lg"` (`h-8`) para acciones principales como Exportar.
  - Botones de ícono: `size="icon"` (`size-7`).
  - Texto secundario y ayudas: `text-xs text-muted-foreground`.
  - Mínimo 12 px en todo el código propio: eliminar `text-[9px]`, `text-[10px]` y `text-[11px]`. No usar `size="xs"` / `size="icon-xs"` de `Button` ni `size="sm"` de `Toggle` (10 px). `Badge` trae 10 px por defecto: usarlo con `className="text-xs"`.
  - Títulos de sección: `text-xs font-medium uppercase tracking-wide text-muted-foreground`, en un solo componente.
- [x] Agregar componentes base con el CLI: `button`, `toggle-group` (+ `toggle`), `select`, `slider`, `switch`, `checkbox`, `radio-group`, `input`, `label`, `tooltip`, `collapsible`, `separator`, `scroll-area`, `sonner`, `dialog`, `alert-dialog`, `dropdown-menu`, `badge`.
  - `sonner.tsx` usa `theme="dark"` fijo en lugar de `next-themes` (dependencia quitada).
  - `TooltipProvider` envuelve la app en `App.tsx`.
  - ESLint: `react-refresh/only-export-components` desactivada solo en `src/components/ui/**` (los componentes de shadcn exportan sus variantes `cva`).
- [x] `src/components/controls/PrecisionSlider.tsx` sobre el `Slider` de shadcn: misma API que el viejo salvo `accentColor` (todo pasa a `primary`; quitar esa prop al migrar cada uso). Conserva la rueda del mouse (1 % del rango o un paso, lo que sea mayor), etiqueta + valor + unidad y `onChange` con número. Tests en `controls/__tests__/`.
  - Accesibilidad: el `Slider` de shadcn no dejaba pasar `aria-label` al thumb, así que el slider no tenía nombre accesible (el `<input type="range">` viejo tampoco lo tenía). Resuelto en la etapa 6.
- [x] `src/components/controls/SegmentedControl.tsx` sobre `ToggleGroup` `single`: no se puede deseleccionar, opciones con `value`, `label`, `icon` y `tooltip` opcionales, y el activo en `primary`. Tests en `controls/__tests__/`. Probado en la app en lugar de ADJUST/CROP (cambio revertido; la migración real es la etapa 2).
- [x] Polyfill de `ResizeObserver` en `vitest.setup.ts` (lo necesita el `Slider`). `hasPointerCapture`/`scrollIntoView` no hicieron falta todavía; agregarlos si `Select` o `DropdownMenu` los piden en los tests.
- Los componentes que usen `Tooltip` necesitan `TooltipProvider` en sus tests (en la app ya está en `App.tsx`).
- **Aceptación:** la app se ve igual o mejor que antes, sin textos bajo 12 px en los componentes base, y la suite pasa.

### Etapa 2 — Panel de control (hecha 2026-10-16)

- [x] Tests de comportamiento antes de migrar: `control-panel/__tests__/` (una suite por sección + `helpers.tsx`) y `builder/__tests__/ControlPanel.test.tsx`. Encuentran los controles por lo que ve el usuario (texto, rueda del mouse, select nativo o de Radix), así que pasaron igual contra la versión vieja y contra la nueva (23 tests).
- [x] `ControlPanel.tsx`: About y Material List con `Button` de ícono + `Tooltip` + `aria-label`. El logo conserva sus colores de marca (azul/verde) a propósito.
- [x] `controls/CollapsibleSection.tsx` sobre `Collapsible`, con modo controlado (`isOpen`/`onToggle`).
- [x] `controls/FieldLabel.tsx`: título de campo único (`Label` + ícono opcional, mayúsculas, `text-muted-foreground`). Los inputs y selects quedan asociados a su etiqueta con `htmlFor`/`useId`.
- [x] `ImageSettingsSection`: Maps X/Y con `Input`; memoria con tokens de estado; ADJUST/CROP y SMOOTH/SHARP con `SegmentedControl` (las descripciones de SMOOTH/SHARP pasan de `title` a `Tooltip`); sliders con el `PrecisionSlider` nuevo; resets con `Button` de ícono + `Tooltip`. Precision Crop deja el verde.
- [x] `ProcessingSettingsSection`: dithering con `Select` agrupado (Smart, Error diffusion, Ordered, y Disabled aparte); Auto con `Button` ghost + `Tooltip`; OKLab con `Switch`; versión con `Select`. El slider de fuerza deja el cian.
- [x] `ConstructionSettingsSection`: Build Mode, estilos de límite de altura, File Format y File Layout con `SegmentedControl`; "Limit build height" con `Switch`; Block Support y 3D Preview Area con `Select`; Support Block ID con `Input` + `Button`. El slider de altura deja el morado.
- [x] Tokens nuevos `success` y `warning` en `index.css` (`:root`, `.dark` y `@theme inline`) para colores de estado. Riesgo de memoria: low → `success`, medium y high → `warning`, critical → `destructive` (antes high era naranja).
- [x] Polyfills de `scrollIntoView`, `hasPointerCapture` y `releasePointerCapture` en `vitest.setup.ts` (los pide el `Select` de Radix).
- [x] Borrados de `legacy/`: `Button`, `Checkbox`, `Input`, `Label`, `Select`, `PrecisionSlider`, `CollapsibleSection`. Solo queda `Toast` (etapa 5).
- **Aceptación cumplida:** en `control-panel/` no hay `<button>`, `<select>` ni inputs range/checkbox/radio sueltos, ni `text-[Npx]`, ni colores escritos a mano. En `ControlPanel.tsx` solo quedan los colores del logo.

Notas de la etapa 2:
- `SegmentedControl` marca el activo con `aria-checked` además de `data-[state=on]`: cuando una opción tiene `tooltip`, el `TooltipTrigger` pisa `data-state` con el estado del tooltip y el activo dejaba de verse.
- `custom-scrollbar` no está definida en ningún CSS (clase muerta). Se quitó de `ControlPanel`; sigue en `MaterialList`, `PaletteSidebar`, `About` y `pages/Builder`. Reemplazar por `ScrollArea` o quitarla al migrar cada uno.
- `primary` en modo oscuro (`oklch(0.424 0.199 265.6)`) tenía poco contraste como color de texto sobre el fondo (~2.3:1). Se aclaró a `oklch(0.55 …)`; ver "Pendientes después de la migración".

### Etapa 3 — Canvas, toolbar y barra de estado (hecha 2026-10-16)

- [x] `controls/ToolbarButton.tsx`: botón de ícono para las barras flotantes, con `Tooltip`, `aria-label` y estado `pressed` (`aria-pressed`, fondo `primary`). El tooltip se engancha a un `span` que envuelve al botón para que siga apareciendo cuando el botón está deshabilitado (p. ej. "Close Pixel Editor first").
- [x] `CanvasToolbar`: todos los botones con `ToolbarButton`, grupos separados con `Separator`, exportar como `Button` primario con spinner y `aria-busy`, descartar con la variante `destructive`. El indicador "Processing..." usa `warning` y `role="status"`. El modo 2D/3D quedó como botón presionable y no como `SegmentedControl`: en una barra vertical de íconos un toggle ocupa menos y se lee igual. `CanvasToolbar.test.tsx` actualizado (roles en vez de `title`) y ampliado con estados presionados, deshabilitados y de exportación.
- [x] `PixelEditor`: herramientas, brillo, deshacer/rehacer, limpiar y cerrar con `ToolbarButton`; el selector de pincel pasó de `div` clickeable a `Button` (accesible con teclado). Tests nuevos en `builder/__tests__/PixelEditor.test.tsx` (8).
- [x] `BrushSelector` pasa a `Dialog` (se va el portal propio y el manejo manual de Esc y del fondo). Las muestras de color siguen pintadas con el color real del mapa, ahora como `Button` con `aria-label` y `aria-pressed`.
- [x] `HintBar` compartido (`canvas/HintBar.tsx`) para la píldora de atajos de `InteractionHints` y de `Mapart3DPreview`, que estaba duplicada.
- [x] `CanvasStatusBar`, `ImageUploader`, `MainCanvas`, `Mapart3DPreview` y `pages/Builder.tsx` con tokens (`popover`, `card`, `muted`, `border`, `success`, `destructive`). Los `text-[10px]` pasan a `text-xs`. `custom-scrollbar` quitada de `pages/Builder.tsx`.
- **Aceptación cumplida**, con dos excepciones a propósito: las coordenadas de sección sobre el mapa (`text-white/50` con sombra, porque van encima de la imagen) y el anillo `ring-black/20` de las muestras de color en `BrushSelector`.
- Probado en la app con Edge controlado por CDP (script en el scratchpad de la sesión): carga de imagen, editor abierto, diálogo de pincel y modo 3D. El preview del mapart y la vista 3D no se pudieron ver porque un perfil nuevo no tiene bloques elegidos en la paleta; queda para la prueba de la etapa 4.

### Etapa 4 — Paleta y materiales (hecha 2026-10-16)

- [x] `PaletteSidebar`: buscador con `Input` + ícono y `aria-label`; colapsar/expandir con `Button` de ícono + `Tooltip`; tokens. La lista sigue siendo un `div` con `overflow-y-auto` (no `ScrollArea`, para mantenerla liviana; ver rendimiento abajo). `custom-scrollbar` quitada.
- [x] `PresetsToolbar`: abrir/cerrar con `Collapsible`; presets con `Button` `secondary`; Reset `destructive`; borrar preset con `Button` de ícono + `Tooltip`. Adelantado de la etapa 5: guardar abre un `Dialog` con `Input` y borrar pide confirmación con `AlertDialog`. `usePalettePresets` ya no llama a `prompt()`/`confirm()`: `saveCurrentAsPreset(name)` recibe el nombre (recorta espacios, ignora vacíos) y `deletePreset(index)` borra directo.
- [x] `PaletteGroup`: tokens. El encabezado pasó de `div` clickeable a `<button>` con `aria-expanded`; las texturas tienen `aria-pressed`. Encabezado y texturas son `<button>` nativos con clases precalculadas, a propósito (ver rendimiento). Las losas y alfombras siguen con `object-cover`, como se veían antes (el código viejo tenía `object-cover` y `object-contain` juntos y ganaba `object-cover`).
- [x] `MaterialList` pasa a `Dialog` (adelantado de la etapa 5); vista Total/Reusable con `SegmentedControl`; shulkers con `Badge`; la textura que falla muestra el ícono `Box` con estado de React en vez de inyectar SVG con `innerHTML`.
- [x] Tests: `PresetsToolbar.test.tsx` con `TooltipProvider`; `usePalettePresets.test.tsx` adaptado a la nueva API y con un caso para nombres vacíos.
- [x] Probado en la app (Edge por CDP): aplicar "All Colors", preview del mapart, guardar y borrar un preset con los diálogos, lista de materiales.
- **Rendimiento (aceptado 2026-10-16):** con la paleta completa, buscar "a" (expande ~650 texturas) cuesta ~10 ms más de hilo principal que antes: ~86 ms contra ~76 ms (~13 %), medido con build de producción, Edge headless y corridas alternadas. Script y layout no cambiaron; la diferencia está en recálculo de estilos y pintado. Aplicar un preset y limpiar la búsqueda quedaron igual. La primera versión migrada costaba más (~+25 ms); se recuperó usando `<button>` nativos en encabezados y texturas, sin `ScrollArea` y sin `cn()` por textura. Si hiciera falta más, la solución de fondo es virtualizar la lista.
- **Aceptación cumplida** salvo los `<button>` nativos de `PaletteGroup`, que quedan por rendimiento.

### Etapa 5 — Notificaciones, diálogos y páginas (hecha 2026-10-16)

- [x] `ui/Toast.tsx` + `ToastContext` reemplazados por `sonner`. Con solo dos llamadores (`PresetsToolbar` y `useMapartWorker`), en vez de mantener un contexto se dejó una función de módulo `showToast(message, type, duration)` en `src/lib/toast.ts` que llama a `toast[type]()`; no necesita provider y es estable (sale de las dependencias de los efectos). `<Toaster position="bottom-right" />` se monta una vez en `App.tsx`. Se borraron `components/legacy/Toast.tsx` y `context/ToastContext.tsx`, con lo que `legacy/` y `context/` quedaron vacías.
- [x] Diálogos nativos de `usePalettePresets` reemplazados por `Dialog` y `AlertDialog` (hecho en la etapa 4).
- [x] Modales hechos a mano a `Dialog`: `BrushSelector` (etapa 3) y `MaterialList` (etapa 4).
- [x] `pages/About.tsx`: superficies, bordes y texto con tokens; enlaces con forma de botón como `Button asChild`; `custom-scrollbar` quitada. Se conservan a propósito los acentos de marca decorativos: degradado del logo y del titular, colores de los íconos de cada feature y el corazón del pie. El titular pasa a `text-4xl md:text-6xl` (con `md:text-8xl` quedaba en 96 px; hasta la etapa 1 la regla global de `h1` lo dejaba en ~51 px).
- [x] `NotFound` y el spinner de carga (`App.tsx`): tokens, `Button asChild` y `Loader2`.
- [x] `title=`: de 48 quedan 3 atributos reales, todos en las texturas de `PaletteGroup` (a propósito, por rendimiento: un `Tooltip` de Radix por textura es lo que se quiso evitar). El de la altura en `CanvasStatusBar` pasó a `Tooltip` con foco de teclado; el resto se convirtió en `Tooltip` + `aria-label` durante las etapas 2 a 4.
- Nota de desarrollo: al agregar una dependencia nueva con `vite` corriendo, el caché de dependencias puede quedar con dos copias de React ("Invalid hook call" en `sonner`). Se resuelve reiniciando con `vite --force`; no afecta al build.

### Etapa 6 — Cierre (hecha 2026-10-16)

- [x] Barrido final en `src/components` (sin `ui/`), `src/pages` y `App.tsx`. Solo quedan las excepciones documentadas:
  - `text-[10rem]` en el `404` de `NotFound` (titular gigante, no texto chico).
  - Colores escritos a mano: acentos de marca del logo (`ControlPanel`) y de `About`, `ring-black/20` en las muestras de `BrushSelector` y `text-white/50` en las coordenadas sobre el mapa.
  - `<button>` nativos y `title=` solo en `PaletteGroup` (encabezado, "Unselect" y texturas), por rendimiento.
  - `custom-scrollbar` ya no aparece en ningún archivo.
- [x] `src/components/legacy/` y `src/context/` borradas (quedaron vacías en la etapa 5).
- [x] Accesibilidad: ningún control sin nombre accesible (revisado con el árbol de accesibilidad en Edge); foco visible al recorrer con Tab. Los sliders no tenían nombre porque el `Slider` de shadcn no pasa `aria-label` al thumb, que es el que tiene `role="slider"`: se editó `ui/slider.tsx` para pasarlo (única edición a un archivo generado; comentario "Local change" en el archivo; revisarla si se regenera con `shadcn add slider --overwrite`).
- [~] Capturas antes/después: reemplazadas por la prueba manual del usuario (panel, canvas, editor, paleta, materiales, teclado y páginas, todo validado).
- [x] README (stack de UI y nota para agregar componentes) y CHANGELOG actualizados.
- **Aceptación cumplida:** `vitest`, tsc, eslint y build en verde; prueba manual de preview 2D/3D, pintura, materiales y exportación. La grilla de paleta tiene la regresión aceptada en la etapa 4 (~10 ms al expandir ~650 texturas); el canvas quedó más rápido (ver abajo).

Hallazgos de la prueba manual, ya resueltos:
- Pintar en mapas grandes congelaba el navegador ~5 s después de cada trazo, solo en desarrollo. React 19.2 en dev compara las props que cambian para el panel Performance y recorre los arrays tipados elemento por elemento; `MainCanvas` recibía `packedResults` (un elemento por píxel, 1,6 M en 10×10) en cada resultado. Ahora `useMapartWorker` entrega `PixelBuffers` (`src/hooks/pixelBuffers.ts`), que guarda los arrays en campos privados: el resultado pasó de 5128 ms a 57 ms hasta verse en pantalla. En producción no ocurría.
- Undo/redo perdía los trazos más viejos después de 50 pasos; el botón Redo quedaba deshabilitado después de deshacer. Ver el historial en "P1 — Memoria y rendimiento".
- `Builder`, `MainCanvas` y las secciones del panel leían el store completo con `useMapart()`, así que cada trazo re-renderizaba la paleta y el panel. Ahora usan `useMapartFields(...)` (selector superficial por campo) y `PaletteSidebar`/`ControlPanel` están memoizados.

### Pendientes después de la migración

- [x] Rueda del mouse en el canvas: React registra `onWheel` como pasivo, así que el `preventDefault()` de `useCanvasInteraction` se ignoraba (aviso en consola) y Ctrl + rueda o el pellizco del trackpad también hacían zoom en toda la página. Ahora `useCanvasInteraction` expone `attachWheel(node)`, que registra un listener nativo con `{ passive: false }`; `MainCanvas` lo engancha con un callback ref, que lo quita cuando el contenedor se desmonta en modo 3D.
- [x] `<Canvas shadows>` en `Mapart3DPreview` pedía `PCFSoftShadowMap`, que three 0.184 marca como obsoleto y reemplaza por `PCFShadowMap`. Ahora usa `shadows="percentage"` (mismo resultado, sin aviso).
- [ ] Aviso `THREE.Clock … deprecated`: lo crea `@react-three/fiber`. Hasta la 9.8.2 (última estable, revisada 2026-10-16) sigue usando `THREE.Clock`, así que no se arregla actualizando; esperar a R3F 10 (hoy en alpha).
- [x] Orden de foco: los 61 grupos de la paleta van antes que el canvas y el panel. `SkipLinks` agrega "Skip to canvas" y "Skip to settings", ocultos hasta recibir foco con el primer Tab; los destinos (`<main>` del canvas y el contenedor del panel) tienen `tabIndex={-1}`.
- [x] Contraste de `primary`: en modo oscuro pasó de `oklch(0.424 …)` a `oklch(0.55 0.199 265.638)` (decidido 2026-10-16). Los íconos con `text-primary` (spinners, engranaje del panel) pasan de ~2:1 a 3.9:1 sobre `background` y 3.4:1 sobre `card`; el texto de los botones primarios queda en 4.66:1 (AA). Sobre `muted` da 2.9:1: no usar `text-primary` ahí, ni para texto chico en general.

### Notas para retomar

- Comando para agregar componentes: `pnpm exec shadcn add <componente>` (usa la versión local del paquete `shadcn`).
- Los componentes generados importan `cn` desde el paquete `cn`; el código propio lo importa desde `@/lib/utils`, que lo reexporta. Son la misma función.
- Si se mueve la carpeta del proyecto, los symlinks de `node_modules` de pnpm quedan apuntando a la ruta vieja: borrar `node_modules` y correr `pnpm install`.
- `components.json` usa `@/components/ui` para los componentes y `@/lib/utils` para `cn`.
- Cambiar el preset más adelante: `pnpm dlx shadcn@latest apply <código>`; ver el actual con `pnpm dlx shadcn@latest preset resolve`.
- Los tokens oscuros están en el bloque `.dark` de `src/index.css`; para ajustar un color, editar ahí.

## Archivado — Motor Rust/WASM (retirado 2026-10-16)

El motor Rust/WASM (`rust/processing-core`, `rust/processing-wasm`, `src/wasm/`, `WasmEngine`) se retiró de la aplicación. Su último estado queda en el tag local `rust-engine-final` (commit `6f168ac`), con paridad exacta frente a TypeScript en los 616 fixtures dorados, incluido el límite de altura.

**Por qué se retiró.** Medido con una imagen real, modo 3D, cachés frías y paleta completa (61 colores, 183 candidatos), WASM en un hilo fue más lento que TypeScript en todos los modos OKLab (0.47–0.94×) y apenas igual o algo mejor en RGB (1.0–1.25×). Las ganancias registradas antes venían de un benchmark con solo 7 colores. Con hilos, el caso más grande ahorraría unos 200 ms; para una app que procesa una sola imagen en la máquina del usuario, eso no compensa mantener dos implementaciones de cada algoritmo, la toolchain de Rust, ~320 KB de WASM y las cabeceras COOP/COEP.

**Efectos de retirarlo.**
- [x] El worker usa solo `TypeScriptEngine`; materiales y exportación reutilizan el resultado base en caché en lugar de reprocesar.
- [x] Las ediciones manuales vuelven a ser incrementales en todos los modos.
- [x] Se quitaron las cabeceras COOP/COEP de Vite y Vercel (solo las necesitaban los hilos de WASM).

**Cuándo reconsiderarlo.** Solo si aparece una versión de escritorio nativa (Tauri o sidecar) o si el procesamiento se vuelve un cuello de botella medido. En ese caso, recuperar el crate desde el tag y antes de integrarlo:
- [ ] Portar la búsqueda de colores podada por luminosidad de `colorMatching.ts` con candidatos en arreglos contiguos, y la caché por color exacto en `none`.
- [ ] Medir con la paleta completa, nunca solo con la golden de 7 colores.
- [ ] Resolver Smart V1, que no se puede paralelizar porque su varianza lee vecinos que aún reciben error.

## Verificación obligatoria por fase

- [x] `vitest` completa sin fallos.
- [x] TypeScript compila sin errores.
- [x] ESLint termina sin errores.
- [x] Los benchmarks críticos no muestran una regresión relevante.
- [x] Se realiza una prueba manual de preview 2D, preview 3D, materiales y exportación.
- [x] Contrato independiente v1 implementado en `src/engine`; ver `docs/PROCESSING_CONTRACT.md`.
- [x] Adaptador inicial del Web Worker para `processV1`/`applyEditsV1`, manteniendo compatibilidad con la API legacy.
- [x] Migrar `useProcessingPipeline` al contrato v1 para procesamiento y ediciones manuales; conservar fallback legacy temporal.
- [x] Migrar cálculo de materiales a `calculateMaterialCountsV1`; la generación de archivos queda pendiente.
- [x] Migrar generación de Litematica/NBT a `generateMapartExportV1`; mantener fallback legacy temporal.
- [x] Crear el esqueleto puro `rust/processing-core` con contrato, errores y validación inicial de buffers.
- [x] Portar la primera primitiva RGB (`rgb_distance_sq`, selección de candidato y cuantización RGBA→ID) con pruebas Rust.
- [x] Integrar cuantización RGB/OKLab básica y empaquetado de candidato en `processing-core`.
- [x] Portar ordered dithering 4×4/8×8, Smart Drop y actualización coherente de ediciones manuales al núcleo Rust.
- [x] Alcanzar paridad algorítmica Rust/TypeScript en 352 fixtures dorados, comparando buffers y estadísticas byte por byte.
- [x] Medir rendimiento Rust/TypeScript con warm-up, dos rondas y 16–30 muestras por escenario; mejora media geométrica observada: 2.87×.
- [x] Integrar el adaptador WASM al Web Worker con fallback y enrutamiento medido: WASM para RGB y OKLab sin difusión; TypeScript para difusión perceptual.
- [x] Optimizar OKLab WASM con LUT gamma, caché acotada, buffer RGB compacto y reducción de copias del puente.
- [x] Implementar paralelismo seguro con Rayon mediante wavefront por tiles, conservando resultados deterministas frente a la ejecución serial.
- [x] Implementar Hybrid V2 con actividad local inmutable, difusión adaptativa continua y aislamiento estricto entre mapas independientes.
  - [x] Mantener Hybrid V1 como opción y exponer V2 explícitamente en la interfaz.
  - [x] Hacer de Smart V2 el modo por defecto (2026-10-16).
  - [x] Verificar fuerza 100% byte por byte contra Floyd–Steinberg.
  - [x] Verificar paridad TypeScript/Rust/WASM en RGB, OKLab y mapas independientes.
  - [x] Medir Hybrid V2 nativo en release: Rayon con 4 hilos logra 2.05× en 512² y 2.37× en 1024×512 frente al núcleo serial.
