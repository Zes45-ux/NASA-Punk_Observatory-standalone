/**
 * Interactive particle solar-system overview for the default landing page.
 * Planet proportions and orbital gaps are deliberately compressed so all nine
 * bodies remain legible as one navigable astronomical thumbnail.
 */
(function initSolarSystemOverview(global)
{
    const PLANETS = [
        {name: 'sun',     orbit: 0,    phase: 0,     radius: 4.9,  particles: 6200, color: '#ff8b24', accent: '#fff4bf', speed: 0,     atmosphere: 1.12},
        {name: 'mercury', orbit: 10.5, phase: -0.65, radius: 0.62, particles: 780,  color: '#736f6b', accent: '#d7d0c7', speed: 0.48},
        {name: 'venus',   orbit: 16.5, phase: 0.8,   radius: 0.98, particles: 1250, color: '#b65325', accent: '#ffd083', speed: 0.34, atmosphere: 1.06},
        {name: 'earth',   orbit: 23,   phase: 2.35,  radius: 1.04, particles: 1500, color: '#1e4f8e', accent: '#7fc08a', speed: 0.28, atmosphere: 1.045},
        {name: 'mars',    orbit: 30,   phase: -2.4,  radius: 0.76, particles: 980,  color: '#8f2e1c', accent: '#e58b59', speed: 0.23},
        {name: 'jupiter', orbit: 41,   phase: -0.35, radius: 2.55, particles: 3400, color: '#8d5038', accent: '#f0d3a5', speed: 0.14, atmosphere: 1.035},
        {name: 'saturn',  orbit: 52,   phase: 1.05,  radius: 2.1,  particles: 2900, color: '#a88c55', accent: '#f3e3b1', speed: 0.11, rings: true, atmosphere: 1.035},
        {name: 'uranus',  orbit: 62,   phase: 2.8,   radius: 1.52, particles: 2050, color: '#4c98a9', accent: '#c3f5f2', speed: 0.08, rings: true, atmosphere: 1.045},
        {name: 'neptune', orbit: 71,   phase: -2.8,  radius: 1.5,  particles: 2050, color: '#173f9b', accent: '#6fa7ff', speed: 0.065, atmosphere: 1.04}
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

        const FOCUS_DURATION_MS = 1080;

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

        function createParticleSphere(definition, index)
        {
            const count = Math.max(180, Math.round(definition.particles * density));
            const positions = new Float32Array(count * 3);
            const colors = new Float32Array(count * 3);
            const base = new THREE.Color(definition.color);
            const accent = new THREE.Color(definition.accent);
            const mixed = new THREE.Color();
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

                let blend = 0.16 + random() * 0.38;
                if (definition.name === 'earth')
                {
                    const terrain = Math.sin(theta * 2.7 + y * 4.2)
                        + Math.sin(theta * 6.1 - y * 7.4) * 0.42;
                    blend = terrain > 0.38 ? 0.82 : 0.08 + random() * 0.16;
                    if (Math.abs(y) > 0.88) blend = 1;
                }
                else if (['venus', 'jupiter', 'saturn', 'uranus', 'neptune'].includes(definition.name))
                {
                    const bandFrequency = definition.name === 'jupiter' ? 11 : 8;
                    blend = 0.1 + (Math.sin(y * Math.PI * bandFrequency + index) * 0.5 + 0.5) * 0.68;
                }
                else if (definition.name === 'sun')
                {
                    blend = Math.pow(random(), 0.65);
                }
                mixed.copy(base).lerp(accent, blend).multiplyScalar(0.78 + random() * 0.4);
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
                const haloMaterial = track(new THREE.PointsMaterial({
                    size: definition.name === 'sun' ? 0.32 : 0.24,
                    map: particleTexture,
                    alphaTest: 0.01,
                    color: definition.accent,
                    transparent: true,
                    opacity: definition.name === 'sun' ? 0.18 : 0.1,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    sizeAttenuation: true
                }));
                const halo = new THREE.Points(geometry, haloMaterial);
                halo.scale.setScalar(definition.atmosphere);
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
            const base = new THREE.Color(definition.accent);
            for (let i = 0; i < count; i++)
            {
                const angle = random() * Math.PI * 2;
                const radius = definition.radius * (1.45 + random() * 0.65);
                const offset = i * 3;
                positions[offset] = Math.cos(angle) * radius;
                positions[offset + 1] = (random() - 0.5) * 0.055;
                positions[offset + 2] = Math.sin(angle) * radius;
                const brightness = 0.5 + random() * 0.5;
                colors[offset] = base.r * brightness;
                colors[offset + 1] = base.g * brightness;
                colors[offset + 2] = base.b * brightness;
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
                opacity: definition.name === 'saturn' ? 0.72 : 0.38,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            }));
            const rings = new THREE.Points(geometry, material);
            rings.rotation.x = definition.name === 'uranus' ? Math.PI * 0.48 : Math.PI * 0.08;
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

        function updateFocus(timestamp)
        {
            const elapsed = Math.max(0, timestamp - focusState.startedAt);
            const progress = Math.min(1, elapsed / FOCUS_DURATION_MS);
            const eased = 1 - Math.pow(1 - progress, 3);
            focusState.target.body.getWorldPosition(focusState.worldTarget);
            focusState.endCamera.copy(focusState.worldTarget).add(focusState.cameraOffset);
            camera.position.lerpVectors(focusState.startCamera, focusState.endCamera, eased);
            focusState.lookAt.lerpVectors(focusState.startLookAt, focusState.worldTarget, eased);
            camera.lookAt(focusState.lookAt);

            const fade = 1 - smoothstep(progress / 0.72);
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
                startLookAt: new THREE.Vector3(0, 0, 0),
                lookAt: new THREE.Vector3(),
                worldTarget: worldPosition.clone()
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
