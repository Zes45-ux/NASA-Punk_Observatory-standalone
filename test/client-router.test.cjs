const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createElement(id)
{
    const classes = new Set();
    const attributes = new Map();
    const children = new Map();
    return {
        id,
        hidden: id === 'ui-layer',
        innerHTML: '',
        textContent: '',
        classList: {
            add: (...names) => names.forEach((name) => classes.add(name)),
            remove: (...names) => names.forEach((name) => classes.delete(name)),
            contains: (name) => classes.has(name),
            toggle: (name, force) => {
                const next = force === undefined ? !classes.has(name) : force;
                if (next) classes.add(name);
                else classes.delete(name);
                return next;
            }
        },
        setAttribute: (name, value) => attributes.set(name, String(value)),
        getAttribute: (name) => attributes.get(name) || null,
        querySelector: (selector) => children.get(selector) || null,
        _children: children,
        _classes: classes
    };
}

function loadRouter()
{
    const listeners = new Map();
    const uiLayer = createElement('ui-layer');
    const systemRoot = createElement('system-select-root');
    const planetRoot = createElement('planet-ui-root');
    const telemetry = createElement('transit-readout');
    planetRoot._children.set('#transit-readout', telemetry);
    const title = 'NASA-Punk Observatory : SYSTEM SELECT';
    const historyCalls = [];
    const rendered = [];
    const cleared = [];
    const focusRequests = [];
    const returnRequests = [];

    const document = {
        title,
        body: {
            classList: {
                add: (...names) => names.forEach((name) => bodyClasses.add(name)),
                remove: (...names) => names.forEach((name) => bodyClasses.delete(name)),
                contains: (name) => bodyClasses.has(name)
            }
        },
        getElementById: (id) => ({
            'ui-layer': uiLayer,
            'system-select-root': systemRoot,
            'planet-ui-root': planetRoot,
            'transit-readout': telemetry,
            'transit-telemetry-label': createElement('transit-telemetry-label')
        }[id] || null),
        querySelector: (selector) => selector === '#transit-readout' ? telemetry : null
    };
    const bodyClasses = new Set();
    const location = {
        origin: 'https://observatory.test',
        href: 'https://observatory.test/index.html',
        pathname: '/index.html'
    };
    const history = {
        pushState: (_state, _title, path) => {
            historyCalls.push(['push', path]);
            location.href = `https://observatory.test${path}`;
            location.pathname = path;
        },
        replaceState: (_state, _title, path) => {
            historyCalls.push(['replace', path]);
            location.href = `https://observatory.test${path}`;
            location.pathname = path;
        }
    };
    const overview = {
        focusAndNavigate: (planet, url, options) => {
            focusRequests.push({planet, url, options});
            return true;
        },
        returnToOverview: (options) => {
            returnRequests.push(options);
            return true;
        }
    };
    const window = {
        document,
        location,
        history,
        PLANET_UI_CONFIG: {
            saturn: {title: 'SOL VI', badge: 'SATURN'},
            jupiter: {title: 'SOL V', badge: 'JUPITER'}
        },
        addEventListener: (type, callback) => listeners.set(type, callback),
        removeEventListener: (type) => listeners.delete(type),
        renderPlanetUI: (planet) => rendered.push(planet),
        clearPlanetUI: () => cleared.push(true),
        setTimeout,
        clearTimeout
    };
    window.window = window;
    const sandbox = {
        window,
        document,
        URL,
        setInterval,
        clearInterval,
        setTimeout,
        clearTimeout,
        console
    };
    vm.runInNewContext(fs.readFileSync('scripts/core/client-router.js', 'utf8'), sandbox);
    return {
        api: window.createClientRouter(),
        window,
        overview,
        listeners,
        location,
        historyCalls,
        rendered,
        cleared,
        focusRequests,
        returnRequests,
        telemetry,
        systemRoot,
        uiLayer,
        bodyClasses,
        document
    };
}

test('client router keeps one canvas while routing into and out of a planet view', () =>
{
    const env = loadRouter();
    env.api.init({overview: env.overview});

    assert.equal(env.api.canHandle('saturn.html'), true);
    assert.equal(env.api.canHandle('https://external.test/saturn.html'), false);
    assert.equal(env.api.navigate('saturn.html'), true);
    assert.equal(env.focusRequests.length, 1);
    assert.equal(env.location.pathname, '/index.html');

    env.focusRequests[0].options.onArrival();
    assert.deepEqual(env.rendered, ['saturn']);
    assert.equal(env.uiLayer.hidden, false);
    assert.equal(env.systemRoot.hidden, true);
    assert.deepEqual(env.historyCalls.at(-1), ['push', '/saturn']);
    assert.equal(env.api.currentPlanet, 'saturn');

    assert.equal(env.api.navigate('jupiter.html'), true);
    assert.equal(env.focusRequests.at(-1).planet, 'jupiter');
    env.focusRequests.at(-1).options.onArrival();
    assert.deepEqual(env.rendered, ['saturn', 'jupiter']);

    assert.equal(env.api.navigate('index.html'), true);
    assert.equal(env.returnRequests.length, 1);
    env.returnRequests[0].onComplete();
    assert.deepEqual(env.cleared, [true]);
    assert.deepEqual(env.historyCalls.at(-1), ['push', '/']);
    assert.equal(env.uiLayer.hidden, true);
    assert.equal(env.systemRoot.hidden, false);
    assert.equal(env.api.currentPlanet, null);
});

test('transit telemetry updates the reusable HUD readout without requiring a new canvas', () =>
{
    const env = loadRouter();
    env.api.init({overview: env.overview});
    env.api.navigate('saturn.html');
    env.focusRequests[0].options.onArrival();
    env.api.onTransitStep({
        planet: 'saturn',
        progress: 0.5,
        distanceRemaining: 12.345,
        approachSpeed: 8.765,
        bearing: -21.4,
        fov: 34.2
    });

    assert.match(env.telemetry.textContent, /SATURN/);
    assert.match(env.telemetry.textContent, /DIST 12\.35/);
    assert.match(env.telemetry.textContent, /APPROACH 8\.77/);
    assert.match(env.telemetry.textContent, /FOV 34\.2/);
});
