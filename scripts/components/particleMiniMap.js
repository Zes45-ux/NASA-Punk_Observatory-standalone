/**
 * Compact particle system map for planet-page navigation.
 *
 * The map is intentionally UI-only: it visualizes orbital motion without
 * adding another celestial-body layer to the main Three.js scene.
 */
(function initParticleMiniMap(global)
{
    const ORBITS = [
        {name: 'mercury', color: '#9ea5ad', radius: 0.10, speed: 0.00042, size: 1.25},
        {name: 'venus',   color: '#eec058', radius: 0.15, speed: 0.00030, size: 1.45},
        {name: 'earth',   color: '#4b70dd', radius: 0.20, speed: 0.00023, size: 1.55},
        {name: 'mars',    color: '#c8434d', radius: 0.25, speed: 0.00018, size: 1.45},
        {name: 'jupiter', color: '#d8ca9d', radius: 0.32, speed: 0.00011, size: 2.4},
        {name: 'saturn',  color: '#e0d0a0', radius: 0.38, speed: 0.000085, size: 2.2},
        {name: 'uranus',  color: '#7fffd4', radius: 0.43, speed: 0.000060, size: 1.8},
        {name: 'neptune', color: '#4b70dd', radius: 0.47, speed: 0.000045, size: 1.8}
    ];

    function createRandom(seed)
    {
        let state = (Number(seed) || 1) >>> 0;
        return function random()
        {
            state += 0x6D2B79F5;
            let value = state;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }

    function createInertMap()
    {
        return {
            start() {},
            stop() {},
            resize() {},
            frame() {},
            running: false,
            particleCount: 0
        };
    }

    function createParticleMiniMap(options = {})
    {
        const document = global.document;
        const canvas   = options.canvas || (document && typeof document.getElementById === 'function'
            ? document.getElementById(options.canvasId || 'system-monitor-particle-canvas')
            : null);

        if (!canvas || typeof canvas.getContext !== 'function')
        {
            return createInertMap();
        }

        const context = canvas.getContext('2d');
        if (!context)
        {
            return createInertMap();
        }

        const count = Math.max(0, Math.min(
            Number.isFinite(options.maxCount) ? options.maxCount : 180,
            Math.floor(options.count || 128)
        ));
        const random = createRandom(options.seed || 20260909);
        const active = options.active || 'sun';
        const motionQuery = options.reducedMotion === true || typeof global.matchMedia !== 'function'
            ? null
            : global.matchMedia('(prefers-reduced-motion: reduce)');
        let reducedMotion = options.reducedMotion === true
            || Boolean(motionQuery && motionQuery.matches);
        const requestFrame = typeof global.requestAnimationFrame === 'function'
            ? global.requestAnimationFrame.bind(global)
            : null;
        const cancelFrame = typeof global.cancelAnimationFrame === 'function'
            ? global.cancelAnimationFrame.bind(global)
            : null;
        const particles = [];

        for (let i = 0; i < count; i++)
        {
            const orbitIndex = i % ORBITS.length;
            const orbit      = ORBITS[orbitIndex];
            particles.push({
                orbitIndex,
                angle   : random() * Math.PI * 2,
                drift   : (0.75 + random() * 0.5) * (random() > 0.5 ? 1 : -1),
                phase   : random() * Math.PI * 2,
                size    : 0.35 + random() * 0.85,
                opacity : 0.18 + random() * 0.42,
                color   : orbit.color
            });
        }

        let viewportWidth  = 260;
        let viewportHeight = 260;
        let pixelRatio     = 1;
        let elapsed        = 0;
        let lastTimestamp  = null;
        let frameHandle    = null;
        let running        = false;

        function now()
        {
            if (global.performance && typeof global.performance.now === 'function')
            {
                return global.performance.now();
            }
            return Date.now();
        }

        function readViewport()
        {
            const rect = typeof canvas.getBoundingClientRect === 'function'
                ? canvas.getBoundingClientRect()
                : null;
            const parentWidth = canvas.parentElement && canvas.parentElement.clientWidth;
            const parentHeight = canvas.parentElement && canvas.parentElement.clientHeight;
            const width = options.width || (rect && rect.width) || canvas.clientWidth || parentWidth || 260;
            const height = options.height || (rect && rect.height) || canvas.clientHeight || parentHeight || width;

            viewportWidth  = Math.max(1, Math.round(width));
            viewportHeight = Math.max(1, Math.round(height));
        }

        function resize()
        {
            readViewport();
            pixelRatio = Math.min(Math.max(global.devicePixelRatio || 1, 1), 2);
            canvas.width  = Math.round(viewportWidth * pixelRatio);
            canvas.height = Math.round(viewportHeight * pixelRatio);
            if (canvas.style)
            {
                canvas.style.width  = `${viewportWidth}px`;
                canvas.style.height = `${viewportHeight}px`;
            }
            if (typeof context.setTransform === 'function')
            {
                context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            }
            if (running && (reducedMotion || !requestFrame))
            {
                draw(lastTimestamp === null ? now() : lastTimestamp);
            }
        }

        function drawOrbit(cx, cy, radius, orbitIndex, mapSize)
        {
            const orbit = ORBITS[orbitIndex];
            context.globalAlpha = 0.12 + orbitIndex * 0.006;
            context.strokeStyle = orbitIndex === 0 ? '#8da9c5' : '#3b4e6b';
            context.lineWidth = orbitIndex === 4 || orbitIndex === 5 ? 0.8 : 0.55;
            context.beginPath();
            if (typeof context.ellipse === 'function')
            {
                context.ellipse(cx, cy, radius, radius * 0.62, 0, 0, Math.PI * 2);
            }
            else
            {
                context.arc(cx, cy, radius * 0.81, 0, Math.PI * 2);
            }
            context.stroke();

            // A few short hash marks make the map read as an instrument panel,
            // while leaving enough empty space for the moving particle stream.
            context.globalAlpha = 0.18;
            context.fillStyle = orbit.color;
            for (let tick = 0; tick < 3; tick++)
            {
                const tickAngle = tick * (Math.PI * 2 / 3) + orbitIndex * 0.35;
                const x = cx + Math.cos(tickAngle) * radius;
                const y = cy + Math.sin(tickAngle) * radius * 0.62;
                context.beginPath();
                context.arc(x, y, mapSize * 0.004, 0, Math.PI * 2);
                context.fill();
            }
        }

        function drawBody(cx, cy, orbit, angle, radius, isActive, mapSize)
        {
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius * 0.62;
            const bodySize = Math.max(mapSize * 0.009, orbit.size);

            // Three concentric point sprites produce a soft glow without a
            // per-frame gradient allocation.
            context.globalAlpha = 0.08;
            context.fillStyle = orbit.color;
            context.beginPath();
            context.arc(x, y, bodySize * 3.8, 0, Math.PI * 2);
            context.fill();
            context.globalAlpha = isActive ? 1 : 0.88;
            context.beginPath();
            context.arc(x, y, bodySize, 0, Math.PI * 2);
            context.fill();

            if (isActive)
            {
                context.globalAlpha = 0.85;
                context.strokeStyle = '#e06236';
                context.lineWidth = 0.9;
                const reticle = bodySize * 3.6;
                const corner = bodySize * 1.5;
                context.beginPath();
                context.moveTo(x - reticle, y - reticle + corner);
                context.lineTo(x - reticle, y - reticle);
                context.lineTo(x - reticle + corner, y - reticle);
                context.moveTo(x + reticle - corner, y - reticle);
                context.lineTo(x + reticle, y - reticle);
                context.lineTo(x + reticle, y - reticle + corner);
                context.moveTo(x - reticle, y + reticle - corner);
                context.lineTo(x - reticle, y + reticle);
                context.lineTo(x - reticle + corner, y + reticle);
                context.moveTo(x + reticle - corner, y + reticle);
                context.lineTo(x + reticle, y + reticle);
                context.lineTo(x + reticle, y + reticle - corner);
                context.stroke();
            }
        }

        function draw(timestamp)
        {
            const current = Number.isFinite(timestamp) ? timestamp : now();
            const delta = lastTimestamp === null ? 0 : Math.min(Math.max(current - lastTimestamp, 0), 80);
            lastTimestamp = current;
            elapsed += delta;

            context.clearRect(0, 0, viewportWidth, viewportHeight);
            context.globalCompositeOperation = 'lighter';

            const mapSize = Math.min(viewportWidth, viewportHeight);
            const centerX = viewportWidth * 0.5;
            const centerY = viewportHeight * 0.5;
            const mapRadius = mapSize * 0.5;

            context.globalAlpha = 0.35;
            context.strokeStyle = '#5b789c';
            context.lineWidth = 0.6;
            context.beginPath();
            context.arc(centerX, centerY, mapRadius * 0.49, 0, Math.PI * 2);
            context.stroke();

            ORBITS.forEach((orbit, orbitIndex) =>
            {
                drawOrbit(centerX, centerY, mapSize * orbit.radius, orbitIndex, mapSize);
            });

            particles.forEach((particle) =>
            {
                const orbit = ORBITS[particle.orbitIndex];
                if (!reducedMotion)
                {
                    particle.angle += orbit.speed * particle.drift * delta;
                }

                const radius = mapSize * orbit.radius;
                const wobble = reducedMotion ? 0 : Math.sin(elapsed * 0.0007 + particle.phase) * mapSize * 0.002;
                const x = centerX + Math.cos(particle.angle) * (radius + wobble);
                const y = centerY + Math.sin(particle.angle) * (radius + wobble) * 0.62;
                const twinkle = reducedMotion ? 1 : 0.7 + Math.sin(elapsed * 0.002 + particle.phase) * 0.3;

                context.globalAlpha = particle.opacity * twinkle;
                context.fillStyle = particle.color;
                context.beginPath();
                context.arc(x, y, Math.max(0.45, particle.size * mapSize * 0.004), 0, Math.PI * 2);
                context.fill();
            });

            ORBITS.forEach((orbit, orbitIndex) =>
            {
                const phase = orbitIndex * 0.83;
                const angle = phase + (reducedMotion ? 0 : elapsed * orbit.speed);
                drawBody(
                    centerX,
                    centerY,
                    orbit,
                    angle,
                    mapSize * orbit.radius,
                    active === orbit.name,
                    mapSize
                );
            });

            const starPulse = reducedMotion ? 1 : 1 + Math.sin(elapsed * 0.0025) * 0.14;
            context.globalAlpha = 0.14;
            context.fillStyle = '#ffb84d';
            context.beginPath();
            context.arc(centerX, centerY, mapSize * 0.047 * starPulse, 0, Math.PI * 2);
            context.fill();
            context.globalAlpha = 1;
            context.fillStyle = '#fff5cc';
            context.beginPath();
            context.arc(centerX, centerY, Math.max(2, mapSize * 0.017), 0, Math.PI * 2);
            context.fill();

            if (active === 'sun')
            {
                context.globalAlpha = 0.85;
                context.strokeStyle = '#e06236';
                context.lineWidth = 0.9;
                const reticle = mapSize * 0.075;
                const corner = mapSize * 0.024;
                context.beginPath();
                context.moveTo(centerX - reticle, centerY - reticle + corner);
                context.lineTo(centerX - reticle, centerY - reticle);
                context.lineTo(centerX - reticle + corner, centerY - reticle);
                context.moveTo(centerX + reticle - corner, centerY - reticle);
                context.lineTo(centerX + reticle, centerY - reticle);
                context.lineTo(centerX + reticle, centerY - reticle + corner);
                context.moveTo(centerX - reticle, centerY + reticle - corner);
                context.lineTo(centerX - reticle, centerY + reticle);
                context.lineTo(centerX - reticle + corner, centerY + reticle);
                context.moveTo(centerX + reticle - corner, centerY + reticle);
                context.lineTo(centerX + reticle, centerY + reticle);
                context.lineTo(centerX + reticle, centerY + reticle - corner);
                context.stroke();
            }

            const scanAngle = reducedMotion ? 0 : elapsed * 0.0011;
            context.globalAlpha = 0.68;
            context.strokeStyle = '#5b789c';
            context.lineWidth = 0.7;
            context.beginPath();
            context.moveTo(centerX, centerY);
            context.lineTo(
                centerX + Math.cos(scanAngle) * mapRadius * 0.48,
                centerY + Math.sin(scanAngle) * mapRadius * 0.48
            );
            context.stroke();

            context.globalAlpha = 1;
            context.globalCompositeOperation = 'source-over';
        }

        function tick(timestamp)
        {
            if (!running)
            {
                return;
            }
            frameHandle = null;
            draw(timestamp);
            if (running && !reducedMotion && requestFrame)
            {
                frameHandle = requestFrame(tick);
            }
        }

        function start()
        {
            if (running)
            {
                return;
            }
            resize();
            running = true;
            lastTimestamp = null;
            if (!reducedMotion && requestFrame)
            {
                frameHandle = requestFrame(tick);
            }
            else
            {
                draw(now());
            }
        }

        function stop()
        {
            running = false;
            if (frameHandle !== null && cancelFrame)
            {
                cancelFrame(frameHandle);
            }
            frameHandle = null;
            lastTimestamp = null;
        }

        function handleMotionChange(event)
        {
            reducedMotion = Boolean(event ? event.matches : motionQuery && motionQuery.matches);
            if (reducedMotion)
            {
                if (frameHandle !== null && cancelFrame)
                {
                    cancelFrame(frameHandle);
                }
                frameHandle = null;
                lastTimestamp = null;
                if (running)
                {
                    draw(now());
                }
                return;
            }

            if (running && frameHandle === null && requestFrame)
            {
                frameHandle = requestFrame(tick);
            }
        }

        if (motionQuery)
        {
            if (typeof motionQuery.addEventListener === 'function')
            {
                motionQuery.addEventListener('change', handleMotionChange);
            }
            else if (typeof motionQuery.addListener === 'function')
            {
                motionQuery.addListener(handleMotionChange);
            }
        }

        return {
            start,
            stop,
            resize,
            frame: draw,
            get running() { return running; },
            get particleCount() { return count; }
        };
    }

    global.createParticleMiniMap = createParticleMiniMap;
})(window);
