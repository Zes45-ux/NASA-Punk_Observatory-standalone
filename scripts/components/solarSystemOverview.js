/**
 * Interactive particle solar-system overview for the default landing page.
 * Planet proportions and orbital gaps are deliberately compressed so all nine
 * bodies remain legible as one navigable astronomical thumbnail.
 */
(function initSolarSystemOverview(global)
{
    const VISUAL_CONFIG = global.PLANET_VISUAL_CONFIG || {};

    function visualFor(name)
    {
        return VISUAL_CONFIG[name] || {};
    }

    function visualColor(name, key, fallback)
    {
        const visual = visualFor(name);
        return visual.palette && visual.palette[key] || fallback;
    }

    const PLANETS = [
        {name: 'sun',     orbit: 0,    phase: 0,     radius: 4.9,  particles: 6200, color: visualColor('sun', 'edge', '#cc4400'), accent: visualColor('sun', 'core', '#ffffff'), speed: 0,     visual: visualFor('sun'),     atmosphere: {scale: 1.14, color: visualColor('sun', 'atmosphere', '#ffb84d'), opacity: 0.2}},
        {name: 'mercury', orbit: 10.5, phase: -0.65, radius: 0.62, particles: 780,  color: visualColor('mercury', 'base', '#999999'), accent: visualColor('mercury', 'light', '#cccccc'), speed: 0.48, visual: visualFor('mercury')},
        {name: 'venus',   orbit: 16.5, phase: 0.8,   radius: 0.98, particles: 1250, color: visualColor('venus', 'base', '#8b1a1a'), accent: visualColor('venus', 'peak', '#ffe0a0'), speed: 0.34, visual: visualFor('venus'),   atmosphere: {scale: 1.045, color: visualColor('venus', 'atmosphere', '#ffae20'), opacity: 0.22, spin: -0.34}},
        {name: 'earth',   orbit: 23,   phase: 2.35,  radius: 1.04, particles: 1500, color: visualColor('earth', 'ocean', '#1a2b4a'), accent: visualColor('earth', 'landHigh', '#9abf8a'), speed: 0.28, visual: visualFor('earth'),   atmosphere: {scale: 1.045, color: visualColor('earth', 'atmosphere', '#ffffff'), opacity: 0.14, spin: 0.2}},
        {name: 'mars',    orbit: 30,   phase: -2.4,  radius: 0.76, particles: 980,  color: visualColor('mars', 'base', '#94544d'), accent: visualColor('mars', 'light', '#d98c6b'), speed: 0.23, visual: visualFor('mars'),    atmosphere: {scale: 1.055, color: visualColor('mars', 'atmosphere', '#ffc840'), opacity: 0.1}},
        {name: 'jupiter', orbit: 41,   phase: -0.35, radius: 2.55, particles: 3400, color: visualColor('jupiter', 'beltBase', '#c28266'), accent: visualColor('jupiter', 'zoneLight', '#f0e2c2'), speed: 0.14, visual: visualFor('jupiter'), rings: 'jupiter', atmosphere: {scale: 1.028, color: visualColor('jupiter', 'atmosphere', '#ffe699'), opacity: 0.12}},
        {name: 'saturn',  orbit: 52,   phase: 1.05,  radius: 2.1,  particles: 2900, color: visualColor('saturn', 'beige', '#d9c37c'), accent: visualColor('saturn', 'cream', '#f4f0d5'), speed: 0.11, visual: visualFor('saturn'),  rings: 'saturn', atmosphere: {scale: 1.035, color: visualColor('saturn', 'atmosphere', '#f4f0d5'), opacity: 0.1}},
        {name: 'uranus',  orbit: 62,   phase: 2.8,   radius: 1.52, particles: 2050, color: visualColor('uranus', 'deep', '#4a9cb8'), accent: visualColor('uranus', 'high', '#e0ffff'), speed: 0.08, visual: visualFor('uranus'),  rings: 'uranus', atmosphere: {scale: 1.04, color: visualColor('uranus', 'atmosphere', '#66e6ff'), opacity: 0.14}},
        {name: 'neptune', orbit: 71,   phase: -2.8,  radius: 1.5,  particles: 2050, color: visualColor('neptune', 'deep', '#1a237e'), accent: visualColor('neptune', 'bright', '#448aff'), speed: 0.065, visual: visualFor('neptune'), rings: 'neptune'}
    ];

    function mulberry32(seed)
    {
        let state = seed >>> 0;
        return function random()
        {
            state += 0x6D2B79F5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function inertOverview()
    {
        return {
            start() {}, stop() {}, resize() {}, setScale() {}, resetFocus() {},
            returnToOverview() { return false; },
            focusAndNavigate() { return false; },
            running: false,
            planetCount: 0
        };
    }

    function createSolarSystemOverview(options = {})
    {
        const THREE = global.THREE;
        const document = global.document;
        const container = document && document.getElementById(options.containerId || 'solar-system-scene');
        if (!THREE || !container)
        {
            return inertOverview();
        }

        const profileRatios = {high: 1, balanced: 0.78, low: 0.58, recovery: 0.38};
        const profileName = options.profile || 'balanced';
        const density = profileRatios[profileName] || profileRatios.balanced;
        const pixelRatioCaps = {high: 1.45, balanced: 1.2, low: 1, recovery: 0.85};
        const reducedMotion = typeof global.matchMedia === 'function'
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
        const renderer = new THREE.WebGLRenderer({alpha: true, antialias: false, powerPreference: 'high-performance'});
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, pixelRatioCaps[profileName] || 1.2));
        renderer.domElement.className = 'solar-system-webgl';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        container.appendChild(renderer.domElement);

        const system = new THREE.Group();
        system.rotation.x = -0.03;
        scene.add(system);

        const clock = new THREE.Clock();
        const random = mulberry32(0x534f4c);
        const worldPosition = new THREE.Vector3();
        const projected = new THREE.Vector3();
        const planetEntries = [];
        const disposables = [];
        const overviewMaterials = [];
        const effectLayers = [];
        const dynamicLayers = [];
        const overviewPointLayers = [];
        const labels = new Map();
        let labelRect = null;
        let lastLabelUpdateAt = -Infinity;
        const labelNodes = document.querySelectorAll(options.labelSelector || '.solar-target');
        labelNodes.forEach((node) => labels.set(node.dataset.planet, node));

        let running = false;
        let frameHandle = null;
        let targetYaw = -0.12;
        let currentYaw = targetYaw;
        let targetPitch = 0;
        let currentPitch = 0;
        let targetDistance = 148;
        let currentDistance = targetDistance;
        let pointerDown = false;
        let pointerMoved = false;
        let pointerX = 0;
        let pointerY = 0;
        let focusState = null;
        let focusedPlanet = null;
        const focusedCameraOffset = new THREE.Vector3();
        let navigationCommitted = false;

        const FOCUS_DURATION_MS = 820;
        const NAVIGATION_COMMIT_PROGRESS = 0.74;
        const OVERVIEW_FOV = 38;
        const TRANSIT_FOV = 34.2;
        let activeQualityProfile = profileName;

        function track(resource)
        {
            disposables.push(resource);
            return resource;
        }

        function createParticleTexture()
        {
            const canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 48;
            const context = canvas.getContext('2d');
            const gradient = context.createRadialGradient(24, 24, 0, 24, 24, 24);
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.32, 'rgba(255,255,255,0.96)');
            gradient.addColorStop(0.68, 'rgba(255,255,255,0.28)');
            gradient.addColorStop(1, 'rgba(255,255,255,0)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, 48, 48);
            return track(new THREE.CanvasTexture(canvas));
        }

        const particleTexture = createParticleTexture();

        function createSurfaceSampler(definition)
        {
            const visual = definition.visual || {};
            const noise = global.SimplexNoise
                ? new global.SimplexNoise(visual.surfaceSeed || `overview-${definition.name}`)
                : null;
            const fallbackPalettes = {
                sun: ['#8a1c00', '#cc4400', '#ffb84d', '#ffffff'],
                mercury: ['#555555', '#999999', '#cccccc'],
                venus: ['#8b1a1a', '#d9531e', '#ffe0a0'],
                earth: ['#1a2b4a', '#3e6b48', '#9abf8a', '#ffffff'],
                mars: ['#6b433c', '#94544d', '#d98c6b', '#ffffff'],
                jupiter: ['#787878', '#8a3f2d', '#c28266', '#d6c7a5', '#f0e2c2'],
                saturn: ['#6b7e8c', '#a68f58', '#d9c37c', '#f4f0d5'],
                uranus: ['#4a9cb8', '#a4d8e6', '#e0ffff'],
                neptune: ['#0d1238', '#1a237e', '#2962ff', '#448aff']
            }[definition.name] || ['#ffffff'];
            const configuredColors = visual.palette && visual.overviewPalette
                ? visual.overviewPalette.map((key) => visual.palette[key]).filter(Boolean)
                : null;
            const palette = (configuredColors && configuredColors.length > 0
                ? configuredColors
                : fallbackPalettes).map((color) => new THREE.Color(color));
            const redSpot = visual.features && visual.features.greatRedSpot && visual.palette
                ? {
                    core: new THREE.Color(visual.palette.redSpotCore || '#8a3f2d'),
                    eye: new THREE.Color(visual.palette.redSpotEye || '#c25e40')
                }
                : null;
            const sampled = new THREE.Color();
            const brightCloudColor = new THREE.Color('#ffffff');
            const readNoise = (x, y, z, scaleX, scaleY = scaleX, scaleZ = scaleX) => noise
                ? noise.noise3D(x * scaleX, y * scaleY, z * scaleZ)
                : Math.sin((x * scaleX + y * scaleY + z * scaleZ) * 3.17);

            return function sample(x, y, z, theta)
            {
                const nx = x / definition.radius;
                const ny = y / definition.radius;
                const nz = z / definition.radius;
                const baseNoise = readNoise(nx, ny, nz, 1.8);
                if (definition.name === 'sun')
                {
                    const detail = baseNoise + readNoise(nx, ny, nz, 6.2) * 0.5;
                    if (detail > 0.6) sampled.copy(palette[3]);
                    else if (detail > 0) sampled.copy(palette[2]).lerp(palette[3], detail);
                    else if (detail > -0.5) sampled.copy(palette[1]).lerp(palette[2], (detail + 0.5) * 2);
                    else sampled.copy(palette[0]).lerp(palette[1], (detail + 1) * 2);
                }
                else if (definition.name === 'mercury')
                {
                    const crater = 1 - Math.pow(Math.abs(readNoise(nx, ny, nz, 8)), 1.2);
                    sampled.copy(crater > 0.62 ? palette[0] : (baseNoise > 0.2 ? palette[2] : palette[1]));
                }
                else if (definition.name === 'venus')
                {
                    const chaos = (readNoise(nx, ny, nz, 5) * 0.8 + readNoise(nx, ny, nz, 13) * 0.2 + 1) * 0.5;
                    sampled.copy(chaos < 0.5 ? palette[0] : palette[1]);
                    sampled.lerp(chaos < 0.5 ? palette[1] : palette[2], chaos < 0.5 ? chaos * 2 : (chaos - 0.5) * 2);
                }
                else if (definition.name === 'earth')
                {
                    const terrain = readNoise(nx, ny, nz, 1.1) * 1.2 + readNoise(nx, ny, nz, 4.2) * 0.25;
                    if (terrain <= 0.1) sampled.copy(palette[0]);
                    else if (terrain < 0.55) sampled.copy(palette[1]).lerp(palette[2], (terrain - 0.1) / 0.45);
                    else sampled.copy(palette[2]).lerp(palette[3], Math.min(1, (terrain - 0.55) * 2.2));
                }
                else if (definition.name === 'mars')
                {
                    const crater = Math.abs(readNoise(nx, ny, nz, 9));
                    if (visual.features && visual.features.polarCaps && Math.abs(ny) > 0.82)
                    {
                        sampled.copy(palette[3] || palette[2]);
                    }
                    else
                    {
                        sampled.copy(crater > 0.72 ? palette[0] : (baseNoise > 0.2 ? palette[2] : palette[1]));
                    }
                }
                else if (definition.name === 'jupiter')
                {
                    const latitude = Math.abs(ny);
                    const signal = Math.sin(Math.sign(ny) * Math.pow(latitude, 1.35) * 12.5
                        + readNoise(nx, ny, nz, 3.2, 0.9, 3.2) * 1.2);
                    const redSpotDistance = Math.sqrt(
                        Math.pow(ny + 0.38, 2) + Math.pow(nx - 0.45, 2) + Math.pow(nz - 0.25, 2)
                    );
                    if (redSpot && redSpotDistance < 0.32)
                    {
                        sampled.copy(redSpot.core).lerp(redSpot.eye, redSpotDistance / 0.32);
                    }
                    else if (latitude > 0.85) sampled.copy(palette[3]).lerp(palette[0], (latitude - 0.85) * 4);
                    else if (signal > 0.1) sampled.copy(palette[3]).lerp(palette[4], Math.min(1, signal));
                    else sampled.copy(palette[2]).lerp(palette[1], Math.min(1, Math.abs(signal) * 0.8 + 0.2));
                }
                else if (definition.name === 'saturn')
                {
                    const band = Math.sin(ny * definition.radius * 3.5 + baseNoise * 0.3);
                    sampled.copy(band > 0.5 ? palette[3] : (band < -0.3 ? palette[1] : palette[2]));
                    if (ny > 0.55) sampled.lerp(palette[0], Math.min(0.7, (ny - 0.55) * 1.5));
                }
                else if (definition.name === 'uranus')
                {
                    sampled.copy(palette[0]).lerp(palette[1], Math.abs(ny) * 0.8 + 0.2);
                    if (Math.abs(ny) > 0.8) sampled.lerp(palette[2], (Math.abs(ny) - 0.8) * 3);
                }
                else
                {
                    const wind = readNoise(nx, ny, nz, 1.8, 8, 1.8);
                    const storm = ny < -0.25 && ny > -0.55 && nx > 0 && Math.abs(nz) < 0.4;
                    if (storm) sampled.copy(palette[0]);
                    else sampled.copy(wind < -0.2 ? palette[1] : palette[2])
                        .lerp(wind < -0.2 ? palette[2] : palette[3], wind < -0.2 ? wind + 1 : wind);
                    if (visual.features && visual.features.brightClouds && readNoise(nx, ny, nz, 8) > 0.65)
                    {
                        sampled.lerp(brightCloudColor, 0.55);
                    }
                }
                sampled.multiplyScalar(0.88 + random() * 0.24);
                return sampled;
            };
        }

        function createParticleSphere(definition, index)
        {
            const visual = definition.visual || {};
            const features = visual.features || {};
            const count = Math.max(180, Math.round(definition.particles * density));
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const mixed = new THREE.Color();
            const sampleSurface = createSurfaceSampler(definition);
            const goldenAngle = Math.PI * (3 - Math.sqrt(5));

            for (let i = 0; i < count; i++)
            {
                const y = 1 - (i / Math.max(1, count - 1)) * 2;
                const radial = Math.sqrt(Math.max(0, 1 - y * y));
                const theta = goldenAngle * i + random() * 0.12;
                const relief = 1 + (random() - 0.5) * (definition.name === 'sun' ? 0.09 : 0.035);
                const offset = i * 3;
                positions[offset] = Math.cos(theta) * radial * definition.radius * relief;
                positions[offset + 1] = y * definition.radius * relief;
                positions[offset + 2] = Math.sin(theta) * radial * definition.radius * relief;

                mixed.copy(sampleSurface(positions[offset], positions[offset + 1], positions[offset + 2], theta));
                colors[offset] = mixed.r;
                colors[offset + 1] = mixed.g;
                colors[offset + 2] = mixed.b;
            }

            const geometry = track(new THREE.BufferGeometry());
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const material = track(new THREE.PointsMaterial({
                size: definition.name === 'sun' ? 0.2 : 0.16,
                map: particleTexture,
                alphaTest: 0.025,
                vertexColors: true,
                transparent: true,
                opacity: definition.name === 'sun' ? 0.98 : 0.92,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                sizeAttenuation: true
            }));
            const cloud = new THREE.Group();
            const surfacePoints = new THREE.Points(geometry, material);
            surfacePoints.userData.visualLayer = 'surface';
            cloud.add(surfacePoints);
            overviewPointLayers.push({
                object: surfacePoints,
                fullCount: count,
                minimumCount: Math.min(count, definition.name === 'sun' ? 180 : 120)
            });

            if (features.wireframe && typeof THREE.WireframeGeometry === 'function'
                && typeof THREE.SphereGeometry === 'function')
            {
                const sphereGeometry = new THREE.SphereGeometry(definition.radius, 14, 10);
                const wireGeometry = track(new THREE.WireframeGeometry(sphereGeometry));
                if (typeof sphereGeometry.dispose === 'function') sphereGeometry.dispose();
                const wireMaterial = track(new THREE.LineBasicMaterial({
                    color: definition.accent || 0x40556b,
                    transparent: true,
                    opacity: 0.11,
                    blending: THREE.AdditiveBlending
                }));
                const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
                wireframe.userData.visualLayer = 'wireframe';
                cloud.add(wireframe);
            }

            if (features.latitudeLongitudeGrid && typeof THREE.LineLoop === 'function')
            {
                const gridGroup = new THREE.Group();
                const gridMaterial = track(new THREE.LineBasicMaterial({
                    color: definition.accent || 0x6b7e8c,
                    transparent: true,
                    opacity: 0.16,
                    blending: THREE.AdditiveBlending
                }));
                const gridSegments = 32;
                for (let latitudeIndex = -3; latitudeIndex <= 3; latitudeIndex++)
                {
                    const latitude = latitudeIndex / 4 * Math.PI * 0.5;
                    const ringRadius = definition.radius * Math.cos(latitude);
                    const points = [];
                    for (let point = 0; point < gridSegments; point++)
                    {
                        const angle = point / gridSegments * Math.PI * 2;
                        points.push(new THREE.Vector3(
                            Math.cos(angle) * ringRadius,
                            Math.sin(latitude) * definition.radius,
                            Math.sin(angle) * ringRadius
                        ));
                    }
                    const geometry = track(new THREE.BufferGeometry().setFromPoints(points));
                    gridGroup.add(new THREE.LineLoop(geometry, gridMaterial));
                }
                for (let longitudeIndex = 0; longitudeIndex < 8; longitudeIndex++)
                {
                    const longitude = longitudeIndex / 8 * Math.PI * 2;
                    const points = [];
                    for (let point = 0; point <= gridSegments; point++)
                    {
                        const latitude = point / gridSegments * Math.PI - Math.PI * 0.5;
                        const radius = Math.cos(latitude) * definition.radius;
                        points.push(new THREE.Vector3(
                            Math.cos(longitude) * radius,
                            Math.sin(latitude) * definition.radius,
                            Math.sin(longitude) * radius
                        ));
                    }
                    const geometry = track(new THREE.BufferGeometry().setFromPoints(points));
                    gridGroup.add(new THREE.Line(geometry, gridMaterial));
                }
                gridGroup.userData.visualLayer = 'latitude-longitude-grid';
                cloud.add(gridGroup);
            }

            if (features.greatRedSpot && typeof THREE.Points === 'function')
            {
                const stormCount = Math.max(90, Math.round(280 * density));
                const stormPositions = new Float32Array(stormCount * 3);
                const stormColors = new Float32Array(stormCount * 3);
                const stormAngles = new Float32Array(stormCount);
                const stormRadii = new Float32Array(stormCount);
                const stormPhases = new Float32Array(stormCount);
                const stormCore = visual.palette && visual.palette.redSpotCore
                    ? new THREE.Color(visual.palette.redSpotCore)
                    : new THREE.Color('#8a3f2d');
                const stormEye = visual.palette && visual.palette.redSpotEye
                    ? new THREE.Color(visual.palette.redSpotEye)
                    : new THREE.Color('#c25e40');
                const stormSwirl = visual.palette
                    ? new THREE.Color(visual.palette.redSpotSwirl || '#e3dccb')
                    : new THREE.Color('#e3dccb');
                const centerX = definition.radius * 0.45;
                const centerY = -definition.radius * 0.38;
                const centerZ = definition.radius * 0.25;
                for (let stormIndex = 0; stormIndex < stormCount; stormIndex++)
                {
                    const angle = random() * Math.PI * 2;
                    const radial = Math.sqrt(random()) * definition.radius * 0.23;
                    const offset = stormIndex * 3;
                    const swirlMix = Math.min(1, radial / (definition.radius * 0.23));
                    stormPositions[offset] = centerX + Math.cos(angle) * radial;
                    stormPositions[offset + 1] = centerY + (random() - 0.5) * definition.radius * 0.08;
                    stormPositions[offset + 2] = centerZ + Math.sin(angle) * radial * 0.52;
                    const color = stormCore.clone().lerp(stormEye, 1 - swirlMix * 0.72)
                        .lerp(stormSwirl, Math.max(0, swirlMix - 0.62) * 2.3);
                    stormColors[offset] = color.r;
                    stormColors[offset + 1] = color.g;
                    stormColors[offset + 2] = color.b;
                    stormAngles[stormIndex] = angle;
                    stormRadii[stormIndex] = radial;
                    stormPhases[stormIndex] = random() * Math.PI * 2;
                }
                const stormGeometry = track(new THREE.BufferGeometry());
                stormGeometry.setAttribute('position', new THREE.BufferAttribute(stormPositions, 3));
                stormGeometry.setAttribute('color', new THREE.BufferAttribute(stormColors, 3));
                const stormMaterial = track(new THREE.PointsMaterial({
                    size: 0.13,
                    map: particleTexture,
                    alphaTest: 0.02,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.82,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }));
                const stormPoints = new THREE.Points(stormGeometry, stormMaterial);
                stormPoints.userData.visualLayer = 'great-red-spot-vortex';
                cloud.add(stormPoints);
                overviewPointLayers.push({object: stormPoints, fullCount: stormCount, minimumCount: 36});
                dynamicLayers.push({
                    update(time)
                    {
                        const positions = stormGeometry.attributes.position.array;
                        for (let stormIndex = 0; stormIndex < stormCount; stormIndex++)
                        {
                            const radius = stormRadii[stormIndex];
                            const phase = stormPhases[stormIndex];
                            const swirl = stormAngles[stormIndex]
                                + time * (0.09 + (1 - radius / (definition.radius * 0.23)) * 0.18);
                            const offset = stormIndex * 3;
                            positions[offset] = centerX + Math.cos(swirl) * radius;
                            positions[offset + 2] = centerZ + Math.sin(swirl) * radius * 0.52;
                            positions[offset + 1] = centerY
                                + Math.sin(time * 0.42 + phase) * definition.radius * 0.018;
                        }
                        stormGeometry.attributes.position.needsUpdate = true;
                    }
                });
            }

            if (features.olympusMons && typeof THREE.Points === 'function')
            {
                const mountainCount = Math.max(32, Math.round(96 * density));
                const mountainPositions = new Float32Array(mountainCount * 3);
                const mountainColors = new Float32Array(mountainCount * 3);
                const mountainColor = visual.palette && visual.palette.light
                    ? new THREE.Color(visual.palette.light)
                    : new THREE.Color('#d98c6b');
                for (let mountainIndex = 0; mountainIndex < mountainCount; mountainIndex++)
                {
                    const angle = random() * Math.PI * 2;
                    const radial = Math.sqrt(random()) * definition.radius * 0.11;
                    const offset = mountainIndex * 3;
                    mountainPositions[offset] = definition.radius * 0.18 + Math.cos(angle) * radial;
                    mountainPositions[offset + 1] = definition.radius * 0.05
                        + Math.sin(angle) * radial * 0.45;
                    mountainPositions[offset + 2] = definition.radius * 0.965
                        + (random() - 0.35) * definition.radius * 0.035;
                    const brightness = 0.72 + random() * 0.28;
                    mountainColors[offset] = mountainColor.r * brightness;
                    mountainColors[offset + 1] = mountainColor.g * brightness;
                    mountainColors[offset + 2] = mountainColor.b * brightness;
                }
                const mountainGeometry = track(new THREE.BufferGeometry());
                mountainGeometry.setAttribute('position', new THREE.BufferAttribute(mountainPositions, 3));
                mountainGeometry.setAttribute('color', new THREE.BufferAttribute(mountainColors, 3));
                const mountainMaterial = track(new THREE.PointsMaterial({
                    size: 0.12,
                    map: particleTexture,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.7,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }));
                const mountainPoints = new THREE.Points(mountainGeometry, mountainMaterial);
                mountainPoints.userData.visualLayer = 'olympus-mons';
                cloud.add(mountainPoints);
                overviewPointLayers.push({object: mountainPoints, fullCount: mountainCount, minimumCount: 18});
            }

            if (features.polarHexagon && typeof THREE.Line === 'function')
            {
                const hexPoints = [];
                const hexRadius = definition.radius * 0.25;
                for (let point = 0; point <= 6; point++)
                {
                    const angle = point * Math.PI / 3;
                    const x = hexRadius * Math.cos(angle);
                    const z = hexRadius * Math.sin(angle);
                    hexPoints.push(new THREE.Vector3(
                        x,
                        Math.sqrt(Math.max(0, definition.radius * definition.radius - x * x - z * z))
                            * 0.99,
                        z
                    ));
                }
                const hexGeometry = track(new THREE.BufferGeometry().setFromPoints(hexPoints));
                const hexMaterial = track(new THREE.LineBasicMaterial({
                    color: definition.accent || 0x6b7e8c,
                    transparent: true,
                    opacity: 0.5,
                    blending: THREE.AdditiveBlending
                }));
                const hexLine = new THREE.Line(hexGeometry, hexMaterial);
                hexLine.userData.visualLayer = 'polar-hexagon';
                cloud.add(hexLine);
            }

            if (features.moon && features.moonOrbit)
            {
                const moonDistance = definition.radius * 2.2;
                const moonOrbitPoints = [];
                for (let point = 0; point <= 64; point++)
                {
                    const angle = point / 64 * Math.PI * 2;
                    moonOrbitPoints.push(new THREE.Vector3(
                        Math.cos(angle) * moonDistance,
                        Math.sin(angle) * 0.15,
                        Math.sin(angle) * moonDistance
                    ));
                }
                const moonOrbitGeometry = track(new THREE.BufferGeometry().setFromPoints(moonOrbitPoints));
                const moonOrbitMaterial = track(new THREE.LineBasicMaterial({
                    color: 0x6b7e8c,
                    transparent: true,
                    opacity: 0.22,
                    blending: THREE.AdditiveBlending
                }));
                const moonOrbitGroup = new THREE.Group();
                moonOrbitGroup.rotation.z = ((visual.moonTilt || 5.14) * Math.PI) / 180;
                moonOrbitGroup.userData.overviewSpin = 0.072;
                moonOrbitGroup.add(new THREE.LineLoop(moonOrbitGeometry, moonOrbitMaterial));

                const moonGeometry = track(new THREE.BufferGeometry());
                moonGeometry.setAttribute('position', new THREE.BufferAttribute(
                    new Float32Array([moonDistance, 0, 0]), 3
                ));
                const moonMaterial = track(new THREE.PointsMaterial({
                    size: 0.14,
                    map: particleTexture,
                    color: 0xcccccc,
                    transparent: true,
                    opacity: 0.88,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }));
                const moonPoints = new THREE.Points(moonGeometry, moonMaterial);
                moonPoints.userData.visualLayer = 'moon';
                moonOrbitGroup.add(moonPoints);
                cloud.add(moonOrbitGroup);
                effectLayers.push(moonOrbitGroup);
                overviewPointLayers.push({object: moonPoints, fullCount: 1, minimumCount: 1});
            }

            if (features.moons && !features.moon && typeof THREE.Points === 'function')
            {
                const satelliteCount = definition.name === 'jupiter' ? 4 : 2;
                const satellitePositions = new Float32Array(satelliteCount * 3);
                const satelliteColors = new Float32Array(satelliteCount * 3);
                const satelliteAngles = new Float32Array(satelliteCount);
                const satelliteRadii = new Float32Array(satelliteCount);
                const satelliteSpeeds = new Float32Array(satelliteCount);
                const satelliteGroup = new THREE.Group();
                const satelliteOrbitColor = definition.name === 'mars' ? 0xc8434d : 0x9aa9b7;
                const satelliteMaterial = track(new THREE.PointsMaterial({
                    size: definition.name === 'jupiter' ? 0.12 : 0.1,
                    map: particleTexture,
                    color: satelliteOrbitColor,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.7,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }));
                for (let satelliteIndex = 0; satelliteIndex < satelliteCount; satelliteIndex++)
                {
                    const angle = random() * Math.PI * 2;
                    const radius = definition.radius * (2 + satelliteIndex * 0.62);
                    const offset = satelliteIndex * 3;
                    satelliteAngles[satelliteIndex] = angle;
                    satelliteRadii[satelliteIndex] = radius;
                    satelliteSpeeds[satelliteIndex] = 0.18 / (1 + satelliteIndex * 0.6);
                    satellitePositions[offset] = Math.cos(angle) * radius;
                    satellitePositions[offset + 1] = (random() - 0.5) * definition.radius * 0.22;
                    satellitePositions[offset + 2] = Math.sin(angle) * radius;
                    satelliteColors[offset] = 0.58 + satelliteIndex * 0.06;
                    satelliteColors[offset + 1] = 0.68 + satelliteIndex * 0.04;
                    satelliteColors[offset + 2] = 0.78 + satelliteIndex * 0.03;
                }
                const satelliteGeometry = track(new THREE.BufferGeometry());
                satelliteGeometry.setAttribute('position', new THREE.BufferAttribute(satellitePositions, 3));
                satelliteGeometry.setAttribute('color', new THREE.BufferAttribute(satelliteColors, 3));
                const satellitePoints = new THREE.Points(satelliteGeometry, satelliteMaterial);
                satellitePoints.userData.visualLayer = 'moons';
                satelliteGroup.add(satellitePoints);
                satelliteGroup.userData.visualLayer = 'moon-orbits';
                cloud.add(satelliteGroup);
                overviewPointLayers.push({object: satellitePoints, fullCount: satelliteCount, minimumCount: satelliteCount});
                dynamicLayers.push({
                    update(_time, delta)
                    {
                        const positions = satelliteGeometry.attributes.position.array;
                        for (let satelliteIndex = 0; satelliteIndex < satelliteCount; satelliteIndex++)
                        {
                            satelliteAngles[satelliteIndex] += satelliteSpeeds[satelliteIndex] * delta;
                            const offset = satelliteIndex * 3;
                            positions[offset] = Math.cos(satelliteAngles[satelliteIndex]) * satelliteRadii[satelliteIndex];
                            positions[offset + 2] = Math.sin(satelliteAngles[satelliteIndex]) * satelliteRadii[satelliteIndex];
                        }
                        satelliteGeometry.attributes.position.needsUpdate = true;
                    }
                });
            }

            if (features.flares)
            {
                const flareCount = Math.max(40, Math.round(240 * density));
                const flarePositions = new Float32Array(flareCount * 3);
                const flareColors = new Float32Array(flareCount * 3);
                const flareAngles = new Float32Array(flareCount);
                const flareRadii = new Float32Array(flareCount);
                const flareSpeeds = new Float32Array(flareCount);
                const flarePhases = new Float32Array(flareCount);
                for (let flareIndex = 0; flareIndex < flareCount; flareIndex++)
                {
                    const angle = random() * Math.PI * 2;
                    const elevation = (random() - 0.5) * 0.8;
                    const radius = definition.radius * (1.02 + random() * 0.25);
                    const offset = flareIndex * 3;
                    flarePositions[offset] = Math.cos(angle) * radius;
                    flarePositions[offset + 1] = elevation * definition.radius;
                    flarePositions[offset + 2] = Math.sin(angle) * radius;
                    flareColors[offset] = 1;
                    flareColors[offset + 1] = 0.65 + random() * 0.35;
                    flareColors[offset + 2] = 0.2;
                    flareAngles[flareIndex] = angle;
                    flareRadii[flareIndex] = radius;
                    flareSpeeds[flareIndex] = 0.08 + random() * 0.16;
                    flarePhases[flareIndex] = random() * Math.PI * 2;
                }
                const flareGeometry = track(new THREE.BufferGeometry());
                flareGeometry.setAttribute('position', new THREE.BufferAttribute(flarePositions, 3));
                flareGeometry.setAttribute('color', new THREE.BufferAttribute(flareColors, 3));
                const flareMaterial = track(new THREE.PointsMaterial({
                    size: 0.26,
                    map: particleTexture,
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.75,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                }));
                const flarePoints = new THREE.Points(flareGeometry, flareMaterial);
                flarePoints.userData.visualLayer = 'flares';
                cloud.add(flarePoints);
                overviewPointLayers.push({object: flarePoints, fullCount: flareCount, minimumCount: 24});
                dynamicLayers.push({
                    update(time)
                    {
                        const positions = flareGeometry.attributes.position.array;
                        for (let index = 0; index < flareCount; index++)
                        {
                            const radius = flareRadii[index]
                                + Math.sin(time * flareSpeeds[index] + flarePhases[index]) * 0.45;
                            positions[index * 3] = Math.cos(flareAngles[index]) * radius;
                            positions[index * 3 + 2] = Math.sin(flareAngles[index]) * radius;
                        }
                        flareGeometry.attributes.position.needsUpdate = true;
                    }
                });
            }

            if (definition.atmosphere)
            {
                const shellRatio = {
                    sun: 0.58,
                    venus: 0.5,
                    earth: 0.34,
                    mars: 0.2,
                    jupiter: 0.38,
                    saturn: 0.28,
                    uranus: 0.34
                }[definition.name] || 0.3;
                const shellCapacity = Math.max(80, Math.round(count * shellRatio));
                const shellPositions = new Float32Array(shellCapacity * 3);
                let shellCount = 0;
                for (let sourceIndex = 0; sourceIndex < count && shellCount < shellCapacity; sourceIndex++)
                {
                    const sourceOffset = sourceIndex * 3;
                    const px = positions[sourceOffset] / definition.radius;
                    const py = positions[sourceOffset + 1] / definition.radius;
                    const pz = positions[sourceOffset + 2] / definition.radius;
                    const cloudSignal = Math.sin(px * 7.2 + pz * 2.4)
                        + Math.sin(py * 9.1 - pz * 5.3) * 0.55;
                    const keep = definition.name === 'earth'
                        ? cloudSignal > 0.28
                        : (sourceIndex % Math.max(1, Math.round(1 / shellRatio)) === 0);
                    if (!keep) continue;
                    const targetOffset = shellCount * 3;
                    shellPositions[targetOffset] = positions[sourceOffset];
                    shellPositions[targetOffset + 1] = positions[sourceOffset + 1];
                    shellPositions[targetOffset + 2] = positions[sourceOffset + 2];
                    shellCount++;
                }
                const haloGeometry = track(new THREE.BufferGeometry());
                haloGeometry.setAttribute('position', new THREE.BufferAttribute(
                    shellPositions.subarray(0, shellCount * 3), 3
                ));
                const haloMaterial = track(new THREE.PointsMaterial({
                    size: definition.name === 'sun' ? 0.32 : 0.24,
                    map: particleTexture,
                    alphaTest: 0.01,
                    color: definition.atmosphere.color,
                    transparent: true,
                    opacity: definition.atmosphere.opacity,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    sizeAttenuation: true
                }));
                const halo = new THREE.Points(haloGeometry, haloMaterial);
                halo.scale.setScalar(definition.atmosphere.scale);
                halo.userData.overviewSpin = definition.atmosphere.spin || 0;
                effectLayers.push(halo);
                overviewPointLayers.push({object: halo, fullCount: shellCount, minimumCount: 40});
                cloud.add(halo);

                if (definition.name === 'venus' && visual.features && visual.features.atmosphere)
                {
                    const hazeMaterial = track(new THREE.PointsMaterial({
                        size: 0.34,
                        map: particleTexture,
                        alphaTest: 0.01,
                        color: definition.atmosphere.color,
                        transparent: true,
                        opacity: definition.atmosphere.opacity * 0.42,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false,
                        sizeAttenuation: true
                    }));
                    const haze = new THREE.Points(haloGeometry, hazeMaterial);
                    haze.scale.setScalar(definition.atmosphere.scale * 1.035);
                    haze.userData.overviewSpin = -0.14;
                    haze.userData.visualLayer = 'venus-atmosphere-haze';
                    effectLayers.push(haze);
                    overviewPointLayers.push({object: haze, fullCount: shellCount, minimumCount: 40});
                    cloud.add(haze);
                }
            }
            return cloud;
        }

        function createOrbit(radius, index)
        {
            const points = [];
            const segments = 192;
            for (let i = 0; i < segments; i++)
            {
                const angle = i / segments * Math.PI * 2;
                points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * 0.72));
            }
            const geometry = track(new THREE.BufferGeometry().setFromPoints(points));
            const material = track(new THREE.LineBasicMaterial({
                color: index % 3 === 0 ? 0x866b42 : 0x40556b,
                transparent: true,
                opacity: index % 3 === 0 ? 0.28 : 0.2,
                blending: THREE.AdditiveBlending
            }));
            system.add(new THREE.LineLoop(geometry, material));
        }

        function createRings(parent, definition)
        {
            const count = Math.round((definition.name === 'saturn' ? 1800 : 700) * density);
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const ringColor = new THREE.Color();
            const ringPalette = definition.visual && definition.visual.palette || {};
            for (let i = 0; i < count; i++)
            {
                const angle = random() * Math.PI * 2;
                let radius;
                if (definition.rings === 'saturn')
                {
                    const segment = random();
                    // Two dense ring families separated by the Cassini gap.
                    radius = segment < 0.54
                        ? definition.radius * (1.24 + random() * 0.34)
                        : definition.radius * (1.78 + random() * 0.49);
                }
                else
                {
                    radius = definition.radius * (1.38 + random() * (definition.rings === 'uranus' ? 0.65 : 0.72));
                }
                const normalized = (radius / definition.radius - 1.38)
                    / (definition.rings === 'saturn' ? 0.95 : 0.72);
                const offset = i * 3;
                positions[offset] = Math.cos(angle) * radius;
                positions[offset + 1] = (random() - 0.5) * 0.055;
                positions[offset + 2] = Math.sin(angle) * radius;
                if (definition.rings === 'saturn')
                {
                    const ringRadius = radius / definition.radius;
                    ringColor.set(ringRadius < 1.62
                        ? (ringRadius < 1.38
                            ? (ringPalette.ringDark || '#4a3b2a')
                            : (ringPalette.ringBright || '#f0e4c0'))
                        : (ringRadius < 1.78 ? '#151923' : (ringPalette.ringIce || '#a0b0c0')));
                }
                else if (definition.rings === 'uranus')
                {
                    ringColor.set(random() > 0.5
                        ? (ringPalette.ringBright || '#40e0d0')
                        : (ringPalette.ringDark || '#2a4f50'));
                }
                else if (definition.rings === 'jupiter')
                {
                    ringColor.set(random() > 0.58 ? '#b6a885' : '#695b4c');
                }
                else
                {
                    ringColor.set(normalized > 0.62 ? '#88aaff' : '#5566aa');
                }
                const edgeFade = definition.rings === 'saturn'
                    ? Math.min(1, Math.max(0, (radius / definition.radius - 1.24) / 0.08),
                        Math.max(0, (2.27 - radius / definition.radius) / 0.08))
                    : 1;
                const brightness = (0.55 + random() * 0.55) * edgeFade;
                colors[offset] = ringColor.r * brightness;
                colors[offset + 1] = ringColor.g * brightness;
                colors[offset + 2] = ringColor.b * brightness;
            }
            const geometry = track(new THREE.BufferGeometry());
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const material = track(new THREE.PointsMaterial({
                size: definition.name === 'saturn' ? 0.13 : 0.11,
                map: particleTexture,
                alphaTest: 0.02,
                vertexColors: true,
                transparent: true,
                opacity: definition.rings === 'saturn' ? 0.72 : (definition.rings === 'uranus' ? 0.42 : 0.3),
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));
            const rings = new THREE.Points(geometry, material);
            rings.rotation.x = definition.rings === 'uranus'
                ? Math.PI * 0.48
                : (definition.rings === 'jupiter' ? Math.PI * 0.12 : Math.PI * 0.08);
            rings.userData.overviewSpin = definition.rings === 'neptune' ? 0.42 : 0.18;
            rings.userData.visualLayer = 'rings';
            effectLayers.push(rings);
            overviewPointLayers.push({object: rings, fullCount: count, minimumCount: 40});
            parent.add(rings);
        }

        function createAsteroidBelt()
        {
            const count = Math.round(2400 * density);
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            for (let i = 0; i < count; i++)
            {
                const angle = random() * Math.PI * 2;
                const radius = 34 + random() * 4.5;
                const offset = i * 3;
                positions[offset] = Math.cos(angle) * radius;
                positions[offset + 1] = (random() - 0.5) * 0.7;
                positions[offset + 2] = Math.sin(angle) * radius * 0.72;
                const brightness = 0.25 + random() * 0.42;
                colors[offset] = brightness;
                colors[offset + 1] = brightness * 0.82;
                colors[offset + 2] = brightness * 0.62;
            }
            const geometry = track(new THREE.BufferGeometry());
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const material = track(new THREE.PointsMaterial({
                size: 0.095,
                map: particleTexture,
                alphaTest: 0.025,
                vertexColors: true,
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));
            const belt = new THREE.Points(geometry, material);
            belt.userData.visualLayer = 'asteroids';
            system.add(belt);
            overviewPointLayers.push({object: belt, fullCount: count, minimumCount: 120});
        }

        PLANETS.forEach((definition, index) =>
        {
            if (definition.orbit > 0) createOrbit(definition.orbit, index);
            const orbitPivot = new THREE.Group();
            const body = new THREE.Group();
            const tiltGroup = new THREE.Group();
            tiltGroup.rotation.z = ((definition.visual && definition.visual.tilt) || 0) * (Math.PI / 180);
            body.add(tiltGroup);
            const particles = createParticleSphere(definition, index);
            tiltGroup.add(particles);
            if (definition.rings) createRings(tiltGroup, definition);
            orbitPivot.add(body);
            system.add(orbitPivot);
            const angle = definition.phase;
            orbitPivot.rotation.y = angle;
            body.position.set(definition.orbit, 0, 0);
            body.scale.z = 0.98;
            planetEntries.push({definition, orbitPivot, body, tiltGroup, particles, angle});
        });
        createAsteroidBelt();

        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 96;
        glowCanvas.height = 96;
        const glowContext = glowCanvas.getContext('2d');
        const glowGradient = glowContext.createRadialGradient(48, 48, 0, 48, 48, 48);
        glowGradient.addColorStop(0, 'rgba(255, 223, 145, 0.72)');
        glowGradient.addColorStop(0.24, 'rgba(232, 166, 72, 0.24)');
        glowGradient.addColorStop(1, 'rgba(232, 166, 72, 0)');
        glowContext.fillStyle = glowGradient;
        glowContext.fillRect(0, 0, 96, 96);
        const glowTexture = track(new THREE.CanvasTexture(glowCanvas));
        const sunGlow = new THREE.Sprite(track(new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0xeaa34a,
            transparent: true,
            opacity: 0.48,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })));
        sunGlow.scale.set(15, 15, 1);
        system.add(sunGlow);

        // The full Sol scene has a layered corona. Keep the same visual cue in
        // the overview without adding another particle allocation or render
        // target: three additive sprite shells share one cached texture.
        const coronaLayers = [
            {scale: 10.8, opacity: 0.24, color: 0xffc35b},
            {scale: 13.6, opacity: 0.16, color: 0xff8a32},
            {scale: 18.4, opacity: 0.1, color: 0xd95d24}
        ];
        for (let coronaIndex = 0; coronaIndex < coronaLayers.length; coronaIndex++)
        {
            const layer = coronaLayers[coronaIndex];
            const corona = new THREE.Sprite(track(new THREE.SpriteMaterial({
                map: glowTexture,
                color: layer.color,
                transparent: true,
                opacity: layer.opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })));
            corona.scale.set(layer.scale, layer.scale, 1);
            corona.userData.visualLayer = 'corona-layer-' + coronaIndex;
            system.add(corona);
        }

        system.traverse((object) =>
        {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.filter(Boolean).forEach((material) =>
            {
                if (!Number.isFinite(material.opacity)) return;
                overviewMaterials.push({object, material, opacity: material.opacity});
            });
        });

        function applyQualityProfile(profile)
        {
            const nextProfile = profileRatios[profile] ? profile : 'balanced';
            const visibleRatio = Math.min(1, profileRatios[nextProfile] / Math.max(0.1, density));
            activeQualityProfile = nextProfile;
            overviewPointLayers.forEach((layer) =>
            {
                if (!layer.object.geometry || typeof layer.object.geometry.setDrawRange !== 'function') return;
                const count = Math.max(layer.minimumCount, Math.floor(layer.fullCount * visibleRatio));
                layer.object.geometry.setDrawRange(0, Math.min(layer.fullCount, count));
            });
            const pixelRatio = Math.min(global.devicePixelRatio || 1, pixelRatioCaps[nextProfile] || 1.2);
            if (typeof renderer.getPixelRatio !== 'function' || renderer.getPixelRatio() !== pixelRatio)
            {
                renderer.setPixelRatio(pixelRatio);
            }
        }

        function handleQualityChange(event)
        {
            const profile = event && event.detail && event.detail.profile;
            if (profile && profile !== 'auto') applyQualityProfile(profile);
        }

        global.addEventListener('observatory:quality', handleQualityChange);
        applyQualityProfile(activeQualityProfile);

        function isInside(object, ancestor)
        {
            let current = object;
            while (current)
            {
                if (current === ancestor) return true;
                current = current.parent;
            }
            return false;
        }

        function smoothstep(value)
        {
            const t = Math.max(0, Math.min(1, value));
            return t * t * (3 - 2 * t);
        }

        function cubicOut(value)
        {
            const t = Math.max(0, Math.min(1, value));
            const inverse = 1 - t;
            return 1 - inverse * inverse * inverse;
        }

        function transitFov(progress)
        {
            const t = progress < 0.5
                ? cubicOut(progress * 2)
                : cubicOut((progress - 0.5) * 2);
            return progress < 0.5
                ? OVERVIEW_FOV + (TRANSIT_FOV - OVERVIEW_FOV) * t
                : TRANSIT_FOV + (OVERVIEW_FOV - TRANSIT_FOV) * t;
        }

        function setCameraFov(value)
        {
            if (Math.abs(camera.fov - value) < 0.01) return;
            camera.fov = value;
            camera.updateProjectionMatrix();
        }

        function broadcastTransitStep(timestamp, progress)
        {
            const detail = focusState.transitDetail;
            const distance = camera.position.distanceTo(focusState.worldTarget);
            const elapsed = focusState.lastTelemetryAt === null
                ? 16.667
                : Math.max(1, timestamp - focusState.lastTelemetryAt);
            const previousDistance = focusState.previousDistance;
            detail.planet = focusState.target.definition.name;
            detail.progress = progress;
            detail.distanceRemaining = distance;
            detail.approachSpeed = Math.max(0, (previousDistance - distance) / (elapsed / 1000));
            detail.bearing = Math.atan2(
                focusState.worldTarget.x - camera.position.x,
                focusState.worldTarget.z - camera.position.z
            ) * 180 / Math.PI;
            detail.fov = camera.fov;
            focusState.previousDistance = distance;
            focusState.lastTelemetryAt = timestamp;
            const router = global.__observatoryClientRouter;
            if (router && typeof router.onTransitStep === 'function')
            {
                router.onTransitStep(detail);
            }
            if (focusState.transitEvent)
            {
                global.dispatchEvent(focusState.transitEvent);
            }
        }

        function updateFocus(timestamp)
        {
            const elapsed = Math.max(0, timestamp - focusState.startedAt);
            const progress = Math.min(1, elapsed / FOCUS_DURATION_MS);
            const eased = cubicOut(progress);
            focusState.target.body.getWorldPosition(focusState.worldTarget);
            if (focusState.mode === 'return')
            {
                camera.position.lerpVectors(focusState.startCamera, focusState.endCamera, eased);
                focusState.lookAt.lerpVectors(focusState.startLookAt, focusState.endLookAt, eased);
                camera.lookAt(focusState.lookAt);
                setCameraFov(transitFov(progress));
            }
            else
            {
                focusState.endCamera.copy(focusState.worldTarget).add(focusState.liveOffset);
                camera.position.lerpVectors(focusState.startCamera, focusState.endCamera, eased);
                focusState.lookAt.lerpVectors(focusState.startLookAt, focusState.worldTarget, eased);
                camera.lookAt(focusState.lookAt);
                setCameraFov(transitFov(progress));
            }

            const fade = focusState.mode === 'return'
                ? smoothstep(progress)
                : 1 - smoothstep(progress / 0.86);
            for (let index = 0; index < overviewMaterials.length; index++)
            {
                const entry = overviewMaterials[index];
                const belongsToTarget = isInside(entry.object, focusState.target.body)
                    || (focusState.target.definition.name === 'sun' && entry.object === sunGlow);
                entry.material.opacity = entry.opacity * (belongsToTarget ? 1 : Math.max(0.06, fade));
            }
            if (focusState.mode === 'focus')
            {
                broadcastTransitStep(timestamp, progress);
            }
            return {
                commit: focusState.mode === 'focus'
                    && progress >= NAVIGATION_COMMIT_PROGRESS,
                complete: progress >= 1
            };
        }

        function prepareParticleHandoff()
        {
            system.traverse((object) =>
            {
                if (!object.isPoints) return;
                object.visible = isInside(object, focusState.target.body);
            });
        }

        function restoreParticleVisibility()
        {
            system.traverse((object) =>
            {
                if (object.isPoints) object.visible = true;
            });
        }

        function updateLabels(timestamp, force = false)
        {
            if (!force && !focusState && !focusedPlanet && timestamp - lastLabelUpdateAt < 48) return;
            lastLabelUpdateAt = timestamp;
            labelRect = labelRect || container.getBoundingClientRect();
            const rect = labelRect;
            planetEntries.forEach((entry) =>
            {
                const label = labels.get(entry.definition.name);
                if (!label) return;
                const activeTarget = focusState ? focusState.target : focusedPlanet;
                if (activeTarget && entry !== activeTarget)
                {
                    label.hidden = true;
                    return;
                }
                entry.body.getWorldPosition(worldPosition);
                projected.copy(worldPosition).project(camera);
                const visible = projected.z > -1 && projected.z < 1
                    && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
                label.hidden = !visible;
                if (!visible) return;
                const x = (projected.x * 0.5 + 0.5) * rect.width;
                const y = (-projected.y * 0.5 + 0.5) * rect.height;
                const previous = label._overviewPosition;
                if (!previous || Math.abs(previous.x - x) > 0.2 || Math.abs(previous.y - y) > 0.2)
                {
                    label.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                    label._overviewPosition = {x, y};
                }
                label.style.setProperty('--target-depth', String(1 - Math.max(0, projected.z) * 0.42));
            });
        }

        function render(timestamp = global.performance ? global.performance.now() : Date.now())
        {
            let focusTransition = null;
            if (focusState)
            {
                focusTransition = updateFocus(timestamp);
                if (focusTransition.commit && !navigationCommitted)
                {
                    navigationCommitted = true;
                    focusState.handoffStartedAt = timestamp;
                    prepareParticleHandoff();
                    if (typeof focusState.onArrival === 'function')
                    {
                        focusState.onArrival();
                    }
                    else if (global.TransitionManager
                        && typeof global.TransitionManager.navigate === 'function')
                    {
                        global.TransitionManager.navigate(focusState.url);
                    }
                }
            }
            else if (focusedPlanet)
            {
                focusedPlanet.body.getWorldPosition(worldPosition);
                camera.position.copy(worldPosition).add(focusedCameraOffset);
                camera.lookAt(worldPosition);
                setCameraFov(OVERVIEW_FOV);
            }
            else
            {
                currentYaw += (targetYaw - currentYaw) * 0.075;
                currentPitch += (targetPitch - currentPitch) * 0.075;
                currentDistance += (targetDistance - currentDistance) * 0.075;
                system.rotation.y = currentYaw;
                system.rotation.x = -0.03 + currentPitch;
                camera.position.set(0, currentDistance * 0.56, currentDistance);
                camera.lookAt(0, 0, 0);
                setCameraFov(OVERVIEW_FOV);
            }
            renderer.render(scene, camera);
            updateLabels(timestamp, Boolean(focusState || focusedPlanet));

            if (focusTransition && focusTransition.complete)
            {
                if (focusState.mode === 'return')
                {
                    const onComplete = focusState.onComplete;
                    focusState = null;
                    focusedPlanet = null;
                    navigationCommitted = false;
                    document.body.classList.remove('solar-system-targeting', 'solar-system-returning');
                    restoreParticleVisibility();
                    for (let index = 0; index < overviewMaterials.length; index++)
                    {
                        const entry = overviewMaterials[index];
                        entry.material.opacity = entry.opacity;
                    }
                    setCameraFov(OVERVIEW_FOV);
                    if (typeof onComplete === 'function') onComplete();
                }
                else if (navigationCommitted)
                {
                    focusedPlanet = focusState.target;
                    focusedCameraOffset.copy(focusState.endCamera).sub(focusState.worldTarget);
                    focusState = null;
                    navigationCommitted = false;
                    document.body.classList.remove('solar-system-targeting');
                    setCameraFov(OVERVIEW_FOV);
                }
            }
        }

        function tick(timestamp)
        {
            if (!running) return;
            const delta = Math.min(clock.getDelta(), 0.05);
            if (!reducedMotion && !focusState && !focusedPlanet)
            {
                for (let index = 0; index < planetEntries.length; index++)
                {
                    const entry = planetEntries[index];
                    if (index > 0) entry.orbitPivot.rotation.y += entry.definition.speed * delta * 0.22;
                    entry.particles.rotation.y += delta * (entry.definition.name === 'sun' ? 0.055 : 0.12);
                }
            }
            else if (!reducedMotion && (focusState || focusedPlanet))
            {
                const activeTarget = focusState ? focusState.target : focusedPlanet;
                activeTarget.particles.rotation.y += delta * 0.08;
            }
            if (!reducedMotion)
            {
                for (let index = 0; index < effectLayers.length; index++)
                {
                    const layer = effectLayers[index];
                    layer.rotation.y += delta * layer.userData.overviewSpin;
                }
                for (let index = 0; index < dynamicLayers.length; index++)
                {
                    dynamicLayers[index].update(timestamp * 0.001, delta);
                }
            }
            render(timestamp);
            frameHandle = global.requestAnimationFrame(tick);
        }

        function resize()
        {
            const width = Math.max(1, container.clientWidth || global.innerWidth || 1);
            const height = Math.max(1, container.clientHeight || global.innerHeight || 1);
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            labelRect = null;
            render(global.performance ? global.performance.now() : Date.now());
        }

        function setScale(value)
        {
            const normalized = Math.max(0, Math.min(1, Number(value) || 0));
            targetDistance = 184 - normalized * 72;
        }

        function onPointerDown(event)
        {
            if (focusState) return;
            pointerDown = true;
            pointerMoved = false;
            pointerX = event.clientX;
            pointerY = event.clientY;
            renderer.domElement.setPointerCapture(event.pointerId);
            renderer.domElement.classList.add('is-dragging');
        }

        function onPointerMove(event)
        {
            if (!pointerDown || focusState) return;
            const dx = event.clientX - pointerX;
            const dy = event.clientY - pointerY;
            if (Math.abs(dx) + Math.abs(dy) > 2) pointerMoved = true;
            targetYaw += dx * 0.0045;
            targetPitch = Math.max(-0.26, Math.min(0.18, targetPitch + dy * 0.0028));
            pointerX = event.clientX;
            pointerY = event.clientY;
        }

        function onPointerUp(event)
        {
            pointerDown = false;
            if (renderer.domElement.hasPointerCapture(event.pointerId))
            {
                renderer.domElement.releasePointerCapture(event.pointerId);
            }
            renderer.domElement.classList.remove('is-dragging');
        }

        function onWheel(event)
        {
            event.preventDefault();
            if (focusState) return;
            targetDistance = Math.max(110, Math.min(186, targetDistance + event.deltaY * 0.06));
            const slider = document.getElementById('zoom-slider');
            const display = document.getElementById('scale-val');
            if (slider)
            {
                const value = Math.round((184 - targetDistance) / 72 * 100);
                slider.value = String(Math.max(0, Math.min(100, value)));
                if (display) display.textContent = `${Math.round(55 + value * 0.9)}%`;
            }
        }

        function handleVisibility()
        {
            if (!document.hidden && running && frameHandle === null)
            {
                clock.getDelta();
                frameHandle = global.requestAnimationFrame(tick);
            }
            else if (document.hidden && frameHandle !== null)
            {
                global.cancelAnimationFrame(frameHandle);
                frameHandle = null;
            }
        }

        renderer.domElement.addEventListener('pointerdown', onPointerDown);
        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('pointerup', onPointerUp);
        renderer.domElement.addEventListener('pointercancel', onPointerUp);
        renderer.domElement.addEventListener('wheel', onWheel, {passive: false});

        function start()
        {
            if (running) return;
            running = true;
            resize();
            document.addEventListener('visibilitychange', handleVisibility);
            if (reducedMotion) render();
            else frameHandle = global.requestAnimationFrame(tick);
        }

        function stop()
        {
            running = false;
            if (frameHandle !== null) global.cancelAnimationFrame(frameHandle);
            frameHandle = null;
            document.removeEventListener('visibilitychange', handleVisibility);
        }

        function resetFocus()
        {
            focusState = null;
            focusedPlanet = null;
            navigationCommitted = false;
            document.body.classList.remove('solar-system-targeting', 'solar-system-returning');
            for (let index = 0; index < overviewMaterials.length; index++)
            {
                const entry = overviewMaterials[index];
                entry.material.opacity = entry.opacity;
            }
            restoreParticleVisibility();
            setCameraFov(OVERVIEW_FOV);
            render();
        }

        function focusAndNavigate(planetName, url, options = {})
        {
            const target = planetEntries.find((entry) => entry.definition.name === planetName);
            if (!target || !url || navigationCommitted || focusState) return false;
            if ((!global.TransitionManager || typeof global.TransitionManager.navigate !== 'function')
                && typeof options.onArrival !== 'function')
            {
                global.location.href = url;
                return true;
            }

            scene.updateMatrixWorld(true);
            target.body.getWorldPosition(worldPosition);
            const cameraOffset = camera.position.clone().sub(worldPosition).normalize();
            const focusDistance = Math.max(4.2, target.definition.radius
                * (target.definition.rings ? 6.2 : 4.8));
            cameraOffset.multiplyScalar(focusDistance);
            const startLookAt = focusedPlanet
                ? focusedPlanet.body.getWorldPosition(new THREE.Vector3())
                : new THREE.Vector3(0, 0, 0);
            if (focusedPlanet && focusedPlanet !== target)
            {
                system.traverse((object) =>
                {
                    if (!object.isPoints) return;
                    object.visible = isInside(object, target.body)
                        || isInside(object, focusedPlanet.body);
                });
            }
            focusState = {
                mode: 'focus',
                target,
                url,
                onArrival: typeof options.onArrival === 'function' ? options.onArrival : null,
                startedAt: global.performance ? global.performance.now() : Date.now(),
                startCamera: camera.position.clone(),
                endCamera: new THREE.Vector3(),
                cameraOffset,
                liveOffset: cameraOffset.clone(),
                startLookAt,
                lookAt: new THREE.Vector3(),
                worldTarget: worldPosition.clone(),
                handoffStartedAt: 0,
                previousDistance: camera.position.distanceTo(worldPosition),
                lastTelemetryAt: null,
                transitDetail: {
                    planet: target.definition.name,
                    progress: 0,
                    distanceRemaining: 0,
                    approachSpeed: 0,
                    bearing: 0,
                    fov: OVERVIEW_FOV
                },
                transitEvent: null
            };
            if (typeof global.CustomEvent === 'function')
            {
                focusState.transitEvent = new global.CustomEvent('observatory:transit-step', {
                    detail: focusState.transitDetail
                });
            }
            document.body.classList.add('solar-system-targeting');
            if (reducedMotion)
            {
                focusState.endCamera.copy(focusState.worldTarget).add(focusState.liveOffset);
                camera.position.copy(focusState.endCamera);
                camera.lookAt(focusState.worldTarget);
                prepareParticleHandoff();
                navigationCommitted = true;
                if (focusState.onArrival) focusState.onArrival();
                focusedPlanet = target;
                focusedCameraOffset.copy(focusState.liveOffset);
                focusState = null;
                navigationCommitted = false;
                document.body.classList.remove('solar-system-targeting');
                setCameraFov(OVERVIEW_FOV);
            }
            return true;
        }

        function returnToOverview(options = {})
        {
            if (!focusedPlanet || focusState) return false;
            scene.updateMatrixWorld(true);
            focusedPlanet.body.getWorldPosition(worldPosition);
            restoreParticleVisibility();
            focusState = {
                mode: 'return',
                target: focusedPlanet,
                url: 'index.html',
                startedAt: global.performance ? global.performance.now() : Date.now(),
                startCamera: camera.position.clone(),
                endCamera: new THREE.Vector3(0, currentDistance * 0.56, currentDistance),
                liveOffset: new THREE.Vector3(),
                startLookAt: worldPosition.clone(),
                endLookAt: new THREE.Vector3(0, 0, 0),
                lookAt: new THREE.Vector3(),
                worldTarget: worldPosition.clone(),
                onComplete: typeof options.onComplete === 'function' ? options.onComplete : null,
                transitDetail: null,
                transitEvent: null
            };
            navigationCommitted = false;
            document.body.classList.add('solar-system-returning');
            if (reducedMotion)
            {
                camera.position.copy(focusState.endCamera);
                camera.lookAt(focusState.endLookAt);
                focusState = null;
                focusedPlanet = null;
                document.body.classList.remove('solar-system-returning');
                restoreParticleVisibility();
                for (let index = 0; index < overviewMaterials.length; index++)
                {
                    const entry = overviewMaterials[index];
                    entry.material.opacity = entry.opacity;
                }
                setCameraFov(OVERVIEW_FOV);
                if (typeof options.onComplete === 'function') options.onComplete();
            }
            // Keep the current planet in view until the reverse shot completes;
            // the router crossfades the HUD while the canvas remains live.
            return true;
        }

        function dispose()
        {
            stop();
            global.removeEventListener('observatory:quality', handleQualityChange);
            disposables.forEach((resource) => resource && resource.dispose && resource.dispose());
            renderer.dispose();
        }

        const api = {
            start,
            stop,
            resize,
            setScale,
            focusAndNavigate,
            returnToOverview,
            resetFocus,
            dispose,
            render,
            get running() { return running; },
            get planetCount() { return planetEntries.length; }
        };
        if (global.TransitionManager && typeof global.TransitionManager.registerParticleScene === 'function')
        {
            global.TransitionManager.registerParticleScene(scene, camera, renderer);
        }
        global.solarSystemOverview = api;
        return api;
    }

    global.createSolarSystemOverview = createSolarSystemOverview;
})(window);
