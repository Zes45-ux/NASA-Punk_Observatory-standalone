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
        const rect = canvas.getBoundingClientRect();
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

    document.addEventListener('mousedown', (e) =>
    {
        if (e.target === canvas)
        {
            InteractionState.focus.downPosition = {x: e.clientX, y: e.clientY};
        }
    });

    document.addEventListener('mouseup', (e) =>
    {
        const start = InteractionState.focus.downPosition;
        InteractionState.focus.downPosition = null;
        if (!start || !isClickGesture(start, {x: e.clientX, y: e.clientY}) || e.target !== canvas)
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

    document.addEventListener('mousemove', (e) =>
    {
        if (InteractionState.isDragging)
        {
            return;
        }
        if (e.target !== canvas)
        {
            canvas.style.cursor = '';
            return;
        }
        canvas.style.cursor = pickPlanet(e.clientX, e.clientY) ? 'pointer' : '';
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

    document.addEventListener('mousedown', (e) =>
    {
        if (e.target.tagName === 'CANVAS')
        {
            InteractionState.isDragging            = true;
            InteractionState.previousMousePosition = {x: e.offsetX, y: e.offsetY};
        }
    });

    document.addEventListener('mousemove', (e) =>
    {
        if (InteractionState.isDragging)
        {
            const deltaMove                        = {
                x: e.offsetX - InteractionState.previousMousePosition.x,
                y: e.offsetY - InteractionState.previousMousePosition.y
            };
            InteractionState.targetRotationY += deltaMove.x * 0.005;
            InteractionState.targetRotationX += deltaMove.y * 0.005;
            InteractionState.previousMousePosition = {x: e.offsetX, y: e.offsetY};
        }
    });

    document.addEventListener('mouseup', () =>
    {
        InteractionState.isDragging = false;
    });

    if (InteractionState.slider)
    {
        initPrecisionSlider(InteractionState.slider, (val) =>
        {
            InteractionState.targetSliderVal = val;
        });
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
        InteractionState.textDisplay.innerText = Math.round(factor * 100) + '%';
    }
    return newZ;
}

function initPrecisionSlider(sliderElement, onUpdate)
{
    let isDragging = false;
    sliderElement.addEventListener('mousedown', (e) =>
    {
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
