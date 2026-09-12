// ==========================================
// NASA-Punk Project: SOL-IV (MARS) - POINT CLOUD MOONS
// ==========================================

// --- PART 1+2: 场景初始化（共享工厂：背景/相机/渲染器/resize） ---
// [CONFIG] 保持拉远的视角以容纳卫星
const INITIAL_ZOOM = 30;

const {scene, camera, renderer, group, tgtLabel} = createPlanetScene({
    name       : 'mars',
    zoom       : INITIAL_ZOOM,
    noiseOffset: 100
});

// 帧率无关的动画步长因子（60fps 校准基准）
const nextDeltaTime = createFrameDelta();

// 1. 倾角容器
const planetTiltGroup      = new THREE.Group();
planetTiltGroup.rotation.z = 25.19 * (Math.PI / 180);
group.add(planetTiltGroup);

// 2. 自转容器 - CORE (承载地表)
const marsSurfaceGroup = new THREE.Group();
planetTiltGroup.add(marsSurfaceGroup);

// 3. 自转容器 - ATMOS (承载大气)
const marsAtmosGroup = new THREE.Group();
planetTiltGroup.add(marsAtmosGroup);

// 4. 卫星系统容器
const marsMoonGroup = new THREE.Group();
planetTiltGroup.add(marsMoonGroup);

let frameSampler;
let surfaceConvergence;


// --- PART 3: 程序化火星主体 ---
const coreRadius = 5.0;
let moonsData    = [];

// --- A. 地表点云 (Surface: Dusty Rock) ---
function createMarsSurface()
{
    const planetName = 'mars';
    const colBase  = new THREE.Color('#94544d');
    const colDark  = new THREE.Color('#6b433c');
    const colLight = new THREE.Color('#d98c6b');
    const noiseGen = new SimplexNoise('mars-craters-dust');
    const surfaceColor = new THREE.Color();

    function sampleSurfaceParticle(i, positions, colors)
    {
        const r     = coreRadius;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi);

        let nBase   = noiseGen.noise3D(x * 0.3, y * 0.3, z * 0.3);
        let nDetail = noiseGen.noise3D(x * 1.5, y * 1.5, z * 1.5);
        let nCrater = Math.abs(noiseGen.noise3D(x * 2.5, y * 2.5, z * 2.5));

        const canyonFactor = (x > 0 && y < 0.5 && y > -0.5) ? Math.abs(z / r) : 0;

        const heightMod = nBase * 0.04 + nDetail * 0.02 - nCrater * 0.05 - canyonFactor * 0.03;

        x *= (1 + heightMod / r);
        y *= (1 + heightMod / r);
        z *= (1 + heightMod / r);

        const offset = i * 3;
        positions[offset]     = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;

        const c   = surfaceColor;
        let val = (nBase + 1) / 2;

        if (nCrater > 0.7)
        {
            c.copy(colDark);
        }
        else if (val > 0.6 || canyonFactor > 0.1)
        {
            c.copy(colLight).lerp(colBase, 0.3);
        }
        else
        {
            c.copy(colBase);
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
        group: marsSurfaceGroup,
        onReady()
        {
            renderer.render(scene, camera);
            ParticleBuilder.markReady({page: planetName});
        }
    });
    frameSampler = surface.frameSampler;
    surfaceConvergence = createSurfaceConvergence(surface.points);

    // 测量网格
    const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(coreRadius + 0.02, 24, 12));
    const wireMat = new THREE.LineBasicMaterial({
        color      : '#dd4f31',
        transparent: true,
        opacity    : 0.08
    });
    marsSurfaceGroup.add(new THREE.LineSegments(wireGeo, wireMat));
}

createMarsSurface();


// --- B. 极稀薄大气 (Atmosphere/Haze) ---
function createMarsAtmosphere()
{
    const atmosParticles = 15000;
    const atmosPos       = new Float32Array(atmosParticles * 3);
    const atmosColors    = new Float32Array(atmosParticles * 3);

    const colHaze = new THREE.Color('#ffc840');
    const rBase   = coreRadius + 0.1;

    for (let i = 0; i < atmosParticles; i++)
    {
        const r     = rBase + Math.random() * 0.3;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        const idx = i * 3;
        atmosPos[idx]     = x;
        atmosPos[idx + 1] = y;
        atmosPos[idx + 2] = z;

        const factor = 0.5 + Math.random() * 0.5;
        atmosColors[idx]     = colHaze.r * factor;
        atmosColors[idx + 1] = colHaze.g * factor;
        atmosColors[idx + 2] = colHaze.b * factor;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(atmosPos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(atmosColors, 3));

    const mat = new THREE.PointsMaterial({
        size           : 0.06,
        vertexColors   : true,
        transparent    : true,
        opacity        : 0.08,
        sizeAttenuation: true
    });

    marsAtmosGroup.add(new THREE.Points(geo, mat));
}

createMarsAtmosphere();


// --- C. 卫星系统 (Phobos & Deimos - PURE POINT CLOUD STYLE) ---
// 参照 earth.js 中 createMoon 的风格：高密度点云 + 极淡网格
function createMarsMoons()
{
    // 艺术化参数
    const moonsConfig = [
        {
            name  : "Phobos",
            radius: 7.5,
            // 公转周期 0.319 天，比火星自转更快（西升东落）
            speed : 0.00469,
            // 基础大小 0.25, 形状扭曲因子(土豆状)
            baseSize     : 0.25,
            scale        : {x: 1.3, y: 1.0, z: 0.8},
            color        : 0xcccccc,
            particleCount: 600
        },
        {
            name         : "Deimos",
            radius       : 12.0,
            // 公转周期 1.263 天
            speed        : 0.00118,
            baseSize     : 0.18,
            scale        : {x: 0.9, y: 0.7, z: 0.7}, // 极度不规则
            color        : 0xaaaaaa,
            particleCount: 400
        }
    ];

    moonsConfig.forEach(config =>
    {
        const satOrbit      = new THREE.Group();
        satOrbit.rotation.x = Math.random() * 0.05;
        satOrbit.rotation.y = Math.random() * Math.PI * 2;
        marsMoonGroup.add(satOrbit);

        // 1. 轨道线 (保持一致)
        const orbitPoints = 128;
        const orbitGeo    = new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, config.radius, config.radius, 0, 2 * Math.PI).getPoints(orbitPoints));
        const orbitLine   = new THREE.Line(orbitGeo, new THREE.LineDashedMaterial({
            color      : config.color,
            transparent: true,
            opacity    : 0.15,
            dashSize   : config.name === "Phobos" ? 0.5 : 1.0,
            gapSize    : config.name === "Phobos" ? 0.3 : 0.5
        }));
        orbitLine.computeLineDistances();
        orbitLine.rotation.x = Math.PI / 2;
        satOrbit.add(orbitLine);

        // 卫星本体组
        const moonBody = new THREE.Group();
        moonBody.position.set(config.radius, 0, 0);
        satOrbit.add(moonBody);

        // 2. 程序化点云 (主体)
        // 使用 SimplexNoise + 缩放 模拟不规则小行星形态
        const moonPos   = new Float32Array(config.particleCount * 3);
        const moonCols  = new Float32Array(config.particleCount * 3);
        const moonGen   = new SimplexNoise('mars-moon-' + config.name);
        const mColBase  = new THREE.Color(config.color);
        const mColDark  = new THREE.Color(config.color).multiplyScalar(0.4);
        const tempColor = new THREE.Color();

        for (let i = 0; i < config.particleCount; i++)
        {
            // 在单位球体内随机采样
            const rBase = 1.0;
            const theta = Math.random() * Math.PI * 2;
            const phi   = Math.acos(2 * Math.random() - 1);

            let x = rBase * Math.sin(phi) * Math.cos(theta);
            let y = rBase * Math.sin(phi) * Math.sin(theta);
            let z = rBase * Math.cos(phi);

            // 叠加 3D 噪波，制造表面坑洼
            let n    = moonGen.noise3D(x * 2.0, y * 2.0, z * 2.0);
            let rMod = 1.0 + n * 0.15; // 高度扰动

            // 应用不规则缩放 (Scale) -> 变成土豆
            x *= rMod * config.scale.x * config.baseSize;
            y *= rMod * config.scale.y * config.baseSize;
            z *= rMod * config.scale.z * config.baseSize;

            const idx = i * 3;
            moonPos[idx]     = x;
            moonPos[idx + 1] = y;
            moonPos[idx + 2] = z;

            // 颜色：基于噪波做明暗变化
            const c = tempColor;
            if (n < -0.2)
            {
                c.copy(mColDark); // 坑底深色
            }
            else
            {
                c.copy(mColBase);
            }
            // 随机杂色
            c.multiplyScalar(0.9 + Math.random() * 0.2);
            moonCols[idx]     = c.r;
            moonCols[idx + 1] = c.g;
            moonCols[idx + 2] = c.b;
        }

        const moonPointsGeo = new THREE.BufferGeometry();
        moonPointsGeo.setAttribute('position', new THREE.BufferAttribute(moonPos, 3));
        moonPointsGeo.setAttribute('color', new THREE.BufferAttribute(moonCols, 3));

        const moonPointsMat = new THREE.PointsMaterial({
            size           : 0.035, // 点大小适中，类似月球
            vertexColors   : true,
            transparent    : true,
            opacity        : 1.0, // 点云不透明，清晰可见
            sizeAttenuation: true
        });
        moonBody.add(new THREE.Points(moonPointsGeo, moonPointsMat));

        // 3. 极淡网格 (背景辅助)
        // 为了匹配形状，我们简单生成一个稍微大一点点的 Icosahedron 并缩放
        const wireGeoRaw = new THREE.IcosahedronGeometry(1.0, 1);
        // 手动应用缩放
        wireGeoRaw.scale(config.scale.x * config.baseSize * 1.05, config.scale.y * config.baseSize * 1.05, config.scale.z * config.baseSize * 1.05);

        const wireGeo = new THREE.WireframeGeometry(wireGeoRaw);
        const wireMat = new THREE.LineBasicMaterial({
            color      : config.color,
            transparent: true,
            opacity    : 0.08 // [FIX] 极低透明度，不易察觉
        });
        moonBody.add(new THREE.LineSegments(wireGeo, wireMat));

        moonsData.push({
            mesh    : moonBody,
            speed   : config.speed,
            radius  : config.radius,
            angle   : Math.random() * Math.PI * 2,
            isPhobos: config.name === "Phobos"
        });
    });
}

createMarsMoons();


// ==========================================
// PART 5: 交互与动画循环
// ==========================================

initInteraction(group, INITIAL_ZOOM);
initPlanetFocus(group, camera, 5.3);

if (typeof InteractionState !== 'undefined')
{
    InteractionState.targetRotationX = 0.2;
    InteractionState.targetRotationY = 0.0;
}
group.rotation.x = 0.2;
group.rotation.y = 0.0;

let frameCount = 0;
let pendingDynamicDelta = 0;

function animate(timestamp)
{
    if (!window.isReducedMotionRequested || !window.isReducedMotionRequested())
    {
        animationLoop.schedule();
    }
    const dt = nextDeltaTime(timestamp);
    pendingDynamicDelta += dt;
    frameCount++;
    frameSampler.sample(timestamp);
    surfaceConvergence.update(timestamp);

    // 自转周期 24.62 小时，与地球几乎相同；演示节奏与地球一致（~87 秒/圈）
    marsSurfaceGroup.rotation.y += 0.0012 * dt;
    if (frameCount % frameSampler.dynamicStride === 0)
    {
        const dynamicDt = pendingDynamicDelta;
        pendingDynamicDelta = 0;
        marsAtmosGroup.rotation.y += 0.00144 * dynamicDt;

        moonsData.forEach(moon =>
        {
            moon.angle += moon.speed * dynamicDt;
            moon.mesh.position.x = moon.radius * Math.cos(moon.angle);
            moon.mesh.position.z = moon.radius * Math.sin(moon.angle);

            // 缓慢的不规则自转
            if (moon.isPhobos)
            {
                moon.mesh.rotation.z -= 0.01 * dynamicDt;
                moon.mesh.rotation.y += 0.005 * dynamicDt;
            }
            else
            {
                moon.mesh.rotation.y += 0.002 * dynamicDt;
                moon.mesh.rotation.x += 0.003 * dynamicDt;
            }
        });
    }

    updateInteraction(group, camera);
    updatePlanetTelemetry(marsSurfaceGroup, tgtLabel, 1);

    renderer.render(scene, camera);
}

const animationLoop = window.createMotionAwareAnimation(animate);
animate();
