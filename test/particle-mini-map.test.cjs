const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadParticleMiniMap()
{
    const callbacks = [];
    const drawCalls = [];
    const context = {
        clearRect: (...args) => drawCalls.push(['clearRect', ...args]),
        beginPath: () => drawCalls.push(['beginPath']),
        arc: (...args) => drawCalls.push(['arc', ...args]),
        ellipse: (...args) => drawCalls.push(['ellipse', ...args]),
        moveTo: (...args) => drawCalls.push(['moveTo', ...args]),
        lineTo: (...args) => drawCalls.push(['lineTo', ...args]),
        stroke: () => drawCalls.push(['stroke']),
        fill: () => drawCalls.push(['fill']),
        setTransform: (...args) => drawCalls.push(['setTransform', ...args]),
        globalAlpha: 1,
        fillStyle: '#fff',
        strokeStyle: '#fff',
        lineWidth: 1,
        globalCompositeOperation: 'source-over'
    };
    const canvas = {
        width: 0,
        height: 0,
        style: {},
        clientWidth: 260,
        clientHeight: 260,
        getBoundingClientRect: () => ({width: 260, height: 260}),
        getContext: () => context
    };
    const docListeners = new Map();
    const cancelled = [];
    const documentMock = {
        hidden: false,
        getElementById: (id) => id === 'system-monitor-particle-canvas' ? canvas : null,
        addEventListener: (type, cb) => {
            if (!docListeners.has(type)) docListeners.set(type, []);
            docListeners.get(type).push(cb);
        },
        removeEventListener: (type, cb) => {
            const list = docListeners.get(type);
            if (list) {
                const idx = list.indexOf(cb);
                if (idx !== -1) list.splice(idx, 1);
            }
        }
    };
    const window = {
        devicePixelRatio: 2,
        document: documentMock,
        requestAnimationFrame: (callback) => {
            callbacks.push(callback);
            return callbacks.length;
        },
        cancelAnimationFrame: (id) => {
            cancelled.push(id);
        },
        performance: {now: () => 0}
    };
    window.window = window;

    const sandbox = {window, document: documentMock, console};
    vm.runInNewContext(
        fs.readFileSync('scripts/components/particleMiniMap.js', 'utf8'),
        sandbox,
        {filename: 'scripts/components/particleMiniMap.js'}
    );

    return {
        api: window.createParticleMiniMap,
        canvas,
        callbacks,
        drawCalls,
        cancelled,
        document: documentMock,
        fireVisibility: (hidden) => {
            documentMock.hidden = hidden;
            const list = docListeners.get('visibilitychange') || [];
            list.forEach(cb => cb());
        }
    };
}

test('particle mini map renders a bounded animated system field', () =>
{
    const env = loadParticleMiniMap();
    const map = env.api({count: 48, active: 'earth'});

    map.start();
    assert.equal(map.running, true);
    assert.equal(map.particleCount, 48);
    assert.equal(env.canvas.width, 520, 'canvas uses the capped device pixel ratio');
    assert.equal(env.canvas.height, 520);
    assert.equal(env.callbacks.length, 1, 'start schedules one animation frame');

    env.callbacks.shift()(0);
    assert.ok(env.drawCalls.filter(([type]) => type === 'arc').length >= 48, 'particle sprites are rendered');
    assert.equal(env.callbacks.length, 1, 'each frame schedules only its successor');

    map.stop();
    assert.equal(map.running, false);
});

test('particle mini map is inert without a canvas and honors reduced motion', () =>
{
    const env = loadParticleMiniMap();
    const inert = env.api({canvasId: 'missing-canvas'});
    inert.start();
    assert.equal(inert.running, false);

    const map = env.api({count: 12, reducedMotion: true});
    map.start();
    assert.equal(env.callbacks.length, 0, 'reduced motion does not start a frame loop');
    assert.ok(env.drawCalls.filter(([type]) => type === 'arc').length >= 12);
    map.stop();
});

test('planet pages load the particle mini map before the UI bootstrap', () =>
{
    for (const page of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'])
    {
        const html = fs.readFileSync(`${page}.html`, 'utf8');
        const mapIndex = html.indexOf('./scripts/components/particleMiniMap.js');
        const uiIndex = html.indexOf('./scripts/components/planetUi.js');
        assert.ok(mapIndex >= 0, `${page} exposes the particle mini map module`);
        assert.ok(mapIndex < uiIndex, `${page} loads the map before planet UI`);
    }
});

test('sun runtime contains no asteroid belt layer', () =>
{
    const source = fs.readFileSync('scripts/planets/sun.js', 'utf8');
    assert.doesNotMatch(source, /asteroid/i);
    assert.doesNotMatch(source, /belt/i);
});

test('particle mini map pauses loop when document is hidden and resumes when visible', () =>
{
    const env = loadParticleMiniMap();
    const map = env.api({count: 24});
    map.start();
    assert.equal(env.callbacks.length, 1);

    // Document becomes hidden
    env.fireVisibility(true);
    assert.ok(env.cancelled.length > 0, 'frame was cancelled when hidden');

    // Becoming visible resumes the loop
    env.fireVisibility(false);
    assert.equal(env.callbacks.length, 2, 'rescheduled frame on becoming visible');

    map.stop();
});
