const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadTransition({reducedMotion = false} = {}) {
    const classes = new Set(['transition-curtain', 'start-covered']);
    const bodyClasses = new Set();
    const windowListeners = new Map();
    const timers = [];
    const navigations = [];
    const curtain = {
        classList: {
            add: (...names) => names.forEach((name) => classes.add(name)),
            remove: (...names) => names.forEach((name) => classes.delete(name)),
            contains: (name) => classes.has(name)
        },
        offsetWidth: 1
    };
    const location = {};
    Object.defineProperty(location, 'href', {
        get: () => navigations.at(-1),
        set: (value) => navigations.push(value)
    });
    const window = {
        location,
        matchMedia: () => ({matches: reducedMotion}),
        addEventListener: (type, callback) => windowListeners.set(type, callback),
        dispatchEvent: (event) => windowListeners.get(event.type)?.(event)
    };
    const document = {
        body: {
            appendChild: () => {},
            classList: {
                add: (...names) => names.forEach((name) => bodyClasses.add(name)),
                remove: (...names) => names.forEach((name) => bodyClasses.delete(name)),
                contains: (name) => bodyClasses.has(name)
            }
        },
        getElementById: (id) => id === 'global-curtain' ? curtain : null,
        addEventListener: (type, callback) => {
            if (type === 'DOMContentLoaded') callback();
        }
    };
    const sandbox = {
        window,
        document,
        setTimeout: (callback, delay) => {
            timers.push({callback, delay});
            return timers.length;
        },
        clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
        requestAnimationFrame: (callback) => callback(),
        CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
        console
    };
    vm.runInNewContext(fs.readFileSync('scripts/core/transition.js', 'utf8'), sandbox);
    return {api: window.TransitionManager, curtain, bodyClasses, windowListeners, timers, location, navigations, window, document};
}

test('ready reveals the interface without starting the legacy curtain', () => {
    const env = loadTransition();
    env.windowListeners.get('observatory:ready')();
    assert.equal(env.curtain.classList.contains('start-covered'), false);
    assert.equal(env.bodyClasses.has('transition-ready'), true);
    assert.equal(env.timers[0].delay, 1500);
});

test('cached page restore clears an unfinished particle exit and allows navigation again', () => {
    const env = loadTransition();
    env.api.navigate('earth.html');
    env.windowListeners.get('pageshow')?.({persisted: true});
    assert.equal(env.bodyClasses.has('particle-transition-exit'), false);
    assert.equal(env.bodyClasses.has('transition-ready'), true);
    env.api.navigate('mars.html');
    env.timers.at(-1).callback();
    assert.deepEqual(env.navigations, ['mars.html']);
});

test('restore invalidates an unfinished exit callback and timeout', () => {
    const env = loadTransition();
    env.api.navigate('earth.html');
    env.windowListeners.get('pageshow')({persisted: true});
    env.timers.forEach(timer => timer.callback());
    assert.deepEqual(env.navigations, []);
    env.api.navigate('mars.html');
    env.timers.at(-1).callback();
    assert.deepEqual(env.navigations, ['mars.html']);
});

test('readiness timeout reveals the curtain', () => {
    const env = loadTransition();
    env.timers[0].callback();
    assert.equal(env.curtain.classList.contains('start-covered'), false);
    assert.equal(env.bodyClasses.has('transition-ready'), true);
});

test('navigation is single-flight and uses the default particle-exit hold', () => {
    const env = loadTransition();
    env.api.navigate('earth.html');
    env.api.navigate('mars.html');
    assert.equal(env.timers.at(-1).delay, 480);
    assert.equal(env.bodyClasses.has('particle-transition-exit'), true);
    env.timers.at(-1).callback();
    assert.equal(env.location.href, 'earth.html');
    env.timers.forEach((timer) => timer.callback());
    assert.deepEqual(env.navigations, ['earth.html']);
});

test('particle scene can hold navigation until its GPU exit duration', () => {
    const env = loadTransition();
    env.windowListeners.set('observatory:navigate-start', (event) => event.detail.holdFor(900));

    env.api.navigate('venus.html');

    assert.equal(env.timers.at(-1).delay, 900);
    assert.equal(env.navigations.length, 0);
    env.timers.at(-1).callback();
    assert.deepEqual(env.navigations, ['venus.html']);
});

test('particle scene hold is capped so a faulty effect cannot trap navigation', () => {
    const env = loadTransition();
    env.windowListeners.set('observatory:navigate-start', (event) => event.detail.holdFor(9999));
    env.api.navigate('venus.html');
    assert.equal(env.timers.at(-1).delay, 1200);
});

test('registered Three.js point layers create a bounded cross-page particle bridge', () => {
    const env = loadTransition();
    const stored = new Map();
    const appended = [];
    env.window.innerWidth = 1000;
    env.window.innerHeight = 600;
    env.window.devicePixelRatio = 1;
    env.window.requestAnimationFrame = () => 41;
    env.window.cancelAnimationFrame = () => {};
    env.window.sessionStorage = {
        getItem: (key) => stored.get(key) || null,
        setItem: (key, value) => stored.set(key, value),
        removeItem: (key) => stored.delete(key)
    };
    env.window.THREE = {
        Vector3: class {
            fromBufferAttribute(attribute, index) {
                this.x = attribute.getX(index);
                this.y = attribute.getY(index);
                this.z = attribute.getZ(index);
                return this;
            }
            applyMatrix4() { return this; }
            project() { return this; }
        }
    };
    env.document.createElement = () => ({
        className: '', id: '', style: {},
        setAttribute: () => {},
        remove: () => {},
        getContext: () => ({setTransform: () => {}, clearRect: () => {}})
    });
    env.document.body.appendChild = (node) => appended.push(node);

    const position = {
        count: 30,
        getX: (index) => Math.cos(index / 30 * Math.PI * 2) * 0.5,
        getY: (index) => Math.sin(index / 30 * Math.PI * 2) * 0.5,
        getZ: () => 0
    };
    const points = {
        visible: true,
        isPoints: true,
        matrixWorld: {},
        geometry: {attributes: {position}, drawRange: {count: Infinity}},
        material: {color: {r: 0.3, g: 0.7, b: 1}, opacity: 0.9}
    };
    env.api.registerParticleScene({
        updateMatrixWorld: () => {},
        traverse: (callback) => callback(points)
    }, {updateMatrixWorld: () => {}}, {
        domElement: {getBoundingClientRect: () => ({left: 0, top: 0, width: 1000, height: 600})}
    });

    env.api.navigate('mars.html');

    const serialized = Array.from(stored.values())[0];
    const bridge = JSON.parse(serialized);
    assert.equal(env.timers.at(-1).delay, 720);
    assert.equal(bridge.target, 'mars.html');
    assert.equal(bridge.particles.length, 30);
    assert.ok(appended.some((node) => node.id === 'particle-transition-overlay'));
});

test('reduced motion navigates without waiting for the curtain animation', () => {
    const env = loadTransition({reducedMotion: true});

    env.api.navigate('earth.html');

    assert.deepEqual(env.navigations, ['earth.html']);
    assert.equal(env.timers.some((timer) => timer.delay === 480), false);
});

test('ready during exit does not cancel the particle transition', () => {
    const env = loadTransition();
    env.api.navigate('earth.html');
    env.windowListeners.get('observatory:ready')();
    assert.equal(env.bodyClasses.has('particle-transition-exit'), true);
});
