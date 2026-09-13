/**
 * Camera hand-gesture controls for planet pages.
 * MediaPipe supplies 21 hand landmarks; this module translates them into the
 * existing interaction state so mouse, touch, trackpad, slider, and camera
 * controls always share the same zoom and rotation targets.
 */
(function initHandGestureModule(global)
{
    const INFERENCE_INTERVAL_MS = 66;
    const AUTO_START_DELAY_MS = 250;
    const PINCH_DEAD_ZONE = 0.004;
    const PALM_DEAD_ZONE = 0.0025;
    const ROTATION_GAIN = 2.4;
    const ZOOM_GAIN = 150;
    const MIN_ROTATION_X = -1.2;
    const MAX_ROTATION_X = 1.2;
    const visualState = {
        presence: 0,
        energy: 0,
        tracking: false
    };
    let visualTargetPresence = 0;
    let visualTargetEnergy = 0;

    function distance(a, b)
    {
        if (!a || !b)
        {
            return 0;
        }
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = (a.z || 0) - (b.z || 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function calculatePinchRatio(landmarks)
    {
        if (!landmarks || landmarks.length < 21)
        {
            return null;
        }
        const palmWidth = distance(landmarks[5], landmarks[17]);
        if (!Number.isFinite(palmWidth) || palmWidth < 0.0001)
        {
            return null;
        }
        return distance(landmarks[4], landmarks[8]) / palmWidth;
    }

    function calculatePalmCenter(landmarks)
    {
        if (!landmarks || landmarks.length < 18)
        {
            return null;
        }
        const anchors = [landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]];
        return anchors.reduce((center, point) => ({
            x: center.x + point.x / anchors.length,
            y: center.y + point.y / anchors.length
        }), {x: 0, y: 0});
    }

    function createGestureDelta(previous, pinchRatio, palmCenter)
    {
        if (!previous || !Number.isFinite(pinchRatio) || !palmCenter)
        {
            return {zoom: 0, rotationX: 0, rotationY: 0};
        }

        const pinchDelta = pinchRatio - previous.pinchRatio;
        const palmDeltaX = palmCenter.x - previous.palmCenter.x;
        const palmDeltaY = palmCenter.y - previous.palmCenter.y;
        return {
            zoom: Math.abs(pinchDelta) >= PINCH_DEAD_ZONE ? pinchDelta * ZOOM_GAIN : 0,
            rotationX: Math.abs(palmDeltaY) >= PALM_DEAD_ZONE ? palmDeltaY * ROTATION_GAIN : 0,
            rotationY: Math.abs(palmDeltaX) >= PALM_DEAD_ZONE ? palmDeltaX * ROTATION_GAIN : 0
        };
    }

    function applyGestureTarget(state, anchor, pinchRatio, palmCenter)
    {
        const delta = createGestureDelta(anchor, pinchRatio, palmCenter);
        state.targetSliderVal = Math.min(100, Math.max(0, anchor.sliderValue + delta.zoom));
        state.targetRotationX = Math.min(MAX_ROTATION_X, Math.max(MIN_ROTATION_X,
            anchor.rotationX + delta.rotationX));
        state.targetRotationY = anchor.rotationY + delta.rotationY;
        return delta;
    }

    function setVisualTracking(tracking, zoomValue)
    {
        visualState.tracking = Boolean(tracking);
        visualTargetPresence = visualState.tracking ? 1 : 0;
        if (visualState.tracking && Number.isFinite(zoomValue))
        {
            visualTargetEnergy = Math.min(1, Math.max(0, zoomValue / 100));
        }
        else
        {
            visualTargetEnergy = 0;
        }
    }

    function updateVisualState(zoomValue)
    {
        if (visualState.tracking && Number.isFinite(zoomValue))
        {
            visualTargetEnergy = Math.min(1, Math.max(0, zoomValue / 100));
        }
        // The planet render loop already runs continuously. Easing here keeps
        // the model's lower inference cadence from appearing as visible steps.
        visualState.presence += (visualTargetPresence - visualState.presence) * 0.12;
        visualState.energy += (visualTargetEnergy - visualState.energy) * 0.1;
        if (visualState.presence < 0.001 && visualTargetPresence === 0)
        {
            visualState.presence = 0;
        }
        if (visualState.energy < 0.001 && visualTargetEnergy === 0)
        {
            visualState.energy = 0;
        }
        return visualState;
    }

    function createController(options)
    {
        const state = options.state;
        const button = global.document && global.document.getElementById('gesture-control-toggle');
        const status = global.document && global.document.getElementById('gesture-control-status');
        const panel = global.document && global.document.getElementById('gesture-camera-panel');
        const video = global.document && global.document.getElementById('gesture-camera-feed');
        const recovery = global.document && global.document.getElementById('gesture-control-recovery');
        const detectionValue = global.document && global.document.getElementById('gesture-detection-value');
        if (!button || !status || !panel || !video || !state)
        {
            return null;
        }

        let stream = null;
        let hands = null;
        let running = false;
        let starting = false;
        let requestVersion = 0;
        let processing = false;
        let frameHandle = null;
        let frameMode = '';
        let lastInferenceAt = 0;
        let gestureAnchor = null;
        let smoothedPinch = null;
        let frameErrorReported = false;
        let autoStartHandle = null;

        function getCameraEnvironment()
        {
            let embedded = false;
            try
            {
                embedded = Boolean(global.top && global.self && global.top !== global.self);
            }
            catch (error)
            {
                embedded = true;
            }
            const policy = global.document
                && (global.document.permissionsPolicy || global.document.featurePolicy);
            let policyAllowsCamera = true;
            if (policy && typeof policy.allowsFeature === 'function')
            {
                try
                {
                    policyAllowsCamera = policy.allowsFeature('camera');
                }
                catch (error) {}
            }
            return {
                embedded,
                policyAllowsCamera,
                secure: global.isSecureContext !== false
            };
        }

        function showRecovery(visible)
        {
            if (!recovery)
            {
                return;
            }
            recovery.hidden = !visible;
            if (visible && global.location)
            {
                recovery.href = global.location.href;
            }
        }

        function getModelAssetUrl(file)
        {
            const base = global.document && global.document.baseURI;
            if (base && typeof global.URL === 'function')
            {
                return new global.URL(`./scripts/vendor/mediapipe-hands/${file}`, base).href;
            }
            return `./scripts/vendor/mediapipe-hands/${file}`;
        }

        function getCameraErrorMessage(error, environment)
        {
            const name = error && error.name;
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
            {
                return environment.embedded
                    ? 'EMBEDDED PREVIEW BLOCKS CAMERA'
                    : 'CAMERA BLOCKED // ALLOW & RETRY';
            }
            if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
            {
                return 'NO CAMERA FOUND';
            }
            if (name === 'NotReadableError' || name === 'TrackStartError')
            {
                return 'CAMERA BUSY // CLOSE OTHER APPS';
            }
            return 'CAMERA OR HAND MODEL FAILED // RETRY';
        }

        function setStatus(message, mode)
        {
            if (status.textContent !== message)
            {
                status.textContent = message;
            }
            const nextMode = mode || 'idle';
            panel.dataset.state = nextMode;
            if (detectionValue)
            {
                detectionValue.textContent = {
                    tracking: 'HAND LOCK',
                    searching: 'NO HAND',
                    loading: 'STARTING',
                    error: 'ERROR',
                    idle: 'OFFLINE'
                }[nextMode] || 'STANDBY';
            }
        }

        function clearAutoStart()
        {
            if (autoStartHandle !== null && typeof global.clearTimeout === 'function')
            {
                global.clearTimeout(autoStartHandle);
            }
            autoStartHandle = null;
        }

        function scheduleAutoStart()
        {
            if (options.autoStart === false || typeof global.setTimeout !== 'function')
            {
                return;
            }
            panel.hidden = false;
            setStatus('AUTO CAMERA INITIALIZING', 'loading');
            autoStartHandle = global.setTimeout(() =>
            {
                autoStartHandle = null;
                return start();
            }, AUTO_START_DELAY_MS);
        }

        function resetTracking()
        {
            gestureAnchor = null;
            smoothedPinch = null;
        }

        function handleResults(results)
        {
            const landmarks = results && results.multiHandLandmarks && results.multiHandLandmarks[0];
            const pinchRatio = calculatePinchRatio(landmarks);
            const palmCenter = calculatePalmCenter(landmarks);
            if (!Number.isFinite(pinchRatio) || !palmCenter)
            {
                resetTracking();
                setVisualTracking(false, 0);
                setStatus('SEARCHING FOR HAND', 'searching');
                return;
            }

            smoothedPinch = smoothedPinch === null
                ? pinchRatio
                : smoothedPinch + (pinchRatio - smoothedPinch) * 0.42;
            if (!gestureAnchor)
            {
                gestureAnchor = {
                    pinchRatio: smoothedPinch,
                    palmCenter,
                    sliderValue: state.targetSliderVal,
                    rotationX: state.targetRotationX,
                    rotationY: state.targetRotationY
                };
            }

            // The referenced demo maps its normalized fingertip distance to an
            // absolute target: `targetScale = 0.15 + normDist * 2.35`.
            // Source: https://www.yjln.com/643.html
            // Keep that drift-free absolute-target design, but calibrate it to
            // the user's current view and normalize distance by palm width.
            applyGestureTarget(state, gestureAnchor, smoothedPinch, palmCenter);
            setVisualTracking(true, state.targetSliderVal);
            if (state.slider)
            {
                state.slider.value = state.targetSliderVal;
            }

            const zoomFactor = 0.5 * Math.pow(4, state.targetSliderVal / 100);
            setStatus(`HAND LOCK // PINCH ${Math.round(zoomFactor * 100)}%`, 'tracking');
        }

        function cancelScheduledFrame()
        {
            if (frameHandle === null)
            {
                return;
            }
            if (frameMode === 'video' && typeof video.cancelVideoFrameCallback === 'function')
            {
                video.cancelVideoFrameCallback(frameHandle);
            }
            else if (typeof global.cancelAnimationFrame === 'function')
            {
                global.cancelAnimationFrame(frameHandle);
            }
            frameHandle = null;
        }

        function scheduleFrame()
        {
            if (!running || frameHandle !== null)
            {
                return;
            }
            if (typeof video.requestVideoFrameCallback === 'function')
            {
                frameMode = 'video';
                frameHandle = video.requestVideoFrameCallback(processFrame);
            }
            else if (typeof global.requestAnimationFrame === 'function')
            {
                frameMode = 'animation';
                frameHandle = global.requestAnimationFrame(processFrame);
            }
        }

        async function processFrame(timestamp)
        {
            frameHandle = null;
            scheduleFrame();
            const now = Number.isFinite(timestamp) ? timestamp : Date.now();
            if (!running || processing || (global.document && global.document.hidden)
                || now - lastInferenceAt < INFERENCE_INTERVAL_MS)
            {
                return;
            }
            processing = true;
            lastInferenceAt = now;
            try
            {
                await hands.send({image: video});
                frameErrorReported = false;
            }
            catch (error)
            {
                setStatus('TRACKING INTERRUPTED // TAP TO RESET', 'error');
                if (!frameErrorReported && global.console && typeof global.console.error === 'function')
                {
                    global.console.error('[HAND CTRL] inference failed', error);
                    frameErrorReported = true;
                }
            }
            finally
            {
                processing = false;
            }
        }

        async function stop()
        {
            clearAutoStart();
            requestVersion += 1;
            starting = false;
            running = false;
            setVisualTracking(false, 0);
            cancelScheduledFrame();
            resetTracking();
            if (stream)
            {
                for (const track of stream.getTracks())
                {
                    track.stop();
                }
            }
            stream = null;
            video.srcObject = null;
            if (hands && typeof hands.close === 'function')
            {
                try
                {
                    await hands.close();
                }
                catch (error) {}
            }
            hands = null;
            frameErrorReported = false;
            button.setAttribute('aria-pressed', 'false');
            button.querySelector('.gesture-control-value').textContent = 'OFFLINE';
            panel.hidden = true;
            showRecovery(false);
            setStatus('CAMERA STANDBY', 'idle');
        }

        async function start()
        {
            clearAutoStart();
            if (running || starting)
            {
                return;
            }
            const environment = getCameraEnvironment();
            if (!environment.secure)
            {
                setStatus('HTTPS REQUIRED FOR CAMERA', 'error');
                panel.hidden = false;
                return;
            }
            if (!environment.policyAllowsCamera)
            {
                setStatus('OPEN DIRECT SITE FOR CAMERA', 'error');
                panel.hidden = false;
                showRecovery(true);
                return;
            }
            if (!global.navigator || !global.navigator.mediaDevices
                || typeof global.navigator.mediaDevices.getUserMedia !== 'function')
            {
                setStatus('CAMERA API UNAVAILABLE', 'error');
                panel.hidden = false;
                return;
            }
            if (typeof global.Hands !== 'function')
            {
                setStatus('HAND MODEL UNAVAILABLE', 'error');
                panel.hidden = false;
                return;
            }

            panel.hidden = false;
            showRecovery(false);
            setStatus('REQUESTING CAMERA', 'loading');
            button.querySelector('.gesture-control-value').textContent = 'LINKING';
            starting = true;
            const currentRequest = ++requestVersion;
            try
            {
                const acquiredStream = await global.navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        facingMode: 'user',
                        width: {ideal: 640},
                        height: {ideal: 480},
                        frameRate: {ideal: 24, max: 30}
                    }
                });
                if (currentRequest !== requestVersion)
                {
                    for (const track of acquiredStream.getTracks())
                    {
                        track.stop();
                    }
                    return;
                }
                stream = acquiredStream;
                video.srcObject = stream;
                await video.play();
                if (currentRequest !== requestVersion)
                {
                    return;
                }

                hands = new global.Hands({
                    locateFile: getModelAssetUrl
                });
                hands.setOptions({
                    selfieMode: true,
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.55,
                    minTrackingConfidence: 0.5
                });
                hands.onResults(handleResults);
                setStatus('LOADING HAND MODEL', 'loading');
                if (typeof hands.initialize === 'function')
                {
                    await hands.initialize();
                }
                if (currentRequest !== requestVersion)
                {
                    return;
                }
                starting = false;
                running = true;
                button.setAttribute('aria-pressed', 'true');
                button.querySelector('.gesture-control-value').textContent = 'ONLINE';
                setStatus('SHOW ONE HAND // PINCH TO ZOOM', 'searching');
                scheduleFrame();
            }
            catch (error)
            {
                if (currentRequest !== requestVersion)
                {
                    return;
                }
                const message = getCameraErrorMessage(error, environment);
                if (global.console && typeof global.console.error === 'function')
                {
                    global.console.error('[HAND CTRL] startup failed', error);
                }
                await stop();
                panel.hidden = false;
                showRecovery(environment.embedded);
                setStatus(message, 'error');
            }
        }

        async function toggle()
        {
            if (running || stream || starting)
            {
                await stop();
            }
            else
            {
                await start();
            }
        }

        button.addEventListener('click', toggle);
        global.addEventListener('pagehide', stop);
        scheduleAutoStart();
        return {start, stop, toggle, handleResults, isRunning: () => running};
    }

    let activeController = null;

    function init(options)
    {
        if (activeController)
        {
            activeController.stop();
        }
        activeController = createController(options || {});
        return activeController;
    }

    global.HandGestureControl = {
        init,
        calculatePinchRatio,
        calculatePalmCenter,
        createGestureDelta,
        applyGestureTarget,
        setVisualTracking,
        updateVisualState,
        visualState
    };
})(window);
