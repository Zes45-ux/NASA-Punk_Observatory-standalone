(function initPlanetUI(global)
{
    const MONITOR_ORDER        = ['neptune', 'uranus', 'saturn', 'jupiter', 'mars', 'earth', 'venus', 'mercury'];
    const PLANET_ZOOM_FOOTER   = '&gt; CAM_ZOOM: <span id="zoom-text-display">100%</span>' +
        '<br>&gt; SURFACE_GEN: <span id="particle-build-progress">0%</span>';
    const MONITOR_LABEL_TOP    = '<div class="monitor-label label-top">SYSTEM OVERVIEW // CLICK MAP TO EXPAND</div>';
    const MONITOR_LABEL_BOTTOM = '<div class="monitor-label label-bottom">TGT: RA 00h 00m | DEC +00° <span style="margin-left:10px; color:var(--const-orange)">EPOCH: J2000.0</span></div>';

    function buildReticle(isLarge)
    {
        const sizeClass = isLarge ? ' large' : '';
        return `<div class="target-reticle${sizeClass}">
            <div class="reticle-corner rc-tl"></div>
            <div class="reticle-corner rc-tr"></div>
            <div class="reticle-corner rc-bl"></div>
            <div class="reticle-corner rc-br"></div>
        </div>`;
    }

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

    function buildSunMarker(config)
    {
        if (config.active === 'sun')
        {
            return `<div class="sun-marker">${buildReticle(Boolean(config.reticleLarge))}</div>`;
        }

        return '<div class="sun-marker"></div>';
    }

    function buildMonitorOrbit(name, config)
    {
        const orbitActive = config.active === name ? ' orbit-active' : '';
        return `<div class="orbit-path o-${name}${orbitActive}"></div>`;
    }

    function buildMonitorPlanet(name, config)
    {
        const markerExtra = config.active === name && config.activeMarkerExtraClass ? ` ${config.activeMarkerExtraClass}` : '';
        const reticle     = config.active === name ? buildReticle(Boolean(config.reticleLarge)) : '';

        return `<div class="planet-container c-${name}">
                <div class="planet-marker p-${name}${markerExtra}">${reticle}</div>
            </div>`;
    }

    function buildMonitorBody(config)
    {
        return MONITOR_ORDER.map((name) => `${buildMonitorOrbit(name, config)}${buildMonitorPlanet(name, config)}`).join('');
    }

    function buildSystemMonitor(config)
    {
        return `<div class="system-monitor-container">
            <div class="system-monitor-body">
                ${buildSunMarker(config)}
                ${buildMonitorBody(config)}
                <div class="scanner-trail"></div>
                <div class="scanner-line-sys"></div>
            </div>
            <div class="system-monitor-caption" title="GO TO SYSTEM SELECT">
                ${MONITOR_LABEL_TOP}
                ${MONITOR_LABEL_BOTTOM}
            </div>
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
            return `<div class="planet-node node-${node.name}${activeClass}" data-planet-link="${node.link}" title="GO TO ${node.label}">
                    <div class="node-label">${node.label}</div>
                    <div class="planet-system">${node.inner}</div>
                </div>`;
        }).join('');

        return `<div class="system-strip">
            <div class="strip-hints">
                <span class="strip-overview" title="GO TO SYSTEM SELECT">SYSTEM OVERVIEW // SOL</span>
                <span class="strip-hint">CLICK BODY TO JUMP // ESC TO CLOSE</span>
            </div>
            <div class="strip-axis-group">
                <div class="axis-line"></div>
                ${nodes}
            </div>
        </div>`;
    }

    function buildQualityControl()
    {
        return `<div class="quality-control" id="quality-control" title="CYCLE QUALITY PROFILE (AUTO / HIGH / BALANCED / LOW)">
            <div class="quality-label">QUALITY</div>
            <div class="quality-value" id="quality-value">AUTO</div>
        </div>`;
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
        if (!monitor || !strip)
        {
            return;
        }

        monitor.style.cursor = 'pointer';
        let stripOpen = false;

        const setStripOpen = (next) =>
        {
            stripOpen = next;
            strip.classList.toggle('open', stripOpen);
            monitor.classList.toggle('strip-open', stripOpen);
        };

        monitor.addEventListener('click', (event) =>
        {
            // 标注栏固定为系统总览入口；点击星图本体展开横向导航条
            event.stopPropagation();
            if (event.target.closest('.system-monitor-caption'))
            {
                navigateTo('index.html');
                return;
            }
            setStripOpen(true);
        });

        strip.addEventListener('click', (event) =>
        {
            event.stopPropagation();
            if (event.target.closest('.strip-overview'))
            {
                navigateTo('index.html');
                return;
            }
            const node = event.target.closest('[data-planet-link]');
            if (node)
            {
                const target = node.dataset.planetLink;
                if (target !== `${planetName}.html`)
                {
                    navigateTo(target);
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
