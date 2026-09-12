const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadPlanetUiEnv() {
    const documentListeners = new Map();
    const qualityProfiles = [];
    const navigations = [];

    const ParticleBuilder = {
        _profile: 'auto',
        getQualityProfile: () => ParticleBuilder._profile,
        setQualityProfile: (p) => {
            ParticleBuilder._profile = p;
            qualityProfiles.push(p);
        }
    };

    const rootElement = {
        id: 'planet-ui-root',
        innerHTML: '',
        querySelector(selector) {
            if (selector === '#quality-control') return this._qualityControl;
            if (selector === '#quality-value') return this._qualityValue;
            if (selector === '.system-monitor-container') return this._monitor;
            if (selector === '.system-strip') return this._strip;
            if (selector === '.system-monitor-trigger') return this._monitorTrigger;
            return null;
        }
    };

    function createElementMock(tag, className = '') {
        const classSet = new Set(className.split(' ').filter(Boolean));
        const attributes = new Map();
        const listeners = new Map();
        return {
            tagName: tag.toUpperCase(),
            classList: {
                add: (...names) => names.forEach(n => classSet.add(n)),
                remove: (...names) => names.forEach(n => classSet.delete(n)),
                toggle: (name, force) => {
                    const has = force !== undefined ? force : !classSet.has(name);
                    if (has) classSet.add(name);
                    else classSet.delete(name);
                    return has;
                },
                contains: (n) => classSet.has(n)
            },
            setAttribute: (k, v) => attributes.set(k, String(v)),
            getAttribute: (k) => attributes.get(k) ?? null,
            toggleAttribute: (k, v) => { if (v) attributes.set(k, ''); else attributes.delete(k); },
            addEventListener: (type, cb) => {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(cb);
            },
            removeEventListener: (type, cb) => {
                const list = listeners.get(type);
                if (list) {
                    const idx = list.indexOf(cb);
                    if (idx !== -1) list.splice(idx, 1);
                }
            },
            dispatchEvent: (event) => {
                const list = listeners.get(event.type) || [];
                list.forEach(cb => cb(event));
            },
            contains: () => false,
            focus: () => {},
            textContent: '',
            style: {}
        };
    }

    const monitor = createElementMock('div', 'system-monitor-container');
    const strip = createElementMock('nav', 'system-strip');
    const monitorTrigger = createElementMock('button', 'system-monitor-trigger');
    const qualityControl = createElementMock('button', 'quality-control');
    const qualityValue = createElementMock('span', 'quality-value');

    rootElement._monitor = monitor;
    rootElement._strip = strip;
    rootElement._monitorTrigger = monitorTrigger;
    rootElement._qualityControl = qualityControl;
    rootElement._qualityValue = qualityValue;

    const document = {
        getElementById: (id) => (id === 'planet-ui-root' ? rootElement : null),
        addEventListener: (type, cb) => {
            if (!documentListeners.has(type)) documentListeners.set(type, []);
            documentListeners.get(type).push(cb);
        },
        removeEventListener: (type, cb) => {
            const list = documentListeners.get(type);
            if (list) {
                const idx = list.indexOf(cb);
                if (idx !== -1) list.splice(idx, 1);
            }
        },
        dispatchEvent: (event) => {
            const list = documentListeners.get(event.type) || [];
            list.forEach(cb => cb(event));
        },
        activeElement: null
    };

    const ObservatoryUI = {
        buildRightDock: (cfg) => `<div class="right-dock">${cfg && cfg.footerRow ? cfg.footerRow : ''}</div>`,
        buildVerticalZoomControl: () => '<div class="vertical-controls"></div>'
    };

    const PLANET_UI_CONFIG = {
        mars: {
            active: 'mars',
            title: 'SOL IV',
            badge: 'MARS',
            subText: 'SYS: SOL',
            rows: ['> TOPO_SCAN: IRON_OXIDE_DUST']
        }
    };

    const windowListeners = new Map();
    const stoppedMaps = [];

    const window = {
        document,
        ParticleBuilder,
        TransitionManager: {
            navigate: (url) => navigations.push(url)
        },
        ObservatoryUI,
        createParticleMiniMap: () => {
            const map = {
                start: () => {},
                stop: () => stoppedMaps.push(map),
                resize: () => {}
            };
            return map;
        },
        addEventListener: (type, cb) => {
            if (!windowListeners.has(type)) windowListeners.set(type, []);
            windowListeners.get(type).push(cb);
        },
        removeEventListener: (type, cb) => {
            const list = windowListeners.get(type);
            if (list) {
                const idx = list.indexOf(cb);
                if (idx !== -1) list.splice(idx, 1);
            }
        },
        PLANET_UI_CONFIG
    };
    window.window = window;

    const sandbox = {
        window,
        document,
        ObservatoryUI,
        PLANET_UI_CONFIG,
        ParticleBuilder,
        createParticleMiniMap: window.createParticleMiniMap,
        localStorage: {
            getItem: () => null,
            setItem: () => {}
        },
        console
    };

    vm.runInNewContext(fs.readFileSync('scripts/components/planetUi.js', 'utf8'), sandbox);

    return {
        buildPlanetLayout: window.buildPlanetLayout,
        renderPlanetUI: window.renderPlanetUI,
        rootElement,
        monitor,
        strip,
        monitorTrigger,
        qualityControl,
        qualityValue,
        document,
        documentListeners,
        windowListeners,
        stoppedMaps,
        ParticleBuilder,
        qualityProfiles
    };
}

test('buildPlanetLayout generates expected HTML components', () => {
    const {buildPlanetLayout} = loadPlanetUiEnv();
    const html = buildPlanetLayout({
        active: 'mars',
        title: 'SOL IV',
        badge: 'MARS',
        subText: 'SYS: SOL',
        rows: ['TEST']
    });

    assert.match(html, /class="system-monitor-container"/, 'contains monitor container');
    assert.match(html, /class="system-strip"/, 'contains system strip');
    assert.match(html, /id="quality-control"/, 'contains quality control');
    assert.match(html, /id="gesture-control-toggle"/, 'contains opt-in camera control');
    assert.match(html, /id="gesture-camera-feed"/, 'contains local camera preview');
    assert.match(html, /PINCH: PARTICLE FLUX/, 'describes gesture-driven particle response');
    assert.match(html, /id="particle-build-progress"/, 'contains particle progress element');
});

test('renderPlanetUI configures accessibility and cycles quality profile', () => {
    const env = loadPlanetUiEnv();
    env.renderPlanetUI('mars');

    // Initial state: strip closed, aria-hidden true
    assert.equal(env.strip.getAttribute('aria-hidden'), 'true');
    assert.equal(env.monitorTrigger.getAttribute('aria-expanded'), 'false');

    // Click quality control
    env.qualityControl.dispatchEvent({type: 'click'});
    assert.equal(env.ParticleBuilder.getQualityProfile(), 'high');
    assert.equal(env.qualityValue.textContent, 'HIGH');

    env.qualityControl.dispatchEvent({type: 'click'});
    assert.equal(env.ParticleBuilder.getQualityProfile(), 'balanced');
    assert.equal(env.qualityValue.textContent, 'BALANCED');
});

test('renderPlanetUI cleans up document listeners when called repeatedly', () => {
    const env = loadPlanetUiEnv();
    env.renderPlanetUI('mars');
    const clicksAfterFirst = (env.documentListeners.get('click') || []).length;
    const keydownsAfterFirst = (env.documentListeners.get('keydown') || []).length;
    const resizesAfterFirst = (env.windowListeners.get('resize') || []).length;

    assert.equal(clicksAfterFirst, 1);
    assert.equal(keydownsAfterFirst, 1);
    assert.equal(resizesAfterFirst, 1);

    // Call renderPlanetUI again
    env.renderPlanetUI('mars');
    const clicksAfterSecond = (env.documentListeners.get('click') || []).length;
    const keydownsAfterSecond = (env.documentListeners.get('keydown') || []).length;
    const resizesAfterSecond = (env.windowListeners.get('resize') || []).length;

    assert.equal(clicksAfterSecond, 1, 'no duplicate click listener on document');
    assert.equal(keydownsAfterSecond, 1, 'no duplicate keydown listener on document');
    assert.equal(resizesAfterSecond, 1, 'no duplicate resize listener on window');
    assert.equal(env.stoppedMaps.length, 1, 'previous particle map was stopped on re-render');
});
