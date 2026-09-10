/**
 * NASA-Punk Transition System
 */
(function initTransitionSystem(global)
{
    const READY_TIMEOUT_MS = 1500;
    const DEFAULT_EXIT_MS = 480;
    const MAX_EXIT_MS = 1200;
    const PARTICLE_EXIT_MS = 720;
    const PARTICLE_BRIDGE_MS = 1800;
    const PARTICLE_INCOMING_MS = 1050;
    const PARTICLE_HANDOFF_MS = 120;
    const PARTICLE_LIMIT = 1800;
    const BRIDGE_STORAGE_KEY = 'observatory-particle-bridge-v3';
    let revealed = false;
    let navigating = false;
    let cancelNavigation = null;
    let readyTimer = null;
    let continuingParticleBridge = false;
    let registeredParticleScene = null;
    let pendingBridgeState = null;
    let bridgeRenderer = null;
    let bridgeScene = null;
    let bridgeCamera = null;
    let bridgeFrame = null;
    let bridgeSizeTarget = null;
    let incomingBridgeStarted = false;
    const bridgeMeshes = new Set();

    function isReducedMotionRequested()
    {
        return typeof global.matchMedia === 'function'
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

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
            return state && state.version === 3 && Array.isArray(state.particles) ? state : null;
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

    function createBridgeState(url, candidates, paletteCounts, center, viewport, options = {})
    {
        if (candidates.length < 24) return null;
        const paletteKeys = Array.from(paletteCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(entry => entry[0]);
        const palette = paletteKeys.map((key) => [
            ((key >> 6) & 7) * 32 + 16,
            ((key >> 3) & 7) * 32 + 16,
            (key & 7) * 32 + 16
        ]);
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
            version: 3,
            startedAt: Date.now(),
            duration: options.duration || PARTICLE_BRIDGE_MS,
            mode: options.mode || 'outgoing',
            width: viewport.width,
            height: viewport.height,
            target: String(url).split('/').pop().split(/[?#]/)[0],
            palette,
            particles
        };
    }

    function captureRegisteredParticleScene(url, options = {})
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
            if (!object.visible || !object.isPoints || !position || position.count < 1
                || (object.userData && object.userData.observatoryTransitionBridge)) return;
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
        }, options);
    }

    function ensureBridgeRenderer()
    {
        const THREE = global.THREE;
        if (bridgeRenderer) return true;
        if (!THREE || typeof THREE.WebGLRenderer !== 'function'
            || typeof THREE.Scene !== 'function' || typeof THREE.Camera !== 'function') return false;
        try
        {
            bridgeRenderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: false,
                premultipliedAlpha: false,
                powerPreference: 'high-performance'
            });
            bridgeRenderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.15));
            bridgeRenderer.setSize(global.innerWidth || 1, global.innerHeight || 1, false);
            bridgeRenderer.setClearColor(0x000000, 0);
            bridgeRenderer.domElement.id = 'particle-transition-overlay';
            bridgeRenderer.domElement.className = 'particle-transition-overlay';
            bridgeRenderer.domElement.setAttribute('aria-hidden', 'true');
            bridgeRenderer.domElement.style.display = 'none';
            document.body.appendChild(bridgeRenderer.domElement);
            bridgeScene = new THREE.Scene();
            bridgeCamera = new THREE.Camera();
            return true;
        }
        catch (error)
        {
            bridgeRenderer = null;
            bridgeScene = null;
            bridgeCamera = null;
            return false;
        }
    }

    function scheduleBridgePreparation(callback, preferIdle = false)
    {
        if (preferIdle && typeof global.requestIdleCallback === 'function')
        {
            global.requestIdleCallback(callback, {timeout: 500});
            return;
        }
        if (typeof global.requestAnimationFrame === 'function')
        {
            global.requestAnimationFrame(callback);
            return;
        }
        setTimeout(callback, 0);
    }

    function disposeBridgeMesh(mesh)
    {
        if (bridgeScene) bridgeScene.remove(mesh);
        bridgeMeshes.delete(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
    }

    function disposeBridgeRenderer()
    {
        if (!bridgeRenderer) return;
        bridgeRenderer.dispose();
        if (typeof bridgeRenderer.forceContextLoss === 'function')
        {
            bridgeRenderer.forceContextLoss();
        }
        const canvas = bridgeRenderer.domElement;
        if (canvas)
        {
            if (typeof canvas.remove === 'function') canvas.remove();
            else if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        }
        bridgeRenderer = null;
        bridgeScene = null;
        bridgeCamera = null;
        bridgeSizeTarget = null;
    }

    function stopBridgeLoopIfIdle()
    {
        if (bridgeMeshes.size > 0) return;
        if (bridgeFrame !== null && typeof global.cancelAnimationFrame === 'function')
        {
            global.cancelAnimationFrame(bridgeFrame);
        }
        bridgeFrame = null;
        disposeBridgeRenderer();
    }

    function finishIncomingParticleBridge()
    {
        continuingParticleBridge = false;
        document.body.classList.remove('particle-transition-continuation', 'particle-transition-waiting');
        global.dispatchEvent(new CustomEvent('observatory:transition-complete'));
    }

    function renderBridgeFrame()
    {
        bridgeFrame = null;
        if (!bridgeRenderer || bridgeMeshes.size === 0)
        {
            stopBridgeLoopIfIdle();
            return;
        }
        const width = global.innerWidth || 1;
        const height = global.innerHeight || 1;
        if (!bridgeSizeTarget && global.THREE && typeof global.THREE.Vector2 === 'function')
        {
            bridgeSizeTarget = new global.THREE.Vector2();
        }
        if (bridgeSizeTarget)
        {
            const size = bridgeRenderer.getSize(bridgeSizeTarget);
            if (size.x !== width || size.y !== height)
            {
                bridgeRenderer.setSize(width, height, false);
            }
        }

        const now = Date.now();
        for (const mesh of bridgeMeshes)
        {
            const elapsedMs = Math.max(0, now - mesh.userData.startedAt);
            const progress = Math.min(elapsedMs / mesh.userData.duration, 1);
            mesh.material.uniforms.uElapsed.value = elapsedMs / 1000;
            if (mesh.userData.fadeOutStartedAt !== null)
            {
                const fadeProgress = Math.min((now - mesh.userData.fadeOutStartedAt) / PARTICLE_HANDOFF_MS, 1);
                mesh.material.uniforms.uLayerAlpha.value = 1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
                if (fadeProgress >= 1)
                {
                    if (mesh.userData.mode === 'outgoing') clearBridgeState();
                    disposeBridgeMesh(mesh);
                    continue;
                }
            }
            if (mesh.userData.mode === 'incoming' && progress >= 0.7 && !mesh.userData.sceneRevealed)
            {
                mesh.userData.sceneRevealed = true;
                document.body.classList.remove('particle-transition-waiting');
            }
            if (progress >= 1)
            {
                if (mesh.userData.mode === 'outgoing') clearBridgeState();
                if (mesh.userData.mode === 'incoming')
                {
                    finishIncomingParticleBridge();
                }
                disposeBridgeMesh(mesh);
            }
        }
        if (bridgeMeshes.size === 0)
        {
            stopBridgeLoopIfIdle();
            return;
        }
        bridgeRenderer.render(bridgeScene, bridgeCamera);
        bridgeFrame = global.requestAnimationFrame(renderBridgeFrame);
    }

    function ensureBridgeLoop()
    {
        if (bridgeFrame === null && typeof global.requestAnimationFrame === 'function')
        {
            bridgeFrame = global.requestAnimationFrame(renderBridgeFrame);
        }
    }

    function attachParticleBridge(state)
    {
        const THREE = global.THREE;
        if (!state || !ensureBridgeRenderer()
            || typeof THREE.BufferGeometry !== 'function'
            || typeof THREE.BufferAttribute !== 'function'
            || typeof THREE.ShaderMaterial !== 'function'
            || typeof THREE.Points !== 'function') return false;

        const count = state.particles.length;
        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 2);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const phases = new Float32Array(count);
        state.particles.forEach((particle, index) =>
        {
            const positionOffset = index * 3;
            const velocityOffset = index * 2;
            const paletteColor = state.palette[particle[5]] || [255, 255, 255];
            positions[positionOffset] = particle[0] / state.width * 2 - 1;
            positions[positionOffset + 1] = 1 - particle[1] / state.height * 2;
            positions[positionOffset + 2] = 0;
            velocities[velocityOffset] = particle[2] / state.width * 2;
            velocities[velocityOffset + 1] = -particle[3] / state.height * 2;
            colors[positionOffset] = paletteColor[0] / 255;
            colors[positionOffset + 1] = paletteColor[1] / 255;
            colors[positionOffset + 2] = paletteColor[2] / 255;
            sizes[index] = particle[4];
            phases[index] = particle[6];
        });

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uElapsed: {value: Math.max(0, Date.now() - state.startedAt) / 1000},
                uDuration: {value: state.duration / 1000},
                uMode: {value: state.mode === 'incoming' ? 1 : 0},
                uPixelRatio: {value: Math.min(global.devicePixelRatio || 1, 1.15)},
                uLayerAlpha: {value: 1}
            },
            vertexShader: `
                attribute vec2 aVelocity;
                attribute vec3 color;
                attribute float aSize;
                attribute float aPhase;
                uniform float uElapsed;
                uniform float uDuration;
                uniform float uMode;
                uniform float uPixelRatio;
                varying vec3 vColor;
                varying float vAlpha;
                float smoother(float value) {
                    return value * value * value * (value * (value * 6.0 - 15.0) + 10.0);
                }
                void main() {
                    float progress = clamp(uElapsed / uDuration, 0.0, 1.0);
                    float eased = smoother(progress);
                    float incoming = step(0.5, uMode);
                    float outgoingTravel = uElapsed * (0.35 + eased * 0.65);
                    float incomingTravel = (1.0 - eased) * uDuration * 0.88;
                    float travel = mix(outgoingTravel, incomingTravel, incoming);
                    float waveAmount = mix(eased, 1.0 - eased, incoming);
                    vec2 wave = vec2(sin(aPhase + uElapsed * 4.2), cos(aPhase * 1.37 + uElapsed * 3.4));
                    vec2 transformed = position.xy + aVelocity * travel + wave * 0.022 * waveAmount;
                    float outgoingAlpha = 1.0 - smoother(clamp((progress - 0.34) / 0.66, 0.0, 1.0));
                    float incomingAlpha = smoother(clamp(progress / 0.18, 0.0, 1.0))
                        * (1.0 - smoother(clamp((progress - 0.82) / 0.18, 0.0, 1.0)));
                    vAlpha = mix(outgoingAlpha, incomingAlpha, incoming);
                    vColor = color;
                    gl_Position = vec4(transformed, 0.0, 1.0);
                    gl_PointSize = aSize * uPixelRatio * (1.0 + waveAmount * 0.35);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;
                uniform float uLayerAlpha;
                void main() {
                    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
                    if (distanceToCenter > 0.5) discard;
                    float edge = 1.0 - smoothstep(0.2, 0.5, distanceToCenter);
                    gl_FragColor = vec4(vColor, vAlpha * edge * uLayerAlpha * 0.92);
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const mesh = new THREE.Points(geometry, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 10000;
        mesh.userData.observatoryTransitionBridge = true;
        mesh.userData.startedAt = state.startedAt;
        mesh.userData.duration = state.duration;
        mesh.userData.mode = state.mode;
        mesh.userData.sceneRevealed = false;
        mesh.userData.fadeOutStartedAt = null;
        bridgeScene.add(mesh);
        bridgeMeshes.add(mesh);
        bridgeRenderer.domElement.style.display = 'block';
        ensureBridgeLoop();
        return mesh;
    }

    function startIncomingParticleBridge()
    {
        if (!continuingParticleBridge || incomingBridgeStarted || !registeredParticleScene) return;
        incomingBridgeStarted = true;
        const currentTarget = global.location && global.location.pathname
            ? global.location.pathname.split('/').pop()
            : '';
        const incomingState = captureRegisteredParticleScene(currentTarget, {
            mode: 'incoming',
            duration: PARTICLE_INCOMING_MS
        });
        const incomingMesh = incomingState ? attachParticleBridge(incomingState) : null;
        if (!incomingMesh)
        {
            finishIncomingParticleBridge();
            return;
        }
        const handoffStartedAt = Date.now();
        bridgeMeshes.forEach((mesh) =>
        {
            if (mesh !== incomingMesh && mesh.userData.mode === 'outgoing')
            {
                mesh.userData.fadeOutStartedAt = handoffStartedAt;
            }
        });
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
        pendingBridgeState = state;
        continuingParticleBridge = true;
        document.body.classList.add('particle-transition-continuation', 'particle-transition-waiting');
    }

    function reveal()
    {
        if (readyTimer)
        {
            clearTimeout(readyTimer);
            readyTimer = null;
        }
        if (revealed || navigating) return;
        revealed = true;
        const curtain = ensureCurtain();
        curtain.classList.remove('start-covered');
        document.body.classList.add('transition-ready');
    }

    function handleReady()
    {
        reveal();
        startIncomingParticleBridge();
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
            const bridgeState = captureRegisteredParticleScene(url, {mode: 'outgoing'});
            if (bridgeState)
            {
                // 当前主场景自身负责离场逸散。桥接层只需在目标页重建；避免在
                // 点击瞬间创建第二个 WebGL 上下文、编译 shader 并重复绘制粒子。
                storeBridgeState(bridgeState);
                requestedExitMs = PARTICLE_EXIT_MS;
            }
            else
            {
                clearBridgeState();
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
            global.addEventListener('observatory:ready', handleReady, {once: true});
            // ready 事件若因极快的首批粒子构建而先于监听器触发，兜底也必须
            // 完成桥接，而不能只揭开 UI 后把主画布永久留在 waiting 状态。
            readyTimer = setTimeout(handleReady, READY_TIMEOUT_MS);
        },
        navigate: navigate,
        isContinuingParticleTransition: () => continuingParticleBridge,
        registerParticleScene: (scene, camera, renderer) =>
        {
            registeredParticleScene = {scene, camera, renderer};
            if (pendingBridgeState)
            {
                const state = pendingBridgeState;
                pendingBridgeState = null;
                scheduleBridgePreparation(() =>
                {
                    if (incomingBridgeStarted)
                    {
                        clearBridgeState();
                        return;
                    }
                    if (!attachParticleBridge(state))
                    {
                        finishIncomingParticleBridge();
                    }
                });
                return;
            }
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

    global.addEventListener('pagehide', (event) =>
    {
        if (event.persisted) return;
        if (bridgeFrame !== null && typeof global.cancelAnimationFrame === 'function')
        {
            global.cancelAnimationFrame(bridgeFrame);
        }
        bridgeFrame = null;
        for (const mesh of bridgeMeshes) disposeBridgeMesh(mesh);
        disposeBridgeRenderer();
        registeredParticleScene = null;
    });

    // 脚本位于 body 尾部时 DOM 已可用；立即挂 ready 监听，避免等待
    // DOMContentLoaded 与 requestIdleCallback 粒子首批构建之间的竞态。
    if (document.readyState === 'loading' && !document.body)
    {
        document.addEventListener('DOMContentLoaded', () =>
        {
            TransitionManager.init();
        });
    }
    else
    {
        TransitionManager.init();
    }
})(window);
