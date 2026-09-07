const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadSystemParticleField() {
    const callbacks = [];
    const drawCalls = [];
    const context = {
        clearRect: (...args) => drawCalls.push(['clearRect', ...args]),
        beginPath: () => drawCalls.push(['beginPath']),
        arc: (...args) => drawCalls.push(['arc', ...args]),
        fill: () => drawCalls.push(['fill']),
        setTransform: (...args) => drawCalls.push(['setTransform', ...args]),
        globalAlpha: 1,
        fillStyle: '#fff',
        globalCompositeOperation: 'source-over'
    };
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        style: {}
    };
    const window = {
        innerWidth: 800,
        innerHeight: 600,
        devicePixelRatio: 2,
        document: {getElementById: (id) => id === 'system-particle-canvas' ? canvas : null},
        requestAnimationFrame: (callback) => {
            callbacks.push(callback);
            return callbacks.length;
        },
        cancelAnimationFrame: () => {},
        performance: {now: () => 0}
    };
    window.window = window;

    const sandbox = {
        window,
        document: window.document,
        requestAnimationFrame: window.requestAnimationFrame,
        cancelAnimationFrame: window.cancelAnimationFrame,
        performance: window.performance,
        console
    };
    vm.runInNewContext(
        fs.readFileSync('scripts/components/systemParticleField.js', 'utf8'),
        sandbox,
        {filename: 'scripts/components/systemParticleField.js'}
    );

    return {api: window.createSystemParticleField, canvas, callbacks, drawCalls};
}

test('system particle field renders bounded orbital dust and advances one frame at a time', () => {
    const env = loadSystemParticleField();
    const field = env.api({count: 48, seed: 17});

    field.resize();
    assert.equal(env.canvas.width, 1600, 'canvas uses the capped device pixel ratio');
    assert.equal(env.canvas.height, 1200);

    field.start();
    assert.equal(field.running, true);
    assert.equal(env.callbacks.length, 1, 'start schedules one animation frame');

    env.callbacks.shift()(0);
    const arcsAfterFirstFrame = env.drawCalls.filter(([type]) => type === 'arc').length;
    assert.equal(arcsAfterFirstFrame, 48, 'one dust sprite is drawn per configured particle');
    assert.equal(env.callbacks.length, 1, 'each frame schedules only its successor');

    field.stop();
    assert.equal(field.running, false);
});

test('system particle field is inert when its canvas is unavailable', () => {
    const env = loadSystemParticleField();
    const inert = env.api({canvasId: 'missing-canvas'});

    inert.start();
    inert.resize();
    assert.equal(inert.running, false);
    assert.equal(env.callbacks.length, 0);
});

test('system select mounts the orbital field before its page bootstrap', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const canvasIndex = html.indexOf('<canvas id="system-particle-canvas"');
    const scriptIndex = html.indexOf('./scripts/components/systemParticleField.js');
    const pageIndex = html.indexOf('./scripts/pages/index.page.js');

    assert.ok(canvasIndex >= 0, 'system overview exposes a dedicated particle canvas');
    assert.ok(scriptIndex > canvasIndex, 'particle field script follows its canvas');
    assert.ok(scriptIndex < pageIndex, 'page bootstrap runs after the particle field module');
});
