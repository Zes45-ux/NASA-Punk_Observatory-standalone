/**
 * In-document router for the landing-page observatory shell.
 *
 * The overview renderer owns the only WebGL canvas. Planet routes therefore
 * swap HUD DOM and camera state in place; the standalone *.html documents keep
 * their existing direct-navigation fallback for bookmarks and hard reloads.
 */
(function initClientRouter(global)
{
    const PLANET_NAMES = [
        'sun', 'mercury', 'venus', 'earth', 'mars',
        'jupiter', 'saturn', 'uranus', 'neptune'
    ];
    const PLANET_SET = new Set(PLANET_NAMES);
    const INDEX_TITLE = 'NASA-Punk Observatory : SYSTEM SELECT';

    function locationUrl()
    {
        return global.location && global.location.href
            ? global.location.href
            : 'http://localhost/index.html';
    }

    function parseRoute(url)
    {
        let parsed;
        try
        {
            parsed = new URL(url || locationUrl(), locationUrl());
        }
        catch (error)
        {
            return null;
        }

        if (global.location && global.location.origin
            && parsed.origin !== global.location.origin)
        {
            return null;
        }

        const path = parsed.pathname.replace(/\/+$/, '');
        const leaf = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
        const name = leaf.replace(/\.html?$/, '');
        const directory = path.slice(0, path.lastIndexOf('/') + 1) || '/';
        if (!name || name === 'index')
        {
            return {
                kind: 'index',
                path: directory,
                url: parsed
            };
        }
        if (!PLANET_SET.has(name))
        {
            return null;
        }
        return {
            kind: 'planet',
            name,
            href: name + '.html',
            path: directory + name,
            url: parsed
        };
    }

    function createTypewriter(target, text, reducedMotion)
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
        target.textContent = '';
        if (reducedMotion)
        {
            target.textContent = text;
            return;
        }

        let index = 0;
        target._typeTimer = setInterval(() =>
        {
            target.textContent += text.charAt(index);
            index += 1;
            if (index >= text.length)
            {
                clearInterval(target._typeTimer);
                target._typeTimer = null;
            }
        }, 12);
    }

    function createClientRouter(options = {})
    {
        const document = global.document;
        const history = global.history;
        const reducedMotion = typeof global.matchMedia === 'function'
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let overview = options.overview || null;
        let currentPlanet = null;
        let initialized = false;
        let transitionToken = 0;
        let lastReadout = '';
        const indexTitle = options.indexTitle || INDEX_TITLE;

        function bodyClassList()
        {
            return document && document.body && document.body.classList;
        }

        function setHidden(element, hidden)
        {
            if (!element) return;
            element.hidden = hidden;
            if (typeof element.setAttribute === 'function')
            {
                element.setAttribute('aria-hidden', String(hidden));
            }
        }

        function getElement(id)
        {
            return document && typeof document.getElementById === 'function'
                ? document.getElementById(id)
                : null;
        }

        function getPlanetTitle(name)
        {
            const config = global.PLANET_UI_CONFIG && global.PLANET_UI_CONFIG[name];
            const badge = config && config.badge ? config.badge : name.toUpperCase();
            const title = config && config.title ? config.title : name.toUpperCase();
            return 'NASA-Punk : ' + title + ' (' + badge + ')';
        }

        function writeTransitReadout(detail)
        {
            const readout = getElement('transit-readout');
            if (!readout || !detail) return;
            const planet = String(detail.planet || currentPlanet || 'target').toUpperCase();
            const distance = Number(detail.distanceRemaining);
            const approachSpeed = Number(detail.approachSpeed);
            const bearing = Number(detail.bearing);
            const fov = Number(detail.fov);
            const text = '> ' + planet + ' // DIST '
                + (Number.isFinite(distance) ? distance.toFixed(2) : '--.--')
                + ' // APPROACH '
                + (Number.isFinite(approachSpeed) ? approachSpeed.toFixed(2) : '--.--')
                + ' // BRG '
                + (Number.isFinite(bearing) ? bearing.toFixed(1) : '--.-')
                + '° // FOV '
                + (Number.isFinite(fov) ? fov.toFixed(1) : '--.-');
            if (text === lastReadout) return;
            lastReadout = text;
            readout.textContent = text;
        }

        function showSystem({push = false} = {})
        {
            const body = bodyClassList();
            const uiLayer = getElement('ui-layer');
            const systemRoot = getElement('system-select-root');
            const previousPlanet = currentPlanet;
            currentPlanet = null;
            transitionToken += 1;
            if (body)
            {
                body.remove('planet-route-active', 'planet-route-enter', 'planet-route-returning');
            }
            setHidden(systemRoot, false);
            setHidden(uiLayer, true);
            if (previousPlanet && typeof global.clearPlanetUI === 'function')
            {
                global.clearPlanetUI();
            }
            if (document)
            {
                document.title = indexTitle;
            }
            if (push && history && typeof history.pushState === 'function')
            {
                const route = parseRoute(locationUrl());
                const indexPath = route && route.kind === 'planet'
                    ? route.path.slice(0, route.path.lastIndexOf('/') + 1) || '/'
                    : (route ? route.path : './');
                history.pushState({observatoryRoute: 'index'}, '', indexPath);
            }
        }

        function revealPlanet(name, route, {push = false} = {})
        {
            const body = bodyClassList();
            const uiLayer = getElement('ui-layer');
            const systemRoot = getElement('system-select-root');
            currentPlanet = name;
            setHidden(systemRoot, true);
            setHidden(uiLayer, false);
            if (body)
            {
                body.remove('planet-route-returning');
                body.add('planet-route-active', 'planet-route-enter');
            }
            if (typeof global.renderPlanetUI === 'function')
            {
                global.renderPlanetUI(name);
            }
            if (document)
            {
                document.title = getPlanetTitle(name);
            }
            const typeTarget = getElement('transit-telemetry-label');
            createTypewriter(typeTarget, '> ' + name.toUpperCase() + ' // TRANSIT LOCKED', reducedMotion);
            writeTransitReadout({
                planet: name,
                distanceRemaining: 0,
                approachSpeed: 0,
                bearing: 0,
                fov: 38
            });
            if (push && history && typeof history.pushState === 'function')
            {
                history.pushState({observatoryRoute: name}, '', route.path);
            }
            if (body)
            {
                if (typeof global.requestAnimationFrame === 'function')
                {
                    global.requestAnimationFrame(() => body.remove('planet-route-enter'));
                }
                else
                {
                    body.remove('planet-route-enter');
                }
            }
        }

        function finishReturn(push)
        {
            showSystem({push});
        }

        function returnToSystem(push = true)
        {
            if (!currentPlanet)
            {
                showSystem({push});
                return true;
            }
            const token = ++transitionToken;
            const body = bodyClassList();
            setHidden(getElement('system-select-root'), false);
            if (body) body.add('planet-route-returning');
            const complete = () =>
            {
                if (token !== transitionToken) return;
                finishReturn(push);
            };
            if (overview && typeof overview.returnToOverview === 'function'
                && overview.returnToOverview({onComplete: complete}) !== false)
            {
                return true;
            }
            complete();
            return true;
        }

        function navigate(url, {fromHistory = false} = {})
        {
            const route = parseRoute(url);
            if (!route) return false;
            if (route.kind === 'index')
            {
                return returnToSystem(!fromHistory);
            }
            if (!overview || typeof overview.focusAndNavigate !== 'function')
            {
                return false;
            }
            if (currentPlanet === route.name)
            {
                return true;
            }
            const token = ++transitionToken;
            const accepted = overview.focusAndNavigate(route.name, route.href, {
                onArrival: () =>
                {
                    if (token !== transitionToken) return;
                    revealPlanet(route.name, route, {push: !fromHistory});
                }
            });
            return accepted !== false;
        }

        function syncFromLocation()
        {
            const route = parseRoute(locationUrl());
            if (!route) return false;
            return navigate(route.kind === 'planet' ? route.href : route.path, {fromHistory: true});
        }

        function init(next = {})
        {
            if (next.overview) overview = next.overview;
            if (!initialized && typeof global.addEventListener === 'function')
            {
                global.addEventListener('popstate', syncFromLocation);
                initialized = true;
            }
            const route = parseRoute(locationUrl());
            if (!route || route.kind === 'index')
            {
                showSystem();
            }
            else
            {
                syncFromLocation();
            }
            return api;
        }

        const api = {
            init,
            navigate,
            returnToSystem,
            onTransitStep: writeTransitReadout,
            canHandle: (url) => Boolean(parseRoute(url)),
            routeForPlanet: (name) => parseRoute(String(name).toLowerCase() + '.html'),
            get currentPlanet() { return currentPlanet; },
            get initialized() { return initialized; }
        };
        return api;
    }

    global.createClientRouter = createClientRouter;
    global.__observatoryClientRouter = createClientRouter();
})(window);
