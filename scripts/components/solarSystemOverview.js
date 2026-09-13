/**
 * Interactive particle solar-system overview for the default landing page.
 * Planet proportions and orbital gaps are deliberately compressed so all nine
 * bodies remain legible as one navigable astronomical thumbnail.
 */
(function initSolarSystemOverview(global)
{
    const PLANETS = [
        {name: 'sun',     orbit: 0,    phase: 0,     radius: 4.9,  particles: 6200, color: '#cc4400', accent: '#ffffff', speed: 0,     atmosphere: {scale: 1.14, color: '#ffb84d', opacity: 0.2}},
        {name: 'mercury', orbit: 10.5, phase: -0.65, radius: 0.62, particles: 780,  color: '#999999', accent: '#cccccc', speed: 0.48},
        {name: 'venus',   orbit: 16.5, phase: 0.8,   radius: 0.98, particles: 1250, color: '#8b1a1a', accent: '#ffe0a0', speed: 0.34, atmosphere: {scale: 1.045, color: '#ffae20', opacity: 0.22, spin: -0.34}},
        {name: 'earth',   orbit: 23,   phase: 2.35,  radius: 1.04, particles: 1500, color: '#1a2b4a', accent: '#9abf8a', speed: 0.28, atmosphere: {scale: 1.045, color: '#ffffff', opacity: 0.14, spin: 0.2}},
        {name: 'mars',    orbit: 30,   phase: -2.4,  radius: 0.76, particles: 980,  color: '#94544d', accent: '#d98c6b', speed: 0.23, atmosphere: {scale: 1.055, color: '#ffc840', opacity: 0.1}},
        {name: 'jupiter', orbit: 41,   phase: -0.35, radius: 2.55, particles: 3400, color: '#c28266', accent: '#f0e2c2', speed: 0.14, atmosphere: {scale: 1.028, color: '#ffe699', opacity: 0.12}},
        {name: 'saturn',  orbit: 52,   phase: 1.05,  radius: 2.1,  particles: 2900, color: '#d9c37c', accent: '#f4f0d5', speed: 0.11, rings: 'saturn', atmosphere: {scale: 1.035, color: '#f4f0d5', opacity: 0.1}},
        {name: 'uranus',  orbit: 62,   phase: 2.8,   radius: 1.52, particles: 2050, color: '#4a9cb8', accent: '#e0ffff', speed: 0.08, rings: 'uranus', atmosphere: {scale: 1.04, color: '#66e6ff', opacity: 0.14}},
        {name: 'neptune', orbit: 71,   phase: -2.8,  radius: 1.5,  particles: 2050, color: '#1a237e', accent: '#448aff', speed: 0.065, rings: 'neptune'}
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
        const density = profileRatios[options.profile] || 0.78;
        const reducedMotion = typeof global.matchMedia === 'function'
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
        const renderer = new THREE.WebGLRenderer({alpha: true, antialias: false, powerPreference: 'high-performance'});
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.75));
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
        const labels = new Map();
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
        let navigationCommitted = false;

        const FOCUS_DURATION_MS = 1280;

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
            const noise = global.SimplexNoise
                ? new global.SimplexNoise(`overview-${definition.name}`)
                : null;
            const palette = {};
            const colors = {
                sun: ['#8a1c00', '#cc4400', '#ffb84d', '#ffffff'],
                mercury: ['#555555', '#999999', '#cccccc'],
                venus: ['#8b1a1a', '#d9531e', '#ffe0a0'],
                earth: ['#1a2b4a', '#3e6b48', '#9abf8a', '#ffffff'],
                mars: ['#6b433c', '#94544d', '#d98c6b'],
                jupiter: ['#787878', '#8a3f2d', '#c28266', '#d6c7a5', '#f0e2c2'],
                saturn: ['#6b7e8c', '#a68f58', '#d9c37c', '#f4f0d5'],
                uranus: ['#4a9cb8', '#a4d8e6', '#e0ffff'],
                neptune: ['#0d1238', '#1a237e', '#2962ff', '#448aff']
            }[definition.name];
            colors.forEach((color, index) => { palette[index] = new THREE.Color(color); });
            const sampled = new THREE.Color();
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
                    sampled.copy(crater > 0.72 ? palette[0] : (baseNoise > 0.2 ? palette[2] : palette[1]));
                }
                else if (definition.name === 'jupiter')
                {
                    const latitude = Math.abs(ny);
                    const signal = Math.sin(Math.sign(ny) * Math.pow(latitude, 1.4) * 12
                        + readNoise(nx, ny, nz, 3.2, 0.9, 3.2) * 1.2);
                    if (latitude > 0.85) sampled.copy(palette[3]).lerp(palette[0], (latitude - 0.85) * 4);
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
                }
                sampled.multiplyScalar(0.88 + random() * 0.24);
                return sampled;
            };
        }

        function createParticleSphere(definition, index)
        {
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
            cloud.add(new THREE.Points(geometry, material));
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
                cloud.add(halo);
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
            const count = Math.round((definition.name === 'saturn' ? 1600 : 700) * density);
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const ringColor = new THREE.Color();
            for (let i = 0; i < count; i++)
            {
                const angle = random() * Math.PI * 2;
                const radius = definition.radius * (1.38 + random() * (definition.rings === 'saturn' ? 0.95 : 0.72));
                const offset = i * 3;
                positions[offset] = Math.cos(angle) * radius;
                positions[offset + 1] = (random() - 0.5) * 0.055;
                positions[offset + 2] = Math.sin(angle) * radius;
                const normalized = (radius / definition.radius - 1.38)
                    / (definition.rings === 'saturn' ? 0.95 : 0.72);
                if (definition.rings === 'saturn')
                {
                    ringColor.set(normalized < 0.28 ? '#4a3b2a' : (normalized < 0.72 ? '#f0e4c0' : '#a0b0c0'));
                }
                else if (definition.rings === 'uranus')
                {
                    ringColor.set(normalized > 0.76 ? '#40e0d0' : '#2a4f50');
                }
                else
                {
                    ringColor.set(normalized > 0.62 ? '#88aaff' : '#5566aa');
                }
                const brightness = 0.55 + random() * 0.55;
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
            rings.rotation.x = definition.rings === 'uranus' ? Math.PI * 0.48 : Math.PI * 0.08;
            rings.userData.overviewSpin = definition.rings === 'neptune' ? 0.42 : 0.18;
            effectLayers.push(rings);
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
            system.add(new THREE.Points(geometry, material));
        }

        PLANETS.forEach((definition, index) =>
        {
            if (definition.orbit > 0) createOrbit(definition.orbit, index);
            const orbitPivot = new THREE.Group();
            const body = new THREE.Group();
            const particles = createParticleSphere(definition, index);
            body.add(particles);
            if (definition.rings) createRings(body, definition);
            orbitPivot.add(body);
            system.add(orbitPivot);
            const angle = definition.phase;
            orbitPivot.rotation.y = angle;
            body.position.set(definition.orbit, 0, 0);
            body.scale.z = 0.98;
            planetEntries.push({definition, orbitPivot, body, particles, angle});
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

        system.traverse((object) =>
        {
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.filter(Boolean).forEach((material) =>
            {
                if (!Number.isFinite(material.opacity)) return;
                overviewMaterials.push({object, material, opacity: material.opacity});
            });
        });

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

        function smootherstep(value)
        {
            const t = Math.max(0, Math.min(1, value));
            return t * t * t * (t * (t * 6 - 15) + 10);
        }

        function updateFocus(timestamp)
        {
            const elapsed = Math.max(0, timestamp - focusState.startedAt);
            const progress = Math.min(1, elapsed / FOCUS_DURATION_MS);
            const eased = smootherstep(progress);
            const handoffProgress = navigationCommitted
                ? Math.min(1, (timestamp - focusState.handoffStartedAt) / 720)
                : 0;
            focusState.target.body.getWorldPosition(focusState.worldTarget);
            focusState.liveOffset.copy(focusState.cameraOffset)
                .multiplyScalar(1 - smootherstep(handoffProgress) * 0.1);
            focusState.endCamera.copy(focusState.worldTarget).add(focusState.liveOffset);
            camera.position.lerpVectors(focusState.startCamera, focusState.endCamera, eased);
            focusState.lookAt.lerpVectors(focusState.startLookAt, focusState.worldTarget, eased);
            camera.lookAt(focusState.lookAt);

            const fade = 1 - smoothstep(progress / 0.86);
            overviewMaterials.forEach((entry) =>
            {
                const belongsToTarget = isInside(entry.object, focusState.target.body)
                    || (focusState.target.definition.name === 'sun' && entry.object === sunGlow);
                entry.material.opacity = entry.opacity * (belongsToTarget ? 1 : fade);
            });
            return progress >= 1;
        }

        function prepareParticleHandoff()
        {
            system.traverse((object) =>
            {
                if (!object.isPoints) return;
                object.visible = isInside(object, focusState.target.body);
            });
        }

        function updateLabels()
        {
            const rect = container.getBoundingClientRect();
            planetEntries.forEach((entry) =>
            {
                const label = labels.get(entry.definition.name);
                if (!label) return;
                if (focusState && entry !== focusState.target)
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
                label.style.transform = `translate3d(${(projected.x * 0.5 + 0.5) * rect.width}px, ${(-projected.y * 0.5 + 0.5) * rect.height}px, 0)`;
                label.style.setProperty('--target-depth', String(1 - Math.max(0, projected.z) * 0.42));
            });
        }

        function render(timestamp = global.performance ? global.performance.now() : Date.now())
        {
            let focusComplete = false;
            if (focusState)
            {
                focusComplete = updateFocus(timestamp);
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
            }
            renderer.render(scene, camera);
            updateLabels();

            if (focusComplete && !navigationCommitted)
            {
                navigationCommitted = true;
                focusState.handoffStartedAt = timestamp;
                prepareParticleHandoff();
                global.TransitionManager.navigate(focusState.url);
            }
        }

        function tick(timestamp)
        {
            if (!running) return;
            const delta = Math.min(clock.getDelta(), 0.05);
            if (!reducedMotion && !focusState)
            {
                planetEntries.forEach((entry, index) =>
                {
                    if (index > 0) entry.orbitPivot.rotation.y += entry.definition.speed * delta * 0.22;
                    entry.particles.rotation.y += delta * (entry.definition.name === 'sun' ? 0.055 : 0.12);
                });
            }
            else if (!reducedMotion && focusState)
            {
                focusState.target.particles.rotation.y += delta * 0.08;
            }
            if (!reducedMotion)
            {
                effectLayers.forEach((layer) =>
                {
                    layer.rotation.y += delta * layer.userData.overviewSpin;
                });
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
            render();
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
            navigationCommitted = false;
            document.body.classList.remove('solar-system-targeting');
            overviewMaterials.forEach((entry) => { entry.material.opacity = entry.opacity; });
            system.traverse((object) =>
            {
                if (object.isPoints) object.visible = true;
            });
            render();
        }

        function focusAndNavigate(planetName, url)
        {
            const target = planetEntries.find((entry) => entry.definition.name === planetName);
            if (!target || !url || navigationCommitted || focusState) return false;
            if (!global.TransitionManager || typeof global.TransitionManager.navigate !== 'function')
            {
                global.location.href = url;
                return true;
            }
            if (reducedMotion)
            {
                global.TransitionManager.navigate(url);
                return true;
            }

            scene.updateMatrixWorld(true);
            target.body.getWorldPosition(worldPosition);
            const cameraOffset = camera.position.clone().sub(worldPosition).normalize();
            const focusDistance = Math.max(4.2, target.definition.radius
                * (target.definition.rings ? 6.2 : 4.8));
            cameraOffset.multiplyScalar(focusDistance);
            focusState = {
                target,
                url,
                startedAt: global.performance ? global.performance.now() : Date.now(),
                startCamera: camera.position.clone(),
                endCamera: new THREE.Vector3(),
                cameraOffset,
                liveOffset: new THREE.Vector3(),
                startLookAt: new THREE.Vector3(0, 0, 0),
                lookAt: new THREE.Vector3(),
                worldTarget: worldPosition.clone(),
                handoffStartedAt: 0
            };
            document.body.classList.add('solar-system-targeting');
            return true;
        }

        function dispose()
        {
            stop();
            disposables.forEach((resource) => resource && resource.dispose && resource.dispose());
            renderer.dispose();
        }

        const api = {
            start,
            stop,
            resize,
            setScale,
            focusAndNavigate,
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
