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

        const prefetchedPages = new Set();
        const prefetchPlanetPage = (link) =>
        {
            const connection = window.navigator && window.navigator.connection;
            if (!link || (connection && connection.saveData)) return;
            const href = new URL(link, window.location.href).href;
            if (prefetchedPages.has(href) || !document.head) return;
            prefetchedPages.add(href);
            const hint = document.createElement('link');
            hint.rel = 'prefetch';
            hint.as = 'document';
            hint.href = href;
            hint.setAttribute('data-observatory-prefetch', '');
            document.head.appendChild(hint);
        };

        nodes.forEach((node) =>
        {
            node.addEventListener('mouseenter', () => prefetchPlanetPage(node.dataset.link));
            node.addEventListener('focus', () => prefetchPlanetPage(node.dataset.link));
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
                    const clientRouter = window.__observatoryClientRouter;
                    if (clientRouter && clientRouter.initialized
                        && typeof clientRouter.canHandle === 'function'
                        && clientRouter.canHandle(link))
                    {
                        if (TransitionManager.navigate(link) !== false)
                        {
                            return;
                        }
                    }
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
    if (window.__observatoryClientRouter && typeof window.__observatoryClientRouter.init === 'function')
    {
        window.__observatoryClientRouter.init({overview: solarSystemOverview});
    }

    initSystemSelectInteractions();
    window.addEventListener('resize', () =>
    {
        topoBackground.resize();
        if (systemParticleField)
        {
            systemParticleField.resize();
        }
        if (solarSystemOverview)
        {
            solarSystemOverview.resize();
        }
    });

    window.addEventListener('pagehide', () => solarSystemOverview && solarSystemOverview.stop());
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
