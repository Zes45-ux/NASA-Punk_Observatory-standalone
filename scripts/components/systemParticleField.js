/**
 * Lightweight orbital dust field for the system overview.
 *
 * This layer is intentionally separate from the topographic canvas: the
 * topology only redraws when its static field changes, while this canvas
 * updates a small, deterministic set of dust sprites every frame.
 */
(function initSystemParticleField(global)
{
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

    function createSystemParticleField(options = {})
    {
        const document = global.document;
        const canvasId = options.canvasId || 'system-particle-canvas';
        const canvas   = document && typeof document.getElementById === 'function'
            ? document.getElementById(canvasId)
            : null;

        if (!canvas || typeof canvas.getContext !== 'function')
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

        const context = canvas.getContext('2d');
        if (!context)
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

        const maxCount = Number.isFinite(options.maxCount) ? options.maxCount : 420;
        const count    = Math.max(0, Math.min(maxCount, Math.floor(options.count || 240)));
        const random   = createRandom(options.seed || 20260906);
        const bands    = Math.max(1, Math.floor(options.bands || 6));
        const particles = [];

        for (let i = 0; i < count; i++)
        {
            const band = i % bands;
            particles.push({
                band,
                angle     : random() * Math.PI * 2,
                radiusX   : 0.13 + band * 0.067 + random() * 0.035,
                radiusY   : 0.028 + band * 0.008 + random() * 0.012,
                speed     : (0.000045 + random() * 0.000055) * (band % 2 ? -1 : 1),
                phase     : random() * Math.PI * 2,
                size      : 0.45 + random() * 1.25,
                opacity   : 0.16 + random() * 0.42,
                brightness: 0.65 + random() * 0.35
            });
        }

        const reducedMotion = options.reducedMotion === true
            || (typeof global.matchMedia === 'function'
                && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const requestFrame = typeof global.requestAnimationFrame === 'function'
            ? global.requestAnimationFrame.bind(global)
            : null;
        const cancelFrame = typeof global.cancelAnimationFrame === 'function'
            ? global.cancelAnimationFrame.bind(global)
            : null;

        let viewportWidth  = 1;
        let viewportHeight = 1;
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

        function resize()
        {
            viewportWidth  = Math.max(1, Math.round(global.innerWidth || 1));
            viewportHeight = Math.max(1, Math.round(global.innerHeight || 1));
            pixelRatio     = Math.min(Math.max(global.devicePixelRatio || 1, 1), 2);
            canvas.width   = Math.round(viewportWidth * pixelRatio);
            canvas.height  = Math.round(viewportHeight * pixelRatio);
            if (canvas.style)
            {
                canvas.style.width  = `${viewportWidth}px`;
                canvas.style.height = `${viewportHeight}px`;
            }
            if (typeof context.setTransform === 'function')
            {
                context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            }
        }

        function draw(timestamp)
        {
            const current = Number.isFinite(timestamp) ? timestamp : now();
            const delta   = lastTimestamp === null ? 0 : Math.min(Math.max(current - lastTimestamp, 0), 80);
            lastTimestamp = current;
            elapsed += delta;

            context.clearRect(0, 0, viewportWidth, viewportHeight);
            context.globalCompositeOperation = 'lighter';

            const centerX = viewportWidth * 0.5;
            const centerY = viewportHeight * 0.51;
            particles.forEach((particle) =>
            {
                if (!reducedMotion)
                {
                    particle.angle += particle.speed * delta;
                }

                const breathe = Math.sin(elapsed * 0.00035 + particle.phase) * 0.006;
                const x = centerX + Math.cos(particle.angle) * viewportWidth * (particle.radiusX + breathe);
                const y = centerY + Math.sin(particle.angle) * viewportHeight * particle.radiusY;
                const twinkle = 0.72 + Math.sin(elapsed * 0.0018 + particle.phase) * 0.28;

                context.globalAlpha = particle.opacity * twinkle;
                context.fillStyle = particle.band % 3 === 0 ? '#d7ab61' : '#8da9c5';
                context.beginPath();
                context.arc(x, y, particle.size * particle.brightness, 0, Math.PI * 2);
                context.fill();
            });

            context.globalAlpha = 1;
            context.globalCompositeOperation = 'source-over';
        }

        function tick(timestamp)
        {
            if (!running)
            {
                return;
            }
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
            running       = true;
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
            frameHandle   = null;
            lastTimestamp = null;
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

    global.createSystemParticleField = createSystemParticleField;
})(window);
