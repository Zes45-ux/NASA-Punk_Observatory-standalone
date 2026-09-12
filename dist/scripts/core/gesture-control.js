/**
 * Camera hand-gesture controls for planet pages.
 * MediaPipe supplies 21 hand landmarks; this module translates them into the
 * existing interaction state so mouse, touch, trackpad, slider, and camera
 * controls always share the same zoom and rotation targets.
 */
(function initHandGestureModule(global)
{
    const INFERENCE_INTERVAL_MS = 66;
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

        function setStatus(message, mode)
        {
            if (status.textContent !== message)
            {
                status.textContent = message;
            }
            panel.dataset.state = mode || 'idle';
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
            }
            catch (error)
            {
                setStatus('TRACKING INTERRUPTED', 'error');
            }
            finally
            {
                processing = false;
            }
        }

        async function stop()
        {
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
            button.setAttribute('aria-pressed', 'false');
            button.querySelector('.gesture-control-value').textContent = 'OFFLINE';
            panel.hidden = true;
            setStatus('CAMERA STANDBY', 'idle');
        }

        async function start()
        {
            if (running || starting)
            {
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
                    locateFile: (file) => `./scripts/vendor/mediapipe-hands/${file}`
                });
                hands.setOptions({
                    selfieMode: true,
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.7,
                    minTrackingConfidence: 0.7
                });
                hands.onResults(handleResults);
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
                const denied = error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
                await stop();
                panel.hidden = false;
                setStatus(denied ? 'CAMERA PERMISSION DENIED' : 'CAMERA START FAILED', 'error');
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
