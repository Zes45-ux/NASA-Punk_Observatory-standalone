/**
 * Paint the outgoing particle silhouette before Three.js is available.
 * This tiny cached bootstrap prevents a blank document frame during navigation.
 */
(function bootstrapParticleTransition(global)
{
    const STORAGE_KEY = 'observatory-particle-bridge-v3';
    const MAX_AGE_MS = 6000;
    let state;

    try
    {
        state = JSON.parse(global.sessionStorage.getItem(STORAGE_KEY));
    }
    catch (error)
    {
        return;
    }

    const target = global.location.pathname.split('/').pop();
    const age = state ? Date.now() - state.startedAt : Infinity;
    if (!state || state.version !== 3 || !Array.isArray(state.particles)
        || age < 0 || age >= MAX_AGE_MS || (target && target !== state.target)
        || (typeof global.matchMedia === 'function'
            && global.matchMedia('(prefers-reduced-motion: reduce)').matches))
    {
        return;
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.id = 'particle-transition-bootstrap';
    canvas.className = 'particle-transition-overlay particle-transition-bootstrap';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    document.body.classList.add('particle-transition-continuation', 'particle-transition-waiting');

    let width = 1;
    let height = 1;
    let pixelRatio = 1;
    let frame = null;
    let released = false;
    const startedAt = global.performance ? global.performance.now() : Date.now();

    function resize()
    {
        width = Math.max(1, global.innerWidth || state.width || 1);
        height = Math.max(1, global.innerHeight || state.height || 1);
        pixelRatio = Math.min(global.devicePixelRatio || 1, 1.25);
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }

    function smoother(value)
    {
        return value * value * value * (value * (value * 6 - 15) + 10);
    }

    function render(timestamp)
    {
        if (released) return;
        const elapsed = Math.max(0, timestamp - startedAt);
        // Keep the old planet fully legible until the WebGL bridge has rendered.
        const progress = Math.min(elapsed / Math.max(1, state.duration || 2400), 0.7);
        const eased = smoother(progress);
        const travel = elapsed / 1000 * (0.08 + eased * 0.16);
        const scaleX = width / Math.max(1, state.width);
        const scaleY = height / Math.max(1, state.height);

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = 'lighter';
        state.particles.forEach((particle, index) =>
        {
            const palette = state.palette[particle[5]] || [255, 255, 255];
            const phase = particle[6] || 0;
            const wave = 3.5 * eased;
            const x = (particle[0] + particle[2] * travel) * scaleX
                + Math.sin(phase + elapsed * 0.0042) * wave;
            const y = (particle[1] + particle[3] * travel) * scaleY
                + Math.cos(phase * 1.37 + elapsed * 0.0034) * wave;
            const radius = Math.max(0.65, particle[4] * 0.58);
            context.globalAlpha = 0.52 + (index % 5) * 0.07;
            context.fillStyle = `rgb(${palette[0]}, ${palette[1]}, ${palette[2]})`;
            context.beginPath();
            context.arc(x, y, radius, 0, Math.PI * 2);
            context.fill();
        });
        frame = global.requestAnimationFrame(render);
    }

    function release()
    {
        if (released) return;
        released = true;
        if (frame !== null) global.cancelAnimationFrame(frame);
        global.removeEventListener('resize', resize);
        canvas.classList.add('is-released');
        global.setTimeout(() => canvas.remove(), 240);
    }

    resize();
    global.addEventListener('resize', resize, {passive: true});
    frame = global.requestAnimationFrame(render);
    global.__observatoryParticleBootstrap = {canvas, release};
})(window);
