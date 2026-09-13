(function initSystemSelectUi(global)
{
    const SYSTEM_SELECT_CONFIG = global.SYSTEM_SELECT_CONFIG || {};
    const SYSTEM_SELECT_NODES  = SYSTEM_SELECT_CONFIG.nodes || [];

    function buildNode(node)
    {
        return `<a class="solar-target node-${node.name}" data-planet="${node.name}" data-link="${node.link}" href="${node.link}" aria-label="OPEN ${node.label} OBSERVATORY">
            <span class="solar-target-index">${node.name === 'sun' ? '★' : node.label.slice(0, 2)}</span>
            <span class="solar-target-label">${node.label}</span>
            <div class="node-data" style="display:none;">${node.data}</div>
        </a>`;
    }

    function buildSystemSelectStage()
    {
        return `<div class="solar-overview-stage" id="solar-overview-stage">
            <div class="solar-title-cluster" aria-hidden="true">
                <span class="solar-kicker">HELIOCENTRIC PARTICLE MAP</span>
                <strong>SOL SYSTEM</strong>
                <span class="solar-coordinate">ECLIPTIC PROJECTION // LIVE ORBITS</span>
            </div>
            <div class="solar-label-layer" id="solar-label-layer">
                ${SYSTEM_SELECT_NODES.map(buildNode).join('')}
            </div>
            <div class="solar-control-hint">DRAG TO ORBIT&nbsp;&nbsp;·&nbsp;&nbsp;SCROLL TO SCALE&nbsp;&nbsp;·&nbsp;&nbsp;SELECT A WORLD</div>
        </div>`;
    }

    function renderSystemSelectUI()
    {
        const root = document.getElementById('system-select-root');
        if (!root)
        {
            return;
        }

        root.innerHTML = `
            ${ObservatoryUI.buildRightDock(SYSTEM_SELECT_CONFIG.dock)}
            ${buildSystemSelectStage()}
            ${ObservatoryUI.buildHorizontalZoomControl(SYSTEM_SELECT_CONFIG.zoom)}
        `;
    }

    global.renderSystemSelectUI   = renderSystemSelectUI;
    global.buildSystemSelectStage = buildSystemSelectStage;
})(window);
