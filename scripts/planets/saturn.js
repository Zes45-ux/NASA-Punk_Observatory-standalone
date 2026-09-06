// ==========================================
// NASA-Punk Project: SATURN
// ==========================================

// --- PART 1+2: 场景初始化（共享工厂：背景/相机/渲染器/resize） ---
const INITIAL_ZOOM = 42;

const {scene, camera, renderer, group, tgtLabel} = createPlanetScene({
    name       : 'saturn',
    zoom       : INITIAL_ZOOM,
    noiseOffset: 100
});

// 帧率无关的动画步长因子（60fps 校准基准）
const nextDeltaTime = createFrameDelta();

// 1. 倾角容器（真实 axial tilt 26.73°，x 轴为展示视角补偿）
const saturnTiltGroup      = new THREE.Group();
saturnTiltGroup.rotation.z = 26.73 * (Math.PI / 180);
saturnTiltGroup.rotation.x = 15 * (Math.PI / 180);
group.add(saturnTiltGroup);

// 2. 自转容器
const planetSpinGroup = new THREE.Group();
saturnTiltGroup.add(planetSpinGroup);

// 3. 大气层独立容器
const planetAtmoGroup = new THREE.Group();
saturnTiltGroup.add(planetAtmoGroup);

const ringUniforms = {
    uTime: {
        value: 0.0
    }
};
let frameSampler;


// --- A. 程序化气态巨行星 (SATURN) ---
function createGasGiant()
{
    const planetName = 'saturn';
    const noiseGen      = new SimplexNoise('saturn-seed-v2');

    const saturnCream = new THREE.Color('#f4f0d5');
    const saturnBeige = new THREE.Color('#d9c37c');
    const saturnTan   = new THREE.Color('#a68f58');
    const saturnBlue  = new THREE.Color('#6b7e8c');
    const surfaceColor = new THREE.Color();

    function sampleSurfaceParticle(i, positions, colors)
    {
        const r     = 5.4 + Math.random() * 0.1;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const x     = r * Math.sin(phi) * Math.cos(theta);
        const y     = r * Math.sin(phi) * Math.sin(theta);
        const z     = r * Math.cos(phi);

        const offset = i * 3;
        positions[offset]     = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;

        let n    = noiseGen.noise3D(x * 2.5, y * 0.8, z * 2.5);
        let band = Math.sin(y * 3.5 + n * 0.3);

        const c = surfaceColor;
        if (band > 0.5)
        {
            c.copy(saturnCream);
        }
        else if (band < -0.3)
        {
            c.copy(saturnTan).lerp(saturnBeige, 0.4);
        }
        else
        {
            c.copy(saturnBeige).lerp(saturnCream, 0.3);
        }

        if (y > 3.0)
        {
            let blueMix = (y - 3.0) / 2.5;
            blueMix     = Math.min(1, Math.max(0, blueMix));
            c.lerp(saturnBlue, blueMix * 0.7);
        }

        if (Math.random() > 0.99)
        {
            c.addScalar(0.1);
        }

        colors[offset]     = c.r;
        colors[offset + 1] = c.g;
        colors[offset + 2] = c.b;
    }

    const surface = ParticleBuilder.createSurfaceBuild({
        planetName,
        budget: PLANET_PARTICLE_CONFIG[planetName].surface,
        sample: sampleSurfaceParticle,
        material: {
            size        : 0.06,
            vertexColors: true,
            transparent : true,
            opacity     : 0.95
        },
        group: planetSpinGroup,
        onReady()
        {
            renderer.render(scene, camera);
            ParticleBuilder.markReady({page: planetName});
        }
    });
    frameSampler = surface.frameSampler;

    // 平流层/雾霾
    const hazeCount = 15000;
    const hazePos   = [];
    const hazeCols  = [];
    const colHaze   = new THREE.Color('#f4f0d5');

    for (let i = 0; i < hazeCount; i++)
    {
        const r     = 5.6 + Math.random() * 0.1;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const x     = r * Math.sin(phi) * Math.cos(theta);
        const y     = r * Math.sin(phi) * Math.sin(theta);
        const z     = r * Math.cos(phi);

        hazePos.push(x, y, z);

        let c = new THREE.Color().copy(colHaze);
        c.multiplyScalar(0.8 + Math.random() * 0.4);

        if (y > 3.5)
        {
            c.lerp(saturnBlue, 0.3);
        }

        hazeCols.push(c.r, c.g, c.b);
    }

    const hazeGeo = new THREE.BufferGeometry();
    hazeGeo.setAttribute('position', new THREE.Float32BufferAttribute(hazePos, 3));
    hazeGeo.setAttribute('color', new THREE.Float32BufferAttribute(hazeCols, 3));

    const hazeMat    = new THREE.PointsMaterial({
        size        : 0.05,
        vertexColors: true,
        transparent : true,
        opacity     : 0.3
    });
    const planetHaze = new THREE.Points(hazeGeo, hazeMat);
    planetAtmoGroup.add(planetHaze);

    const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(5.6, 24, 16));
    const wireMat = new THREE.LineBasicMaterial({
        color      : '#c2b280',
        transparent: true,
        opacity    : 0.1
    });
    planetSpinGroup.add(new THREE.LineSegments(wireGeo, wireMat));

    const polarHexagonPoints = [];
    const polarHexagonRadius = 1.35;
    const polarSurfaceRadius  = 5.58;
    for (let i = 0; i <= 6; i++)
    {
        const angle = i * Math.PI / 3;
        const x     = polarHexagonRadius * Math.cos(angle);
        const z     = polarHexagonRadius * Math.sin(angle);
        const y     = Math.sqrt(Math.max(0, polarSurfaceRadius ** 2 - x ** 2 - z ** 2));
        polarHexagonPoints.push({x, y, z});
    }
    const polarHexagonGeo = new THREE.BufferGeometry().setFromPoints(polarHexagonPoints);
    const polarHexagonMat = new THREE.LineBasicMaterial({
        color      : '#6b7e8c',
        transparent: true,
        opacity    : 0.6
    });
    planetSpinGroup.add(new THREE.Line(polarHexagonGeo, polarHexagonMat));
}

createGasGiant();


// --- B. 物理光环 (RINGS) ---
function createProceduralRings()
{
    const ringParticles = 30000;
    const positions     = [];
    const colors        = [];

    const innerRadius = 6.3;
    const outerRadius = 12.0;

    const ringInnerDark  = new THREE.Color('#4a3b2a');
    const ringMainBright = new THREE.Color('#f0e4c0');
    const ringOuterIce   = new THREE.Color('#a0b0c0');

    for (let i = 0; i < ringParticles; i++)
    {
        let t = Math.random();
        t     = Math.pow(t, 0.8);
        let r = innerRadius + t * (outerRadius - innerRadius);

        if (r > 9.9 && r < 10.4)
        {
            continue;
        }

        const angle = Math.random() * Math.PI * 2;
        const x     = r * Math.cos(angle);
        const z     = r * Math.sin(angle);
        const y     = (Math.random() - 0.5) * 0.06;

        positions.push(x, y, z);

        let c             = new THREE.Color();
        let opacityFactor = 1.0;

        if (r < 7.8)
        {
            let mix = (r - innerRadius) / (1.5);
            c.copy(ringInnerDark).lerp(ringMainBright, mix * 0.3);
            opacityFactor = 0.2 + mix * 0.4;
        }
        else
        {
            let mix = (r - 7.8) / (outerRadius - 7.8);
            c.copy(ringMainBright).lerp(ringOuterIce, mix * 0.6);
            opacityFactor = 0.8 + Math.random() * 0.4;
        }

        c.multiplyScalar(opacityFactor);
        colors.push(c.r, c.g, c.b);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const shaderMat = new THREE.ShaderMaterial({
        uniforms      : ringUniforms,
        vertexShader  : `
            uniform float uTime;
            attribute vec3 color;
            varying vec3 vColor;
            
            void main() {
                vColor = color;
                float r = length(position.xz);
                float speed = 12.0 * pow(r, -1.4);
                float angle = -uTime * speed;
                float c = cos(angle);
                float s = sin(angle);
                vec3 newPos = vec3(
                    position.x * c - position.z * s,
                    position.y,
                    position.x * s + position.z * c
                );
                vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
                gl_PointSize = 2.0 * (30.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                gl_FragColor = vec4(vColor, 0.7); 
            }
        `,
        transparent   : true,
        depthWrite    : false
    });

    const rings = new THREE.Points(geo, shaderMat);
    saturnTiltGroup.add(rings);
}

createProceduralRings();


// --- C. 泰坦 (Titan) ---
const titanOrbitGroup = new THREE.Group();
saturnTiltGroup.add(titanOrbitGroup);

const titanBodyGroup = new THREE.Group();
titanOrbitGroup.add(titanBodyGroup);

const titanAtmoGroup = new THREE.Group();
titanBodyGroup.add(titanAtmoGroup);

let titanAngle         = 0;
const titanOrbitRadius = 16.2;

function createTitan()
{
    // 轨道
    const curve     = new THREE.EllipseCurve(0, 0, titanOrbitRadius, titanOrbitRadius, 0, 2 * Math.PI, false, 0);
    const geometry  = new THREE.BufferGeometry().setFromPoints(curve.getPoints(128));
    const orbitLine = new THREE.Line(geometry, new THREE.LineDashedMaterial({
        color      : 0xe06236,
        opacity    : 0.4,
        transparent: true,
        dashSize   : 0.4,
        gapSize    : 0.3
    }));
    orbitLine.computeLineDistances();
    orbitLine.rotation.x = Math.PI / 2;
    titanOrbitGroup.add(orbitLine);

    // Titan Core
    const coreParticles = 1200;
    const corePos       = [];
    const coreColors    = [];
    const coreGen       = new SimplexNoise('titan-core');

    const colCoreDark = new THREE.Color('#4a2e20');
    const colCoreLite = new THREE.Color('#8c4b28');

    for (let i = 0; i < coreParticles; i++)
    {
        const r     = 0.75;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const x     = r * Math.sin(phi) * Math.cos(theta);
        const y     = r * Math.sin(phi) * Math.sin(theta);
        const z     = r * Math.cos(phi);

        corePos.push(x, y, z);

        let n = coreGen.noise3D(x * 3, y * 3, z * 3);
        let c = new THREE.Color().copy(colCoreDark).lerp(colCoreLite, (n + 1) / 2);
        coreColors.push(c.r, c.g, c.b);
    }
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.Float32BufferAttribute(corePos, 3));
    coreGeo.setAttribute('color', new THREE.Float32BufferAttribute(coreColors, 3));
    const coreMesh = new THREE.Points(coreGeo, new THREE.PointsMaterial({
        size        : 0.05,
        vertexColors: true,
        transparent : true,
        opacity     : 0.95
    }));
    titanBodyGroup.add(coreMesh);

    // Titan Grid
    const wireGeo   = new THREE.WireframeGeometry(new THREE.SphereGeometry(0.75, 16, 16));
    const wireMat   = new THREE.LineBasicMaterial({
        color      : 0xff8c69,
        transparent: true,
        opacity    : 0.2
    });
    const titanGrid = new THREE.LineSegments(wireGeo, wireMat);
    titanBodyGroup.add(titanGrid);


    // Titan Haze
    const hazeParticles = 2000;
    const hazePos       = [];
    const hazeColors    = [];
    const hazeGen       = new SimplexNoise('titan-haze');

    const colHazeBase = new THREE.Color('#d68528');
    const colHazeTop  = new THREE.Color('#ffaa44');

    for (let i = 0; i < hazeParticles; i++)
    {
        const r     = 0.82;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const x     = r * Math.sin(phi) * Math.cos(theta);
        const y     = r * Math.sin(phi) * Math.sin(theta);
        const z     = r * Math.cos(phi);

        hazePos.push(x, y, z);

        let n = hazeGen.noise3D(x * 1.5, y * 1.5, z * 1.5);
        let c = new THREE.Color().copy(colHazeBase).lerp(colHazeTop, (n + 1) / 2);
        hazeColors.push(c.r, c.g, c.b);
    }
    const hazeGeo = new THREE.BufferGeometry();
    hazeGeo.setAttribute('position', new THREE.Float32BufferAttribute(hazePos, 3));
    hazeGeo.setAttribute('color', new THREE.Float32BufferAttribute(hazeColors, 3));
    const hazeMesh = new THREE.Points(hazeGeo, new THREE.PointsMaterial({
        size        : 0.045,
        vertexColors: true,
        transparent : true,
        opacity     : 0.5
    }));
    titanAtmoGroup.add(hazeMesh);
}

createTitan();


// --- D. 土星卫星群 ---
const moons = [];

function createMoon(name, parentGroup, orbitRadius, speed, inclinationDeg, colorHex, size, isRetrograde = false, isDualColor = false)
{
    const satOrbit      = new THREE.Group();
    satOrbit.rotation.x = inclinationDeg * (Math.PI / 180);
    satOrbit.rotation.y = Math.random() * Math.PI * 2;
    parentGroup.add(satOrbit);

    const geo  = new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius, 0, 2 * Math.PI).getPoints(64));
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color      : colorHex,
        transparent: true,
        opacity    : 0.15,
        dashSize   : 0.2,
        gapSize    : 0.2
    }));
    line.computeLineDistances();
    line.rotation.x = Math.PI / 2;
    satOrbit.add(line);

    if (isDualColor)
    {
        const iapParticles = 64;
        const iPos         = [];
        const iCol         = [];
        const cDark        = new THREE.Color('#111111');
        const cLite        = new THREE.Color('#eeeeee');

        for (let i = 0; i < iapParticles; i++)
        {
            const theta = Math.random() * Math.PI * 2;
            const phi   = Math.acos(2 * Math.random() - 1);
            const r     = size * 0.9;
            const x     = r * Math.sin(phi) * Math.cos(theta);
            const y     = r * Math.sin(phi) * Math.sin(theta);
            const z     = r * Math.cos(phi);
            iPos.push(x, y, z);

            let c = (x > 0) ? cLite : cDark;
            iCol.push(c.r, c.g, c.b);
        }
        const iGeo = new THREE.BufferGeometry();
        iGeo.setAttribute('position', new THREE.Float32BufferAttribute(iPos, 3));
        iGeo.setAttribute('color', new THREE.Float32BufferAttribute(iCol, 3));

        const satMat = new THREE.PointsMaterial({
            size        : size * 0.8,
            vertexColors: true
        });
        const mesh   = new THREE.Points(iGeo, satMat);
        mesh.position.set(orbitRadius, 0, 0);
        satOrbit.add(mesh);

        moons.push({
            orbitGroup   : satOrbit,
            mesh         : mesh,
            speed        : speed,
            radius       : orbitRadius,
            angle        : 0,
            isRetrograde : isRetrograde,
            isChaotic    : false,
            isTidalLocked: true
        });
    }
    else
    {
        const satMat = new THREE.PointsMaterial({
            color: colorHex,
            size : size * 0.8
        });
        const mesh   = new THREE.Points(new THREE.SphereGeometry(size, 4, 4), satMat);
        mesh.position.set(orbitRadius, 0, 0);
        satOrbit.add(mesh);

        moons.push({
            orbitGroup   : satOrbit,
            mesh         : mesh,
            speed        : speed,
            radius       : orbitRadius,
            angle        : 0,
            isRetrograde : isRetrograde,
            isChaotic    : name === "Hyperion",
            isTidalLocked: !isRetrograde && name !== "Hyperion"
        });
    }
}

// 卫星视觉配置（公转速率按真实恒星周期换算：Mimas 0.94d … Phoebe 550.3d 逆行）
createMoon("Mimas", saturnTiltGroup, 12.4, 0.00159, 0.0, 0x8090a0, 0.08);
createMoon("Enceladus", saturnTiltGroup, 13.0, 0.00109, 0.0, 0xaaffff, 0.09);
createMoon("Tethys", saturnTiltGroup, 13.6, 0.000792, 0.0, 0xe6e0c0, 0.10);
createMoon("Dione", saturnTiltGroup, 14.2, 0.000546, 0.0, 0xc0c0e0, 0.10);
createMoon("Rhea", saturnTiltGroup, 14.8, 0.000331, 0.0, 0xb0a090, 0.12);
createMoon("Hyperion", saturnTiltGroup, 17.6, 0.0000703, 0.0, 0xcd853f, 0.09);
createMoon("Iapetus", saturnTiltGroup, 19.0, 0.0000188, 15.47, 0xffffff, 0.13, false, true);
createMoon("Phoebe", group, 20.5, -0.0000027, 20.0, 0x2f4f4f, 0.07, true);


// --- 交互与动画 ---

// 初始化交互模块
initInteraction(group, INITIAL_ZOOM);
initPlanetFocus(group, camera, 5.6);

// [NEW] 初始相机倾角设置
if (typeof InteractionState !== 'undefined')
{
    InteractionState.targetRotationX = 0.0;
    InteractionState.targetRotationY = 0.0;
}
group.rotation.x = 0.0;
group.rotation.y = 0.0;

let time = 0;
let frameCount = 0;

function animate(timestamp)
{
    requestAnimationFrame(animate);
    const dt = nextDeltaTime(timestamp);
    frameCount++;
    frameSampler.sample(timestamp);
    time += 0.002 * dt;

    // 自转周期 10.66 小时；演示节奏压缩至 ~50 秒/圈，仍快于地球
    planetSpinGroup.rotation.y += 0.0021 * dt;
    planetAtmoGroup.rotation.y += 0.00158 * dt;

    ringUniforms.uTime.value = time;

    // 泰坦公转和潮汐锁定（公转周期 15.95 天）
    titanAngle += 0.0000938 * dt;
    titanBodyGroup.position.x = titanOrbitRadius * Math.cos(titanAngle);
    titanBodyGroup.position.z = titanOrbitRadius * Math.sin(titanAngle);
    // 潮汐锁定：自转角等于公转角
    titanBodyGroup.rotation.y = titanAngle - Math.PI / 2;
    titanAtmoGroup.rotation.y += 0.001 * dt;

    moons.forEach(sat =>
    {
        sat.angle += sat.speed * dt;
        sat.mesh.position.x = sat.radius * Math.cos(sat.angle);
        sat.mesh.position.z = sat.radius * Math.sin(sat.angle);

        if (sat.isChaotic)
        {
            // Hyperion 的混沌自转
            sat.mesh.rotation.x += 0.03 * dt;
            sat.mesh.rotation.y += 0.05 * dt;
        }
        else if (sat.isTidalLocked)
        {
            // 潮汐锁定：自转角与公转角同步 (反向旋转以保持面向中心)
            sat.mesh.rotation.y = -sat.angle;
        }
        else
        {
            // 一般自转
            sat.mesh.rotation.y += 0.02 * dt;
        }
    });

    // 视角和缩放控制
    updateInteraction(group, camera);

    // 遥测数据更新
    updatePlanetTelemetry(planetSpinGroup, tgtLabel, 1);

    renderer.render(scene, camera);
}

animate();
