const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadTopoRenderer(options = {}) {
    const drawCalls = [];
    const context = {
        clearRect: (...args) => drawCalls.push(['clearRect', ...args]),
        fillRect: (...args) => drawCalls.push(['fillRect', ...args]),
        beginPath: () => drawCalls.push(['beginPath']),
        moveTo: (...args) => drawCalls.push(['moveTo', ...args]),
        lineTo: (...args) => drawCalls.push(['lineTo', ...args]),
        arc: (...args) => drawCalls.push(['arc', ...args]),
        fill: () => drawCalls.push(['fill']),
        stroke: () => drawCalls.push(['stroke']),
        canvas: null
    };
    const canvas = {
        id: 'topo-canvas',
        width: 300,
        height: 200,
        getContext: (type) => (type === '2d' ? context : null)
    };
    context.canvas = canvas;

    let queuedRaf = null;
    const SimplexNoise = class {
        constructor() {}
        noise2D(x, y) {
            return Math.sin(x * 10) * Math.cos(y * 10);
        }
    };

    const sandbox = {
        window: {
            innerWidth: 300,
            innerHeight: 200
        },
        document: {
            getElementById: (id) => (id === 'topo-canvas' ? canvas : null)
        },
        requestAnimationFrame: (cb) => {
            queuedRaf = cb;
            return 1;
        },
        SimplexNoise,
        console,
        ...options
    };
    sandbox.window.document = sandbox.document;

    vm.runInNewContext(fs.readFileSync('scripts/components/topoRenderer.js', 'utf8'), sandbox);

    return {
        createTopoBackground: sandbox.window.createTopoBackground,
        canvas,
        context,
        drawCalls,
        flushRaf: () => {
            if (queuedRaf) {
                const cb = queuedRaf;
                queuedRaf = null;
                cb();
            }
        }
    };
}

test('createTopoBackground returns inert interface when canvas is missing', () => {
    const {createTopoBackground} = loadTopoRenderer({
        document: {getElementById: () => null}
    });
    const bg = createTopoBackground({canvasId: 'non-existent'});
    assert.equal(typeof bg.resize, 'function');
    assert.doesNotThrow(() => bg.resize());
});

test('createTopoBackground executes initial draw on rAF and renders contours', () => {
    const {createTopoBackground, drawCalls, flushRaf} = loadTopoRenderer();
    const bg = createTopoBackground({canvasId: 'topo-canvas'});

    // Initially queued on rAF
    flushRaf();

    const moves = drawCalls.filter(([cmd]) => cmd === 'moveTo');
    const lines = drawCalls.filter(([cmd]) => cmd === 'lineTo');
    const strokes = drawCalls.filter(([cmd]) => cmd === 'stroke');
    const fills = drawCalls.filter(([cmd]) => cmd === 'fill');

    assert.ok(moves.length > 0, 'contours produce moveTo calls');
    assert.ok(lines.length > 0, 'contours produce lineTo calls');
    assert.ok(strokes.length > 0, 'contours produce stroke calls');
    assert.ok(fills.length > 0, 'stars produce fill calls');
});

test('createTopoBackground renders overlayFill when provided', () => {
    const {createTopoBackground, drawCalls, flushRaf} = loadTopoRenderer();
    createTopoBackground({canvasId: 'topo-canvas', overlayFill: 'rgba(200, 35, 55, 0.03)'});
    flushRaf();

    const fillRects = drawCalls.filter(([cmd]) => cmd === 'fillRect');
    assert.ok(fillRects.length > 0, 'overlayFill calls fillRect');
});

test('requestResize coalesces multiple calls within one animation frame', () => {
    const {createTopoBackground, drawCalls, flushRaf} = loadTopoRenderer();
    const bg = createTopoBackground({canvasId: 'topo-canvas'});
    flushRaf();
    const initialCallCount = drawCalls.length;

    // Trigger multiple resizes before next frame
    bg.resize();
    bg.resize();
    bg.resize();

    // No immediate redraw until rAF flushes
    assert.equal(drawCalls.length, initialCallCount, 'draws are deferred until rAF');

    flushRaf();
    assert.ok(drawCalls.length > initialCallCount, 'redraws once after rAF');
});
