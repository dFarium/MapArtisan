# Mapart Creator

A powerful, web-based tool for creating Minecraft Map Art. Originally inspired by `mapartcraft`, this tool has evolved to focus on a superior user experience and advanced features tailored for modern Minecraft (1.16+).

> **Designed for Minecraft 1.16+** — Modern block palettes and advanced 3D mechanics that simplify construction while maximizing visual fidelity.

---

## Features

### Image Settings

| Feature                    | Description                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------ |
| **Multi-Map Grids**        | Configure grids of 15+ maps for large-scale builds                                   |
| **Fitting Strategy**       | Choose between `Adjust` (fill canvas) or `Crop` (precision framing with zoom/offset) |
| **Pre-Processing Filters** | Adjust saturation, brightness, and contrast before quantization                      |

### Color Processing

- **10 Dithering Algorithms**: Smart (Hybrid), Floyd-Steinberg, Bayer 4x4, Bayer 8x8, Adaptive, Atkinson, Stucki, Burkes, Sierra-Lite, or None
- **Smart (Hybrid) by Default**: Blends Floyd-Steinberg with noise reduction for optimal balance
- **Hybrid Strength Slider**: Fine-tune the tradeoff between detail and smoothness
- **Auto-Detect Mode**: Analyzes your image to suggest the best dithering settings
- **CIELAB Color Space**: Perceptually uniform color matching (enabled by default)

### Construction Model

**Build Modes:**
| Mode | Description |
|------|-------------|
| `2D` | Flat map, no height variation |
| `3D Valley` | _Default._ Optimized height selection with Smart Drop for easier construction |
| `Staircase` | Classic diagonal staircase for full color range |

**Additional Options:**

- **3D Precision Slider** — Control "lossyness" (0% = Flat, 100% = Full 3D)
- **Structural Support** — Choose between full support, floating, or gravity-only support

### Version Support

Supports **Minecraft 1.16.0 through 1.21.5**:

- **Dynamic Palette Filtering** — Shows only blocks available in your target version
- **Automatic DataVersion** — Exports `.litematic` files with the correct internal version ID
- **Preset Compatibility** — Incompatible blocks are auto-replaced when loading presets

### Palette & Presets

- Browse and select blocks by color group in the **Palette Sidebar**
- **Search Filter** for quickly finding blocks by name
- **Custom Presets**: Save, load, and share your favorite block configurations
- **Quick Presets**: Apply "Basic", "Easy", "All", or "None" with one click

### Pixel Editor

- **Manual Painting** — Draw directly on the preview to fix individual pixels
- **Color/Block Picker** — Pick any color from the preview to use as your brush
- **Brightness Control** — Adjust the brightness level (light/normal/dark)
- **Undo/Redo** — Full history support

> **Note:** Edits are cleared when processing settings (palette, dithering, build mode, etc.) change.

### Real-Time Preview

- **2D Canvas** — Pan, zoom, and interact with the quantized preview
- **3D Preview** — Toggle to see a real-time 3D representation of your map art
- **Processing Indicator** — Visual feedback when reprocessing the image

### Export & Material List

| Export Type          | Description                                                        |
| -------------------- | ------------------------------------------------------------------ |
| **Litematica**       | Download `.litematic` files for direct use with the Litematica mod |
| **Multi-Map**        | Automatically bundles maps larger than 1x1 into a `.zip` file      |
| **Material List**    | View all required blocks with quantities and stack counts          |
| **Preview Download** | Save the quantized preview as a PNG image                          |

---

## Tech Stack

| Category    | Technologies                                     |
| ----------- | ------------------------------------------------ |
| Frontend    | React 19, TypeScript, Vite                       |
| 3D Engine   | Three.js (@react-three/fiber, @react-three/drei) |
| Styling     | Tailwind CSS 4                                   |
| State       | Zustand                                          |
| Concurrency | Web Workers via Comlink                          |
| Compression | pako, jszip                                      |

---

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

---

_Developed for the Minecraft community._
