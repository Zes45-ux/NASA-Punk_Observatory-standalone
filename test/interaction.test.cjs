const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadInteraction(extra = {}) {
    const fakeCanvas = {
        style               : {},
        getBoundingClientRect: () => ({left: 0, top: 0, width: 100, height: 100})
    };
    const documentStub = {
        getElementById : (id) => (id === 'canvas-container' ? {appendChild() {}} : null),
        querySelector  : (selector) => (selector === '#canvas-container canvas' ? fakeCanvas : null),
        addEventListener: () => {},
        createElement  : () => ({style: {}, remove() {}})
    };
    let hitResult = [{}];
    const sandbox = {
        document: documentStub,
        setTimeout: () => 0,
        clearTimeout: () => {},
        THREE: {
            MeshBasicMaterial: class { constructor(options) { this.options = options; } },
            SphereGeometry: class { constructor(radius) { this.radius = radius; } },
            Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; } },
            Raycaster: class {
                setFromCamera() {}
                intersectObject() { return hitResult; }
            },
            Vector2: class { constructor() { this.x = 0; this.y = 0; } }
        },
        ...extra
    };
    const source = fs.readFileSync('scripts/core/interaction.js', 'utf8') +
        '\n;globalThis.__interaction = {InteractionState, initInteraction, updateInteraction, initPlanetFocus, computeFocusSliderValue, isClickGesture};';
    vm.runInNewContext(source, sandbox);
    return {api: sandbox.__interaction, fakeCanvas, setHitResult: (value) => { hitResult = value; }};
}

test('computeFocusSliderValue inverts the zoom factor curve', () => {
    const {api} = loadInteraction();
    assert.equal(api.computeFocusSliderValue(1), 50);
    assert.equal(api.computeFocusSliderValue(2), 100);
    const detail = api.computeFocusSliderValue(1 / 0.45);
    assert.ok(detail > 100, 'detail slider value goes past the manual slider ceiling');
    const initialZ = 25;
    const factor = 0.5 * Math.pow(4, detail / 100);
    assert.ok(Math.abs(initialZ / factor - initialZ * 0.45) < 1e-9, 'roundtrip reaches the detail distance');
});

test('isClickGesture separates clicks from drags', () => {
    const {api} = loadInteraction();
    assert.equal(api.isClickGesture({x: 10, y: 10}, {x: 10, y: 10}), true);
    assert.equal(api.isClickGesture({x: 10, y: 10}, {x: 14, y: 13}), true, 'movement inside threshold stays a click');
    assert.equal(api.isClickGesture({x: 10, y: 10}, {x: 40, y: 10}), false, 'large movement is a drag');
    assert.equal(api.isClickGesture(null, {x: 1, y: 1}), false, 'missing down position is never a click');
});

test('initPlanetFocus adds an invisible raycast sphere to the group', () => {
    const {api} = loadInteraction();
    const group = {children: [], add(child) { this.children.push(child); }};
    const focus = api.initPlanetFocus(group, {}, 5.0);
    assert.notEqual(focus, null);
    assert.equal(group.children.length, 1);
    const sphere = group.children[0];
    assert.equal(sphere.geometry.radius, 5.0);
    assert.equal(sphere.material.options.colorWrite, false, 'hit sphere writes no color');
    assert.equal(sphere.material.options.depthWrite, false, 'hit sphere writes no depth');
    assert.ok(focus.detailSlider > 100);
});

test('focus toggle animates to the detail slider and restores the previous zoom', () => {
    const {api} = loadInteraction();
    const group = {children: [], add(child) { this.children.push(child); }};
    const focus = api.initPlanetFocus(group, {}, 5.0);
    const {InteractionState} = api;
    assert.equal(InteractionState.focus.active, false);

    focus.setFocused(true);
    assert.equal(InteractionState.focus.active, true);
    assert.equal(InteractionState.targetSliderVal, focus.detailSlider, 'zoom target moves to the detail value');

    focus.setFocused(false);
    assert.equal(InteractionState.focus.active, false);
    assert.equal(InteractionState.targetSliderVal, 50, 'unfocus restores the previous zoom');

    InteractionState.targetSliderVal = 80;
    focus.setFocused(true);
    focus.setFocused(false);
    assert.equal(InteractionState.targetSliderVal, 80, 'restores the manual zoom the user had before focusing');
});

test('setFocused keeps the existing state when toggled twice', () => {
    const {api} = loadInteraction();
    const focus = api.initPlanetFocus({children: [], add() {}}, {}, 5.0);
    focus.setFocused(true);
    const activeSlider = api.InteractionState.targetSliderVal;
    focus.setFocused(true);
    assert.equal(api.InteractionState.targetSliderVal, activeSlider, 'double focus does not overwrite pre-focus value');
    assert.equal(api.InteractionState.focus.preFocusSlider, 50);
});

test('pickPlanet mirrors the raycast hit result', () => {
    const {api, setHitResult} = loadInteraction();
    const focus = api.initPlanetFocus({children: [], add() {}}, {}, 5.0);
    setHitResult([{}]);
    assert.equal(focus.pickPlanet(50, 50), true);
    setHitResult([]);
    assert.equal(focus.pickPlanet(50, 50), false);
});

test('every planet runtime calls initPlanetFocus after initInteraction', () => {
    for (const name of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
        const source = fs.readFileSync(`scripts/planets/${name}.js`, 'utf8');
        const initIndex = source.indexOf('initInteraction(group, INITIAL_ZOOM);');
        const focusIndex = source.indexOf('initPlanetFocus(group, camera,');
        assert.ok(initIndex >= 0, `${name} calls initInteraction`);
        assert.ok(focusIndex > initIndex, `${name} wires initPlanetFocus after interaction init`);
    }
});
