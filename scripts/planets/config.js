const PLANET_DOCK_CONFIG = {
    sun    : {
        title  : 'SOL',
        badge  : 'STAR',
        subText: 'SYS: <b>SOL</b> // TYPE: <b>G2V</b> // AGE: <b>4.60 BY</b>',
        rows   : [
            '&gt; THERMAL_SCAN: <span>5778 K</span> // STABLE',
            '&gt; SOLAR_WIND: <span>400 km/s</span> <span class="alert">[HIGH]</span>',
            '&gt; MAG._FIELD: <span>POLARITY FLIP</span> DETECTED'
        ]
    },
    mercury: {
        title  : 'SOL I',
        badge  : 'MERCURY',
        subText: 'SYS: <b>SOL</b> // ORB: <b>0.39 AU</b> // ECC: <b>0.2056</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>SCORCHED_BASALT</span>',
            '&gt; ATMOS_SCAN: <span>Na / K</span> <span class="alert">[TRACE_EXOSPHERE]</span>',
            '&gt; ROT_LOCK: <span>3:2 RESONANCE</span> <span class="alert">[58.6 D]</span>'
        ]
    },
    venus  : {
        title  : 'SOL II',
        badge  : 'VENUS',
        subText: 'SYS: <b>SOL</b> // ORB: <b>0.72 AU</b> // ECC: <b>0.0067</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>VOLCANIC_PLAINS</span>',
            '&gt; ATMOS_SCAN: <span>CO2 / H2SO4</span> <span class="alert">[SUPERCRITICAL]</span>',
            '&gt; ROT_LOCK: <span>243 D SIDEREAL</span> <span class="alert">[RETROGRADE]</span>'
        ]
    },
    earth  : {
        title  : 'SOL III',
        badge  : 'TERRA',
        subText: 'SYS: <b>SOL</b> // ORB: <b>1.00 AU</b> // ECC: <b>0.0167</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>SILICATE / LIQUID_H2O</span>',
            '&gt; ATMOS_SCAN: <span>N2 / O2</span> <span class="alert">[LIFE_SUPPORT]</span>',
            '&gt; ORBITAL_ASSETS: <span>1 MOON // 4 LEO</span> TRACKED'
        ]
    },
    mars   : {
        title  : 'SOL IV',
        badge  : 'MARS',
        subText: 'SYS: <b>SOL</b> // ORB: <b>1.52 AU</b> // ECC: <b>0.0934</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>IRON_OXIDE_DUST</span>',
            '&gt; ATMOS_COMP: <span>CO2 95% / N2 / AR</span> <span class="alert">[THIN]</span>',
            '&gt; ORBITAL_ASSETS: <span>2 CONFIRMED</span> <span class="alert">[PHOBOS // DEIMOS]</span>'
        ]
    },
    jupiter: {
        title  : 'SOL V',
        badge  : 'JUPITER',
        subText: 'SYS: <b>SOL</b> // ORB: <b>5.20 AU</b> // ECC: <b>0.0484</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>N/A</span> <span class="alert">[GAS_GIANT]</span>',
            '&gt; ATMOS-SCAN: <span>H2 / He / NH3</span> <span class="alert">[STORM_BANDS]</span>',
            '&gt; ORBITAL_ASSETS: <span>95 CONFIRMED</span> <span class="alert">[10 TRACKED]</span>'
        ]
    },
    saturn : {
        title  : 'SOL VI',
        badge  : 'SATURN',
        subText: 'SYS: <b>SOL</b> // ORB: <b>9.58 AU</b> // ECC: <b>0.0541</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>N/A</span> <span class="alert">[GAS_GIANT]</span>',
            '&gt; ATMOS_SCAN: <span>H2 / He</span> <span class="alert">[HEX_POLE]</span>',
            '&gt; ORBITAL_ASSETS: <span>274 CONFIRMED</span> <span class="alert">[9 TRACKED]</span>'
        ]
    },
    uranus : {
        title  : 'SOL VII',
        badge  : 'URANUS',
        subText: 'SYS: <b>SOL</b> // ORB: <b>19.22 AU</b> // ECC: <b>0.0472</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>N/A</span> <span class="alert">[ICE_GIANT]</span>',
            '&gt; ATMOS_SCAN: <span>H2 / He / CH4</span> <span class="alert">[COLD]</span>',
            '&gt; ORBITAL_ASSETS: <span>28 CONFIRMED</span> <span class="alert">[16 TRACKED]</span>'
        ]
    },
    neptune: {
        title  : 'SOL VIII',
        badge  : 'NEPTUNE',
        subText: 'SYS: <b>SOL</b> // ORB: <b>30.07 AU</b> // ECC: <b>0.0086</b>',
        rows   : [
            '&gt; TOPO_SCAN: <span>N/A</span> <span class="alert">[ICE_GIANT]</span>',
            '&gt; ATMOS_SCAN: <span>H2 / He / CH4</span> <span class="alert">[SUPERSONIC]</span>',
            '&gt; ORBITAL_ASSETS: <span>16 CONFIRMED</span> <span class="alert">[TRITON RETROGRADE]</span>'
        ]
    }
};

const PLANET_MONITOR_CONFIG = {
    sun    : {
        active      : 'sun',
        reticleLarge: true
    },
    mercury: {
        active: 'mercury'
    },
    venus  : {
        active: 'venus'
    },
    earth  : {
        active: 'earth'
    },
    mars   : {
        active: 'mars'
    },
    jupiter: {
        active      : 'jupiter',
        reticleLarge: true
    },
    saturn : {
        active      : 'saturn',
        reticleLarge: true
    },
    uranus : {
        active      : 'uranus',
        reticleLarge: true
    },
    neptune: {
        active                : 'neptune',
        activeMarkerExtraClass: 'p-neptune-theme'
    }
};

// Surface budgets are coverage-normalized: each value targets ~2.5-3.2x
// particle coverage of the visible disk at the planet's default zoom and point
// size (the empirically best-looking band on a 1080p display; below ~2x the
// sphere shows gaps, above ~4x translucent layers blur into mush).
// Dynamic ceilings stay as-is; hardcoded dynamic layers run well below them.
const PLANET_PARTICLE_CONFIG = {
    sun:     {surface: 200000, dynamic: 80000},
    mercury: {surface: 160000, dynamic: 30000},
    venus:   {surface: 150000, dynamic: 60000},
    earth:   {surface: 210000, dynamic: 50000},
    mars:    {surface: 180000, dynamic: 40000},
    jupiter: {surface: 200000, dynamic: 80000},
    saturn:  {surface: 160000, dynamic: 60000},
    uranus:  {surface: 130000, dynamic: 40000},
    neptune: {surface: 170000, dynamic: 60000}
};

const PLANET_UI_CONFIG = Object.keys(PLANET_DOCK_CONFIG).reduce((acc, planetName) =>
{
    acc[planetName] = Object.assign(
        {},
        PLANET_DOCK_CONFIG[planetName],
        PLANET_MONITOR_CONFIG[planetName]
    );
    return acc;
}, {});
