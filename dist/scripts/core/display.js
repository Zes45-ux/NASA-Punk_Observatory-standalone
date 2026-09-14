/**
 * Display area helpers.
 * Background remains viewport-wide; foreground content should measure itself
 * from the display area that remains after the optional serif is reserved.
 */
(function initDisplayArea(global)
{
    function getSize(element)
    {
        const target = element || document.body;
        const rect = target?.getBoundingClientRect?.() || {};
        return {
            width : Math.max(1, Math.round(rect.width || global.innerWidth || 1)),
            height: Math.max(1, Math.round(rect.height || global.innerHeight || 1))
        };
    }

    global.DisplayArea = {
        getRoot: () => document.body,
        getSize
    };
})(window);
