import { createCanvas } from 'canvas';

// Setup ImageData global for tests using node-canvas
// jsdom's ImageData is not a constructor, but canvas provides one
const canvas = createCanvas(1, 1);
const ctx = canvas.getContext('2d');
global.ImageData = ctx.createImageData(1, 1).constructor as unknown as typeof ImageData;

