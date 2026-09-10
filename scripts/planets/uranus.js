// ==========================================
// NASA-Punk Project: URANUS
// ==========================================

// --- PART 1+2: 场景初始化（共享工厂：背景/相机/渲染器/resize） ---
const INITIAL_ZOOM = 38;

const {scene, camera, renderer, group, tgtLabel} = createPlanetScene({
    name       : 'uranus',
    zoom       : INITIAL_ZOOM,
    noiseOffset: 800
});

// 帧率无关的动画步长因子（60fps 校准基准）
const nextDeltaTime = createFrameDelta();

const uranusTiltGroup      = new THREE.Group();
uranusTiltGroup.rotation.z = -97.77 * (Math.PI / 180);
group.add(uranusTiltGroup);

const uranusSpinGroup = new THREE.Group();
uranusTiltGroup.add(uranusSpinGroup);

const ringGroup = new THREE.Group();
uranusTiltGroup.add(ringGroup);

const moonGroup = new THREE.Group();
uranusTiltGroup.add(moonGroup);

let frameSampler;
let surfaceConvergence;


// --- PART 3: 天王星主体 ---
function createUranus()
{
    const planetName = 'uranus';
    const noiseGen      = new SimplexNoise('uranus-base');

    const colBase = new THREE.Color('#a4d8e6');
    const colDeep = new THREE.Color('#4a9cb8');
    const colHigh = new THREE.Color('#e0ffff');
    const surfaceColor = new THREE.Color();

    function sampleSurfaceParticle(i, positions, colors)
    {
        const r = 5.0;

        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        const offset = i * 3;
        positions[offset]     = x;
        positions[offset + 1] = y;
        positions[offset + 2] = z;

        let lat = Math.abs(y / r);
        const c = surfaceColor;

        c.copy(colDeep).lerp(colBase, lat * 0.8 + 0.2);

        if (lat > 0.8)
        {
            c.lerp(colHigh, (lat - 0.8) * 3.0);
        }

        let bandNoise = noiseGen.noise3D(x, y * 4.0, z);
        if (Math.abs(bandNoise) > 0.6)
        {
            c.multiplyScalar(1.05);
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
            opacity     : 0.9
        },
        group: uranusSpinGroup,
        onReady()
        {
            renderer.render(scene, camera);
            ParticleBuilder.markReady({page: planetName});
        }
    });
    frameSampler = surface.frameSampler;
    surfaceConvergence = createSurfaceConvergence(surface.points);

    const atmosCount = 8000;
    const atmosPos   = new Float32Array(atmosCount * 3);
    const atmosCol   = new Float32Array(atmosCount * 3);
    for (let i = 0; i < atmosCount; i++)
    {
        const r     = 5.2;
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const idx   = i * 3;
        atmosPos[idx]     = r * Math.sin(phi) * Math.cos(theta);
        atmosPos[idx + 1] = r * Math.sin(phi) * Math.sin(theta);
        atmosPos[idx + 2] = r * Math.cos(phi);
        atmosCol[idx]     = 0.4;
        atmosCol[idx + 1] = 0.9;
        atmosCol[idx + 2] = 1.0;
    }
    const atmosGeo = new THREE.BufferGeometry();
    atmosGeo.setAttribute('position', new THREE.BufferAttribute(atmosPos, 3));
    atmosGeo.setAttribute('color', new THREE.BufferAttribute(atmosCol, 3));
    const atmos = new THREE.Points(atmosGeo, new THREE.PointsMaterial({
        size        : 0.08,
        vertexColors: true,
        transparent : true,
        opacity     : 0.15,
        blending    : THREE.AdditiveBlending
    }));
    uranusSpinGroup.add(atmos);

    const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(5.1, 24, 24));
    const wireMat = new THREE.LineBasicMaterial({
        color      : '#64dceb',
        transparent: true,
        opacity    : 0.05
    });
    uranusSpinGroup.add(new THREE.LineSegments(wireGeo, wireMat));
}

createUranus();


// --- PART 5: 星环系统 ---
function createProceduralRings()
{
    // 环系按真实相对半径排布（天王星半径 = 5.0）：
    // ζ(内弥漫) → 6/5/4 → α/β → η/γ/δ → ε（最外、最亮，两侧为牧羊犬卫星）
    const ringDefs = [
        {
            r      : 6.9,
            width  : 0.8,
            color  : '#1a1a1a',
            opacity: 0.12,
            density: 10000,
            spread : 0.08
        },
        {
            r      : 8.26,
            width  : 0.2,
            color  : '#2a4f50',
            opacity: 0.2,
            density: 5000,
            spread : 0.04
        },
        {
            r      : 8.85,
            width  : 0.25,
            color  : '#2f4f4f',
            opacity: 0.25,
            density: 8000,
            spread : 0.05
        },
        {
            r      : 9.5,
            width  : 0.4,
            color  : '#3a5f60',
            opacity: 0.3,
            density: 5000,
            spread : 0.04
        },
        {
            r      : 10.05,
            width  : 0.3,
            color  : '#40e0d0',
            opacity: 0.5,
            density: 11000,
            spread : 0.02
        }
    ];

    const totalParticles = ringDefs.reduce((sum, def) => sum + def.density, 0);
    const positions      = new Float32Array(totalParticles * 3);
    const colors         = new Float32Array(totalParticles * 3);
    let offset           = 0;

    ringDefs.forEach(def =>
    {
        const pColor = new THREE.Color(def.color);

        for (let i = 0; i < def.density; i++)
        {
            const r     = def.r + (Math.random() - 0.5) * def.width;
            const angle = Math.random() * Math.PI * 2;
            const y     = (Math.random() - 0.5) * def.spread;

            const x = r * Math.cos(angle);
            const z = r * Math.sin(angle);

            const idx = offset * 3;
            positions[idx]     = x;
            positions[idx + 1] = y;
            positions[idx + 2] = z;

            const factor = (0.7 + Math.random() * 0.6) * 0.8;
            colors[idx]     = pColor.r * factor;
            colors[idx + 1] = pColor.g * factor;
            colors[idx + 2] = pColor.b * factor;
            offset += 1;
        }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
        size           : 0.05,
        vertexColors   : true,
        transparent    : true,
        opacity        : 0.5,
        sizeAttenuation: true,
        blending       : THREE.AdditiveBlending,
        depthWrite     : false
    });

    const rings = new THREE.Points(geo, mat);
    ringGroup.add(rings);
}

createProceduralRings();


// --- PART 6: 卫星系统 ---
const moons = [];

function createMoon(config)
{
    const {
              name,
              radius,
              speed,
              size,
              color,
              type,
              detail,
              inclination  = 0,
              isRetrograde = false
          } = config;

    const satOrbit = new THREE.Group();
    if (inclination !== 0)
    {
        satOrbit.rotation.x = (Math.random() - 0.5) * inclination;
        satOrbit.rotation.z = (Math.random() - 0.5) * inclination;
    }
    else
    {
        satOrbit.rotation.x = (Math.random() - 0.5) * 0.04;
    }
    satOrbit.rotation.y = Math.random() * Math.PI * 2;
    moonGroup.add(satOrbit);

    const curve     = new THREE.EllipseCurve(0, 0, radius, radius, 0, 2 * Math.PI);
    const points    = curve.getPoints(type === 'Major' ? 128 : 64);
    const orbitGeo  = new THREE.BufferGeometry().setFromPoints(points);
    const orbitMat  = new THREE.LineDashedMaterial({
        color      : color,
        transparent: true,
        opacity    : type === 'Major' ? 0.35 : 0.08,
        dashSize   : type === 'Major' ? 0.3 : 0.5,
        gapSize    : type === 'Major' ? 0.2 : 0.8
    });
    const orbitLine = new THREE.Line(orbitGeo, orbitMat);
    orbitLine.computeLineDistances();
    orbitLine.rotation.x = Math.PI / 2;
    satOrbit.add(orbitLine);

    const moonMeshGroup = new THREE.Group();
    moonMeshGroup.position.set(radius, 0, 0);
    satOrbit.add(moonMeshGroup);

    const baseColor = new THREE.Color(color);

    if (type === 'Major')
    {
        const wireGeo = new THREE.WireframeGeometry(new THREE.SphereGeometry(size, 8, 8));
        const wireMat = new THREE.LineBasicMaterial({
            color      : color,
            transparent: true,
            opacity    : 0.6
        });
        moonMeshGroup.add(new THREE.LineSegments(wireGeo, wireMat));

        const pCount    = 300;
        const pPos      = new Float32Array(pCount * 3);
        const pCol      = new Float32Array(pCount * 3);
        const mNoise    = new SimplexNoise(name);
        const darkColor = baseColor.clone().multiplyScalar(0.3);
        const tempColor = new THREE.Color();

        for (let i = 0; i < pCount; i++)
        {
            const theta = Math.random() * Math.PI * 2;
            const phi   = Math.acos(2 * Math.random() - 1);
            const r     = size * 0.92;
            const x     = r * Math.sin(phi) * Math.cos(theta);
            const y     = r * Math.sin(phi) * Math.sin(theta);
            const z     = r * Math.cos(phi);
            const i3    = i * 3;
            pPos[i3]     = x;
            pPos[i3 + 1] = y;
            pPos[i3 + 2] = z;

            let n = mNoise.noise3D(x * detail, y * detail, z * detail);
            tempColor.copy(baseColor);

            if (name === "Miranda" && Math.abs(n) > 0.3)
            {
                tempColor.multiplyScalar(0.4);
            }
            else if (name === "Ariel" && n > 0.2)
            {
                tempColor.addScalar(0.3);
            }
            else if (name === "Umbriel")
            {
                tempColor.multiplyScalar(0.6);
            }
            if (n < -0.2)
            {
                tempColor.lerp(darkColor, 0.5);
            }

            pCol[i3]     = tempColor.r;
            pCol[i3 + 1] = tempColor.g;
            pCol[i3 + 2] = tempColor.b;
        }
        const cloudGeo = new THREE.BufferGeometry();
        cloudGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        cloudGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
        moonMeshGroup.add(new THREE.Points(cloudGeo, new THREE.PointsMaterial({
            size        : size * 0.45,
            vertexColors: true
        })));

    }
    else
    {
        const geo = new THREE.IcosahedronGeometry(size, 0);
        const mat = new THREE.MeshBasicMaterial({
            color      : color,
            wireframe  : true,
            transparent: true,
            opacity    : 0.5
        });
        moonMeshGroup.add(new THREE.Mesh(geo, mat));
    }

    moons.push({
        group    : satOrbit,
        meshGroup: moonMeshGroup,
        speed    : isRetrograde ? -speed : speed,
        radius   : radius,
        angle    : Math.random() * Math.PI * 2,
        type     : type
    });
}

// 卫星配置（公转速率按真实恒星周期换算）
createMoon({
    name  : "Bianca",
    radius: 7.5,
    // 公转周期 0.435 天
    speed : 0.00344,
    size  : 0.05,
    color : 0x447777,
    type  : 'Minor'
});
createMoon({
    name  : "Cressida",
    radius: 7.8,
    // 公转周期 0.464 天
    speed : 0.00323,
    size  : 0.06,
    color : 0x447777,
    type  : 'Minor'
});
createMoon({
    name  : "Puck",
    radius: 9.1,
    // 公转周期 0.762 天（内侧卫星群最外侧）
    speed : 0.00196,
    size  : 0.08,
    color : 0x55aaaa,
    type  : 'Minor'
});
createMoon({
    name  : "Desdemona",
    radius: 8.1,
    // 公转周期 0.474 天
    speed : 0.00316,
    size  : 0.05,
    color : 0x447777,
    type  : 'Minor'
});
createMoon({
    name  : "Juliet",
    radius: 8.4,
    // 公转周期 0.493 天
    speed : 0.00303,
    size  : 0.06,
    color : 0x447777,
    type  : 'Minor'
});
createMoon({
    name  : "Portia",
    radius: 8.7,
    // 公转周期 0.513 天
    speed : 0.00291,
    size  : 0.08,
    color : 0x559999,
    type  : 'Minor'
});
createMoon({
    name  : "Cordelia",
    radius: 9.73,
    // 公转周期 0.335 天，ε 环内牧羊犬
    speed : 0.00446,
    size  : 0.04,
    color : 0x558888,
    type  : 'Minor'
});
createMoon({
    name  : "Ophelia",
    radius: 10.35,
    // 公转周期 0.376 天，ε 环外牧羊犬
    speed : 0.00397,
    size  : 0.04,
    color : 0x558888,
    type  : 'Minor'
});
createMoon({
    name  : "Miranda",
    radius: 10.6,
    // 公转周期 1.413 天
    speed : 0.00106,
    size  : 0.22,
    color : 0xcccccc,
    type  : 'Major',
    detail: 10.0
});
createMoon({
    name  : "Ariel",
    radius: 12.2,
    // 公转周期 2.520 天
    speed : 0.000593,
    size  : 0.28,
    color : 0xe0ffff,
    type  : 'Major',
    detail: 5.0
});
createMoon({
    name  : "Umbriel",
    radius: 14.0,
    // 公转周期 4.144 天
    speed : 0.000361,
    size  : 0.28,
    color : 0x666666,
    type  : 'Major',
    detail: 3.0
});
createMoon({
    name  : "Titania",
    radius: 16.2,
    // 公转周期 8.706 天
    speed : 0.000172,
    size  : 0.38,
    color : 0xe0d0b0,
    type  : 'Major',
    detail: 6.0
});
createMoon({
    name  : "Oberon",
    radius: 19.0,
    // 公转周期 13.46 天
    speed : 0.000111,
    size  : 0.35,
    color : 0xa08080,
    type  : 'Major',
    detail: 8.0
});
createMoon({
    name        : "Caliban",
    radius      : 23.0,
    // 公转周期 579.7 天，逆行不规则卫星
    speed       : 0.0000026,
    size        : 0.06,
    color       : 0xaa5555,
    type        : 'Minor',
    inclination : 0.8,
    isRetrograde: true
});
createMoon({
    name        : "Sycorax",
    radius      : 27.0,
    // 公转周期 1288 天，逆行不规则卫星
    speed       : 0.00000116,
    size        : 0.08,
    color       : 0xcc6666,
    type        : 'Minor',
    inclination : 0.9,
    isRetrograde: true
});
createMoon({
    name        : "Setebos",
    radius      : 31.0,
    // 公转周期 2225 天，逆行不规则卫星
    speed       : 0.00000067,
    size        : 0.05,
    color       : 0x888888,
    type        : 'Minor',
    inclination : 0.6,
    isRetrograde: true
});


// --- PART 7: 交互与动画 ---

// 初始化交互模块
initInteraction(group, INITIAL_ZOOM);
initPlanetFocus(group, camera, 5.1);

// [NEW] 初始相机倾角设置
if (typeof InteractionState !== 'undefined')
{
    InteractionState.targetRotationX = 0.0;
    InteractionState.targetRotationY = 0.2;
}
group.rotation.x = 0.0;
group.rotation.y = 0.2;

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

    // 物理更新
    // 逆行自转（自转周期 17.24 小时）；演示节奏压缩至 ~70 秒/圈
    uranusSpinGroup.rotation.y -= 0.0015 * dt;
    ringGroup.rotation.y += 0.0005 * dt;
    moons.forEach(sat =>
    {
        sat.angle += sat.speed * dt;
        sat.meshGroup.position.x = sat.radius * Math.cos(sat.angle);
        sat.meshGroup.position.z = sat.radius * Math.sin(sat.angle);

        if (sat.type === 'Major')
        {
            sat.meshGroup.rotation.y += 0.01 * dt;
        }
        else
        {
            sat.meshGroup.rotation.x += 0.02 * dt;
            sat.meshGroup.rotation.y += 0.02 * dt;
        }
    });

    // 2. 更新交互状态 (调用抽象模块)
    updateInteraction(group, camera);

    // 3. 更新遥测数据 (调用抽象模块，启用 Dec 翻转)
    // 启用 Dec 翻转，以匹配 IAU 定义的北极方向和 Dec 读数。
    updatePlanetTelemetry(uranusSpinGroup, tgtLabel, -1);

    renderer.render(scene, camera);
}

const animationLoop = window.createMotionAwareAnimation(animate);
animate();
