(function initSystemSelectConfig(global)
{
    global.SYSTEM_SELECT_CONFIG = {
        dock       : {
            title    : 'SYSTEM : SOL',
            subText  : 'SECTOR: <b>SOL_SYSTEM</b> // STAR: <b>G2V_DWARF</b> // PLANETS: <b>8</b>',
            rows     : ['&gt; SYSTEM_OVERVIEW: <span class="alert">SOL</span>'],
            footerRow: '<div class="terminal-output" id="terminal-content"></div>'
        },
        interaction: {
            initialTerminalText: '> SYSTEM MAP ONLINE...\n> 9 CELESTIAL BODIES TRACKED\n> SELECT TARGET',
            defaultScale      : 100
        },
        zoom       : {
            sliderId : 'zoom-slider',
            displayId: 'scale-val',
            label    : 'SYSTEM_SCALE',
            value    : '100%'
        },
        nodes      : [
            {
                name : 'sun',
                label: 'SOL',
                link : 'sun.html',
                data : '> TARGET: SOL [STAR]\n> TYPE: G2V YELLOW DWARF\n> STATUS: ACTIVE'
            },
            {
                name : 'mercury',
                label: 'MERCURY',
                link : 'mercury.html',
                data : '> TARGET: SOL-I [MERCURY]\n> TYPE: TERRESTRIAL\n> STATUS: ONLINE'
            },
            {
                name : 'venus',
                label: 'VENUS',
                link : 'venus.html',
                data : '> TARGET: SOL-II [VENUS]\n> TYPE: TERRESTRIAL\n> STATUS: ONLINE'
            },
            {
                name : 'earth',
                label: 'TERRA',
                link : 'earth.html',
                data : '> TARGET: SOL-III [TERRA]\n> TYPE: TERRESTRIAL\n> STATUS: HABITABLE'
            },
            {
                name : 'mars',
                label: 'MARS',
                link : 'mars.html',
                data : '> TARGET: SOL-IV [MARS]\n> TYPE: TERRESTRIAL\n> STATUS: ONLINE'
            },
            {
                name : 'jupiter',
                label: 'JUPITER',
                link : 'jupiter.html',
                data : '> TARGET: SOL-V [JUPITER]\n> TYPE: GAS GIANT\n> STATUS: ONLINE'
            },
            {
                name : 'saturn',
                label: 'SATURN',
                link : 'saturn.html',
                data : '> TARGET: SOL-VI [SATURN]\n> TYPE: GAS GIANT\n> STATUS: ONLINE'
            },
            {
                name : 'uranus',
                label: 'URANUS',
                link : 'uranus.html',
                data : '> TARGET: SOL-VII [URANUS]\n> TYPE: ICE GIANT\n> STATUS: ONLINE'
            },
            {
                name : 'neptune',
                label: 'NEPTUNE',
                link : 'neptune.html',
                data : '> TARGET: SOL-VIII [NEPTUNE]\n> TYPE: ICE GIANT\n> STATUS: ONLINE'
            }
        ]
    };
})(window);
