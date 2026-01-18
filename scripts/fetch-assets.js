import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PALETTE_PATH = path.join(__dirname, "../src/data/palette.json");
const PUBLIC_TEXTURES_DIR = path.join(__dirname, "../public/textures");
const BASE_URL =
  "https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.21.1";

async function main() {
  console.log("Starting asset fetch and bundling...");

  // 1. Ensure public/textures exists
  if (!fs.existsSync(PUBLIC_TEXTURES_DIR)) {
    fs.mkdirSync(PUBLIC_TEXTURES_DIR, { recursive: true });
  }

  // 2. Load Palette Data
  const paletteRaw = fs.readFileSync(PALETTE_PATH, "utf-8");
  const palette = JSON.parse(paletteRaw);

  // Collect all unique blocks
  const paletteBlocks = new Set();
  palette.colors.forEach((color) => {
    color.blocks.forEach((block) => {
      paletteBlocks.add(block.replace("minecraft:", ""));
    });
  });
  console.log(`Found ${paletteBlocks.size} unique blocks in palette.`);

  // 3. Fetch Texture Mapping
  console.log("Fetching texture mapping...");
  const mappingResponse = await fetch(`${BASE_URL}/blocks_textures.json`);
  if (!mappingResponse.ok) throw new Error("Failed to fetch texture mapping");
  const textureMappingArray = await mappingResponse.json();

  // Convert array to map for easier lookup: name -> texture_path
  const textureMap = {};
  textureMappingArray.forEach((item) => {
    if (item.name && item.texture) {
      textureMap[item.name] = item.texture;
    }
  });

  // 4. Download and Bundle Textures
  const textureBundle = {}; // Map<BlockName, Base64String>
  let successCount = 0;
  let failCount = 0;

  console.log("Downloading and bundling...");

  // Use sequential or batched downloads to avoid rate limits if needed, but parallel is usually fine for these amounts
  // We will do parallel with limit if needed, but Promise.all is okay for ~1000 items usually (might timeout, let's chunk)

  const blocks = Array.from(paletteBlocks);
  const CHUNK_SIZE = 50;

  for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
    const chunk = blocks.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (blockName) => {
        if (textureMap[blockName]) {
          const texturePath = textureMap[blockName].replace("minecraft:", "");
          const url = `${BASE_URL}/${texturePath}.png`;

          // We'll use the file system as cache during build to avoid re-downloading if not needed
          const dest = path.join(PUBLIC_TEXTURES_DIR, `${blockName}.png`);

          try {
            let buffer;
            if (fs.existsSync(dest)) {
              buffer = fs.readFileSync(dest);
            } else {
              const response = await fetch(url);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const arrayBuffer = await response.arrayBuffer();
              buffer = Buffer.from(arrayBuffer);
              fs.writeFileSync(dest, buffer);
            }

            textureBundle[blockName] = buffer.toString("base64");
            successCount++;
          } catch (err) {
            console.error(`Failed ${blockName}: ${err.message}`);
            failCount++;
          }
        } else {
          // console.warn(`No mapping: ${blockName}`); // verbose
          failCount++;
        }
      }),
    );

    // precise logging
    process.stdout.write(
      `\rProcessed ${Math.min(i + CHUNK_SIZE, blocks.length)}/${blocks.length}`,
    );
  }

  console.log("\nWriting bundle...");
  const bundlePath = path.join(PUBLIC_TEXTURES_DIR, "textures.json");
  fs.writeFileSync(bundlePath, JSON.stringify(textureBundle));

  const stats = fs.statSync(bundlePath);
  console.log(`Bundle generated: ${bundlePath}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Included: ${Object.keys(textureBundle).length} textures`);
}

main().catch(console.error);
