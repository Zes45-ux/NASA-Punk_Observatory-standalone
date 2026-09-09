// ==========================================
// NASA-Punk Project: SUN
// ==========================================

// --- PART 1+2: 场景初始化（共享工厂：背景/相机/渲染器/resize） ---
const INITIAL_ZOOM = 30;

const {scene, camera, renderer, group, tgtLabel} = createPlanetScene({
    name       : 'sun',
    zoom       : INITIAL_ZOOM,
    noiseOffset: 100,
    overlayFill: 'rgba(200, 35, 55, 0.03)'
});

// 帧率无关的动画步长因子（60fps 校准基准）
const nextDeltaTime = createFrameDelta();

// 太阳自转轴相对黄道面倾角 7.25 度
const sunTiltGroup      = new THREE.Group();
sunTiltGroup.rotation.z = 7.25 * (Math.PI / 180);
group.add(sunTiltGroup);

const sunGroup = new THREE.Group();
sunTiltGroup.add(sunGroup);


// --- A. 静态高密度粒子光球 + 动态叠加层 (Photosphere) ---
let frameSampler;
let surfaceConvergence;
const sunNoiseGen = new SimplexNoise('sol-core-v1');
const timeStep    = 0.005;

const colCore          = new THREE.Color('#ffffff');
const colSurface       = new THREE.Color('#ffb84d');
const colEdge          = new THREE.Color('#cc4400');
const colSpot          = new THREE.Color('#8a1c00');
const colEruptHot      = new THREE.Color('#ffffff');
const colEruptMid      = new THREE.Color('#ffcc00');
const colEruptCool     = new THREE.Color('#8a1c00');
const staticSurfaceColor = new THREE.Color();
const scratchColor      = new THREE.Color();
const directionToCenter = new THREE.Vector3();
const eruptionStartPos  = new THREE.Vector3();
const eruptionNormal    = new THREE.Vector3();
const eruptionOffset    = new THREE.Vector3();
const eruptionPosition  = new THREE.Vector3();
const eruptionSpread    = new THREE.Vector3();

function sampleSunSurfaceParticle(i, positions, colors)
{
    const r     = 6.0;
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const x     = r * Math.sin(phi) * Math.cos(theta);
    const y     = r * Math.sin(phi) * Math.sin(theta);
    const z     = r * Math.cos(phi);

    let n = sunNoiseGen.noise3D(x * 0.4, y * 0.4, z * 0.4);
    n += 0.5 * sunNoiseGen.noise3D(x * 1.5, y * 1.5, z * 1.5);

    const c = staticSurfaceColor;
    if (n > 0.6)
    {
        c.copy(colCore);
    }
    else if (n > 0.0)
    {
        c.copy(colSurface).lerp(colCore, n);
    }
    else if (n > -0.5)
    {
        c.copy(colEdge).lerp(colSurface, (n + 0.5) * 2);
    }
    else
    {
        c.copy(colSpot).lerp(colEdge, (n + 1.0) * 2);
    }

    const limbFactor = z / 6.0;
    if (limbFactor < 0.5)
    {
        c.lerp(colSpot, (0.5 - limbFactor) * 1.5);
    }

    const offset = i * 3;
    const pulse  = 1.0 + n * 0.05;
    positions[offset]     = x * pulse;
    positions[offset + 1] = y * pulse;
    positions[offset + 2] = z * pulse;
    colors[offset]        = c.r;
    colors[offset + 1]    = c.g;
    colors[offset + 2]    = c.b;
}

function createSunSurface()
{
    const planetName = 'sun';
    const surface = ParticleBuilder.createSurfaceBuild({
        planetName,
        budget: PLANET_PARTICLE_CONFIG[planetName].surface,
        sample: sampleSunSurfaceParticle,
        material: {
            size           : 0.09,
            vertexColors   : true,
            transparent    : true,
            opacity        : 0.95,
            blending       : THREE.AdditiveBlending,
            sizeAttenuation: true
        },
        group: sunGroup,
        onReady()
        {
            renderer.render(scene, camera);
            ParticleBuilder.markReady({page: planetName});
        }
    });
    frameSampler = surface.frameSampler;
    surfaceConvergence = createSurfaceConvergence(surface.points);
}

createSunSurface();

let sunPhotosphereUniforms;

function createDynamicSun()
{
    const particleCount = 30000;
    const positions     = [];

    for (let i = 0; i < particleCount; i++)
    {
        const r     = 6.0;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const x     = r * Math.sin(phi) * Math.cos(theta);
        const y     = r * Math.sin(phi) * Math.sin(theta);
        const z     = r * Math.cos(phi);

        positions.push(x, y, z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    // 光球脉动（噪声亮度 + 半径脉冲 + 临边昏暗）全部在顶点着色器内完成，
    // CPU 每帧只更新 uTime/uScale，不再回传 30k×2 属性
    sunPhotosphereUniforms = {
        uTime : {value: 0},
        uSize : {value: 0.09},
        uScale: {value: 300},
        uColCore   : {value: colCore},
        uColSurface: {value: colSurface},
        uColEdge   : {value: colEdge},
        uColSpot   : {value: colSpot}
    };

    const sunMat = new THREE.ShaderMaterial({
        uniforms      : sunPhotosphereUniforms,
        vertexShader  : PLANET_GLSL.snoise3D + `
            uniform float uTime;
            uniform float uSize;
            uniform float uScale;
            uniform vec3 uColCore;
            uniform vec3 uColSurface;
            uniform vec3 uColEdge;
            uniform vec3 uColSpot;
            varying vec3 vColor;

            void main() {
                vec3 p = position;
                float n = snoise(vec3(p.x * 0.4, p.y * 0.4, p.z * 0.4 + uTime * 0.3));
                n += 0.5 * snoise(vec3(p.x * 1.5, p.y * 1.5, p.z * 1.5 - uTime * 0.5));

                vec3 c;
                if (n > 0.6) {
                    c = uColCore;
                } else if (n > 0.0) {
                    c = mix(uColSurface, uColCore, n);
                } else if (n > -0.5) {
                    c = mix(uColEdge, uColSurface, (n + 0.5) * 2.0);
                } else {
                    c = mix(uColSpot, uColEdge, (n + 1.0) * 2.0);
                }

                float limbFactor = p.z / 6.0;
                if (limbFactor < 0.5) {
                    c = mix(c, uColSpot, (0.5 - limbFactor) * 1.5);
                }
                vColor = c;

                vec3 newPos = p * (1.0 + n * 0.05);
                vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
                gl_PointSize = uSize * (uScale / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }`,
        fragmentShader: `
            varying vec3 vColor;
            void main() { gl_FragColor = vec4(vColor, 0.95); }`,
        transparent   : true,
        blending      : THREE.AdditiveBlending
    });

    sunGroup.add(new THREE.Points(geometry, sunMat));
}

createDynamicSun();


// --- A-2. 太阳核心 (Dense Core) ---
let coreParticles;

function createSunCore()
{
    const particleCount = 5000;
    const positions     = [];
    const colors        = [];

    const colorCoreHot   = colCore;
    const colorCoreInner = colSurface;
    const coreColor      = new THREE.Color();

    for (let i = 0; i < particleCount; i++)
    {
        const r     = 4.0 + Math.random() * 1.5;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const x     = r * Math.sin(phi) * Math.cos(theta);
        const y     = r * Math.sin(phi) * Math.sin(theta);
        const z     = r * Math.cos(phi);

        positions.push(x, y, z);

        const c           = coreColor;
        const normalizedR = (r - 4.0) / 1.5;
        c.copy(colorCoreHot).lerp(colorCoreInner, normalizedR);

        colors.push(c.r, c.g, c.b);
    }

    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    coreGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const coreMat = new THREE.PointsMaterial({
        size        : 0.12,
        vertexColors: true,
        transparent : true,
        opacity     : 0.85,
        blending    : THREE.AdditiveBlending
    });

    coreParticles = new THREE.Points(coreGeo, coreMat);
    sunGroup.add(coreParticles);
}

createSunCore();


// --- B. 磁场环 (Magnetic Loops) ---
const magneticGroup = new THREE.Group();
sunGroup.add(magneticGroup);
const activeLoops = [];

function createMagneticLoops()
{
    const loopCount = 12;

    for (let i = 0; i < loopCount; i++)
    {
        const r      = 5.8;
        const theta1 = Math.random() * Math.PI * 2;
        const phi1   = Math.acos(2 * Math.random() - 1);
        const p1     = new THREE.Vector3().setFromSphericalCoords(r, phi1, theta1);
        const offset = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
        const p2     = p1.clone().add(offset).normalize().multiplyScalar(r);
        const mid    = p1.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(r * (1.3 + Math.random() * 0.5));

        const curve       = new THREE.CubicBezierCurve3(p1, p1.clone().lerp(mid, 0.5), p2.clone().lerp(mid, 0.5), p2);
        const points      = curve.getPoints(60);
        const particleGeo = new THREE.BufferGeometry().setFromPoints(points);

        const rand    = Math.random();
        let loopColor = 0xe06236;
        if (rand > 0.6)
        {
            loopColor = 0xffb84d;
        }
        else if (rand < 0.3)
        {
            loopColor = 0xcc4400;
        }

        const particleMat = new THREE.PointsMaterial({
            color      : loopColor,
            size       : 0.05,
            transparent: true,
            opacity    : 0.6,
            blending   : THREE.AdditiveBlending
        });

        const mesh = new THREE.Points(particleGeo, particleMat);
        magneticGroup.add(mesh);
        activeLoops.push({
            mesh      : mesh,
            flowOffset: Math.random() * 100
        });
    }
}

createMagneticLoops();


// --- C. 动态日冕 (Dynamic Corona) ---
const coronaGroup = new THREE.Group();
sunGroup.add(coronaGroup);

let coronaUniforms;

function createCoronaSystem()
{
    const coronaParticles = 6000;
    const positions       = [];
    const colors          = [];
    const sizes           = [];
    const directions      = [];
    const speeds          = [];
    const phases          = [];

    const colInner = new THREE.Color('#ffcc66');
    const colOuter = new THREE.Color('#cc4400');
    const coronaColor = new THREE.Color();

    for (let i = 0; i < coronaParticles; i++)
    {
        const t = Math.pow(Math.random(), 1.5);
        const r = 6.1 + t * 3.0;

        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        positions.push(x, y, z);

        const normalizedDist = (r - 6.1) / 3.0;
        coronaColor.copy(colInner).lerp(colOuter, normalizedDist);
        coronaColor.multiplyScalar(0.8 + Math.random() * 0.4);
        colors.push(coronaColor.r, coronaColor.g, coronaColor.b);

        sizes.push(0.18 * (1.0 - normalizedDist * 0.5));

        const len = Math.sqrt(x * x + y * y + z * z);
        directions.push(x / len, y / len, z / len);
        speeds.push(0.003 + Math.random() * 0.007);
        phases.push(Math.random() * 3.0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aDirection', new THREE.Float32BufferAttribute(directions, 3));
    geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));

    // 日冕粒子沿径向循环外溢（模运算代替 CPU 逐帧积分），径向抖动在着色器内计算；
    // uTime 用帧计数值驱动，速度保持与旧逐帧积分一致的量纲
    coronaUniforms = {
        uTime  : {value: 0},
        uScale : {value: 300},
        uBaseR : {value: 5.1},
        uTravel: {value: 3.0}
    };

    const mat = new THREE.ShaderMaterial({
        uniforms      : coronaUniforms,
        vertexShader  : PLANET_GLSL.snoise3D + `
            uniform float uTime;
            uniform float uScale;
            uniform float uBaseR;
            uniform float uTravel;
            attribute vec3 aColor;
            attribute vec3 aDirection;
            attribute float aSpeed;
            attribute float aPhase;
            attribute float aSize;
            varying vec3 vColor;

            void main() {
                float r = uBaseR + mod(aPhase + aSpeed * uTime, uTravel);
                vec3 base = aDirection * r;
                vec3 jitter = vec3(
                    snoise(base * 0.5 + vec3(uTime * 0.5, 0.0, 0.0)),
                    snoise(base * 0.5 + vec3(0.0, uTime * 0.5, 0.0)),
                    snoise(base * 0.5 + vec3(0.0, 0.0, uTime * 0.5))
                ) * 0.03;
                vColor = aColor;
                vec4 mvPosition = modelViewMatrix * vec4(base + jitter, 1.0);
                gl_PointSize = aSize * (uScale / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }`,
        fragmentShader: `
            varying vec3 vColor;
            void main() { gl_FragColor = vec4(vColor, 0.4); }`,
        transparent   : true,
        blending      : THREE.AdditiveBlending,
        depthWrite    : false
    });

    const mesh = new THREE.Points(geo, mat);
    coronaGroup.add(mesh);
    return mesh;
}

const coronaMesh = createCoronaSystem();


// --- D. 标准双层网格 (Observation Grids) ---
const gridGroup = new THREE.Group();
sunGroup.add(gridGroup);

function createSunGrid()
{
    const geo1  = new THREE.WireframeGeometry(new THREE.SphereGeometry(6.0, 24, 24));
    const mat1  = new THREE.LineBasicMaterial({
        color      : 0xffb84d,
        transparent: true,
        opacity    : 0.15
    });
    const mesh1 = new THREE.LineSegments(geo1, mat1);
    gridGroup.add(mesh1);

    const geo2  = new THREE.WireframeGeometry(new THREE.SphereGeometry(6.5, 32, 32));
    const mat2  = new THREE.LineBasicMaterial({
        color      : 0xcc4400,
        transparent: true,
        opacity    : 0.05
    });
    const mesh2 = new THREE.LineSegments(geo2, mat2);
    gridGroup.add(mesh2);

    return {
        inner: mesh1,
        outer: mesh2
    };
}

const sunGrids = createSunGrid();


// --- D-2. 小行星带 (Asteroid Belt, 2.2-3.3 AU 示意比例) ---
// 火星与木星轨道之间的主带：3 万粒子一次性生成、位置完全静态，
// 仅整组做极慢公转（animate 内单次 O(1) 更新）
const asteroidBeltGroup = new THREE.Group();
sunTiltGroup.add(asteroidBeltGroup);

function createAsteroidBelt()
{
    const beltParticles = 30000;
    const positions     = [];
    const colors        = [];
    const beltColor     = new THREE.Color();
    const colRock       = new THREE.Color('#6b5d4f');
    const colIce        = new THREE.Color('#a89a86');

    for (let i = 0; i < beltParticles; i++)
    {
        // 内密外疏 + 轻微密度起伏，带内厚度向边缘收敛
        const r     = 11.5 + Math.pow(Math.random(), 0.8) * 4.0;
        const theta = Math.random() * Math.PI * 2;
        const falloff = 1.0 - (r - 11.5) / 4.0 * 0.6;
        const y     = (Math.random() - 0.5) * 0.8 * falloff;

        positions.push(r * Math.cos(theta), y, r * Math.sin(theta));

        beltColor.copy(colRock).lerp(colIce, Math.random() * 0.6);
        const shade = 0.45 + Math.random() * 0.55;
        colors.push(beltColor.r * shade, beltColor.g * shade, beltColor.b * shade);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size           : 0.07,
        vertexColors   : true,
        transparent    : true,
        opacity        : 0.45,
        sizeAttenuation: true,
        depthWrite     : false
    });

    const beltPoints = new THREE.Points(geo, mat);
    asteroidBeltGroup.add(beltPoints);
    return beltPoints;
}

const asteroidBelt = createAsteroidBelt();
// 带内颗粒尺寸打散（消除均一点径的塑料感）+ 按画质档位缩放可见数量
// （balanced 2.25 万 / low 1.5 万 / recovery 7.5 千），均为一次性配置
createPointSizeJitter(asteroidBelt, {min: 0.5, max: 1.6});
createQualityDrawRange(asteroidBelt);


// --- E. 日面喷发 (Solar Eruptions) ---
const eruptionGroup = new THREE.Group();
sunGroup.add(eruptionGroup);
const maxEruptionParticles = 2000;
const eruptionGeo          = new THREE.BufferGeometry();
const eruptionPositions    = new Float32Array(maxEruptionParticles * 3);
const eruptionColors       = new Float32Array(maxEruptionParticles * 3);
const eruptionData         = [];

for (let i = 0; i < maxEruptionParticles; i++)
{
    eruptionPositions[i * 3]     = 0;
    eruptionPositions[i * 3 + 1] = 0;
    eruptionPositions[i * 3 + 2] = 0;
    eruptionColors[i * 3]        = 1;
    eruptionColors[i * 3 + 1]    = 1;
    eruptionColors[i * 3 + 2]    = 1;
    eruptionData.push({
        active  : false,
        velocity: new THREE.Vector3(),
        life    : 0,
        maxLife : 0,
        startPos: new THREE.Vector3()
    });
}
eruptionGeo.setAttribute('position', new THREE.BufferAttribute(eruptionPositions, 3));
eruptionGeo.setAttribute('color', new THREE.BufferAttribute(eruptionColors, 3));
const eruptionMat  = new THREE.PointsMaterial({
    size        : 0.15,
    vertexColors: true,
    transparent : true,
    opacity     : 0.95,
    blending    : THREE.AdditiveBlending
});
const eruptionMesh = new THREE.Points(eruptionGeo, eruptionMat);
eruptionGroup.add(eruptionMesh);

function triggerEruption()
{
    const r        = 6.0;
    const theta    = Math.random() * Math.PI * 2;
    const phi      = Math.acos(2 * Math.random() - 1);
    const startPos = eruptionStartPos.setFromSphericalCoords(r, phi, theta);
    const normal   = eruptionNormal.copy(startPos).normalize();

    let count       = 0;
    const batchSize = 60 + Math.floor(Math.random() * 40);

    for (let i = 0; i < maxEruptionParticles; i++)
    {
        if (!eruptionData[i].active)
        {
            eruptionData[i].active  = true;
            eruptionData[i].life    = 0;
            eruptionData[i].maxLife = 300 + Math.random() * 200;

            const offset = eruptionOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.2);
            const pos    = eruptionPosition.copy(startPos).add(offset);

            eruptionPositions[i * 3]     = pos.x;
            eruptionPositions[i * 3 + 1] = pos.y;
            eruptionPositions[i * 3 + 2] = pos.z;
            eruptionData[i].startPos.copy(pos);

            const speed  = 0.05 + Math.random() * 0.04;
            const spread = eruptionSpread.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.02);
            eruptionData[i].velocity.copy(normal).multiplyScalar(speed).add(spread);

            count++;
            if (count >= batchSize)
            {
                break;
            }
        }
    }
}

initInteraction(group, INITIAL_ZOOM);
initPlanetFocus(group, camera, 6.2);

if (typeof InteractionState !== 'undefined')
{
    InteractionState.targetRotationX = 0.0;
    InteractionState.targetRotationY = 0.0;
}
group.rotation.x = 0.0;
group.rotation.y = 0.0;

let time = 0;
let frameCount = 0;
let pendingDynamicDelta = 0;
let coronaTime = 0;

function animate(timestamp)
{
    if (!window.isReducedMotionRequested || !window.isReducedMotionRequested())
    {
        requestAnimationFrame(animate);
    }
    const dt = nextDeltaTime(timestamp);
    pendingDynamicDelta += dt;
    frameCount++;
    coronaTime += dt;
    frameSampler.sample(timestamp);
    surfaceConvergence.update(timestamp);
    time += timeStep * dt;

    // 自转周期 ~25.4 天（赤道）。真实速率下几乎不可见，
    // 演示节奏压缩至 ~4 分钟/圈，慢于地球、快于水星（保持真实次序）
    sunGroup.rotation.y += 0.00045 * dt;

    // 小行星带整体极慢公转（单次 O(1) 更新，粒子位置保持静态）
    asteroidBeltGroup.rotation.y += 0.0002 * dt;

    if (coreParticles)
    {
        coreParticles.rotation.y += 0.002 * dt;
        const pulse = 1.0 + Math.sin(time * 3.0) * 0.005;
        coreParticles.scale.set(pulse, pulse, pulse);
    }

    if (sunGrids)
    {
        sunGrids.inner.rotation.y += 0.0005 * dt;
        sunGrids.outer.rotation.y -= 0.0005 * dt;
        sunGrids.outer.rotation.z += 0.0002 * dt;
    }

    // 光球脉动与日冕外溢都在顶点着色器内完成，CPU 只更新 uniform
    const pointScale = renderer.domElement.height * 0.5;
    sunPhotosphereUniforms.uTime.value = time;
    sunPhotosphereUniforms.uScale.value = pointScale;
    // 以 60Hz 校准步长推进，避免 120Hz 显示器上的日冕外溢速度减半。
    coronaUniforms.uTime.value = coronaTime;
    coronaUniforms.uScale.value = pointScale;

    activeLoops.forEach((loop) =>
    {
        loop.mesh.material.opacity = 0.4 + Math.sin(time * 2 + loop.flowOffset) * 0.2;
    });

    if (frameCount % frameSampler.dynamicStride === 0)
    {
        const dynamicDt = pendingDynamicDelta;
        pendingDynamicDelta = 0;
        if (Math.random() > Math.pow(0.995, dynamicDt))
        {
            triggerEruption();
        }

        const pPos = eruptionGeo.attributes.position.array;
        const pCol = eruptionGeo.attributes.color.array;

        const slowMo = 0.15;

        for (let i = 0; i < maxEruptionParticles; i++)
        {
            if (eruptionData[i].active)
            {
                pPos[i * 3] += eruptionData[i].velocity.x * slowMo * dynamicDt;
                pPos[i * 3 + 1] += eruptionData[i].velocity.y * slowMo * dynamicDt;
                pPos[i * 3 + 2] += eruptionData[i].velocity.z * slowMo * dynamicDt;

                const cx          = pPos[i * 3];
                const cy          = pPos[i * 3 + 1];
                const cz          = pPos[i * 3 + 2];
                const currentDist = Math.sqrt(cx * cx + cy * cy + cz * cz);
                directionToCenter.set(-cx, -cy, -cz).normalize();

                const noiseScale = 0.5;
                const nX         = sunNoiseGen.noise4D(cx * noiseScale, cy * noiseScale, cz * noiseScale, time) * 0.003 * dynamicDt;
                const nY         = sunNoiseGen.noise4D(cy * noiseScale, cz * noiseScale, cx * noiseScale, time + 100) * 0.003 * dynamicDt;
                const nZ         = sunNoiseGen.noise4D(cz * noiseScale, cx * noiseScale, cy * noiseScale, time + 200) * 0.003 * dynamicDt;

                eruptionData[i].velocity.x += nX * slowMo;
                eruptionData[i].velocity.y += nY * slowMo;
                eruptionData[i].velocity.z += nZ * slowMo;

                eruptionData[i].velocity.addScaledVector(directionToCenter, 0.002 * slowMo * dynamicDt);
                eruptionData[i].velocity.multiplyScalar(1.0 - (0.003 * slowMo * dynamicDt));

                eruptionData[i].life += 1.0 * slowMo * dynamicDt;
                const progress = eruptionData[i].life / eruptionData[i].maxLife;

                const c = scratchColor;
                if (progress < 0.15)
                {
                    c.copy(colEruptHot).lerp(colEruptMid, progress / 0.15);
                }
                else
                {
                    c.copy(colEruptMid).lerp(colEruptCool, (progress - 0.15) / 0.85);
                }

                pCol[i * 3]     = c.r;
                pCol[i * 3 + 1] = c.g;
                pCol[i * 3 + 2] = c.b;

                if (eruptionData[i].life >= eruptionData[i].maxLife || currentDist < 5.8)
                {
                    eruptionData[i].active = false;
                    pPos[i * 3]            = 0;
                    pPos[i * 3 + 1]        = 0;
                    pPos[i * 3 + 2]        = 0;
                }
            }
        }

        eruptionGeo.attributes.position.needsUpdate = true;
        eruptionGeo.attributes.color.needsUpdate    = true;
    }

    updateInteraction(group, camera);
    updatePlanetTelemetry(sunGroup, tgtLabel, 1);

    renderer.render(scene, camera);
}

animate();
