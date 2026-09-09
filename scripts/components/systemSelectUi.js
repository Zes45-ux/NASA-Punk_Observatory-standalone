(function initSystemSelectUi(global)
{
    const SYSTEM_SELECT_CONFIG = global.SYSTEM_SELECT_CONFIG || {};
    const SYSTEM_SELECT_NODES  = SYSTEM_SELECT_CONFIG.nodes || [];

    function buildNode(node)
    {
        return `<a class="planet-node node-${node.name}" data-link="${node.link}" href="${node.link}" aria-label="OPEN ${node.label} OBSERVATORY">
            <div class="node-label">${node.label}</div>
            <div class="planet-system">
                ${node.inner}
            </div>
            <div class="node-data" style="display:none;">${node.data}</div>
        </a>`;
    }

    function buildSystemSelectStage()
    {
        return `<div class="nav-stage">
            <div class="axis-group" id="axis-group">
                <div class="axis-line"></div>
                ${SYSTEM_SELECT_NODES.map(buildNode).join('')}
            </div>
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
