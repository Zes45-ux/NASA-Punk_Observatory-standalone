// ==========================================
// NASA-Punk Project: SOL-II (VENUS) - CHAOS & DENSITY CORRECTED
// ==========================================

// --- PART 1+2: 场景初始化（共享工厂：背景/相机/渲染器/resize） ---
const INITIAL_ZOOM = 25;

const {scene, camera, renderer, group, tgtLabel} = createPlanetScene({
    name       : 'venus',
    zoom       : INITIAL_ZOOM,
    noiseOffset: 100
});

// 帧率无关的动画步长因子（60fps 校准基准）
const nextDeltaTime = createFrameDelta();

// 1. 倾角容器 (金星轴倾角极大 ~177度)
const planetTiltGroup      = new THREE.Group();
planetTiltGroup.rotation.z = 177 * (Math.PI / 180);
group.add(planetTiltGroup);

// 2. 自转容器 - CORE (地表，慢速自转)
const venusSurfaceGroup = new THREE.Group();
planetTiltGroup.add(venusSurfaceGroup);

// 3. 自转容器 - CLOUDS (大气，超自转)
const cloudGroup = new THREE.Group();
planetTiltGroup.add(cloudGroup);


// --- PART 3: 程序化金星主体 (双层点云结构) ---
let frameSampler;
let surfaceConvergence;
let venusCloudUniforms;
const coreRadius = 5.0;
const venusCloudBaseColor = new THREE.Color('#ffae20');

// --- A. 地表点云 (Inner Surface: Magma Chaos) ---
function createVenusSurface()
{
    const planetName = 'venus';
    // [NEW PALETTE] 模拟岩浆的高对比度色板
    const colBase = new THREE.Color('#8b1a1a'); // 深岩浆红
    const colHigh = new THREE.Color('#d9531e'); // 亮熔岩橙
    const colPeak = new THREE.Color('#ffe0a0'); // 极热点黄
    const noiseGen = new SimplexNoise('venus-magma-chaos-rock');
    const surfaceColor = new THREE.Color();

    function sampleSurfaceParticle(i, positions, colors)
    {
        const r     = coreRadius;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi);

        // 高频噪波用于混沌化颜色
        let nChaos = 0;
        nChaos += noiseGen.noise3D(x * 1.5, y * 1.5, z * 1.5) * 0.8;
        nChaos += noiseGen.noise3D(x * 4.0, y * 4.0, z * 4.0) * 0.2; // 细节裂缝

        // [FIX 1] 极小的起伏，保持形状完美
        const heightMod = noiseGen.noise3D(x * 0.2, y * 0.2, z * 0.2) * 0.005;

        x *= (1 + heightMod / r);
        y *= (1 + heightMod / r);
        z *= (1 + heightMod / r);

        const offset = i * 3;
        positions[offset]     = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;

        // 基于噪波值进行高对比度着色
        const c   = surfaceColor;
        let val = (nChaos + 1) / 2;

        if (val < 0.5)
        {
            c.copy(colBase).lerp(colHigh, val * 2.0);
        }
        else
        {
            c.copy(colHigh).lerp(colPeak, (val - 0.5) * 2.0);
        }

        c.multiplyScalar(0.9 + Math.random() * 0.2);
        colors[offset]     = c.r;
        colors[offset + 1] = c.g;
        colors[offset + 2] = c.b;
    }

    const surface = ParticleBuilder.createSurfaceLayer({
        planetName,
        budget: PLANET_PARTICLE_CONFIG[planetName].surface,
        sample: sampleSurfaceParticle,
        material: {
            size           : 0.055,
            vertexColors   : true,
            transparent    : true,
            opacity        : 0.95,
            sizeAttenuation: true
        },
        group: venusSurfaceGroup,
        onReady()
        {
            renderer.render(scene, camera);
            ParticleBuilder.markReady({page: planetName});
        }
    });
    frameSampler = surface.frameSampler;
    surfaceConvergence = createSurfaceConvergence(surface.points);
}

createVenusSurface();


// --- B. 大气点云 (Outer Atmosphere: Density Reduced) ---

function createVenusClouds()
{
    // [FIX 2] 粒子数量减半
    const cloudParticles = 45000;
    const cloudPos       = new Float32Array(cloudParticles * 3);

    for (let i = 0; i < cloudParticles; i++)
    {
        // [FIX 1] 粒子均匀分布在球壳内，位置上无噪波扰动
        const r     = coreRadius + Math.random() * 0.4;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        const idx = i * 3;
        cloudPos[idx]     = x;
        cloudPos[idx + 1] = y;
        cloudPos[idx + 2] = z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cloudPos, 3));

    // 流动亮度在顶点着色器内计算，CPU 不再逐帧回传 45k 颜色
    venusCloudUniforms = {
        uTime : {value: 0},
        uSize : {value: 0.06},
        uScale: {value: 300},
        uColor: {value: venusCloudBaseColor}
    };

    const mat = new THREE.ShaderMaterial({
        uniforms      : venusCloudUniforms,
        vertexShader  : PLANET_GLSL.snoise3D + `
            uniform float uTime;
            uniform float uSize;
            uniform float uScale;
            uniform vec3 uColor;
            varying vec3 vColor;

            void main() {
                float flowNoise = snoise(position * 0.2 + vec3(uTime));
                float brightness = 1.0 + flowNoise * 0.25;
                vColor = uColor * brightness;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = uSize * (uScale / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }`,
        fragmentShader: `
            varying vec3 vColor;
            void main() { gl_FragColor = vec4(vColor, 0.2); }`,
        transparent   : true
    });

    const cloudPoints = new THREE.Points(geo, mat);
    cloudGroup.add(cloudPoints);

    // 测量网格
    const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(coreRadius + 0.1, 24, 12));
    const wireMat = new THREE.LineBasicMaterial({
        color      : '#ffc140',
        transparent: true,
        opacity    : 0.05
    });
    planetTiltGroup.add(new THREE.LineSegments(wireGeo, wireMat));
}

createVenusClouds();


// ==========================================
// PART 4: 交互与动画循环
// ==========================================

// 初始化交互模块
initInteraction(group, INITIAL_ZOOM);
initPlanetFocus(group, camera, 5.0);

if (typeof InteractionState !== 'undefined')
{
    InteractionState.targetRotationX = -0.2;
    InteractionState.targetRotationY = 0.0;
}
group.rotation.x = -0.2;
group.rotation.y = 0.0;

function animate(timestamp)
{
    if (!window.isReducedMotionRequested || !window.isReducedMotionRequested())
    {
        animationLoop.schedule();
    }
    const dt = nextDeltaTime(timestamp);
    frameSampler.sample(timestamp);
    surfaceConvergence.update(timestamp);

    // 1. 地表逆行自转（真实恒星周 243 天几乎不可见，
    //    演示节奏压缩至 ~7 分钟/圈，保持"最慢天体"的相对次序）
    venusSurfaceGroup.rotation.y -= 0.00025 * dt;

    // 2. 大气超自转（云层明显快于地表，保留差速流动观感）
    cloudGroup.rotation.y -= 0.0011 * dt;

    // 3. 云层流动亮度：顶点着色器计算，CPU 仅更新时间 uniform
    venusCloudUniforms.uTime.value = Date.now() * 0.00005;
    venusCloudUniforms.uScale.value = renderer.domElement.height * 0.5;

    // 4. 视角和缩放控制
    updateInteraction(group, camera);

    // 5. 遥测数据更新 (以云层组作为参考系，因为它是主要视觉对象)
    updatePlanetTelemetry(cloudGroup, tgtLabel, 2);

    renderer.render(scene, camera);
}

const animationLoop = window.createMotionAwareAnimation(animate);
animate();
