/**
 * NASA-Punk Transition System
 */
(function initTransitionSystem(global)
{
    const READY_TIMEOUT_MS = 1500;
    const DEFAULT_EXIT_MS = 480;
    const MAX_EXIT_MS = 1200;
    const PARTICLE_EXIT_MS = 720;
    const PARTICLE_BRIDGE_MS = 1850;
    const PARTICLE_LIMIT = 1800;
    const BRIDGE_STORAGE_KEY = 'observatory-particle-bridge-v2';
    let revealed = false;
    let navigating = false;
    let cancelNavigation = null;
    let readyTimer = null;
    let bridgeFrame = null;
    let continuingParticleBridge = false;
    let registeredParticleScene = null;

    function isReducedMotionRequested()
    {
        return typeof global.matchMedia === 'function'
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function createCurtainMarkup()
    {
        return `
                <div class="curtain-col c1"></div>
                <div class="curtain-col c2"></div>
                <div class="curtain-col c3"></div>
                <div class="curtain-col c4"></div>
            `;
    }

    function ensureCurtain()
    {
        let curtain = document.getElementById('global-curtain');
        if (!curtain)
        {
            curtain           = document.createElement('div');
            curtain.className = 'transition-curtain';
            curtain.id        = 'global-curtain';
            curtain.innerHTML = createCurtainMarkup();
            document.body.appendChild(curtain);
        }
        return curtain;
    }

    function readBridgeState()
    {
        try
        {
            if (!global.sessionStorage) return null;
            const state = JSON.parse(global.sessionStorage.getItem(BRIDGE_STORAGE_KEY));
            return state && Array.isArray(state.particles) ? state : null;
        }
        catch (error)
        {
            return null;
        }
    }

    function storeBridgeState(state)
    {
        try
        {
            if (global.sessionStorage)
            {
                global.sessionStorage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(state));
            }
        }
        catch (error)
        {
            // file://、隐私模式或存储配额不足时，仅退化为当前页逸散。
        }
    }

    function clearBridgeState()
    {
        try
        {
            if (global.sessionStorage) global.sessionStorage.removeItem(BRIDGE_STORAGE_KEY);
        }
        catch (error)
        {
            // 忽略不可用的会话存储。
        }
    }

    function hash(value)
    {
        const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
        return x - Math.floor(x);
    }

    function createBridgeState(url, candidates, paletteCounts, center, viewport)
    {
        if (candidates.length < 24) return null;
        const paletteKeys = Array.from(paletteCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(entry => entry[0]);
        const palette = paletteKeys.map((key) =>
        {
            const r = ((key >> 6) & 7) * 32 + 16;
            const g = ((key >> 3) & 7) * 32 + 16;
            const b = (key & 7) * 32 + 16;
            return `rgb(${r},${g},${b})`;
        });
        const nearestPalette = (colorKey) =>
        {
            const r = (colorKey >> 6) & 7;
            const g = (colorKey >> 3) & 7;
            const b = colorKey & 7;
            let nearest = 0;
            let nearestDistance = Infinity;
            paletteKeys.forEach((key, index) =>
            {
                const dr = r - ((key >> 6) & 7);
                const dg = g - ((key >> 3) & 7);
                const db = b - (key & 7);
                const distance = dr * dr + dg * dg + db * db;
                if (distance < nearestDistance)
                {
                    nearest = index;
                    nearestDistance = distance;
                }
            });
            return nearest;
        };

        const count = Math.min(PARTICLE_LIMIT, candidates.length);
        const particles = [];
        for (let index = 0; index < count; index += 1)
        {
            const candidate = candidates[Math.floor(index * candidates.length / count)];
            const x = candidate[0];
            const y = candidate[1];
            const dx = x - center.x;
            const dy = y - center.y;
            const length = Math.max(18, Math.sqrt(dx * dx + dy * dy));
            const random = hash(index + x * 0.31 + y * 0.73);
            const speed = 150 + random * 260;
            const swirl = (hash(index * 1.91) - 0.5) * 180;
            const vx = dx / length * speed - dy / length * swirl;
            const vy = dy / length * speed + dx / length * swirl;
            const size = 0.75 + candidate[2] / 255 * 1.1 + hash(index * 3.17) * 0.45;
            particles.push([
                Math.round(x * 2) / 2,
                Math.round(y * 2) / 2,
                Math.round(vx),
                Math.round(vy),
                Math.round(size * 10) / 10,
                nearestPalette(candidate[3]),
                Math.round(hash(index * 7.13) * 628) / 100
            ]);
        }

        return {
            version: 2,
            startedAt: Date.now(),
            duration: PARTICLE_BRIDGE_MS,
            width: viewport.width,
            height: viewport.height,
            target: String(url).split('/').pop().split(/[?#]/)[0],
            palette,
            particles
        };
    }

    function captureRegisteredParticleScene(url)
    {
        const registration = registeredParticleScene;
        const THREE = global.THREE;
        if (!registration || !THREE) return null;
        const {scene, camera, renderer} = registration;
        const canvas = renderer && renderer.domElement;
        if (!canvas || typeof canvas.getBoundingClientRect !== 'function') return null;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return null;

        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const layers = [];
        scene.traverse((object) =>
        {
            const position = object && object.geometry && object.geometry.attributes
                ? object.geometry.attributes.position
                : null;
            if (!object.visible || !object.isPoints || !position || position.count < 1) return;
            const drawCount = object.geometry.drawRange && Number.isFinite(object.geometry.drawRange.count)
                ? object.geometry.drawRange.count
                : position.count;
            const count = Math.min(position.count, Math.max(0, drawCount));
            if (count > 0) layers.push({object, position, count, weight: Math.sqrt(count)});
        });
        if (layers.length === 0) return null;

        const totalWeight = layers.reduce((sum, layer) => sum + layer.weight, 0);
        const reserved = Math.min(28, Math.max(8, Math.floor(PARTICLE_LIMIT / layers.length * 0.3)));
        const flexible = Math.max(0, PARTICLE_LIMIT - reserved * layers.length);
        const candidates = [];
        const paletteCounts = new Map();
        const vector = new THREE.Vector3();
        layers.forEach((layer, layerIndex) =>
        {
            const quota = Math.max(1, Math.min(layer.count,
                reserved + Math.floor(flexible * layer.weight / totalWeight)));
            const attempts = Math.min(layer.count, quota * 3);
            const stride = layer.count / attempts;
            const material = Array.isArray(layer.object.material)
                ? layer.object.material[0]
                : layer.object.material;
            const materialColor = material && material.color ? material.color : {r: 1, g: 1, b: 1};
            const color = layer.object.geometry.attributes.color;
            const alpha = Math.round(255 * Math.max(0.15,
                material && Number.isFinite(material.opacity) ? material.opacity : 1));
            let accepted = 0;
            for (let attempt = 0; attempt < attempts && accepted < quota && candidates.length < PARTICLE_LIMIT; attempt += 1)
            {
                const index = Math.min(layer.count - 1,
                    Math.floor((attempt + hash(layerIndex * 17.3)) * stride));
                vector.fromBufferAttribute(layer.position, index);
                vector.applyMatrix4(layer.object.matrixWorld);
                vector.project(camera);
                if (vector.z < -1 || vector.z > 1 || Math.abs(vector.x) > 1.15 || Math.abs(vector.y) > 1.15) continue;
                const r = Math.min(255, Math.max(0, Math.round(255 * materialColor.r * (color ? color.getX(index) : 1))));
                const g = Math.min(255, Math.max(0, Math.round(255 * materialColor.g * (color ? color.getY(index) : 1))));
                const b = Math.min(255, Math.max(0, Math.round(255 * materialColor.b * (color ? color.getZ(index) : 1))));
                const colorKey = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
                paletteCounts.set(colorKey, (paletteCounts.get(colorKey) || 0) + 1);
                candidates.push([
                    rect.left + (vector.x + 1) * 0.5 * rect.width,
                    rect.top + (1 - vector.y) * 0.5 * rect.height,
                    alpha,
                    colorKey
                ]);
                accepted += 1;
            }
        });

        return createBridgeState(url, candidates, paletteCounts, {
            x: rect.left + rect.width * 0.5,
            y: rect.top + rect.height * 0.5
        }, {
            width: global.innerWidth || rect.width,
            height: global.innerHeight || rect.height
        });
    }

    function captureCanvasParticleBridge(url)
    {
        if (!document.querySelector || !document.createElement) return null;
        const source = document.querySelector('#canvas-container canvas');
        if (!source || typeof source.getBoundingClientRect !== 'function') return null;
        const rect = source.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return null;

        const sample = document.createElement('canvas');
        const sampleWidth = Math.min(420, Math.max(180, Math.round(rect.width * 0.36)));
        const sampleHeight = Math.max(100, Math.round(sampleWidth * rect.height / rect.width));
        sample.width = sampleWidth;
        sample.height = sampleHeight;
        const context = sample.getContext && sample.getContext('2d', {willReadFrequently: true});
        if (!context) return null;

        let pixels;
        try
        {
            context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
            pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
        }
        catch (error)
        {
            return null;
        }

        const candidates = [];
        const paletteCounts = new Map();
        for (let y = 0; y < sampleHeight; y += 1)
        {
            for (let x = 0; x < sampleWidth; x += 1)
            {
                const offset = (y * sampleWidth + x) * 4;
                const alpha = pixels[offset + 3];
                if (alpha < 12) continue;
                const r = pixels[offset];
                const g = pixels[offset + 1];
                const b = pixels[offset + 2];
                if (r + g + b < 32) continue;
                const colorKey = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
                paletteCounts.set(colorKey, (paletteCounts.get(colorKey) || 0) + 1);
                candidates.push([
                    rect.left + (x + 0.5) / sampleWidth * rect.width,
                    rect.top + (y + 0.5) / sampleHeight * rect.height,
                    alpha,
                    colorKey
                ]);
            }
        }
        return createBridgeState(url, candidates, paletteCounts, {
            x: rect.left + rect.width * 0.5,
            y: rect.top + rect.height * 0.5
        }, {
            width: global.innerWidth || rect.width,
            height: global.innerHeight || rect.height
        });
    }

    function captureParticleBridge(url)
    {
        return captureRegisteredParticleScene(url) || captureCanvasParticleBridge(url);
    }

    function runParticleBridge(state)
    {
        if (!state || !document.createElement || typeof global.requestAnimationFrame !== 'function') return false;
        if (bridgeFrame !== null && typeof global.cancelAnimationFrame === 'function')
        {
            global.cancelAnimationFrame(bridgeFrame);
        }
        const existing = document.getElementById('particle-transition-overlay');
        if (existing && typeof existing.remove === 'function') existing.remove();

        const canvas = document.createElement('canvas');
        canvas.id = 'particle-transition-overlay';
        canvas.className = 'particle-transition-overlay';
        canvas.setAttribute('aria-hidden', 'true');
        const pixelRatio = Math.min(global.devicePixelRatio || 1, 1.35);
        const width = global.innerWidth || state.width;
        const height = global.innerHeight || state.height;
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const context = canvas.getContext('2d');
        if (!context) return false;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        document.body.appendChild(canvas);

        const scaleX = width / Math.max(1, state.width);
        const scaleY = height / Math.max(1, state.height);
        const velocityScale = Math.min(scaleX, scaleY);
        const buckets = state.palette.map(() => []);
        state.particles.forEach((particle) =>
        {
            const bucket = buckets[particle[5]] || buckets[0];
            bucket.push(particle);
        });

        function smootherStep(value)
        {
            return value * value * value * (value * (value * 6 - 15) + 10);
        }

        function draw()
        {
            const elapsed = Math.max(0, Date.now() - state.startedAt);
            const seconds = elapsed / 1000;
            const travel = smootherStep(Math.min(elapsed / state.duration, 1));
            const fadeStart = PARTICLE_EXIT_MS * 0.88;
            const fade = 1 - smootherStep(Math.min(Math.max((elapsed - fadeStart) / (state.duration - fadeStart), 0), 1));
            context.clearRect(0, 0, width, height);
            context.globalCompositeOperation = 'lighter';
            context.globalAlpha = fade * 0.92;

            buckets.forEach((bucket, paletteIndex) =>
            {
                if (bucket.length === 0) return;
                context.fillStyle = state.palette[paletteIndex];
                context.beginPath();
                bucket.forEach((particle) =>
                {
                    const wave = Math.sin(particle[6] + seconds * 4.2) * 18 * travel;
                    const x = particle[0] * scaleX + particle[2] * seconds * velocityScale + wave;
                    const y = particle[1] * scaleY + particle[3] * seconds * velocityScale - wave * 0.35;
                    const size = particle[4] * (1 + travel * 0.35);
                    const radius = size * 0.5;
                    context.moveTo(x + radius, y);
                    context.arc(x, y, radius, 0, Math.PI * 2);
                });
                context.fill();
            });

            if (elapsed < state.duration)
            {
                bridgeFrame = global.requestAnimationFrame(draw);
                return;
            }
            bridgeFrame = null;
            canvas.remove();
            clearBridgeState();
            continuingParticleBridge = false;
            document.body.classList.remove('particle-transition-continuation');
        }

        bridgeFrame = global.requestAnimationFrame(draw);
        return true;
    }

    function resumeParticleBridge()
    {
        const state = readBridgeState();
        if (!state) return;
        const age = Date.now() - state.startedAt;
        const currentTarget = global.location && global.location.pathname
            ? global.location.pathname.split('/').pop()
            : '';
        if (age < 0 || age >= state.duration || (currentTarget && currentTarget !== state.target))
        {
            clearBridgeState();
            return;
        }
        continuingParticleBridge = runParticleBridge(state);
        if (continuingParticleBridge) document.body.classList.add('particle-transition-continuation');
    }

    function reveal()
    {
        if (revealed || navigating) return;
        revealed = true;
        const curtain = ensureCurtain();
        curtain.classList.remove('start-covered');
        document.body.classList.add('transition-ready');
    }

    function navigate(url)
    {
        if (navigating) return;
        navigating = true;
        let requestedExitMs = 0;
        const holdFor = (duration) =>
        {
            if (!Number.isFinite(duration)) return;
            requestedExitMs = Math.max(requestedExitMs, duration);
        };
        if (!isReducedMotionRequested())
        {
            const bridgeState = captureParticleBridge(url);
            if (bridgeState)
            {
                storeBridgeState(bridgeState);
                runParticleBridge(bridgeState);
                requestedExitMs = PARTICLE_EXIT_MS;
            }
        }
        global.dispatchEvent(new CustomEvent('observatory:navigate-start', {
            detail: {url, holdFor}
        }));
        const curtain = ensureCurtain();
        curtain.classList.remove('start-covered');
        document.body.classList.add('particle-transition-exit');

        if (isReducedMotionRequested())
        {
            global.location.href = url;
            navigating = false;
            return;
        }

        let finished = false;
        let navigationTimer = null;
        const cleanup = () =>
        {
            finished = true;
            clearTimeout(navigationTimer);
        };
        const finish = () =>
        {
            if (finished) return;
            cleanup();
            global.location.href = url;
        };
        cancelNavigation = cleanup;
        const exitMs = Math.min(MAX_EXIT_MS, Math.max(DEFAULT_EXIT_MS, requestedExitMs));
        navigationTimer = setTimeout(finish, exitMs);
    }

    const TransitionManager = {
        init    : function ()
        {
            global.addEventListener('observatory:ready', reveal, {once: true});
            readyTimer = setTimeout(reveal, READY_TIMEOUT_MS);
        },
        navigate: navigate,
        isContinuingParticleTransition: () => continuingParticleBridge,
        registerParticleScene: (scene, camera, renderer) =>
        {
            registeredParticleScene = {scene, camera, renderer};
        }
    };

    global.TransitionManager = TransitionManager;
    resumeParticleBridge();

    global.addEventListener('pageshow', (event) =>
    {
        if (!event.persisted) return;
        if (cancelNavigation) cancelNavigation();
        cancelNavigation = null;
        clearTimeout(readyTimer);
        navigating = false;
        revealed = true;
        document.body.classList.remove('particle-transition-exit');
        document.body.classList.add('transition-ready');
        ensureCurtain().classList.remove('curtain-exit', 'curtain-intro', 'start-covered');
    });

    document.addEventListener('DOMContentLoaded', () =>
    {
        TransitionManager.init();
    });
})(window);
