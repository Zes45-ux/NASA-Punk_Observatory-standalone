(function initPlanetUI(global)
{
    const PLANET_ZOOM_FOOTER   = '&gt; CAM_ZOOM: <span id="zoom-text-display">100%</span>' +
        '<br>&gt; SURFACE_GEN: <span id="particle-build-progress">0%</span>';
    const MONITOR_LABEL_TOP    = '<div class="monitor-label label-top">SYSTEM OVERVIEW // CLICK MAP TO EXPAND</div>';
    const MONITOR_LABEL_BOTTOM = '<div class="monitor-label label-bottom">TGT: RA 00h 00m | DEC +00° <span style="margin-left:10px; color:var(--const-orange)">EPOCH: J2000.0</span></div>';

    function navigateTo(url)
    {
        if (typeof TransitionManager !== 'undefined')
        {
            TransitionManager.navigate(url);
        }
        else
        {
            window.location.href = url;
        }
    }

    function buildSystemMonitor(config)
    {
        return `<div class="system-monitor-container">
            <div class="system-monitor-body" aria-hidden="true">
                <canvas id="system-monitor-particle-canvas" class="system-monitor-particle-canvas" aria-hidden="true"></canvas>
            </div>
            <button type="button" class="system-monitor-trigger" aria-expanded="false" aria-controls="system-planet-strip" aria-label="OPEN SYSTEM NAVIGATION"></button>
            <a class="system-monitor-caption" title="GO TO SYSTEM SELECT" href="index.html" aria-label="GO TO SYSTEM SELECT">
                ${MONITOR_LABEL_TOP}
                ${MONITOR_LABEL_BOTTOM}
            </a>
        </div>`;
    }

    // 展开态导航条复用首页 system select 的行星节点视觉（node-* 类见 components.css）
    const STRIP_NODES = [
        {
            name : 'sun',
            label: 'SOL',
            link : 'sun.html',
            inner: '<div class="planet-body"></div>'
        },
        {
            name : 'mercury',
            label: 'MERCURY',
            link : 'mercury.html',
            inner: '<div class="planet-body"></div>'
        },
        {
            name : 'venus',
            label: 'VENUS',
            link : 'venus.html',
            inner: '<div class="planet-body"></div>'
        },
        {
            name : 'earth',
            label: 'EARTH',
            link : 'earth.html',
            inner: '<div class="planet-body"></div>'
                + '<div class="satellite-orbit orbit-hidden"><div class="satellite"></div></div>'
        },
        {
            name : 'mars',
            label: 'MARS',
            link : 'mars.html',
            inner: '<div class="planet-body"></div>'
                + '<div class="satellite-orbit orbit-hidden o-phobos"><div class="satellite sat-small s-phobos"></div></div>'
                + '<div class="satellite-orbit orbit-hidden o-deimos"><div class="satellite sat-small s-deimos"></div></div>'
        },
        {
            name : 'jupiter',
            label: 'JUPITER',
            link : 'jupiter.html',
            inner: '<div class="planet-body"></div>'
                + '<div class="satellite-orbit orbit-hidden"><div class="satellite"></div></div>'
        },
        {
            name : 'saturn',
            label: 'SATURN',
            link : 'saturn.html',
            inner: '<div class="ring-back"></div><div class="planet-body"></div><div class="ring-front"></div>'
                + '<div class="satellite-orbit orbit-hidden"><div class="satellite"></div></div>'
        },
        {
            name : 'uranus',
            label: 'URANUS',
            link : 'uranus.html',
            inner: '<div class="ring-back"></div><div class="planet-body"></div><div class="ring-front"></div>'
                + '<div class="satellite-orbit orbit-hidden"><div class="satellite"></div></div>'
        },
        {
            name : 'neptune',
            label: 'NEPTUNE',
            link : 'neptune.html',
            inner: '<div class="ring-back ring-faint"></div><div class="planet-body"></div><div class="ring-front ring-faint"></div>'
                + '<div class="satellite-orbit orbit-hidden o-triton"><div class="satellite s-triton"></div></div>'
        }
    ];

    function buildSystemStrip(activeName)
    {
        const nodes = STRIP_NODES.map((node) =>
        {
            const activeClass = node.name === activeName ? ' strip-active' : '';
            return `<a class="planet-node node-${node.name}${activeClass}" data-planet-link="${node.link}" href="${node.link}" title="GO TO ${node.label}" aria-label="GO TO ${node.label}">
                    <div class="node-label">${node.label}</div>
                    <div class="planet-system">${node.inner}</div>
                </a>`;
        }).join('');

        return `<nav class="system-strip" id="system-planet-strip" aria-label="PLANET NAVIGATION" aria-hidden="true">
            <div class="strip-hints">
                <a class="strip-overview" title="GO TO SYSTEM SELECT" href="index.html">SYSTEM OVERVIEW // SOL</a>
                <span class="strip-hint">CLICK BODY TO JUMP // ESC TO CLOSE</span>
            </div>
            <div class="strip-axis-group">
                <div class="axis-line"></div>
                ${nodes}
            </div>
        </nav>`;
    }

    function buildQualityControl()
    {
        return `<button type="button" class="quality-control" id="quality-control" title="CYCLE QUALITY PROFILE (AUTO / HIGH / BALANCED / LOW)" aria-label="CYCLE QUALITY PROFILE" aria-live="polite">
            <span class="quality-label">QUALITY</span>
            <span class="quality-value" id="quality-value">AUTO</span>
        </button>`;
    }

    function buildPlanetLayout(config)
    {
        return `${ObservatoryUI.buildRightDock({
            title    : config.title,
            badge    : config.badge,
            subText  : config.subText,
            rows     : config.rows,
            footerRow: PLANET_ZOOM_FOOTER
        })}${ObservatoryUI.buildVerticalZoomControl({
            sliderId: 'cam-zoom-slider',
            label   : 'OPTICS'
        })}${buildQualityControl()}${buildSystemMonitor(config)}${buildSystemStrip(config.active)}`;
    }

    const QUALITY_CYCLE = ['auto', 'high', 'balanced', 'low'];
    const QUALITY_STORAGE_KEY = 'observatory-quality';

    function readStoredQuality()
    {
        try
        {
            const stored = localStorage.getItem(QUALITY_STORAGE_KEY);
            return QUALITY_CYCLE.includes(stored) ? stored : null;
        }
        catch (error)
        {
            return null;    // file:// 或隐私模式下 storage 可能被禁用
        }
    }

    function storeQuality(profile)
    {
        try
        {
            localStorage.setItem(QUALITY_STORAGE_KEY, profile);
        }
        catch (error)
        {
            // 忽略：仅影响跨会话记忆
        }
    }

    function renderPlanetUI(planetName)
    {
        const cfg  = PLANET_UI_CONFIG[planetName];
        const root = document.getElementById('planet-ui-root');
        if (!cfg || !root)
        {
            return;
        }

        root.innerHTML = buildPlanetLayout(cfg);
        const monitor = root.querySelector('.system-monitor-container');
        const strip   = root.querySelector('.system-strip');
        const monitorTrigger = root.querySelector('.system-monitor-trigger');
        if (!monitor || !strip || !monitorTrigger)
        {
            return;
        }

        monitor.style.cursor = 'pointer';
        let stripOpen = false;
        const particleMap = typeof createParticleMiniMap === 'function'
            ? createParticleMiniMap({
                canvasId: 'system-monitor-particle-canvas',
                active  : planetName,
                count   : 128,
                seed    : 20260909
            })
            : null;

        if (particleMap)
        {
            particleMap.start();
            window.addEventListener('resize', () => particleMap.resize());
            window.addEventListener('pagehide', () => particleMap.stop(), {once: true});
        }

        const setStripOpen = (next) =>
        {
            stripOpen = next;
            strip.classList.toggle('open', stripOpen);
            monitor.classList.toggle('strip-open', stripOpen);
            monitorTrigger.setAttribute('aria-expanded', String(stripOpen));
            strip.setAttribute('aria-hidden', String(!stripOpen));
            strip.toggleAttribute('inert', !stripOpen);
            strip.inert = !stripOpen;

            if (!stripOpen && strip.contains(document.activeElement))
            {
                monitorTrigger.focus();
            }
        };

        // 隐藏状态下同时阻断 Tab 进入导航条，避免 aria-hidden 内容仍可获得焦点。
        setStripOpen(false);

        monitor.addEventListener('click', (event) =>
        {
            // 标注栏固定为系统总览入口；点击星图本体展开横向导航条
            event.stopPropagation();
            if (event.target.closest('.system-monitor-caption'))
            {
                event.preventDefault();
                navigateTo('index.html');
                return;
            }
            if (event.target.closest('.system-monitor-trigger'))
            {
                setStripOpen(true);
            }
        });

        strip.addEventListener('click', (event) =>
        {
            event.stopPropagation();
            if (event.target.closest('.strip-overview'))
            {
                event.preventDefault();
                navigateTo('index.html');
                return;
            }
            const node = event.target.closest('[data-planet-link]');
            if (node)
            {
                const target = node.dataset.planetLink;
                if (target !== `${planetName}.html`)
                {
                    event.preventDefault();
                    navigateTo(target);
                }
                else
                {
                    event.preventDefault();
                }
                return;
            }
            setStripOpen(false);
        });

        document.addEventListener('click', (event) =>
        {
            if (stripOpen && !strip.contains(event.target))
            {
                setStripOpen(false);
            }
        });

        document.addEventListener('keydown', (event) =>
        {
            if (event.key === 'Escape' && stripOpen)
            {
                setStripOpen(false);
            }
        });

        // 手动画质档位：渲染时先恢复上次选择（此时尚无 sampler，由
        // ParticleBuilder 记住覆盖值，后续创建的 sampler 会直接锁定）
        const qualityControl = root.querySelector('#quality-control');
        const qualityValue   = root.querySelector('#quality-value');
        if (qualityControl && qualityValue && typeof ParticleBuilder !== 'undefined')
        {
            const applyQuality = (profile, persist) =>
            {
                ParticleBuilder.setQualityProfile(profile);
                qualityValue.textContent = profile.toUpperCase();
                qualityControl.setAttribute('aria-label', `QUALITY PROFILE: ${profile.toUpperCase()}. ACTIVATE TO CYCLE`);
                if (persist)
                {
                    storeQuality(profile);
                }
            };

            const stored = readStoredQuality();
            if (stored)
            {
                applyQuality(stored, false);
            }

            qualityControl.addEventListener('click', () =>
            {
                const next = QUALITY_CYCLE[(QUALITY_CYCLE.indexOf(ParticleBuilder.getQualityProfile()) + 1) % QUALITY_CYCLE.length];
                applyQuality(next, true);
            });
        }
    }

    global.buildPlanetLayout = buildPlanetLayout;
    global.renderPlanetUI    = renderPlanetUI;
})(window);
