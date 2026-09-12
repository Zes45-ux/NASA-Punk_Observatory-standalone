const InteractionState = {
    isDragging           : false,
    previousMousePosition: {x: 0, y: 0},
    targetRotationX      : 0,
    targetRotationY      : 0,
    initialZ             : 25,
    currentSliderVal     : 50,
    targetSliderVal      : 50,
    slider               : null,
    textDisplay          : null,
    lastZoomText         : '',
    focus                : {
        active         : false,
        preFocusSlider : 50,
        downPosition   : null,
        hintShown      : false
    }
};

// 将目标相机距离换算为缩放档位（updateInteraction 中 factor = 0.5 * 4^(val/100) 的反函数）
function computeFocusSliderValue(detailZoomFactor)
{
    return 100 * Math.log(detailZoomFactor / 0.5) / Math.log(4);
}

// 区分"点击"与"拖拽"：位移小于阈值视为点击
function isClickGesture(startPosition, endPosition, threshold = 6)
{
    if (!startPosition || !endPosition)
    {
        return false;
    }
    const dx = endPosition.x - startPosition.x;
    const dy = endPosition.y - startPosition.y;
    return dx * dx + dy * dy <= threshold * threshold;
}

const canvasBoundsCaches = new WeakMap();

function getCanvasBoundsManager(canvas)
{
    if (!canvas || typeof canvas.getBoundingClientRect !== 'function')
    {
        return {
            get: () => ({left: 0, top: 0, width: 0, height: 0}),
            invalidate: () => {}
        };
    }

    let manager = canvasBoundsCaches.get(canvas);
    if (!manager)
    {
        let cachedRect = null;

        function invalidate()
        {
            cachedRect = null;
        }

        function get()
        {
            if (!cachedRect)
            {
                const r = canvas.getBoundingClientRect() || {};
                cachedRect = {
                    left: r.left || 0,
                    top: r.top || 0,
                    width: r.width || 1,
                    height: r.height || 1
                };
            }
            return cachedRect;
        }

        if (typeof canvas.addEventListener === 'function')
        {
            canvas.addEventListener('pointerenter', invalidate, {passive: true});
            canvas.addEventListener('pointerdown', invalidate, {passive: true});
        }

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
        {
            window.addEventListener('resize', invalidate, {passive: true});
            window.addEventListener('scroll', invalidate, {passive: true});
            window.addEventListener('orientationchange', invalidate, {passive: true});
        }

        if (typeof ResizeObserver !== 'undefined')
        {
            try
            {
                const ro = new ResizeObserver(invalidate);
                ro.observe(canvas);
            }
            catch (_) {}
        }

        manager = {get, invalidate};
        canvasBoundsCaches.set(canvas, manager);
    }
    return manager;
}

function initPlanetFocus(targetGroup, camera, focusRadius, options = {})
{
    if (typeof THREE === 'undefined' || typeof document === 'undefined')
    {
        return null;
    }

    const canvas = document.querySelector('#canvas-container canvas') || document.querySelector('canvas');
    if (!canvas)
    {
        return null;
    }

    const boundsManager = getCanvasBoundsManager(canvas);

    const detailFactor = options.detailFactor || 0.45;
    // detailFactor 是"聚焦距离 = initialZ 的比例"，需换算为缩放因子（距离的倒数）
    const detailSlider = computeFocusSliderValue(1 / detailFactor);

    // 透明命中球：不写出任何像素，但可被射线拾取
    const hitMaterial = new THREE.MeshBasicMaterial({colorWrite: false, depthWrite: false});
    const hitSphere   = new THREE.Mesh(new THREE.SphereGeometry(focusRadius, 16, 16), hitMaterial);
    targetGroup.add(hitSphere);

    const raycaster = new THREE.Raycaster();
    const ndc       = new THREE.Vector2();

    function pickPlanet(clientX, clientY)
    {
        const rect = boundsManager.get();
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        return raycaster.intersectObject(hitSphere, false).length > 0;
    }

    function setFocused(next)
    {
        if (next === InteractionState.focus.active)
        {
            return;
        }
        InteractionState.focus.active = next;
        const nextSlider = next ? detailSlider : InteractionState.focus.preFocusSlider;
        if (next)
        {
            InteractionState.focus.preFocusSlider = InteractionState.targetSliderVal;
            showFocusHint();
        }
        InteractionState.targetSliderVal = nextSlider;
        if (InteractionState.slider)
        {
            InteractionState.slider.value = Math.min(nextSlider, 100);
        }
    }

    function showFocusHint()
    {
        if (InteractionState.focus.hintShown)
        {
            return;
        }
        InteractionState.focus.hintShown = true;
        const container   = document.getElementById('canvas-container');
        if (!container || typeof container.appendChild !== 'function')
        {
            return;
        }
        const hint        = document.createElement('div');
        hint.textContent  = 'FOCUS MODE // CLICK BODY OR PRESS ESC TO RETURN';
        hint.style.cssText = 'position:absolute;left:50%;bottom:8%;transform:translateX(-50%);'
            + 'font-family:\'Roboto Mono\',monospace;font-size:11px;letter-spacing:2px;'
            + 'color:rgba(231,227,218,0.75);background:rgba(16,24,33,0.85);'
            + 'border:1px solid rgba(91,120,156,0.4);padding:6px 14px;'
            + 'pointer-events:none;transition:opacity 0.6s;z-index:5;';
        container.appendChild(hint);
        setTimeout(() => { hint.style.opacity = '0'; }, 3200);
        setTimeout(() => { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 4000);
    }

    // 点击聚焦：Pointer Events 同时覆盖鼠标与触屏；多指（捏合缩放）不算点击
    canvas.addEventListener('pointerdown', (e) =>
    {
        if (!e.isPrimary)
        {
            InteractionState.focus.downPosition = null;
            return;
        }
        InteractionState.focus.downPosition = {x: e.clientX, y: e.clientY};
    });

    canvas.addEventListener('pointerup', (e) =>
    {
        const start = InteractionState.focus.downPosition;
        InteractionState.focus.downPosition = null;
        if (!e.isPrimary || !start || !isClickGesture(start, {x: e.clientX, y: e.clientY}))
        {
            return;
        }
        const hitPlanet = pickPlanet(e.clientX, e.clientY);
        if (hitPlanet)
        {
            setFocused(!InteractionState.focus.active);
        }
        else if (InteractionState.focus.active)
        {
            setFocused(false);
        }
    });

    canvas.addEventListener('pointermove', (e) =>
    {
        if (e.pointerType !== 'mouse' || InteractionState.isDragging)
        {
            return;
        }
        const nextCursor = pickPlanet(e.clientX, e.clientY) ? 'pointer' : '';
        if (canvas.style.cursor !== nextCursor)
        {
            canvas.style.cursor = nextCursor;
        }
    });

    canvas.addEventListener('pointerleave', () =>
    {
        if (canvas.style.cursor !== '')
        {
            canvas.style.cursor = '';
        }
    });

    document.addEventListener('keydown', (e) =>
    {
        if (e.key === 'Escape' && InteractionState.focus.active)
        {
            setFocused(false);
        }
    });

    return {setFocused, pickPlanet, detailSlider};
}

function initInteraction(targetGroup, initialZoomZ, sliderId = 'cam-zoom-slider', textId = 'zoom-text-display')
{
    InteractionState.initialZ    = initialZoomZ;
    InteractionState.slider      = document.getElementById(sliderId);
    InteractionState.textDisplay = document.getElementById(textId);
    InteractionState.lastZoomText = '';

    const canvas = document.querySelector('#canvas-container canvas') || document.querySelector('canvas');
    const boundsManager = getCanvasBoundsManager(canvas);
    const activePointers = new Map();
    let pinchGesture = null;
    let trackpadGesture = null;

    function currentZoomFactor()
    {
        return 0.5 * Math.pow(4, InteractionState.targetSliderVal / 100);
    }

    function setTargetZoomFactor(factor)
    {
        if (!Number.isFinite(factor) || factor <= 0)
        {
            return;
        }
        const value = Math.min(100, Math.max(0, computeFocusSliderValue(factor)));
        InteractionState.targetSliderVal = value;
        if (InteractionState.slider)
        {
            InteractionState.slider.value = value;
        }
    }

    function normalizeWheelDelta(e)
    {
        const deltaY = Number(e.deltaY);
        if (!Number.isFinite(deltaY))
        {
            return 0;
        }
        // Trackpads normally report pixel deltas. Normalize the other modes so
        // ctrl+wheel remains usable as a fallback for a mouse or test device.
        if (e.deltaMode === 1)
        {
            return deltaY * 16;
        }
        if (e.deltaMode === 2)
        {
            return deltaY * 800;
        }
        return deltaY;
    }

    function handleTrackpadWheel(e)
    {
        // macOS trackpad pinch is exposed as a ctrl+wheel event by Chromium
        // and Firefox. Intercept it so the browser does not zoom the page.
        if (!e.ctrlKey)
        {
            return;
        }
        if (e.preventDefault)
        {
            e.preventDefault();
        }
        const delta = normalizeWheelDelta(e);
        if (!delta)
        {
            return;
        }
        // A negative delta means fingers spreading apart: zoom toward the body.
        const factor = currentZoomFactor() * Math.exp(-delta * 0.0025);
        setTargetZoomFactor(factor);
    }

    function handleGestureStart(e)
    {
        if (e.preventDefault)
        {
            e.preventDefault();
        }
        trackpadGesture = {baseFactor: currentZoomFactor()};
    }

    function handleGestureChange(e)
    {
        if (e.preventDefault)
        {
            e.preventDefault();
        }
        if (!trackpadGesture || !Number.isFinite(Number(e.scale)) || Number(e.scale) <= 0)
        {
            return;
        }
        // Safari exposes the pinch as a cumulative gesture scale instead of a
        // ctrl+wheel stream. Use the same zoom limits and slider synchronization.
        setTargetZoomFactor(trackpadGesture.baseFactor * Number(e.scale));
    }

    function handleGestureEnd(e)
    {
        if (e.preventDefault)
        {
            e.preventDefault();
        }
        trackpadGesture = null;
    }

    function canvasPoint(e)
    {
        const rect = boundsManager.get();
        return {x: e.clientX - rect.left, y: e.clientY - rect.top};
    }

    function pinchDistance()
    {
        const points = Array.from(activePointers.values());
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        return Math.max(1, Math.sqrt(dx * dx + dy * dy));
    }

    if (canvas)
    {
        // Pointer Events 统一鼠标与触屏：单指拖拽旋转，双指捏合缩放
        canvas.addEventListener('pointerdown', (e) =>
        {
            if (canvas.setPointerCapture)
            {
                try
                {
                    canvas.setPointerCapture(e.pointerId);
                }
                catch (error)
                {
                    // 指针可能已经释放，忽略即可
                }
            }
            const point = canvasPoint(e);
            activePointers.set(e.pointerId, point);

            if (activePointers.size === 1)
            {
                InteractionState.isDragging            = true;
                InteractionState.previousMousePosition = point;
            }
            else if (activePointers.size === 2)
            {
                // 双指进入捏合缩放，暂停单指旋转
                InteractionState.isDragging = false;
                const factor = 0.5 * Math.pow(4, InteractionState.targetSliderVal / 100);
                pinchGesture = {baseDistance: pinchDistance(), baseFactor: factor};
            }
        });

        canvas.addEventListener('pointermove', (e) =>
        {
            if (!activePointers.has(e.pointerId))
            {
                return;
            }
            const point = canvasPoint(e);
            activePointers.set(e.pointerId, point);

            if (activePointers.size === 1 && InteractionState.isDragging)
            {
                InteractionState.targetRotationY += (point.x - InteractionState.previousMousePosition.x) * 0.005;
                InteractionState.targetRotationX += (point.y - InteractionState.previousMousePosition.y) * 0.005;
                InteractionState.previousMousePosition = point;
            }
            else if (activePointers.size === 2 && pinchGesture)
            {
                // 捏合：距离比换算为缩放因子，再反解到滑杆值域
                const factor = pinchGesture.baseFactor * (pinchDistance() / pinchGesture.baseDistance);
                const value  = Math.min(100, Math.max(0, computeFocusSliderValue(factor)));
                InteractionState.targetSliderVal = value;
                if (InteractionState.slider)
                {
                    InteractionState.slider.value = value;
                }
            }
        });

        const releasePointer = (e) =>
        {
            activePointers.delete(e.pointerId);
            pinchGesture = null;
            if (activePointers.size === 0)
            {
                InteractionState.isDragging = false;
            }
            else if (activePointers.size === 1)
            {
                // 从捏合回到单指：以剩余指位重新锚定旋转起点
                InteractionState.isDragging            = true;
                InteractionState.previousMousePosition = Array.from(activePointers.values())[0];
            }
        };

        canvas.addEventListener('pointerup', releasePointer);
        canvas.addEventListener('pointercancel', releasePointer);

        // Mac trackpads do not expose a pinch as two Pointer Events. Chromium
        // and Firefox use ctrl+wheel, while Safari uses gesture* events.
        canvas.addEventListener('wheel', handleTrackpadWheel, {passive: false});
        canvas.addEventListener('gesturestart', handleGestureStart, {passive: false});
        canvas.addEventListener('gesturechange', handleGestureChange, {passive: false});
        canvas.addEventListener('gestureend', handleGestureEnd, {passive: false});
    }

    if (InteractionState.slider)
    {
        initPrecisionSlider(InteractionState.slider, (val) =>
        {
            InteractionState.targetSliderVal = val;
        });
    }

    if (typeof window !== 'undefined' && window.HandGestureControl
        && typeof window.HandGestureControl.init === 'function')
    {
        window.HandGestureControl.init({state: InteractionState});
    }
}

function updateInteraction(group, camera)
{
    if (group)
    {
        group.rotation.y += (InteractionState.targetRotationY - group.rotation.y) * 0.1;
        group.rotation.x += (InteractionState.targetRotationX - group.rotation.x) * 0.1;
    }
    InteractionState.currentSliderVal += (InteractionState.targetSliderVal - InteractionState.currentSliderVal) * 0.1;
    const factor = 0.5 * Math.pow(4, InteractionState.currentSliderVal / 100);
    const newZ   = InteractionState.initialZ / factor;

    if (camera)
    {
        camera.position.z = newZ;
    }
    if (InteractionState.textDisplay)
    {
        const zoomText = Math.round(factor * 100) + '%';
        if (zoomText !== InteractionState.lastZoomText)
        {
            // textContent avoids the synchronous layout work caused by innerText.
            InteractionState.textDisplay.textContent = zoomText;
            InteractionState.lastZoomText = zoomText;
        }
    }

    if (typeof window !== 'undefined' && window.HandGestureControl
        && typeof window.HandGestureControl.updateVisualState === 'function')
    {
        const gestureVisualState = window.HandGestureControl.updateVisualState(InteractionState.currentSliderVal);
        if (typeof window.updateGestureParticleResponses === 'function')
        {
            window.updateGestureParticleResponses(gestureVisualState);
        }
    }
    return newZ;
}

function initPrecisionSlider(sliderElement, onUpdate)
{
    let isDragging = false;
    // 原生 range 的键盘和触屏操作统一通过 input 同步。
    sliderElement.addEventListener('input', () =>
    {
        if (onUpdate) onUpdate(Number(sliderElement.value));
    });
    sliderElement.addEventListener('mousedown', (e) =>
    {
        // 鼠标使用精细坐标映射，避免浏览器再次执行默认拖动。
        e.preventDefault();
        sliderElement.focus();
        isDragging                 = true;
        document.body.style.cursor = 'grabbing';
        sliderElement.classList.add('active');
        handleDrag(e);
        window.addEventListener('mousemove', handleGlobalMove);
        window.addEventListener('mouseup', handleGlobalUp);
    });

    function handleGlobalMove(e)
    {
        if (isDragging)
        {
            e.preventDefault();
            handleDrag(e);
        }
    }

    function handleGlobalUp()
    {
        if (isDragging)
        {
            isDragging                 = false;
            document.body.style.cursor = '';
            sliderElement.classList.remove('active');
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
        }
    }

    function handleDrag(e)
    {
        const rect       = sliderElement.getBoundingClientRect();
        const isVertical = sliderElement.classList.contains('vertical');
        let percent;
        if (isVertical)
        {
            const relativeY = e.clientY - rect.top;
            percent         = 1 - (relativeY / rect.height);
        }
        else
        {
            const relativeX = e.clientX - rect.left;
            percent         = relativeX / rect.width;
        }
        percent = Math.max(0, Math.min(1, percent));

        const min    = parseFloat(sliderElement.min) || 0;
        const max    = parseFloat(sliderElement.max) || 100;
        const step   = parseFloat(sliderElement.step) || 1;
        let newValue = min + percent * (max - min);
        if (step > 0)
        {
            newValue = Math.round(newValue / step) * step;
        }

        sliderElement.value = newValue;
        if (onUpdate)
        {
            onUpdate(newValue);
        }
    }
}
