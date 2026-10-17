import { createCanvas } from 'canvas';

// Setup ImageData global for tests using node-canvas
// jsdom's ImageData is not a constructor, but canvas provides one
const canvas = createCanvas(1, 1);
const ctx = canvas.getContext('2d');
global.ImageData = ctx.createImageData(1, 1).constructor as unknown as typeof ImageData;

// jsdom lacks ResizeObserver, which Radix uses to measure sliders and popovers.
if (typeof window !== 'undefined' && !window.ResizeObserver) {
    window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// Radix Select scrolls the selected item into view and captures the pointer;
// jsdom implements neither.
if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView ??= function () {};
    Element.prototype.hasPointerCapture ??= function () { return false; };
    Element.prototype.releasePointerCapture ??= function () {};
}

