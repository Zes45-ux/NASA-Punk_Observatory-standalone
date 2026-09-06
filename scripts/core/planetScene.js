/**
 * Planet Scene Kit
 * 行星页共享的场景初始化工厂与动画工具：
 *  - createPlanetScene: 场景/相机/渲染器/背景/resize 一站式初始化
 *  - createFrameDelta : 帧率无关的动画步长因子（60fps 校准基准）
 *  - PLANET_GLSL.snoise3D: 顶点着色器用的 3D simplex 噪声（Ashima, MIT）
 */
(function initPlanetSceneKit(global)
{
    function createPlanetScene(options)
    {
        const name        = options.name;
        const initialZoom = options.zoom;
        const noiseOffset = options.noiseOffset === undefined ? 100 : options.noiseOffset;

        const sharedTopoBackground = createTopoBackground({
            canvasId   : 'topo-canvas',
            noiseOffset: noiseOffset,
            overlayFill: options.overlayFill || null
        });

        const canvasContainer = document.getElementById('canvas-container');
        const displaySize     = DisplayArea.getSize(canvasContainer);
        const scene           = new THREE.Scene();
        const camera          = new THREE.PerspectiveCamera(35, displaySize.width / displaySize.height, 0.1, 1000);

        camera.position.z = initialZoom;

        const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setSize(displaySize.width, displaySize.height);
        // 4K/5K 屏按完整 devicePixelRatio 渲染点云代价过高，钳制到 2
        renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
        canvasContainer.appendChild(renderer.domElement);

        function resizeScene()
        {
            const nextDisplaySize = DisplayArea.getSize(canvasContainer);
            camera.aspect         = nextDisplaySize.width / nextDisplaySize.height;
            camera.updateProjectionMatrix();
            renderer.setSize(nextDisplaySize.width, nextDisplaySize.height);
        }

        if (typeof ResizeObserver !== 'undefined')
        {
            const displayResizeObserver = new ResizeObserver(() =>
            {
                resizeScene();
            });
            displayResizeObserver.observe(canvasContainer);
        }

        global.addEventListener('resize', () =>
        {
            sharedTopoBackground.resize();
        });

        const tgtLabel = document.querySelector('.monitor-label.label-bottom');

        const group = new THREE.Group();
        scene.add(group);

        return {
            scene,
            camera,
            renderer,
            group,
            tgtLabel,
            resizeScene
        };
    }

    // 动画步长按实际帧间隔归一化：60fps 时为 1，120Hz 约 0.5，
    // 卡顿帧最多放大 2.5 倍、最小 0.25，避免切后台回来后瞬移
    function createFrameDelta()
    {
        let lastTimestamp = null;

        return function nextDeltaTime(timestamp)
        {
            if (typeof timestamp !== 'number' || !Number.isFinite(timestamp))
            {
                return 1;
            }
            if (lastTimestamp === null)
            {
                lastTimestamp = timestamp;
                return 1;
            }
            const factor = (timestamp - lastTimestamp) / 16.667;
            lastTimestamp = timestamp;
            return Math.min(Math.max(factor, 0.25), 2.5);
        };
    }

    // Ashima Arts / Ian McEwan 的 3D simplex 噪声（MIT），GLSL ES 1.0 兼容
    const SIMPLEX_3D_GLSL = `
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
            const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);

            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);

            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;

            i = mod289(i);
            vec4 p = permute(permute(permute(
                     i.z + vec4(0.0, i1.z, i2.z, 1.0))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0));

            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;

            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);

            vec4 x = x_ * ns.x + ns.yyyy;
            vec4 y = y_ * ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);

            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);

            vec4 s0 = floor(b0) * 2.0 + 1.0;
            vec4 s1 = floor(b1) * 2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));

            vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);

            vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;

            vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }
    `;

    global.createPlanetScene = createPlanetScene;
    global.createFrameDelta  = createFrameDelta;
    global.PLANET_GLSL       = {snoise3D: SIMPLEX_3D_GLSL};
})(typeof window !== 'undefined' ? window : globalThis);
