(function initPlanetUI(global)
{
    const MONITOR_ORDER        = ['neptune', 'uranus', 'saturn', 'jupiter', 'mars', 'earth', 'venus', 'mercury'];
    const PLANET_ZOOM_FOOTER   = '&gt; CAM_ZOOM: <span id="zoom-text-display">100%</span>' +
        '<br>&gt; SURFACE_GEN: <span id="particle-build-progress">0%</span>';
    const MONITOR_LABEL_TOP    = '<div class="monitor-label label-top">SYSTEM OVERVIEW // SOL // CLICK BODY TO JUMP</div>';
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
            return `<div class="sun-marker" data-planet-link="sun.html">${buildReticle(Boolean(config.reticleLarge))}</div>`;
        }

        return '<div class="sun-marker" data-planet-link="sun.html" title="GO TO SOL"></div>';
    }

    function buildMonitorOrbit(name, config)
    {
        const orbitActive = config.active === name ? ' orbit-active' : '';
        return `<div class="orbit-path o-${name}${orbitActive}"></div>`;
    }

    function buildMonitorPlanet(name, config)
    {
        const isActive    = config.active === name;
        const markerExtra = isActive && config.activeMarkerExtraClass ? ` ${config.activeMarkerExtraClass}` : '';
        const reticle     = isActive ? buildReticle(Boolean(config.reticleLarge)) : '';
        const linkTitle   = isActive ? '' : ` title="GO TO ${name.toUpperCase()}"`;

        return `<div class="planet-container c-${name}">
                <div class="planet-marker p-${name}${markerExtra}" data-planet-link="${name}.html"${linkTitle}>${reticle}</div>
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
            <div class="system-monitor-caption">
                ${MONITOR_LABEL_TOP}
                ${MONITOR_LABEL_BOTTOM}
            </div>
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
        })}${buildSystemMonitor(config)}`;
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
        const monitor  = root.querySelector('.system-monitor-container');
        if (monitor)
        {
            monitor.style.cursor = 'pointer';
            monitor.addEventListener('click', (event) =>
            {
                // 命中星图天体标记：直接切换到该星球页面；点击其余区域回系统总览
                const marker = event.target.closest('[data-planet-link]');
                const target = marker ? marker.dataset.planetLink : 'index.html';
                if (marker && target === `${planetName}.html`)
                {
                    return;
                }
                navigateTo(target);
            });
        }
    }

    global.buildPlanetLayout = buildPlanetLayout;
    global.renderPlanetUI    = renderPlanetUI;
})(window);
