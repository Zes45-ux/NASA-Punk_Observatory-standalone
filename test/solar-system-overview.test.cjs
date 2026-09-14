const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('landing page boots the WebGL solar-system overview before its page runtime', () =>
{
    const html = fs.readFileSync('index.html', 'utf8');
    const containerIndex = html.indexOf('id="solar-system-scene"');
    const threeIndex = html.indexOf('./scripts/vendor/three.min.js');
    const overviewIndex = html.indexOf('./scripts/components/solarSystemOverview.js');
    const pageIndex = html.indexOf('./scripts/pages/index.page.js');

    assert.ok(containerIndex >= 0, 'landing page contains a dedicated 3D overview surface');
    assert.ok(threeIndex > containerIndex, 'Three.js loads after the overview surface exists');
    assert.ok(overviewIndex > threeIndex, 'overview module loads after Three.js');
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
    assert.match(source, /FOCUS_DURATION_MS = 1280/, 'camera push has an explicit cinematic duration');
    assert.match(source, /overview-\$\{definition\.name\}/,
        'thumbnail surface noise is seeded per matching planet');
    assert.match(source, /smootherstep\(progress\)/,
        'camera movement eases smoothly at both ends of the flight');
    assert.match(source, /cloudSignal > 0\.28/,
        'Earth keeps a sparse cloud mask instead of a solid white shell');
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
    const sharedColors = {
        sun: '#ffb84d',
        mercury: '#999999',
        venus: '#8b1a1a',
        earth: '#1a2b4a',
        mars: '#94544d',
        jupiter: '#f0e2c2',
        saturn: '#d9c37c',
        uranus: '#4a9cb8',
        neptune: '#2962ff'
    };
    Object.entries(sharedColors).forEach(([planet, color]) =>
    {
        const fullScene = fs.readFileSync(`scripts/planets/${planet}.js`, 'utf8');
        assert.ok(fullScene.includes(color), `${planet} full scene defines ${color}`);
        assert.ok(overview.includes(color), `${planet} thumbnail reuses ${color}`);
    });
});

test('overview thumbnail models replicate full planet features with physical tilt, rings, wireframes, and GRS', () =>
{
    const overview = fs.readFileSync('scripts/components/solarSystemOverview.js', 'utf8');
    assert.match(overview, /tiltGroup\.rotation\.z = \(definition\.tilt \|\| 0\)/, 'planets rotate on physical axial tilts');
    assert.match(overview, /new THREE\.WireframeGeometry/, 'tactical reference wireframe is embedded on planet bodies');
    assert.match(overview, /hexPoints\.push/, 'Saturn features the north polar hexagon');
    assert.match(overview, /#cc3300/, 'Jupiter features the Great Red Spot crimson vortex');
    assert.match(overview, /flareCount/, 'Sun features dynamic solar prominence flare particles');
    assert.match(overview, /returnToOverview/, 'overview exposes pull-back reverse transit');
    assert.match(overview, /camera\.fov = 38 - Math\.sin/, 'camera exhibits dynamic FOV warp during push transit');
    assert.match(overview, /__observatoryClientRouter/, 'overview integrates with client-side seamless router');
});

test('landing page hosts planet UI layer and client-side seamless transition router', () =>
{
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes('id="planet-ui-root"'), 'index.html contains planet UI root mount point');
    assert.ok(html.includes('scripts/components/planetUi.js'), 'index.html loads planet UI components');

    const page = fs.readFileSync('scripts/pages/index.page.js', 'utf8');
    assert.match(page, /setupClientRouter\(\)/, 'index page initializes the client router');
    assert.match(page, /mountPlanet\(planetName, url\)/, 'client router dynamically mounts planet view');
    assert.match(page, /returnToSystem\(/, 'client router supports return-to-system flight');
    assert.match(page, /history\.pushState/, 'client router synchronizes URLs without full page reload');
});
