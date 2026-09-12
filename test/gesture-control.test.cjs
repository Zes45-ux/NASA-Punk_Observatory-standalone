const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadGestureApi()
{
    const window = {document: null};
    window.window = window;
    vm.runInNewContext(fs.readFileSync('scripts/core/gesture-control.js', 'utf8'), {window});
    return window.HandGestureControl;
}

function createLandmarks()
{
    return Array.from({length: 21}, () => ({x: 0, y: 0, z: 0}));
}

test('pinch ratio is normalized against palm width', () =>
{
    const api = loadGestureApi();
    const landmarks = createLandmarks();
    landmarks[5] = {x: 0, y: 0, z: 0};
    landmarks[17] = {x: 1, y: 0, z: 0};
    landmarks[4] = {x: 0.25, y: 0, z: 0};
    landmarks[8] = {x: 0.75, y: 0, z: 0};

    assert.equal(api.calculatePinchRatio(landmarks), 0.5);
    assert.equal(api.calculatePinchRatio(null), null);
});

test('palm center averages stable hand anchors', () =>
{
    const api = loadGestureApi();
    const landmarks = createLandmarks();
    for (const index of [0, 5, 9, 13, 17])
    {
        landmarks[index] = {x: 0.6, y: 0.4, z: 0};
    }
    const center = api.calculatePalmCenter(landmarks);
    assert.ok(Math.abs(center.x - 0.6) < 1e-12);
    assert.ok(Math.abs(center.y - 0.4) < 1e-12);
});

test('gesture deltas preserve direction and suppress camera jitter', () =>
{
    const api = loadGestureApi();
    const previous = {pinchRatio: 0.3, palmCenter: {x: 0.5, y: 0.5}};
    const movement = api.createGestureDelta(previous, 0.4, {x: 0.6, y: 0.45});
    assert.ok(movement.zoom > 0, 'opening the pinch zooms toward the planet');
    assert.ok(movement.rotationY > 0, 'rightward palm movement rotates right');
    assert.ok(movement.rotationX < 0, 'upward palm movement rotates up');

    const jitter = api.createGestureDelta(previous, 0.302, {x: 0.501, y: 0.499});
    assert.equal(jitter.zoom, 0);
    assert.equal(jitter.rotationX, 0);
    assert.equal(jitter.rotationY, 0);
});

test('absolute gesture targets do not accumulate drift across identical frames', () =>
{
    const api = loadGestureApi();
    const state = {targetSliderVal: 50, targetRotationX: 0.2, targetRotationY: 0};
    const anchor = {
        pinchRatio: 0.3,
        palmCenter: {x: 0.5, y: 0.5},
        sliderValue: 50,
        rotationX: 0.2,
        rotationY: 0
    };

    api.applyGestureTarget(state, anchor, 0.4, {x: 0.6, y: 0.45});
    const firstTarget = {...state};
    api.applyGestureTarget(state, anchor, 0.4, {x: 0.6, y: 0.45});

    assert.deepEqual(state, firstTarget, 'same landmarks keep the same calibrated target');
    assert.ok(state.targetSliderVal > anchor.sliderValue);
});

test('visual state eases hand tracking and zoom into shader-friendly values', () =>
{
    const api = loadGestureApi();
    api.setVisualTracking(true, 100);
    const active = api.updateVisualState(100);
    assert.ok(active.presence > 0 && active.presence < 1);
    assert.ok(active.energy > 0 && active.energy < 1);
    assert.equal(active.tracking, true);

    const previousPresence = active.presence;
    api.setVisualTracking(false, 0);
    const fading = api.updateVisualState(0);
    assert.ok(fading.presence < previousPresence, 'visual layer fades after tracking is lost');
    assert.equal(fading.tracking, false);
});

test('every planet page loads the local hand model before the gesture controller', () =>
{
    for (const name of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'])
    {
        const html = fs.readFileSync(`${name}.html`, 'utf8');
        const interaction = html.indexOf('./scripts/core/interaction.js');
        const model = html.indexOf('./scripts/vendor/mediapipe-hands/hands.js');
        const controller = html.indexOf('./scripts/core/gesture-control.js');
        assert.ok(interaction >= 0 && interaction < model, `${name} loads interaction state first`);
        assert.ok(model < controller, `${name} loads MediaPipe before the controller`);
    }
});

test('camera activation can be cancelled while permission is still pending', async () =>
{
    let resolveCamera;
    let trackStopped = false;
    const cameraPromise = new Promise((resolve) => { resolveCamera = resolve; });
    const value = {textContent: 'OFFLINE'};
    const button = {
        attributes: new Map(),
        addEventListener() {},
        querySelector: () => value,
        setAttribute(name, next) { this.attributes.set(name, next); }
    };
    const status = {textContent: ''};
    const panel = {dataset: {}, hidden: true};
    const video = {srcObject: null, play: async () => {}};
    const elements = {
        'gesture-control-toggle': button,
        'gesture-control-status': status,
        'gesture-camera-panel': panel,
        'gesture-camera-feed': video
    };
    const window = {
        document: {hidden: false, getElementById: (id) => elements[id]},
        navigator: {mediaDevices: {getUserMedia: () => cameraPromise}},
        Hands: class {},
        addEventListener() {},
        requestAnimationFrame: () => 1,
        cancelAnimationFrame() {}
    };
    window.window = window;
    vm.runInNewContext(fs.readFileSync('scripts/core/gesture-control.js', 'utf8'), {window});

    const controller = window.HandGestureControl.init({
        state: {targetSliderVal: 50, targetRotationX: 0, targetRotationY: 0, slider: null}
    });
    const startPromise = controller.start();
    await controller.stop();
    resolveCamera({getTracks: () => [{stop: () => { trackStopped = true; }}]});
    await startPromise;

    assert.equal(controller.isRunning(), false);
    assert.equal(trackStopped, true, 'a late camera stream is released immediately');
    assert.equal(value.textContent, 'OFFLINE');
});
