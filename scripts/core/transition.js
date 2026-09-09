/**
 * NASA-Punk Transition System
 */
(function initTransitionSystem(global)
{
    const READY_TIMEOUT_MS = 1500;
    const DEFAULT_EXIT_MS = 480;
    const MAX_EXIT_MS = 1200;
    let revealed = false;
    let navigating = false;
    let cancelNavigation = null;
    let readyTimer = null;

    function isReducedMotionRequested()
    {
        return typeof global.matchMedia === 'function'
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function createCurtainMarkup()
    {
        return `
                <div class="curtain-col c1"></div>
                <div class="curtain-col c2"></div>
                <div class="curtain-col c3"></div>
                <div class="curtain-col c4"></div>
            `;
    }

    function ensureCurtain()
    {
        let curtain = document.getElementById('global-curtain');
        if (!curtain)
        {
            curtain           = document.createElement('div');
            curtain.className = 'transition-curtain';
            curtain.id        = 'global-curtain';
            curtain.innerHTML = createCurtainMarkup();
            document.body.appendChild(curtain);
        }
        return curtain;
    }

    function reveal()
    {
        if (revealed || navigating) return;
        revealed = true;
        const curtain = ensureCurtain();
        curtain.classList.remove('start-covered');
        document.body.classList.add('transition-ready');
    }

    function navigate(url)
    {
        if (navigating) return;
        navigating = true;
        let requestedExitMs = 0;
        const holdFor = (duration) =>
        {
            if (!Number.isFinite(duration)) return;
            requestedExitMs = Math.max(requestedExitMs, duration);
        };
        global.dispatchEvent(new CustomEvent('observatory:navigate-start', {
            detail: {url, holdFor}
        }));
        const curtain = ensureCurtain();
        curtain.classList.remove('start-covered');
        document.body.classList.add('particle-transition-exit');

        if (isReducedMotionRequested())
        {
            global.location.href = url;
            navigating = false;
            return;
        }

        let finished = false;
        let navigationTimer = null;
        const cleanup = () =>
        {
            finished = true;
            clearTimeout(navigationTimer);
        };
        const finish = () =>
        {
            if (finished) return;
            cleanup();
            global.location.href = url;
        };
        cancelNavigation = cleanup;
        const exitMs = Math.min(MAX_EXIT_MS, Math.max(DEFAULT_EXIT_MS, requestedExitMs));
        navigationTimer = setTimeout(finish, exitMs);
    }

    const TransitionManager = {
        init    : function ()
        {
            global.addEventListener('observatory:ready', reveal, {once: true});
            readyTimer = setTimeout(reveal, READY_TIMEOUT_MS);
        },
        navigate: navigate
    };

    global.TransitionManager = TransitionManager;

    global.addEventListener('pageshow', (event) =>
    {
        if (!event.persisted) return;
        if (cancelNavigation) cancelNavigation();
        cancelNavigation = null;
        clearTimeout(readyTimer);
        navigating = false;
        revealed = true;
        document.body.classList.remove('particle-transition-exit');
        document.body.classList.add('transition-ready');
        ensureCurtain().classList.remove('curtain-exit', 'curtain-intro', 'start-covered');
    });

    document.addEventListener('DOMContentLoaded', () =>
    {
        TransitionManager.init();
    });
})(window);
