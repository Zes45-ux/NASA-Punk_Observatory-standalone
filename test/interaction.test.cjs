const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('precision slider synchronizes native input from keyboard and touch', () => {
    const listeners = new Map();
    const slider = {value: '50', addEventListener: (type, fn) => listeners.set(type, fn)};
    const context = {};
    vm.runInNewContext(fs.readFileSync('scripts/core/interaction.js', 'utf8'), context);
    const values = [];
    context.initPrecisionSlider(slider, value => values.push(value));
    slider.value = '60';
    listeners.get('input')?.({target: slider});
    slider.value = '70';
    listeners.get('input')?.({target: slider});
    assert.deepEqual(values, [60, 70]);
});

test('precision mouse drag updates once and preserves focus and release cleanup', () => {
    const listeners = new Map(), globalListeners = new Map(), values = [];
    let focused = false, prevented = false;
    const classes = new Set();
    const slider = {
        min: '0', max: '100', step: '10', value: '50',
        focus: () => { focused = true; },
        addEventListener: (type, fn) => listeners.set(type, fn),
        classList: {contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name)},
        getBoundingClientRect: () => ({left: 0, top: 0, width: 100, height: 100})
    };
    const context = {
        document: {body: {style: {}}},
        window: {addEventListener: (type, fn) => globalListeners.set(type, fn), removeEventListener: type => globalListeners.delete(type)}
    };
    vm.runInNewContext(fs.readFileSync('scripts/core/interaction.js', 'utf8'), context);
    context.initPrecisionSlider(slider, value => values.push(value));
    listeners.get('mousedown')({clientX: 60, clientY: 0, preventDefault() { prevented = true; }});
    assert.deepEqual(values, [60]);
    assert.ok(focused && prevented);
    globalListeners.get('mousemove')({clientX: 80, clientY: 0, preventDefault() {}});
    globalListeners.get('mouseup')();
    assert.deepEqual(values, [60, 80]);
    assert.equal(globalListeners.size, 0);
    assert.equal(context.document.body.style.cursor, '');
});

test('zoom readout avoids repeated layout-forcing DOM writes', () => {
    const {api} = loadInteraction();
    let writes = 0;
    const textDisplay = {value: ''};
    Object.defineProperty(textDisplay, 'textContent', {
        get() { return this.value; },
        set(value) { writes += 1; this.value = value; }
    });

    api.InteractionState.textDisplay = textDisplay;
    api.InteractionState.lastZoomText = '';
    api.InteractionState.initialZ = 25;
    api.InteractionState.currentSliderVal = 50;
    api.InteractionState.targetSliderVal = 50;

    api.updateInteraction(null, null);
    api.updateInteraction(null, null);

    assert.equal(textDisplay.value, '100%');
    assert.equal(writes, 1, 'stable zoom values do not rewrite the DOM every frame');
});

function loadInteraction(extra = {}) {
    const canvasListeners = new Map();
    const fakeCanvas = {
        style               : {},
        getBoundingClientRect: () => ({left: 0, top: 0, width: 100, height: 100}),
        addEventListener    : (type, listener, options) => {
            const listeners = canvasListeners.get(type) || [];
            listeners.push({listener, options});
            canvasListeners.set(type, listeners);
        },
        setPointerCapture   : () => {}
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
        '\n;globalThis.__interaction = {InteractionState, initInteraction, updateInteraction, initPlanetFocus, computeFocusSliderValue, isClickGesture, getCanvasBoundsManager};';
    vm.runInNewContext(source, sandbox);
    return {
        api: sandbox.__interaction,
        fakeCanvas,
        canvasListeners,
        emitCanvasEvent(type, event) {
            for (const entry of canvasListeners.get(type) || [])
            {
                entry.listener(event);
            }
        },
        setHitResult: (value) => { hitResult = value; }
    };
}

test('Mac trackpad pinch zooms through ctrl+wheel without zooming the page', () => {
    const env = loadInteraction();
    env.api.initInteraction(null, 25);

    let prevented = false;
    env.emitCanvasEvent('wheel', {
        ctrlKey: true,
        deltaY: -20,
        deltaMode: 0,
        preventDefault() { prevented = true; }
    });

    assert.equal(prevented, true);
    assert.ok(env.api.InteractionState.targetSliderVal > 50, 'spreading fingers zooms in');
    const zoomedValue = env.api.InteractionState.targetSliderVal;

    prevented = false;
    env.emitCanvasEvent('wheel', {
        ctrlKey: false,
        deltaY: -100,
        deltaMode: 0,
        preventDefault() { prevented = true; }
    });

    assert.equal(prevented, false, 'ordinary wheel scrolling remains untouched');
    assert.equal(env.api.InteractionState.targetSliderVal, zoomedValue);
    assert.equal(env.canvasListeners.get('wheel')[0].options.passive, false);
});

test('Safari gesture events use the same zoom state and limits', () => {
    const env = loadInteraction();
    env.api.initInteraction(null, 25);

    env.emitCanvasEvent('gesturestart', {preventDefault() {}});
    env.emitCanvasEvent('gesturechange', {scale: 1.5, preventDefault() {}});
    assert.ok(env.api.InteractionState.targetSliderVal > 50, 'gesture spread zooms in');

    env.emitCanvasEvent('gesturechange', {scale: 0.001, preventDefault() {}});
    assert.equal(env.api.InteractionState.targetSliderVal, 0, 'gesture zoom is clamped to the slider minimum');
    env.emitCanvasEvent('gestureend', {preventDefault() {}});
});

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

test('canvas.getBoundingClientRect is called once and cached across sequential pointermove events in pickPlanet', () => {
    let getBoundingClientRectCalls = 0;
    const env = loadInteraction();
    env.fakeCanvas.getBoundingClientRect = () => {
        getBoundingClientRectCalls++;
        return {left: 10, top: 20, width: 200, height: 150};
    };

    const group = {children: [], add(child) { this.children.push(child); }};
    env.api.initPlanetFocus(group, {}, 5.0);

    assert.equal(getBoundingClientRectCalls, 0, 'no layout reads before interaction');

    for (let i = 0; i < 20; i++) {
        env.emitCanvasEvent('pointermove', {
            pointerType: 'mouse',
            clientX: 50 + i,
            clientY: 50 + i
        });
    }

    assert.equal(getBoundingClientRectCalls, 1, 'getBoundingClientRect is called exactly once across 20 sequential pointermoves');
});

test('canvasPoint during drag uses cached canvas bounds without refetching geometry', () => {
    let getBoundingClientRectCalls = 0;
    const env = loadInteraction();
    env.fakeCanvas.getBoundingClientRect = () => {
        getBoundingClientRectCalls++;
        return {left: 0, top: 0, width: 100, height: 100};
    };

    env.api.initInteraction(null, 25);

    env.emitCanvasEvent('pointerdown', {
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        isPrimary: true
    });

    assert.equal(getBoundingClientRectCalls, 1, 'bounds evaluated once on gesture start');

    for (let i = 1; i <= 15; i++) {
        env.emitCanvasEvent('pointermove', {
            pointerId: 1,
            clientX: 10 + i,
            clientY: 10 + i
        });
    }

    assert.equal(getBoundingClientRectCalls, 1, 'zero additional layout reads during continuous dragging');
});

test('canvas bounds cache invalidates on window resize, scroll, orientationchange, and pointerdown/enter', () => {
    const windowListeners = new Map();
    const mockWindow = {
        addEventListener: (type, fn) => {
            const list = windowListeners.get(type) || [];
            list.push(fn);
            windowListeners.set(type, list);
        }
    };

    let getBoundingClientRectCalls = 0;
    const env = loadInteraction({ window: mockWindow });
    env.fakeCanvas.getBoundingClientRect = () => {
        getBoundingClientRectCalls++;
        return {left: 0, top: 0, width: 100, height: 100};
    };

    const group = {children: [], add() {}};
    env.api.initPlanetFocus(group, {}, 5.0);

    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 10, clientY: 10});
    assert.equal(getBoundingClientRectCalls, 1);

    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 11, clientY: 11});
    assert.equal(getBoundingClientRectCalls, 1);

    for (const fn of windowListeners.get('resize') || []) fn();
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 12, clientY: 12});
    assert.equal(getBoundingClientRectCalls, 2, 're-queries after window resize');

    for (const fn of windowListeners.get('scroll') || []) fn();
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 13, clientY: 13});
    assert.equal(getBoundingClientRectCalls, 3, 're-queries after window scroll');

    for (const fn of windowListeners.get('orientationchange') || []) fn();
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 14, clientY: 14});
    assert.equal(getBoundingClientRectCalls, 4, 're-queries after orientationchange');

    env.emitCanvasEvent('pointerenter', {});
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 15, clientY: 15});
    assert.equal(getBoundingClientRectCalls, 5, 're-queries after pointerenter');

    env.emitCanvasEvent('pointerdown', {isPrimary: true, pointerId: 1, clientX: 15, clientY: 15});
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 16, clientY: 16});
    assert.equal(getBoundingClientRectCalls, 6, 're-queries after pointerdown');
});

test('ResizeObserver invalidates canvas bounds cache when supported', () => {
    let roCallback = null;
    let observedCanvas = null;
    class MockResizeObserver {
        constructor(callback) {
            roCallback = callback;
        }
        observe(target) {
            observedCanvas = target;
        }
    }

    let getBoundingClientRectCalls = 0;
    const env = loadInteraction({ ResizeObserver: MockResizeObserver });
    env.fakeCanvas.getBoundingClientRect = () => {
        getBoundingClientRectCalls++;
        return {left: 0, top: 0, width: 100, height: 100};
    };

    const group = {children: [], add() {}};
    env.api.initPlanetFocus(group, {}, 5.0);

    assert.equal(observedCanvas, env.fakeCanvas, 'ResizeObserver observes canvas');

    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 20, clientY: 20});
    assert.equal(getBoundingClientRectCalls, 1);

    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 25, clientY: 20});
    assert.equal(getBoundingClientRectCalls, 1, 'cached');

    assert.equal(typeof roCallback, 'function');
    roCallback();

    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 30, clientY: 20});
    assert.equal(getBoundingClientRectCalls, 2, 're-queried after ResizeObserver notification');
});

test('canvas.style.cursor is only set when the cursor state actually changes', () => {
    const env = loadInteraction();
    let cursorWrites = 0;
    let currentCursor = '';
    Object.defineProperty(env.fakeCanvas.style, 'cursor', {
        get() { return currentCursor; },
        set(val) {
            cursorWrites++;
            currentCursor = val;
        }
    });

    const group = {children: [], add(child) { this.children.push(child); }};
    env.api.initPlanetFocus(group, {}, 5.0);

    env.setHitResult([]);
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 10, clientY: 10});
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 11, clientY: 10});
    assert.equal(cursorWrites, 0, 'no DOM mutation when cursor remains default empty string');
    assert.equal(currentCursor, '');

    env.setHitResult([{}]);
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 50, clientY: 50});
    assert.equal(cursorWrites, 1, 'cursor set to pointer on hover');
    assert.equal(currentCursor, 'pointer');

    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 51, clientY: 50});
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 52, clientY: 50});
    assert.equal(cursorWrites, 1, 'no redundant cursor writes while maintaining pointer state');

    env.setHitResult([]);
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 10, clientY: 10});
    assert.equal(cursorWrites, 2, 'cursor reset to empty string when leaving hit area');
    assert.equal(currentCursor, '');

    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 11, clientY: 10});
    env.emitCanvasEvent('pointermove', {pointerType: 'mouse', clientX: 12, clientY: 10});
    assert.equal(cursorWrites, 2, 'no redundant cursor writes while remaining outside hit area');
});

test('getCanvasBoundsManager handles missing or invalid canvas gracefully', () => {
    const env = loadInteraction();
    const managerNull = env.api.getCanvasBoundsManager(null);
    const rectNull = managerNull.get();
    assert.equal(rectNull.left, 0);
    assert.equal(rectNull.top, 0);
    assert.equal(rectNull.width, 0);
    assert.equal(rectNull.height, 0);
    assert.doesNotThrow(() => managerNull.invalidate());

    const managerObj = env.api.getCanvasBoundsManager({});
    const rectObj = managerObj.get();
    assert.equal(rectObj.left, 0);
    assert.equal(rectObj.top, 0);
    assert.equal(rectObj.width, 0);
    assert.equal(rectObj.height, 0);
});
