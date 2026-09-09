/**
 * Planet Scene Kit
 * 行星页共享的场景初始化工厂与动画工具：
 *  - createPlanetScene: 场景/相机/渲染器/背景/resize 一站式初始化
 *  - createFrameDelta : 帧率无关的动画步长因子（60fps 校准基准）
 *  - createSurfaceConvergence: 表面点云螺旋汇聚入场（着色器内完成）
 *  - createQualityDrawRange  : 静态粒子层按画质档位缩放 drawRange
 *  - createPointSizeJitter   : 静态点云逐粒子尺寸差异（编译期补丁）
 *  - createMotionAwareAnimation: reduced-motion 感知的共享动画调度器
 *  - PLANET_GLSL.snoise3D: 顶点着色器用的 3D simplex 噪声（Ashima, MIT）
 */
(function initPlanetSceneKit(global)
{
    let reducedMotionMediaQuery;
    let reducedMotionMediaQueryReady = false;

    function getReducedMotionMediaQuery()
    {
        if (!reducedMotionMediaQueryReady)
        {
            reducedMotionMediaQuery = typeof global.matchMedia === 'function'
                ? global.matchMedia('(prefers-reduced-motion: reduce)')
                : null;
            reducedMotionMediaQueryReady = true;
        }
        return reducedMotionMediaQuery;
    }

    function isReducedMotionRequested()
    {
        const mediaQuery = getReducedMotionMediaQuery();
        return Boolean(mediaQuery && mediaQuery.matches);
    }

    function createMotionAwareAnimation(animate)
    {
        const mediaQuery   = getReducedMotionMediaQuery();
        const requestFrame = typeof global.requestAnimationFrame === 'function'
            ? global.requestAnimationFrame.bind(global)
            : null;
        const cancelFrame  = typeof global.cancelAnimationFrame === 'function'
            ? global.cancelAnimationFrame.bind(global)
            : null;
        let frameHandle = null;

        function schedule()
        {
            if (!requestFrame || frameHandle !== null || (mediaQuery && mediaQuery.matches))
            {
                return;
            }
            frameHandle = requestFrame((timestamp) =>
            {
                frameHandle = null;
                animate(timestamp);
            });
        }

        function handleMotionChange(event)
        {
            const matches = event ? event.matches : mediaQuery && mediaQuery.matches;
            if (matches)
            {
                if (frameHandle !== null && cancelFrame)
                {
                    cancelFrame(frameHandle);
                    frameHandle = null;
                }
                return;
            }
            schedule();
        }

        if (mediaQuery)
        {
            if (typeof mediaQuery.addEventListener === 'function')
            {
                mediaQuery.addEventListener('change', handleMotionChange);
            }
            else if (typeof mediaQuery.addListener === 'function')
            {
                mediaQuery.addListener(handleMotionChange);
            }
        }

        return {schedule};
    }

    global.isReducedMotionRequested = isReducedMotionRequested;

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

    const SHADER_PATCHES = '__observatoryShaderPatches';

    // 多个视觉增强都需要修改 PointsMaterial 的 onBeforeCompile。统一串联
    // 补丁，避免后注册的效果把前一个效果覆盖掉。
    function registerShaderPatch(material, key, patch)
    {
        if (!material || typeof patch !== 'function')
        {
            return;
        }

        if (!Array.isArray(material[SHADER_PATCHES]))
        {
            const patches  = [];
            const original = material.onBeforeCompile;
            const baseKey = typeof material.customProgramCacheKey === 'function'
                ? material.customProgramCacheKey()
                : String(original || '');
            material[SHADER_PATCHES] = patches;
            material.customProgramCacheKey = () => JSON.stringify([baseKey, ...patches.map(entry => entry.key)]);
            material.onBeforeCompile = (shader, renderer) =>
            {
                if (typeof original === 'function')
                {
                    original.call(material, shader, renderer);
                }
                patches.forEach((entry) => entry.patch(shader));
            };
        }

        material[SHADER_PATCHES].push({key, patch});
        material.needsUpdate = true;
    }

    // 表面点云汇聚动画：构建期间粒子以低透明度散布在外围壳层上缓慢漂移，
    // observatory:ready 后按粒子哈希错峰螺旋汇聚到最终位置，同时淡入到原
    // 透明度（顶点+片段着色器内完成，CPU 每帧只写两个 uniform）。
    // 需要 observatory:ready 事件触发；事件缺失时 6 秒后兜底开始
    function createSurfaceConvergence(points, options = {})
    {
        const duration     = options.duration || 1400;
        const fallbackDelay = Number.isFinite(options.fallbackDelay)
            ? Math.max(0, options.fallbackDelay)
            : 6000;
        const scatter       = Number(options.scatter || 12).toFixed(2);
        const reducedMotion = isReducedMotionRequested();
        const uniforms      = {uReveal: {value: reducedMotion ? 1 : 0}, uTime: {value: 0}};
        let startedAt = null;
        let finished = reducedMotion;
        let readyFired = false;
        let waitingAt = null;

        global.addEventListener('observatory:ready', () =>
        {
            readyFired = true;
        }, {once: true});

        registerShaderPatch(points.material, ['convergence-v1', scatter], (shader) =>
        {
            // 片元淡入依赖 PointsMaterial 模板里的 color_fragment 锚点；
            // 锚点缺失时退化为纯顶点动画，varying 两侧同步省略
            const fadeAnchor = '#include <color_fragment>';
            const fadeSupported = typeof shader.fragmentShader === 'string'
                && shader.fragmentShader.indexOf(fadeAnchor) !== -1;

            shader.uniforms.uReveal = uniforms.uReveal;
            shader.uniforms.uTime = uniforms.uTime;
            shader.vertexShader = 'uniform float uReveal;\nuniform float uTime;\n'
                + (fadeSupported ? 'varying float vConvReveal;\n' : '')
                + shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    [
                        '#include <begin_vertex>',
                        'float convHash = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
                        'float convReveal = clamp((uReveal - convHash * 0.6) / 0.4, 0.0, 1.0);',
                        'convReveal = convReveal * convReveal * (3.0 - 2.0 * convReveal);',
                        'vec3 convDir = normalize(position + vec3(0.0001, 0.0002, 0.0003));',
                        'vec3 convJitter = vec3(fract(convHash * 91.17), fract(convHash * 47.23), fract(convHash * 13.7)) - 0.5;',
                        'vec3 convScattered = position + convDir * ' + scatter + ' + convJitter * 3.0;',
                        // 螺旋内旋：散布端点绕 Y 轴扭转，扭转角随 reveal 收敛到 0，
                        // 叠加 sin(uTime) 让壳层在等待期缓慢呼吸
                        'float convSpin = (1.0 - convReveal) * (0.9 + convHash * 1.6 + sin(convHash * 6.2832 + uTime * 0.5) * 0.15);',
                        'float convSin = sin(convSpin);',
                        'float convCos = cos(convSpin);',
                        'convScattered.xz = mat2(convCos, convSin, -convSin, convCos) * convScattered.xz;',
                        'transformed = mix(convScattered, position, convReveal);'
                    ].concat(fadeSupported ? ['vConvReveal = convReveal;'] : []).join('\n')
                );

            if (fadeSupported)
            {
                shader.fragmentShader = 'varying float vConvReveal;\n' + shader.fragmentShader.replace(
                    fadeAnchor,
                    fadeAnchor + '\n\tdiffuseColor.a *= 0.2 + 0.8 * vConvReveal;'
                );
            }
        });

        function update(timestamp)
        {
            if (finished || reducedMotion)
            {
                return;
            }
            const now = Number.isFinite(timestamp) ? timestamp : performance.now();
            uniforms.uTime.value = now / 1000;
            if (waitingAt === null)
            {
                waitingAt = now;
            }
            if (startedAt === null)
            {
                if (!readyFired && now - waitingAt < fallbackDelay)
                {
                    return;
                }
                startedAt = now;
            }
            const progress = Math.min((now - startedAt) / duration, 1);
            uniforms.uReveal.value = progress;
            if (progress >= 1)
            {
                finished = true;
            }
        }

        return {update, uniforms};
    }

    // 共享的点精灵外观：把默认方形点裁成柔边圆点，并给每个粒子一个
    // 稳定的尺寸差异。所有计算都在 shader 中完成，不增加逐帧 CPU 工作。
    function createParticleAppearance(points, options = {})
    {
        const min    = Number.isFinite(options.min) ? options.min : 0.78;
        const max    = Number.isFinite(options.max) ? Math.max(min, options.max) : 1.22;
        const inside = Number.isFinite(options.inside) ? Math.min(0.49, Math.max(0.1, options.inside)) : 0.26;

        registerShaderPatch(points && points.material,
            ['appearance-v1', min.toFixed(3), (max - min).toFixed(3), inside.toFixed(3)], (shader) =>
        {
            if (typeof shader.vertexShader === 'string')
            {
                const pointSizeAnchor = 'gl_PointSize = size;';
                if (shader.vertexShader.indexOf(pointSizeAnchor) !== -1)
                {
                    shader.vertexShader = shader.vertexShader.replace(
                        pointSizeAnchor,
                        [
                            'float particleSizeHash = fract(sin(dot(position.xy, vec2(41.173, 17.431))) * 43758.5453);',
                            'gl_PointSize = size * (' + min.toFixed(3) + ' + particleSizeHash * ' + (max - min).toFixed(3) + ');'
                        ].join('\n')
                    );
                }
            }

            if (typeof shader.fragmentShader !== 'string')
            {
                return;
            }

            const colorAnchor = '#include <color_fragment>';
            if (shader.fragmentShader.indexOf(colorAnchor) === -1)
            {
                return;
            }

            shader.fragmentShader = shader.fragmentShader.replace(
                colorAnchor,
                colorAnchor + '\n'
                    + 'vec2 particlePoint = gl_PointCoord - vec2(0.5);\n'
                    + 'float particleDistance = length(particlePoint);\n'
                    + 'if (particleDistance > 0.5) discard;\n'
                    + 'diffuseColor.a *= 1.0 - smoothstep(' + inside.toFixed(3) + ', 0.5, particleDistance);'
            );
        });
    }

    // 静态粒子层接入画质档位：初始按手动档位或设备信号缩放 drawRange，
    // 之后跟随 observatory:quality 实时增减（O(1)，无逐帧成本）
    function createQualityDrawRange(points, options = {})
    {
        const ratios   = {high: 1, balanced: 0.75, low: 0.5, recovery: 0.25};
        const maxCount = options.maxCount !== undefined
            ? options.maxCount
            : points.geometry.attributes.position.count;

        function apply(profile)
        {
            if (profile === 'auto')
            {
                profile = global.ParticleBuilder
                    ? global.ParticleBuilder.selectInitialProfile(global.navigator)
                    : 'high';
            }
            const ratio = ratios[profile];
            points.geometry.setDrawRange(0, ratio === undefined ? maxCount : Math.floor(maxCount * ratio));
        }

        const ParticleBuilder = global.ParticleBuilder;
        if (ParticleBuilder && typeof ParticleBuilder.getQualityProfile === 'function')
        {
            const override = ParticleBuilder.getQualityProfile();
            apply(override === 'auto'
                ? ParticleBuilder.selectInitialProfile(global.navigator)
                : override);
        }
        else
        {
            apply('high');
        }

        global.addEventListener('observatory:quality', (event) =>
        {
            apply(event && event.detail ? event.detail.profile : 'high');
        });

        return {apply};
    }

    // 静态点云逐粒子尺寸差异：编译期把均一 gl_PointSize 打散成哈希分布，
    // 消除同一点径带来的"塑料感"（一次性补丁，无逐帧成本）
    function createPointSizeJitter(points, options = {})
    {
        const min = Number.isFinite(options.min) ? options.min : 0.5;
        const max = Number.isFinite(options.max) ? options.max : 1.5;
        const anchor = 'gl_PointSize = size;';

        registerShaderPatch(points.material, ['size-jitter-v1', min.toFixed(3), (max - min).toFixed(3)], (shader) =>
        {
            if (typeof shader.vertexShader !== 'string'
                || shader.vertexShader.indexOf(anchor) === -1)
            {
                return;
            }
            shader.vertexShader = shader.vertexShader.replace(
                anchor,
                [
                    'float sizeJitterHash = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);',
                    'gl_PointSize = size * (' + min.toFixed(3) + ' + sizeJitterHash * ' + (max - min).toFixed(3) + ');'
                ].join('\n')
            );
        });
    }

    global.createPlanetScene = createPlanetScene;
    global.createFrameDelta  = createFrameDelta;
    global.createMotionAwareAnimation = createMotionAwareAnimation;
    global.createSurfaceConvergence = createSurfaceConvergence;
    global.createParticleAppearance = createParticleAppearance;
    global.createQualityDrawRange   = createQualityDrawRange;
    global.createPointSizeJitter    = createPointSizeJitter;
    global.PLANET_GLSL       = {snoise3D: SIMPLEX_3D_GLSL};
})(typeof window !== 'undefined' ? window : globalThis);
