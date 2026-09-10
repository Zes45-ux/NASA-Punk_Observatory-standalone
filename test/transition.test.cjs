const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadTransition({reducedMotion = false, readyState} = {}) {
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
        readyState,
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

test('transition initializes immediately when its body-end script runs before DOMContentLoaded', () => {
    const env = loadTransition({readyState: 'loading'});
    assert.equal(typeof env.windowListeners.get('observatory:ready'), 'function');
    assert.equal(env.timers[0].delay, 1500);
});

test('readiness fallback uses the same bridge-completion path as the ready event', () => {
    const source = fs.readFileSync('scripts/core/transition.js', 'utf8');
    assert.ok(source.includes('function handleReady()'));
    assert.ok(source.includes('readyTimer = setTimeout(handleReady, READY_TIMEOUT_MS)'));
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

test('registered Three.js point layers create bounded GPU bridge state', () => {
    const env = loadTransition();
    const stored = new Map();
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
        AdditiveBlending: 2,
        WebGLRenderer: class {
            constructor() {
                this.domElement = {style: {}, setAttribute: () => {}};
                this.size = {x: 1, y: 1};
            }
            setPixelRatio() {}
            setSize(x, y) { this.size = {x, y}; }
            setClearColor() {}
            getSize(target) { target.x = this.size.x; target.y = this.size.y; return target; }
            render() {}
        },
        Scene: class {
            constructor() { this.children = []; }
            add(object) { this.children.push(object); }
            remove(object) { this.children = this.children.filter((child) => child !== object); }
        },
        Camera: class {},
        Vector2: class {},
        Vector3: class {
            fromBufferAttribute(attribute, index) {
                this.x = attribute.getX(index);
                this.y = attribute.getY(index);
                this.z = attribute.getZ(index);
                return this;
            }
            applyMatrix4() { return this; }
            project() { return this; }
        },
        BufferGeometry: class {
            constructor() { this.attributes = {}; }
            setAttribute(name, attribute) { this.attributes[name] = attribute; }
            dispose() {}
        },
        BufferAttribute: class {
            constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
        },
        ShaderMaterial: class {
            constructor(options) { Object.assign(this, options); }
            dispose() {}
        },
        Points: class {
            constructor(geometry, material) {
                this.geometry = geometry;
                this.material = material;
                this.userData = {};
            }
        }
    };
    env.document.createElement = () => ({
        className: '', id: '', style: {},
        setAttribute: () => {},
        remove: () => {},
        getContext: () => ({setTransform: () => {}, clearRect: () => {}})
    });

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
    assert.equal(bridge.version, 3);
    assert.equal(bridge.mode, 'outgoing');
    assert.equal(bridge.target, 'mars.html');
    assert.equal(bridge.particles.length, 30);
    assert.ok(Array.isArray(bridge.palette[0]), 'GPU colors are stored as numeric RGB tuples');
});

test('registered scenes do not eagerly allocate a second WebGL context', () => {
    const env = loadTransition();
    let rendererCount = 0;
    let idleCallback = null;
    env.window.requestIdleCallback = (callback) => { idleCallback = callback; };
    env.window.THREE = {
        WebGLRenderer: class { constructor() { rendererCount += 1; } },
        Scene: class {},
        Camera: class {}
    };

    env.api.registerParticleScene({}, {}, {});

    assert.equal(rendererCount, 0);
    assert.equal(idleCallback, null);
});

test('source page stores the bridge without rendering a duplicate overlay', () => {
    const source = fs.readFileSync('scripts/core/transition.js', 'utf8');
    const navigateSource = source.slice(source.indexOf('function navigate(url)'), source.indexOf('const TransitionManager'));
    assert.ok(navigateSource.includes('storeBridgeState(bridgeState)'));
    assert.equal(navigateSource.includes('attachParticleBridge(bridgeState)'), false);
});

test('particle bridge rendering stays on one GPU draw path instead of Canvas2D loops', () => {
    const source = fs.readFileSync('scripts/core/transition.js', 'utf8');
    assert.ok(source.includes('new THREE.ShaderMaterial'));
    assert.ok(source.includes('bridgeRenderer.render(bridgeScene, bridgeCamera)'));
    assert.ok(source.includes('PARTICLE_HANDOFF_MS = 120'));
    assert.ok(source.includes('mesh.userData.fadeOutStartedAt = handoffStartedAt'));
    assert.ok(source.includes("new CustomEvent('observatory:transition-complete')"));
    assert.equal(source.includes("getContext('2d')"), false);
    assert.equal(source.includes('context.arc('), false);
    assert.equal(source.includes('Array.from(bridgeMeshes)'), false);
    assert.ok(source.includes('disposeBridgeMesh(mesh);\n                    continue;'));
});

test('completed bridge releases its temporary renderer and WebGL context', () => {
    const source = fs.readFileSync('scripts/core/transition.js', 'utf8');
    assert.ok(source.includes('function disposeBridgeRenderer()'));
    assert.ok(source.includes('bridgeRenderer.dispose()'));
    assert.ok(source.includes('bridgeRenderer.forceContextLoss()'));
    assert.ok(source.includes("global.addEventListener('pagehide'"));
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
