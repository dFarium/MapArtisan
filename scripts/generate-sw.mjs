import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const TEXTURES_DIR = join(ROOT, "public", "textures");
const SW_PATH = join(ROOT, "public", "sw.js");

// Read all .png files from public/textures/
const textures = readdirSync(TEXTURES_DIR)
  .filter((f) => f.endsWith(".png"))
  .sort()
  .map((f) => `/textures/${f}`);

console.log(`[generate-sw] Found ${textures.length} textures`);

const sw = `const CACHE_NAME = "texture-cache-v2";
const TEXTURES_TO_CACHE = [
${textures.map((t) => `  "${t}",`).join("\n")}
];
const TEXTURE_URL_PATTERN = /\\/textures\\/.*\\.png$/;

// Install event - pre-cache all textures
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Pre-caching textures...");
      return Promise.allSettled(TEXTURES_TO_CACHE.map((url) => cache.add(url)));
    }),
  );
  self.skipWaiting();
});

// Activate event - clean up old caches if any
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

// Fetch event - Cache-First strategy for textures
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (TEXTURE_URL_PATTERN.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response; // Return from cache
        }

        return fetch(event.request).then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        });
      }),
    );
  }
});
`;

writeFileSync(SW_PATH, sw);
console.log(`[generate-sw] Written ${SW_PATH}`);
