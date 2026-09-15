const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('landing page boots the WebGL solar-system overview before its page runtime', () =>
{
    const html = fs.readFileSync('index.html', 'utf8');
    const containerIndex = html.indexOf('id="solar-system-scene"');
    const threeIndex = html.indexOf('./scripts/vendor/three.min.js');
    const configIndex = html.indexOf('./scripts/planets/config.js');
    const overviewIndex = html.indexOf('./scripts/components/solarSystemOverview.js');
    const pageIndex = html.indexOf('./scripts/pages/index.page.js');

    assert.ok(containerIndex >= 0, 'landing page contains a dedicated 3D overview surface');
    assert.ok(threeIndex > containerIndex, 'Three.js loads after the overview surface exists');
    assert.ok(configIndex > threeIndex, 'shared planet visual config loads after Three.js');
    assert.ok(overviewIndex > configIndex, 'overview reads the shared visual config');
    assert.ok(pageIndex > overviewIndex, 'page bootstrap starts after the overview module');
});

test('overview defines the sun and all eight planets as particle bodies', () =>
{
    const source = fs.readFileSync('scripts/components/solarSystemOverview.js', 'utf8');
    const bodies = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    bodies.forEach((name) => assert.match(source, new RegExp(`name: '${name}'`), `${name} is present`));
    assert.match(source, /new THREE\.Points\(/, 'planet surfaces use point geometry');
    assert.match(source, /createAsteroidBelt\(\)/, 'overview includes the asteroid belt');
    assert.match(source, /const particleTexture = createParticleTexture\(\)/, 'particles use a soft radial sprite');
    assert.match(source, /definition\.atmosphere/, 'atmospheric worlds receive a separate halo layer');
    assert.match(source, /const angle = definition\.phase/, 'initial orbit phases are composition-controlled');
    assert.match(source, /setScale/, 'overview exposes system-scale control');
    assert.match(source, /focusAndNavigate/, 'overview exposes a click-to-focus transition');
    assert.match(source, /prepareParticleHandoff/, 'handoff isolates the selected planet particles');
    assert.match(source, /registerParticleScene\(scene, camera, renderer\)/,
        'overview registers its particle scene with the cross-page bridge');
    assert.match(source, /FOCUS_DURATION_MS = 820/, 'camera push stays inside the fast cinematic budget');
    assert.match(source, /definition\.visual/, 'thumbnail bodies consume canonical planet visual data');
    assert.match(source, /surfaceSeed/, 'thumbnail surface noise uses the detail-scene seed');
    assert.match(source, /smootherstep\(cameraProgress\)/,
        'camera movement eases smoothly at both ends of the flight');
    assert.match(source, /cloudSignal > 0\.28/,
        'Earth keeps a sparse cloud mask instead of a solid white shell');
    assert.match(source, /tiltGroup\.rotation\.z/, 'thumbnail bodies preserve axial tilt');
    assert.match(source, /WireframeGeometry/, 'thumbnail bodies preserve the tactical wireframe treatment');
    assert.match(source, /hexPoints/, 'Saturn preserves its polar hexagon cue');
    assert.match(source, /redSpot/, 'Jupiter preserves its Great Red Spot cue');
    assert.match(source, /observatory:quality/, 'overview responds to the shared quality profile');
    assert.match(source, /setDrawRange/, 'overview can reduce point layers without reallocating them');
});

test('planet labels route clicks through the overview focus before page navigation', () =>
{
    const source = fs.readFileSync('scripts/pages/index.page.js', 'utf8');
    assert.match(source, /overview\.focusAndNavigate\(node\.dataset\.planet, link\)/);
    assert.match(source, /solarSystemOverview\.resetFocus\(\)/,
        'back-forward cache restores the full overview after a transition');
});

test('overview palettes reuse the defining colors from each full planet scene', () =>
{
    const overview = fs.readFileSync('scripts/components/solarSystemOverview.js', 'utf8');
    const config = fs.readFileSync('scripts/planets/config.js', 'utf8');
    const bodies = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    assert.match(overview, /PLANET_VISUAL_CONFIG/);
    bodies.forEach((planet) =>
    {
        const fullScene = fs.readFileSync(`scripts/planets/${planet}.js`, 'utf8');
        assert.match(config, new RegExp(`${planet}:\\s*\\{`), `${planet} has canonical visual data`);
        assert.match(fullScene, /PLANET_VISUAL_CONFIG/, `${planet} consumes canonical visual data`);
    });
});

test('overview and detail pages share stable seeds, palettes, and feature flags', () =>
{
    const config = fs.readFileSync('scripts/planets/config.js', 'utf8');
    const overview = fs.readFileSync('scripts/components/solarSystemOverview.js', 'utf8');
    assert.match(config, /surfaceSeed: 'sol-core-v1'/);
    assert.match(config, /surfaceSeed: 'seed-terra-firma-v2'/);
    assert.match(config, /features: \{[\s\S]*flares: true/);
    assert.match(config, /features: \{[\s\S]*greatRedSpot: true/);
    assert.match(config, /features: \{[\s\S]*polarHexagon: true/);
    assert.match(overview, /visual\.overviewPalette/);
    assert.match(overview, /visual\.features/);
});

test('planet links prefetch their document on intent without wasting data-saver bandwidth', () =>
{
    const source = fs.readFileSync('scripts/pages/index.page.js', 'utf8');
    assert.match(source, /prefetchPlanetPage/);
    assert.match(source, /hint\.rel = 'prefetch'/);
    assert.match(source, /connection\.saveData/);
});
