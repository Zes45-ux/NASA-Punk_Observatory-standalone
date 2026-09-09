const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('shader cache separates patch types, parameters and order while sharing equivalent programs', () => {
    const THREE = require('../scripts/vendor/three.min.js');
    const {api} = loadPlanetScene();
    const material = () => new THREE.PointsMaterial({vertexColors: true, transparent: true});
    const a = material(), b = material(), equivalent = material(), different = material(), reversed = material();
    for (const m of [a, equivalent]) {
        api.createParticleAppearance({material: m});
        api.createSurfaceConvergence({material: m}, {scatter: 12});
    }
    api.createPointSizeJitter({material: b});
    api.createParticleAppearance({material: different});
    api.createSurfaceConvergence({material: different}, {scatter: 9});
    api.createSurfaceConvergence({material: reversed});
    api.createParticleAppearance({material: reversed});
    assert.notEqual(a.customProgramCacheKey(), b.customProgramCacheKey());
    assert.notEqual(a.customProgramCacheKey(), different.customProgramCacheKey());
    assert.notEqual(a.customProgramCacheKey(), reversed.customProgramCacheKey());
    assert.equal(a.customProgramCacheKey(), equivalent.customProgramCacheKey());
    const version = b.version;
    api.createParticleAppearance({material: b});
    assert.ok(b.version > version, 'adding a patch invalidates an already compiled material');
});

function loadPlanetScene(windowExtras = {}) {
    const windowListeners = new Map();
    const events = [];
    const window = {
        devicePixelRatio: 1,
        addEventListener: (type, callback) => windowListeners.set(type, callback),
        dispatchEvent: (event) => {
            events.push(event);
            windowListeners.get(event.type)?.(event);
        }
    };
    window.window = window;
    Object.assign(window, windowExtras);
    const sandbox = {
        window,
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        performance: {now: () => 0},
        requestAnimationFrame: (callback) => callback(),
        console
    };
    vm.runInNewContext(fs.readFileSync('scripts/core/planetScene.js', 'utf8'), sandbox);
    return {
        api: {
            isReducedMotionRequested: window.isReducedMotionRequested,
            createFrameDelta: window.createFrameDelta,
            createSurfaceConvergence: window.createSurfaceConvergence,
            createParticleAppearance: window.createParticleAppearance,
            createQualityDrawRange: window.createQualityDrawRange,
            createPointSizeJitter: window.createPointSizeJitter
        },
        events,
        fireReady: () => windowListeners.get('observatory:ready')?.({type: 'observatory:ready'}),
        fire: (event) => window.dispatchEvent(event)
    };
}

test('createFrameDelta scales steps by elapsed time with clamps', () => {
    const {api} = loadPlanetScene();
    const nextDelta = api.createFrameDelta();

    assert.equal(nextDelta(undefined), 1, 'missing timestamp defaults to 1');
    assert.equal(nextDelta(1000), 1, 'first timestamp anchors the clock');
    assert.ok(Math.abs(nextDelta(1040) - 2.4) < 1e-3, '40 ms gap scales up');
    assert.ok(Math.abs(nextDelta(1048) - 0.48) < 1e-3, 'fast display scales down');
    assert.equal(nextDelta(1048), 0.25, 'zero gap clamps to the minimum');
    assert.equal(nextDelta(NaN), 1, 'non-finite timestamps do not move the clock');
    assert.equal(nextDelta(1500), 2.5, 'large gap clamps to the maximum');
});

test('surface convergence is immediately settled when reduced motion is requested', () => {
    const {api} = loadPlanetScene({
        matchMedia: () => ({matches: true})
    });
    const convergence = api.createSurfaceConvergence({material: {}}, {duration: 1000});

    assert.equal(api.isReducedMotionRequested(), true);
    assert.equal(convergence.uniforms.uReveal.value, 1);
    convergence.update(500);
    assert.equal(convergence.uniforms.uReveal.value, 1);
});

test('surface convergence waits for readiness then eases every particle in', () => {
    const {api, fireReady} = loadPlanetScene();
    const material = {};
    const points = {material};
    const convergence = api.createSurfaceConvergence(points, {duration: 1000, scatter: 9});

    assert.equal(typeof material.onBeforeCompile, 'function', 'convergence patches the surface material');

    // 注入的着色器片段替换 begin_vertex 声明 uniforms，并在 color_fragment
    // 后接入错峰淡入
    const shader = {
        uniforms: {},
        vertexShader: 'uniform float size;\n#include <begin_vertex>\n#include <project_vertex>',
        fragmentShader: 'uniform vec3 diffuse;\n#include <color_fragment>\nvoid main() {}'
    };
    material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('uniform float uReveal;'));
    assert.ok(shader.vertexShader.includes('uniform float uTime;'));
    assert.ok(shader.vertexShader.includes('convScattered.xz = mat2('), 'scattered shell swirls inward');
    assert.ok(shader.vertexShader.includes('transformed = mix('));
    assert.ok(shader.vertexShader.includes('vConvReveal = convReveal;'), 'vertex exposes the stagger');
    assert.ok(shader.fragmentShader.includes('varying float vConvReveal;'));
    assert.ok(shader.fragmentShader.includes('diffuseColor.a *= 0.2 + 0.8 * vConvReveal;'), 'particles fade in while converging');
    assert.equal(shader.uniforms.uReveal, convergence.uniforms.uReveal, 'reveal uniform object is shared');
    assert.equal(shader.uniforms.uTime, convergence.uniforms.uTime, 'time uniform object is shared');

    const before = convergence.uniforms.uReveal.value;
    convergence.update(0);
    convergence.update(500);
    assert.equal(convergence.uniforms.uReveal.value, before, 'stays collapsed before readiness');
    assert.ok(convergence.uniforms.uTime.value > 0, 'scattered shell drifts while waiting');

    fireReady();
    convergence.update(100);
    assert.equal(convergence.uniforms.uReveal.value, 0, 'ready frame anchors the reveal clock');
    convergence.update(600);
    assert.ok(convergence.uniforms.uReveal.value > 0, 'starts easing after the ready event');
    assert.ok(convergence.uniforms.uReveal.value < 1, 'mid-flight reveal is partial');

    convergence.update(1500);
    assert.equal(convergence.uniforms.uReveal.value, 1, 'fully revealed after the duration');
});

test('surface convergence stays vertex-only when the fragment anchor is missing', () => {
    const {api} = loadPlanetScene();
    const material = {};
    api.createSurfaceConvergence({material}, {duration: 1000});
    const shader = {
        uniforms: {},
        vertexShader: '#include <begin_vertex>',
        fragmentShader: 'void main() {}'
    };
    material.onBeforeCompile(shader);
    assert.ok(!shader.vertexShader.includes('vConvReveal'), 'no varying without a fragment anchor');
    assert.ok(shader.vertexShader.includes('transformed = mix('), 'vertex swirl still applies');
    assert.equal(shader.fragmentShader, 'void main() {}', 'fragment stays untouched');
});

test('surface convergence falls back to a delayed start without the ready event', () => {
    const {api} = loadPlanetScene();
    const convergence = api.createSurfaceConvergence({material: {}}, {duration: 1000});

    for (let i = 0; i < 400; i++) convergence.update(i * 16);
    assert.ok(convergence.uniforms.uReveal.value > 0, 'fallback start keeps the effect alive without readiness');
});

test('surface convergence fallback follows elapsed time instead of frame count', () => {
    const {api} = loadPlanetScene();
    const convergence = api.createSurfaceConvergence({material: {}}, {duration: 1000});

    for (let time = 0; time <= 6500; time += 500) convergence.update(time);
    assert.ok(convergence.uniforms.uReveal.value > 0, 'slow displays still start the reveal after the fallback delay');
});

test('particle appearance creates soft round points and composes with convergence', () => {
    const {api} = loadPlanetScene();
    const material = {};
    const points = {material};

    api.createParticleAppearance(points, {min: 0.75, max: 1.25});
    api.createSurfaceConvergence(points, {duration: 500, scatter: 3});

    const shader = {
        uniforms: {},
        vertexShader: 'uniform float size;\n#include <begin_vertex>\ngl_PointSize = size;\n#include <project_vertex>',
        fragmentShader: 'uniform vec3 diffuse;\n#include <color_fragment>\n#include <output_fragment>'
    };
    material.onBeforeCompile(shader);

    assert.ok(shader.vertexShader.includes('particleSizeHash'), 'appearance adds deterministic size variation');
    assert.ok(shader.fragmentShader.includes('gl_PointCoord'), 'appearance uses the point sprite coordinate');
    assert.ok(shader.fragmentShader.includes('smoothstep'), 'appearance adds a soft circular edge');
    assert.ok(shader.vertexShader.includes('convScattered.xz = mat2('), 'convergence patch remains active');
});


test('static layers get hashed point size jitter and profile-scaled draw ranges', () => {
    const {api, fire} = loadPlanetScene();
    const drawCalls = [];
    const points = {
        geometry: {
            attributes: {position: {count: 30000}},
            setDrawRange: (start, count) => drawCalls.push([start, count])
        },
        material: {}
    };

    api.createPointSizeJitter(points, {min: 0.5, max: 1.6});
    const shader = {vertexShader: 'gl_PointSize = size;\n#ifdef USE_SIZEATTENUATION'};
    points.material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('gl_PointSize = size * (0.500 + sizeJitterHash * 1.100);'), 'jitter resizes gl_PointSize');
    assert.ok(shader.vertexShader.includes('sizeJitterHash = fract('), 'jitter comes from a position hash');

    const untouched = {vertexShader: 'void main() {}'};
    points.material.onBeforeCompile(untouched);
    assert.equal(untouched.vertexShader, 'void main() {}', 'missing anchor leaves the shader alone');

    api.createQualityDrawRange(points);
    assert.deepEqual(drawCalls[0], [0, 30000], 'no ParticleBuilder in the sandbox defaults to the full range');

    fire({type: 'observatory:quality', detail: {profile: 'low'}});
    assert.deepEqual(drawCalls[drawCalls.length - 1], [0, 15000], 'low profile halves the layer');

    fire({type: 'observatory:quality', detail: {profile: 'recovery'}});
    assert.deepEqual(drawCalls[drawCalls.length - 1], [0, 7500], 'recovery keeps a quarter visible');

    fire({type: 'observatory:quality', detail: {profile: 'auto'}});
    assert.deepEqual(drawCalls[drawCalls.length - 1], [0, 30000], 'auto restores the full range');
});

test('quality draw range seeds from ParticleBuilder when present', () => {
    const {api, fire} = loadPlanetScene({
        ParticleBuilder: {
            getQualityProfile: () => 'auto',
            selectInitialProfile: () => 'balanced'
        }
    });
    const drawCalls = [];
    const points = {
        geometry: {
            attributes: {position: {count: 30000}},
            setDrawRange: (start, count) => drawCalls.push([start, count])
        },
        material: {}
    };

    api.createQualityDrawRange(points);
    assert.deepEqual(drawCalls[0], [0, 22500], 'auto profile falls back to the device signal profile');
    fire({type: 'observatory:quality', detail: {profile: 'high'}});
    fire({type: 'observatory:quality', detail: {profile: 'auto'}});
    assert.deepEqual(drawCalls.at(-1), [0, 22500], 'returning to auto respects device limits');

    const manualCalls = [];
    const manual = {
        geometry: {
            attributes: {position: {count: 30000}},
            setDrawRange: (start, count) => manualCalls.push([start, count])
        },
        material: {}
    };
    const {api: manualApi} = loadPlanetScene({
        ParticleBuilder: {
            getQualityProfile: () => 'low',
            selectInitialProfile: () => 'balanced'
        }
    });
    manualApi.createQualityDrawRange(manual);
    assert.deepEqual(manualCalls[0], [0, 15000], 'a locked manual profile wins over device signals');
});
