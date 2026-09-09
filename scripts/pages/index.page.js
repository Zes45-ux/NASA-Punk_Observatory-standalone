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

        target.textContent = '';
        if (reducedMotion)
        {
            target.textContent = cleanText;
            target.innerHTML += '<span class="blink-cursor">_</span>';
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
            target.innerHTML += '<span class="blink-cursor">_</span>';
        }, 10);
    }

    function initSystemSelectInteractions()
    {
        const axisGroup       = document.getElementById('axis-group');
        const slider          = document.getElementById('zoom-slider');
        const scaleVal        = document.getElementById('scale-val');
        const terminalContent = document.getElementById('terminal-content');
        const root            = document.getElementById('system-select-root');
        const nodes           = document.querySelectorAll('.planet-node');

        if (!axisGroup || !slider || !scaleVal || !terminalContent || !root || nodes.length === 0)
        {
            return;
        }

        const planetsTotalWidthPx = SYSTEM_SELECT_INTERACTION.planetsTotalWidthPx || 482;
        const gapsCount           = SYSTEM_SELECT_INTERACTION.gapsCount || 8;
        const targetWidthRatio    = SYSTEM_SELECT_INTERACTION.targetWidthRatio || 0.70;
        const minimumGapPx        = SYSTEM_SELECT_INTERACTION.minimumGapPx || 20;
        let currentBaseGapPx      = 0;

        function applyZoom(sliderValue)
        {
            const factor         = 0.5 * Math.pow(4, sliderValue / 100);
            const finalGap       = currentBaseGapPx * factor;
            const axisWidth      = planetsTotalWidthPx + gapsCount * finalGap;
            const availableWidth = Math.max(1, DisplayArea.getSize(root).width - 16);
            const axisScale       = Math.min(1, availableWidth / Math.max(1, axisWidth));
            axisGroup.style.gap  = `${finalGap}px`;
            axisGroup.style.setProperty('--axis-scale', axisScale.toFixed(4));
            scaleVal.innerText   = `${Math.round(factor * 100)}%`;
        }

        function calculateBaseGap()
        {
            const displaySize         = DisplayArea.getSize(document.getElementById('system-select-root'));
            const targetTotalWidth    = displaySize.width * targetWidthRatio;
            let availableSpaceForGaps = targetTotalWidth - planetsTotalWidthPx;
            if (availableSpaceForGaps < gapsCount * minimumGapPx)
            {
                availableSpaceForGaps = gapsCount * minimumGapPx;
            }

            currentBaseGapPx = availableSpaceForGaps / gapsCount;
            applyZoom(slider.value);
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
                    TransitionManager.navigate(link);
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

        return calculateBaseGap;
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
    }

    const recalculateLayout = initSystemSelectInteractions();
    window.addEventListener('resize', () =>
    {
        topoBackground.resize();
        if (systemParticleField)
        {
            systemParticleField.resize();
        }
        if (recalculateLayout)
        {
            recalculateLayout();
        }
    });

    if (recalculateLayout)
    {
        recalculateLayout();
    }

    requestAnimationFrame(() => ParticleBuilder.markReady({page: 'index'}));
})();
