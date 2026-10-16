/**
 * Generates the reference test card used to validate exports in Minecraft.
 *
 * The card is 1024x2048: exactly 8 source pixels per block for a 1x2 map
 * grid (128x256 blocks). Every structural element is drawn on the 8px grid,
 * so it survives any resampling unchanged; only the fine-detail band uses
 * single source pixels, to expose nearest-neighbour aliasing.
 *
 * Layout per map (block coordinates, x from the west, rows from the north):
 * - Row 0 and row 127: full-width boundary stripes. A missing row in game
 *   shows up as a missing stripe.
 * - x 0-15: map number on white.
 * - x 16-47: dark vertical gradient (stresses descending height runs).
 * - x 48-79: light vertical gradient (stresses ascending height runs).
 * - x 80-111: one-pixel stripes and noise (resampling and aliasing).
 * - x 112-127: hue ramp (colour fidelity).
 *
 * Usage: node scripts/generate-test-card.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'docs', 'test-images', 'test-card-1x2.png');

const SCALE = 8;
const MAP = 128;
const MAPS_Y = 2;
const canvas = createCanvas(MAP * SCALE, MAP * MAPS_Y * SCALE);
const ctx = canvas.getContext('2d');

/** Fills a rectangle given in block coordinates. */
function blocks(x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * SCALE, y * SCALE, width * SCALE, height * SCALE);
}

/** Vertical gradient snapped to whole blocks so resampling cannot change it. */
function blockGradient(x, y, width, height, from, to) {
    for (let row = 0; row < height; row++) {
        const t = row / (height - 1);
        const channel = (i) => Math.round(from[i] + (to[i] - from[i]) * t);
        blocks(x, y + row, width, 1, `rgb(${channel(0)},${channel(1)},${channel(2)})`);
    }
}

/** 3x5 pixel font, enough for the map numbers. */
const DIGITS = {
    0: ['111', '101', '101', '101', '111'],
    1: ['010', '110', '010', '010', '111'],
};

function digit(value, x, y, size) {
    DIGITS[value].forEach((line, row) => {
        [...line].forEach((cell, column) => {
            if (cell === '1') blocks(x + column * size, y + row * size, size, size, '#111111');
        });
    });
}

/** Deterministic noise so the card is identical on every run. */
function random(seed) {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function fineDetail(x, y, width, height, seed) {
    const left = x * SCALE;
    const top = y * SCALE;
    const pixelWidth = width * SCALE;
    const pixelHeight = height * SCALE;
    const half = Math.floor(pixelHeight / 2);
    const image = ctx.createImageData(pixelWidth, pixelHeight);
    const next = random(seed);
    for (let py = 0; py < pixelHeight; py++) {
        for (let px = 0; px < pixelWidth; px++) {
            const i = (py * pixelWidth + px) * 4;
            let r, g, b;
            if (py < half) {
                // One-pixel black and white stripes: average grey, nearest-neighbour aliasing.
                const value = px % 2 === 0 ? 0 : 255;
                r = g = b = value;
            } else {
                // Coloured noise around a mid green: averages to a flat colour.
                r = Math.round(60 + next() * 120);
                g = Math.round(110 + next() * 120);
                b = Math.round(40 + next() * 80);
            }
            image.data[i] = r;
            image.data[i + 1] = g;
            image.data[i + 2] = b;
            image.data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, left, top);
}

function hueRamp(x, y, width, height) {
    for (let row = 0; row < height; row++) {
        const hue = Math.round((row / height) * 360);
        blocks(x, y + row, width, 1, `hsl(${hue}, 75%, 50%)`);
    }
}

for (let map = 0; map < MAPS_Y; map++) {
    const top = map * MAP;

    blocks(0, top, 16, MAP, '#ffffff');
    digit(map, 2, top + 8, 4);
    blockGradient(16, top, 32, MAP, [90, 100, 120], [20, 30, 50]);
    blockGradient(48, top, 32, MAP, [140, 150, 170], [240, 250, 255]);
    fineDetail(80, top, 32, MAP, 1234 + map);
    hueRamp(112, top, 16, MAP);

    // Boundary stripes: first row yellow, last row red on map 0; blue and green on map 1.
    const [firstColor, lastColor] = map === 0 ? ['#f2d21b', '#d42020'] : ['#1f4fd4', '#24a83a'];
    blocks(0, top, MAP, 1, firstColor);
    blocks(0, top + MAP - 1, MAP, 1, lastColor);
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, canvas.toBuffer('image/png'));
console.log(`[test-card] wrote ${OUTPUT}`);
