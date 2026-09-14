(function initSystemSelectPage()
{
    const SYSTEM_SELECT_CONFIG      = window.SYSTEM_SELECT_CONFIG || {};
    const SYSTEM_SELECT_INTERACTION = SYSTEM_SELECT_CONFIG.interaction || {};
    const reducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function typeText(target, text)
    {
        if (!target)
        {
            return;
        }
        if (target._typeTimer)
        {
            clearInterval(target._typeTimer);
            target._typeTimer = null;
        }

        const cleanText    = text
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join('\n');

        function appendCursor()
        {
            const cursor = document.createElement('span');
            cursor.className = 'blink-cursor';
            cursor.textContent = '_';
            target.appendChild(cursor);
        }

        target.textContent = '';
        if (reducedMotion)
        {
            target.textContent = cleanText;
            appendCursor();
            return;
        }

        let index         = 0;
        target._typeTimer = setInterval(() =>
        {
            if (index < cleanText.length)
            {
                target.textContent += cleanText.charAt(index);
                index += 1;
                return;
            }

            clearInterval(target._typeTimer);
            target._typeTimer = null;
            appendCursor();
        }, 10);
    }

    function initSystemSelectInteractions()
    {
        const slider          = document.getElementById('zoom-slider');
        const scaleVal        = document.getElementById('scale-val');
        const terminalContent = document.getElementById('terminal-content');
        const nodes           = document.querySelectorAll('.solar-target');

        if (!slider || !scaleVal || !terminalContent || nodes.length === 0)
        {
            return;
        }

        function applyZoom(sliderValue)
        {
            const value = Number(sliderValue);
            scaleVal.textContent = `${Math.round(55 + value * 0.9)}%`;
            if (window.solarSystemOverview)
            {
                window.solarSystemOverview.setScale(value / 100);
            }
        }

        initPrecisionSlider(slider, (value) =>
        {
            applyZoom(value);
        });

        nodes.forEach((node) =>
        {
            const showNodeData = () =>
            {
                const dataDiv = node.querySelector('.node-data');
                if (dataDiv)
                {
                    typeText(terminalContent, dataDiv.textContent);
                }
            };

            node.addEventListener('mouseenter', showNodeData);
            node.addEventListener('focus', showNodeData);

            node.addEventListener('click', (event) =>
            {
                const link = node.dataset.link;
                if (!link)
                {
                    return;
                }

                if (typeof TransitionManager !== 'undefined')
                {
                    event.preventDefault();
                    const overview = window.solarSystemOverview;
                    if (!overview || !overview.focusAndNavigate(node.dataset.planet, link))
                    {
                        TransitionManager.navigate(link);
                    }
                }
            });
        });

        setTimeout(() =>
        {
            typeText(
                terminalContent,
                SYSTEM_SELECT_INTERACTION.initialTerminalText || '> SYSTEM READY...\n> SELECT TARGET\n> STANDBY...'
            );
        }, 100);

        applyZoom(slider.value || SYSTEM_SELECT_INTERACTION.defaultScale || 100);
    }

    if (typeof renderSystemSelectUI === 'function')
    {
        renderSystemSelectUI();
    }

    const topoBackground = createTopoBackground({
        canvasId   : 'topo-canvas',
        noiseOffset: 100
    });
    const overviewProfile = typeof ParticleBuilder !== 'undefined'
        ? ParticleBuilder.selectInitialProfile()
        : 'high';
    const overviewParticleCount = {
        high    : 320,
        balanced: 240,
        low     : 170,
        recovery: 110
    }[overviewProfile] || 320;
    const systemParticleField = typeof createSystemParticleField === 'function'
        ? createSystemParticleField({
            count: overviewParticleCount,
            seed : 20260906
        })
        : null;

    if (systemParticleField)
    {
        systemParticleField.start();
        window.addEventListener('pagehide', () => systemParticleField.stop());
        window.addEventListener('pageshow', (event) =>
        {
            if (event && event.persisted === true)
            {
                systemParticleField.start();
            }
        });
    }

    const solarSystemOverview = typeof createSolarSystemOverview === 'function'
        ? createSolarSystemOverview({
            containerId: 'solar-system-scene',
            labelSelector: '.solar-target',
            profile: overviewProfile
        })
        : null;
    if (solarSystemOverview)
    {
        solarSystemOverview.start();
    }

    initSystemSelectInteractions();

    // ==========================================
    // Seamless Client Navigation & Interaction Router
    // ==========================================
    function setupClientRouter()
    {
        const overview = window.solarSystemOverview;
        const systemSelectRoot = document.getElementById('system-select-root');
        const planetUiRoot = document.getElementById('planet-ui-root');
        const uiLayer = document.getElementById('ui-layer');

        function mountPlanet(planetName, url)
        {
            if (systemSelectRoot) systemSelectRoot.style.display = 'none';
            if (uiLayer) uiLayer.style.display = 'block';
            document.body.classList.add('planet-view-active', 'transition-ready');
            document.body.classList.remove('solar-system-targeting');

            if (typeof renderPlanetUI === 'function')
            {
                renderPlanetUI(planetName);
                bindPlanetInteractions(planetName);
            }
            if (url)
            {
                history.pushState({ planet: planetName }, '', url);
            }
            const config = window.PLANET_DOCK_CONFIG?.[planetName];
            if (config?.title)
            {
                document.title = `NASA-Punk : ${config.title}`;
            }
        }

        function returnToSystem(push = true)
        {
            if (overview && typeof overview.returnToOverview === 'function')
            {
                overview.returnToOverview(() =>
                {
                    if (uiLayer) uiLayer.style.display = 'none';
                    if (planetUiRoot) planetUiRoot.innerHTML = '';
                    if (systemSelectRoot) systemSelectRoot.style.display = '';
                    document.body.classList.remove('planet-view-active');
                    document.body.classList.add('transition-ready');
                    document.title = 'NASA-Punk Observatory : SYSTEM SELECT';
                    if (push) history.pushState(null, '', 'index.html');
                });
            }
            else
            {
                if (uiLayer) uiLayer.style.display = 'none';
                if (planetUiRoot) planetUiRoot.innerHTML = '';
                if (systemSelectRoot) systemSelectRoot.style.display = '';
                document.body.classList.remove('planet-view-active');
                if (push) history.pushState(null, '', 'index.html');
            }
        }

        function bindPlanetInteractions(currentPlanet)
        {
            const monitorCaption = document.querySelector('.system-monitor-caption');
            if (monitorCaption)
            {
                monitorCaption.addEventListener('click', (e) =>
                {
                    e.preventDefault();
                    returnToSystem(true);
                });
            }

            const stripNodes = document.querySelectorAll('[data-planet-link]');
            stripNodes.forEach((node) =>
            {
                node.addEventListener('click', (e) =>
                {
                    const targetLink = node.dataset.planetLink;
                    const targetName = targetLink.replace('.html', '');
                    if (targetName && targetName !== currentPlanet)
                    {
                        e.preventDefault();
                        if (overview)
                        {
                            overview.focusAndNavigate(targetName, targetLink, {
                                onArrival: (name, url) => mountPlanet(name, url)
                            });
                        }
                    }
                });
            });
        }

        window.addEventListener('popstate', (event) =>
        {
            if (event.state && event.state.planet)
            {
                if (overview)
                {
                    overview.focusAndNavigate(event.state.planet, `${event.state.planet}.html`, {
                        onArrival: (name, url) => mountPlanet(name, url)
                    });
                }
            }
            else
            {
                returnToSystem(false);
            }
        });

        window.__observatoryClientRouter = {
            onPlanetArrival: (planetName, url) => mountPlanet(planetName, url),
            returnToSystem
        };

        window.addEventListener('observatory:transit-step', (e) =>
        {
            const terminalContent = document.getElementById('terminal-content');
            if (!terminalContent || !e.detail) return;
            const { planet, progress, distanceRemaining } = e.detail;
            if (progress < 0.95)
            {
                terminalContent.textContent = `> TGT LOCK: [${planet.toUpperCase()}]\n> DISTANCE: ${distanceRemaining} AU\n> INERTIAL TRANSIT: ${Math.round(progress * 100)}%`;
            }
            else
            {
                terminalContent.textContent = `> TGT: [${planet.toUpperCase()}] ARRIVED\n> ORBIT INSERTION: 100% COMPLETE`;
            }
        });
    }

    setupClientRouter();

    window.addEventListener('resize', () =>
    {
        topoBackground.resize();
        systemParticleField?.resize();
        solarSystemOverview?.resize();
    });

    window.addEventListener('pagehide', () => solarSystemOverview?.stop());
    window.addEventListener('pageshow', (event) =>
    {
        if (!solarSystemOverview || !event.persisted) return;
        solarSystemOverview.resetFocus();
        solarSystemOverview.start();
    });

    requestAnimationFrame(() =>
    {
        if (typeof ParticleBuilder !== 'undefined' && typeof ParticleBuilder.markReady === 'function')
        {
            ParticleBuilder.markReady({page: 'index'});
        }
    });
})();
