// ==========================================
// NASA-Punk Project: SOL-VIII (NEPTUNE) - FINAL SPEED TUNE
// ==========================================

// --- PART 1+2: 场景初始化（共享工厂：背景/相机/渲染器/resize） ---
const INITIAL_ZOOM = 30;

const {scene, camera, renderer, group, tgtLabel} = createPlanetScene({
    name       : 'neptune',
    zoom       : INITIAL_ZOOM,
    noiseOffset: 100
});

// 帧率无关的动画步长因子（60fps 校准基准）
const nextDeltaTime = createFrameDelta();

// 1. 倾角容器
const planetTiltGroup      = new THREE.Group();
planetTiltGroup.rotation.z = 28.32 * (Math.PI / 180);
group.add(planetTiltGroup);

// 2. 自转容器
const planetSpinGroup = new THREE.Group();
planetTiltGroup.add(planetSpinGroup);

// 3. 卫星系统容器
const moonSystemGroup = new THREE.Group();
group.add(moonSystemGroup);

let frameSampler;
let surfaceConvergence;


// --- PART 3: 程序化海王星 (Atmosphere) ---
function createNeptune()
{
    const planetName = 'neptune';
    const noiseGen      = new SimplexNoise('neptune-wind-shear');

    const colDeep   = new THREE.Color('#1a237e');
    const colMid    = new THREE.Color('#2962ff');
    const colBright = new THREE.Color('#448aff');
    const colStorm  = new THREE.Color('#0d1238');
    const surfaceColor = new THREE.Color();

    function sampleSurfaceParticle(i, positions, colors)
    {
        const r     = 5.0 + Math.random() * 0.3;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi);

        let nBand = noiseGen.noise3D(x * 0.5, y * 3.0, z * 0.5);

        let isStorm = false;
        if (y < -1.5 && y > -2.5 && x > 0 && Math.abs(z) < 2.0)
        {
            if (Math.random() > 0.6)
            {
                isStorm = true;
            }
        }

        const offset = i * 3;
        positions[offset]     = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;

        const c = surfaceColor;

        if (isStorm)
        {
            c.copy(colStorm);
        }
        else
        {
            const val = (nBand + 1) / 2;
            if (val < 0.4)
            {
                c.copy(colDeep).lerp(colMid, val / 0.4);
            }
            else
            {
                c.copy(colMid).lerp(colBright, (val - 0.4) / 0.6);
            }
        }

        const depthFactor = (r - 5.0) / 0.3;
        c.multiplyScalar(0.5 + depthFactor * 0.5);

        colors[offset]     = c.r;
        colors[offset + 1] = c.g;
        colors[offset + 2] = c.b;
    }

    const surface = ParticleBuilder.createSurfaceBuild({
        planetName,
        budget: PLANET_PARTICLE_CONFIG[planetName].surface,
        sample: sampleSurfaceParticle,
        material: {
            size           : 0.055,
            vertexColors   : true,
            transparent    : true,
            opacity        : 0.85,
            sizeAttenuation: true
        },
        group: planetSpinGroup,
        onReady()
        {
            renderer.render(scene, camera);
            ParticleBuilder.markReady({page: planetName});
        }
    });
    frameSampler = surface.frameSampler;
    surfaceConvergence = createSurfaceConvergence(surface.points);

    const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(5.32, 32, 16));
    const wireMat = new THREE.LineBasicMaterial({
        color      : '#448aff',
        transparent: true,
        opacity    : 0.06
    });
    planetTiltGroup.add(new THREE.LineSegments(wireGeo, wireMat));
}

createNeptune();


// --- PART 4: 五道环系统 (The 5 Distinct Rings) ---

// 存储光环层数据的数组，用于动画循环
let ringLayers = [];

function createNeptuneRings()
{
    const ringGroup = new THREE.Group();
    planetTiltGroup.add(ringGroup);

    // 环的参数配置
    const ringsConfig = [
        {name: 'Galle', radius: 7.1, width: 0.6, particles: 2500, opacity: 0.15, color: 0x5566aa},
        {name: 'LeVerrier', radius: 7.8, width: 0.1, particles: 1200, opacity: 0.3, color: 0x6677cc},
        {name: 'Lassell', radius: 8.2, width: 0.3, particles: 1000, opacity: 0.1, color: 0x445599},
        {name: 'Arago', radius: 8.6, width: 0.1, particles: 1000, opacity: 0.3, color: 0x6677cc},
        {name: 'Adams', radius: 9.4, width: 0.4, particles: 12000, opacity: 0.9, color: 0x88aaff, isMain: true}
    ];

    const ringNoise = new SimplexNoise('ring-arcs-separated');

    ringsConfig.forEach(config =>
    {
        const pos = [];
        const col = [];
        const ringColor = new THREE.Color(config.color);
        const c = new THREE.Color();

        for (let i = 0; i < config.particles; i++)
        {
            const theta = Math.random() * Math.PI * 2;
            const r     = config.radius + (Math.random() - 0.5) * config.width;

            let alpha = config.opacity;

            if (config.isMain)
            {
                const arcRaw         = ringNoise.noise2D(Math.cos(theta) * 2.0, Math.sin(theta) * 2.0);
                let presence         = (arcRaw + 0.4) / 1.4;
                presence             = Math.max(0, presence);
                const smoothPresence = Math.pow(presence, 3);

                const survivalChance = 0.02 + 0.98 * smoothPresence;
                if (Math.random() > survivalChance)
                {
                    continue;
                }
                alpha = 0.1 + 0.85 * smoothPresence;
            }

            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);

            pos.push(x, 0, z);

            c.copy(ringColor).multiplyScalar(0.7 + Math.random() * 0.5);
            col.push(c.r, c.g, c.b);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));

        const mat = new THREE.PointsMaterial({
            size           : 0.055,
            vertexColors   : true,
            transparent    : true,
            opacity        : config.isMain ? 0.9 : 0.4,
            sizeAttenuation: true,
            blending       : THREE.AdditiveBlending
        });

        const pointsMesh = new THREE.Points(geo, mat);
        ringGroup.add(pointsMesh);

        // 计算开普勒角速度: omega ~ r^(-1.5)
        const keplerRatio   = Math.pow(7.1 / config.radius, 1.5);
        const rotationSpeed = 0.008 * keplerRatio;

        ringLayers.push({
            mesh : pointsMesh,
            speed: rotationSpeed
        });
    });
}

createNeptuneRings();


// --- PART 5: 卫星系统 ---
let tritonData     = null;
let minorMoonsData = [];

function createTriton()
{
    const tOrbitRadius = 12.5;
    const tOrbitGroup  = new THREE.Group();

    // 倾角设置：Triton 具有高倾角和逆行轨道
    tOrbitGroup.rotation.z = 20 * (Math.PI / 180);
    tOrbitGroup.rotation.x = 157 * (Math.PI / 180);

    moonSystemGroup.add(tOrbitGroup);

    // [NEW] 海卫一程序化纹理噪声生成器
    const tritonNoise = new SimplexNoise('triton-cryovolcanism');

    // 1. 轨道线
    const orbitGeo  = new THREE.BufferGeometry().setFromPoints(
        new THREE.EllipseCurve(0, 0, tOrbitRadius, tOrbitRadius, 0, 2 * Math.PI).getPoints(128)
    );
    const orbitLine = new THREE.Line(orbitGeo, new THREE.LineDashedMaterial({
        color: 0x88aaff, transparent: true, opacity: 0.25, dashSize: 0.5, gapSize: 0.5
    }));
    orbitLine.computeLineDistances();
    orbitLine.rotation.x = Math.PI / 2;
    tOrbitGroup.add(orbitLine);

    // 2. Triton 本体
    const tBody = new THREE.Group();
    tOrbitGroup.add(tBody);

    const tParticles = 800;
    const tPos       = [];
    const tCol       = [];
    // 使用代表冰和氮冰的颜色
    const colTriton  = new THREE.Color('#d0e0ff');
    // 使用代表喷流和黑暗条纹的颜色
    const colDark    = new THREE.Color('#90a0bb');

    for (let i = 0; i < tParticles; i++)
    {
        const r     = 0.35;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi);

        tPos.push(x, y, z);

        let c = colTriton.clone();

        // [MODIFIED] 使用 Simplex Noise 创建表面细节
        // 缩放系数 6.0 用于创建哈密瓜皮状的中等大小地貌
        const surfaceNoise = tritonNoise.noise3D(x * 6.0, y * 6.0, z * 6.0);

        let brightness = 0.8 + Math.random() * 0.2; // 基础随机亮度

        // 将噪声从 [-1, 1] 映射到 [0.6, 1.2] 的亮度调节因子
        let noiseFactor = THREE.MathUtils.clamp((surfaceNoise + 1) * 0.5 * 1.5, 0.6, 1.2);

        // 乘以基础亮度和噪声因子
        c.multiplyScalar(brightness * noiseFactor);

        // 进一步基于噪声值进行颜色混合，模拟深色条纹/喷流区
        if (surfaceNoise < -0.3)
        {
            // 噪声低谷区（代表黑暗或阴影）更倾向于深色
            c.lerp(colDark, 0.4);
        }

        tCol.push(c.r, c.g, c.b);
    }

    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
    tGeo.setAttribute('color', new THREE.Float32BufferAttribute(tCol, 3));

    const tMat = new THREE.PointsMaterial({
        size        : 0.045,
        vertexColors: true,
        transparent : true,
        opacity     : 1.0,
        blending    : THREE.AdditiveBlending // 增加科幻感
    });
    tBody.add(new THREE.Points(tGeo, tMat));

    const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(0.36, 12, 12));
    const wireMat = new THREE.LineBasicMaterial({color: 0x88aaff, transparent: true, opacity: 0.1});
    tBody.add(new THREE.LineSegments(wireGeo, wireMat));

    tritonData = {
        mesh  : tBody,
        angle : 0,
        // 公转周期 5.877 天，逆行
        speed : -0.000254,
        radius: tOrbitRadius
    };
}

function createMinorMoons()
{
    // 内侧卫星与 Nereid（公转速率按真实恒星周期换算）
    const moonsConfig = [
        {name: "Galatea", radius: 5.5, speed: 0.00349, size: 0.05, color: 0x6677aa},
        {name: "Larissa", radius: 5.75, speed: 0.0027, size: 0.06, color: 0x556699},
        {name: "Proteus", radius: 6.0, speed: 0.00133, size: 0.08, color: 0x6677aa},
        {name: "Nereid", radius: 24.0, speed: 0.0000042, size: 0.07, color: 0x8899cc, eccentric: true}
    ];

    moonsConfig.forEach(config =>
    {
        const orbitGroup      = new THREE.Group();
        orbitGroup.rotation.x = config.eccentric ? 0.3 : Math.random() * 0.05;
        orbitGroup.rotation.z = config.eccentric ? 0.2 : Math.random() * 0.05;
        planetTiltGroup.add(orbitGroup);

        const orbitPoints = config.eccentric ? 128 : 64;
        const xRad        = config.radius;
        const yRad        = config.eccentric ? config.radius * 0.7 : config.radius;

        const orbitGeo  = new THREE.BufferGeometry().setFromPoints(
            new THREE.EllipseCurve(0, 0, xRad, yRad, 0, 2 * Math.PI).getPoints(orbitPoints)
        );
        const orbitLine = new THREE.Line(orbitGeo, new THREE.LineDashedMaterial({
            color: 0x445588, transparent: true, opacity: 0.1, dashSize: 0.2, gapSize: 0.2
        }));
        orbitLine.computeLineDistances();
        orbitLine.rotation.x = Math.PI / 2;
        orbitGroup.add(orbitLine);

        const mesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(config.size, 0),
            new THREE.MeshBasicMaterial({color: config.color, wireframe: true, transparent: true, opacity: 0.6})
        );
        orbitGroup.add(mesh);

        minorMoonsData.push({
            mesh : mesh,
            angle: Math.random() * Math.PI * 2,
            speed: config.speed,
            xRad : xRad,
            yRad : yRad
        });
    });
}

createTriton();
createMinorMoons();


// ==========================================
// PART 6: 交互与动画循环
// ==========================================

initInteraction(group, INITIAL_ZOOM);
initPlanetFocus(group, camera, 5.3);

if (typeof InteractionState !== 'undefined')
{
    InteractionState.targetRotationX = 0.3;
    InteractionState.targetRotationY = 0.0;
}
group.rotation.x = 0.3;
group.rotation.y = 0.0;

let frameCount = 0;

function animate(timestamp)
{
    if (!window.isReducedMotionRequested || !window.isReducedMotionRequested())
    {
        animationLoop.schedule();
    }
    const dt = nextDeltaTime(timestamp);
    frameCount++;
    frameSampler.sample(timestamp);
    surfaceConvergence.update(timestamp);

    // 自转周期 16.11 小时；演示节奏压缩至 ~65 秒/圈，快于天王星
    planetSpinGroup.rotation.y += 0.0016 * dt;

    // 光环自转动画
    ringLayers.forEach(layer =>
    {
        layer.mesh.rotation.y += layer.speed * dt;
    });

    if (tritonData)
    {
        // 公转周期 5.877 天，逆行轨道
        tritonData.angle += tritonData.speed * dt;
        tritonData.mesh.position.x = tritonData.radius * Math.cos(tritonData.angle);
        tritonData.mesh.position.z = tritonData.radius * Math.sin(tritonData.angle);
        // 潮汐锁定：自转角等于公转角
        tritonData.mesh.rotation.y = tritonData.angle;
    }

    minorMoonsData.forEach(moon =>
    {
        moon.angle += moon.speed * dt;
        moon.mesh.position.x = moon.xRad * Math.cos(moon.angle);
        moon.mesh.position.z = moon.yRad * Math.sin(moon.angle);
        moon.mesh.rotation.x += 0.02 * dt;
        moon.mesh.rotation.y += 0.02 * dt;
    });

    updateInteraction(group, camera);
    updatePlanetTelemetry(planetSpinGroup, tgtLabel, 1);

    renderer.render(scene, camera);
}

const animationLoop = window.createMotionAwareAnimation(animate);
animate();
