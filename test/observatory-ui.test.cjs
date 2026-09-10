const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadObservatoryUi() {
    const sandbox = {
        window: {},
        document: {},
        console
    };
    sandbox.window.window = sandbox.window;
    vm.runInNewContext(fs.readFileSync('scripts/components/observatoryUi.js', 'utf8'), sandbox);
    return sandbox.window.ObservatoryUI;
}

function loadSerifSystem(config = {}) {
    const classList = new Set();
    const styleProperties = new Map();
    const appendedChildren = [];
    const removedChildren = [];

    const body = {
        classList: {
            add: (...names) => names.forEach(n => classList.add(n)),
            remove: (...names) => names.forEach(n => classList.delete(n)),
            contains: (n) => classList.has(n)
        },
        style: {
            setProperty: (k, v) => styleProperties.set(k, v),
            removeProperty: (k) => styleProperties.delete(k)
        },
        appendChild: (child) => appendedChildren.push(child)
    };

    const document = {
        body,
        querySelectorAll: (selector) => {
            if (selector === '.serif-region') {
                return appendedChildren.filter(c => !removedChildren.includes(c)).map(node => ({
                    remove: () => removedChildren.push(node)
                }));
            }
            return [];
        },
        createElement: (tag) => ({
            tagName: tag.toUpperCase(),
            className: '',
            dataset: {},
            innerHTML: '',
            style: {}
        }),
        addEventListener: () => {}
    };

    const window = {
        SERIF_CONFIG: config,
        document
    };
    window.window = window;

    const sandbox = {
        window,
        document,
        console
    };

    vm.runInNewContext(fs.readFileSync('scripts/core/serif.js', 'utf8'), sandbox);

    return {
        SerifManager: window.SerifManager,
        classList,
        styleProperties,
        appendedChildren,
        removedChildren
    };
}

test('ObservatoryUI builds right dock with title, rows, badge and footer', () => {
    const ui = loadObservatoryUi();
    const html = ui.buildRightDock({
        title: 'SOL IV',
        badge: 'MARS',
        subText: 'SYS: SOL',
        rows: ['> TOPO_SCAN: IRON_OXIDE_DUST'],
        footerRow: '<div class="footer">FOOTER_DATA</div>'
    });

    assert.match(html, /class="right-dock"/);
    assert.match(html, /SOL IV/);
    assert.match(html, /\[MARS\]/);
    assert.match(html, /FOOTER_DATA/);
    assert.match(html, /class="data-row"/);
});

test('ObservatoryUI builds zoom controls with accessibility labels and ticks', () => {
    const ui = loadObservatoryUi();
    const hZoom = ui.buildHorizontalZoomControl({
        sliderId: 'zoom-slider',
        displayId: 'scale-val',
        label: 'FOV_SCALE',
        value: '100%'
    });
    assert.match(hZoom, /id="zoom-slider"/);
    assert.match(hZoom, /id="scale-val"/);
    assert.match(hZoom, /aria-label="FOV_SCALE"/);
    assert.match(hZoom, /class="tick"/);

    const vZoom = ui.buildVerticalZoomControl({
        sliderId: 'cam-zoom-slider',
        label: 'OPTICS'
    });
    assert.match(vZoom, /id="cam-zoom-slider"/);
    assert.match(vZoom, /aria-label="OPTICS"/);
    assert.match(vZoom, /aria-orientation="vertical"/);
});

test('SerifManager initializes active style and sets CSS insets', () => {
    const {SerifManager, classList, styleProperties, appendedChildren} = loadSerifSystem({
        enabled: true,
        style: 'segmented-colorbar-right'
    });

    assert.ok(classList.has('has-serif-right'));
    assert.equal(styleProperties.get('--display-right-inset'), 'var(--segmented-colorbar-serif-size)');
    assert.equal(appendedChildren.length, 1);
    assert.equal(appendedChildren[0].dataset.edge, 'right');
});

test('SerifManager disables serif and cleans up insets when disabled', () => {
    const {SerifManager, classList, styleProperties, removedChildren} = loadSerifSystem({
        enabled: true,
        style: 'segmented-colorbar-right'
    });

    SerifManager.setEnabled(false);
    assert.ok(classList.has('serif-disabled'));
    assert.ok(!classList.has('has-serif-right'));
    assert.equal(styleProperties.has('--display-right-inset'), false);
    assert.ok(removedChildren.length > 0);
});

test('SerifManager switches styles dynamically', () => {
    const {SerifManager, classList, styleProperties} = loadSerifSystem({
        enabled: true,
        style: 'segmented-colorbar-right'
    });

    SerifManager.use('stacked-colorbar-top');
    assert.ok(classList.has('has-serif-top'));
    assert.ok(!classList.has('has-serif-right'));
    assert.equal(styleProperties.get('--display-top-inset'), 'var(--stacked-colorbar-serif-size)');
});
