/**
 * Shared topography background renderer for system/planet pages.
 * Requires: SimplexNoise loaded globally.
 */
(function initTopoModule(global)
{
    function createTopoBackground(options)
    {
        const config = Object.assign({
            canvasId   : 'topo-canvas',
            noiseOffset: 100,
            overlayFill: null,
            gridSize   : 5,
            noiseScale : 0.002,
            levels     : 6,
            lineColor  : '#3b4e6b',
            lineWidth  : 1.8,
            starCount  : 150,
            gridAlpha  : 0.05
        }, options || {});

        const canvas = document.getElementById(config.canvasId);
        if (!canvas)
        {
            return {
                resize: function ()
                {
                }
            };
        }
        const ctx                = canvas.getContext('2d');
        const simplex            = new SimplexNoise();
        // Ensure each page load starts with a fresh noise phase.
        const runtimeNoiseOffset = config.noiseOffset + Math.random() * 10000;
        let stars                = [];

        function initStars()
        {
            stars = [];
            for (let i = 0; i < config.starCount; i++)
            {
                stars.push({
                    x      : Math.random() * canvas.width,
                    y      : Math.random() * canvas.height,
                    size   : Math.random() * 1.5 + 0.3,
                    opacity: Math.random() * 0.6 + 0.1
                });
            }
        }

        function getIsoT(val1, val2, isoValue)
        {
            if (Math.abs(val2 - val1) < 0.00001)
            {
                return 0.5;
            }
            return (isoValue - val1) / (val2 - val1);
        }

        function draw()
        {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (config.overlayFill)
            {
                ctx.fillStyle = config.overlayFill;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            ctx.beginPath();
            ctx.strokeStyle = config.lineColor;
            ctx.lineWidth   = 1;
            ctx.globalAlpha = config.gridAlpha;
            const gridStep  = 120;
            for (let x = 0; x <= canvas.width; x += gridStep)
            {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
            }
            for (let y = 0; y <= canvas.height; y += gridStep)
            {
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
            }
            ctx.stroke();

            ctx.globalAlpha = config.gridAlpha * 2.5;
            const crossSize = 3;
            ctx.beginPath();
            for (let x = 0; x <= canvas.width; x += gridStep)
            {
                for (let y = 0; y <= canvas.height; y += gridStep)
                {
                    ctx.moveTo(x - crossSize, y);
                    ctx.lineTo(x + crossSize, y);
                    ctx.moveTo(x, y - crossSize);
                    ctx.lineTo(x, y + crossSize);
                }
            }
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            stars.forEach(function (star)
            {
                ctx.globalAlpha = star.opacity;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = config.lineColor;
            ctx.lineWidth   = config.lineWidth;
            ctx.lineCap     = 'round';
            ctx.lineJoin    = 'round';

            const cols      = Math.ceil(canvas.width / config.gridSize) + 1;
            const rows      = Math.ceil(canvas.height / config.gridSize) + 1;
            const rowStride = rows + 1;
            const field     = new Float32Array((cols + 1) * rowStride);

            for (let i = 0; i <= cols; i++)
            {
                const xOffset = i * config.gridSize * config.noiseScale + runtimeNoiseOffset;
                const colBase = i * rowStride;
                for (let j = 0; j <= rows; j++)
                {
                    field[colBase + j] = (
                        simplex.noise2D(
                            xOffset,
                            j * config.gridSize * config.noiseScale + runtimeNoiseOffset
                        ) + 1
                    ) * 0.5;
                }
            }

            const step = 1 / config.levels;
            const gz   = config.gridSize;
            for (let level = 0.2; level < 0.8; level += step)
            {
                ctx.beginPath();
                for (let i = 0; i < cols - 1; i++)
                {
                    const colBase     = i * rowStride;
                    const nextColBase = (i + 1) * rowStride;
                    const x           = i * gz;

                    for (let j = 0; j < rows - 1; j++)
                    {
                        const y     = j * gz;
                        const valTL = field[colBase + j];
                        const valTR = field[nextColBase + j];
                        const valBR = field[nextColBase + j + 1];
                        const valBL = field[colBase + j + 1];

                        let state = 0;
                        if (valTL >= level) state |= 8;
                        if (valTR >= level) state |= 4;
                        if (valBR >= level) state |= 2;
                        if (valBL >= level) state |= 1;

                        if (state === 0 || state === 15) continue;

                        switch (state)
                        {
                            case 1:
                            case 14:
                                ctx.moveTo(x + gz * getIsoT(valBL, valBR, level), y + gz);
                                ctx.lineTo(x, y + gz * getIsoT(valTL, valBL, level));
                                break;
                            case 2:
                            case 13:
                                ctx.moveTo(x + gz, y + gz * getIsoT(valTR, valBR, level));
                                ctx.lineTo(x + gz * getIsoT(valBL, valBR, level), y + gz);
                                break;
                            case 3:
                            case 12:
                                ctx.moveTo(x + gz, y + gz * getIsoT(valTR, valBR, level));
                                ctx.lineTo(x, y + gz * getIsoT(valTL, valBL, level));
                                break;
                            case 4:
                            case 11:
                                ctx.moveTo(x + gz * getIsoT(valTL, valTR, level), y);
                                ctx.lineTo(x + gz, y + gz * getIsoT(valTR, valBR, level));
                                break;
                            case 5:
                            {
                                const ax = x + gz * getIsoT(valTL, valTR, level);
                                const by = y + gz * getIsoT(valTR, valBR, level);
                                const cx = x + gz * getIsoT(valBL, valBR, level);
                                const dy = y + gz * getIsoT(valTL, valBL, level);
                                ctx.moveTo(ax, y);
                                ctx.lineTo(x, dy);
                                ctx.moveTo(x + gz, by);
                                ctx.lineTo(cx, y + gz);
                                break;
                            }
                            case 6:
                            case 9:
                                ctx.moveTo(x + gz * getIsoT(valTL, valTR, level), y);
                                ctx.lineTo(x + gz * getIsoT(valBL, valBR, level), y + gz);
                                break;
                            case 7:
                            case 8:
                                ctx.moveTo(x + gz * getIsoT(valTL, valTR, level), y);
                                ctx.lineTo(x, y + gz * getIsoT(valTL, valBL, level));
                                break;
                            case 10:
                            {
                                const ax = x + gz * getIsoT(valTL, valTR, level);
                                const by = y + gz * getIsoT(valTR, valBR, level);
                                const cx = x + gz * getIsoT(valBL, valBR, level);
                                const dy = y + gz * getIsoT(valTL, valBL, level);
                                ctx.moveTo(ax, y);
                                ctx.lineTo(x + gz, by);
                                ctx.moveTo(cx, y + gz);
                                ctx.lineTo(x, dy);
                                break;
                            }
                        }
                    }
                }
                ctx.stroke();
            }
        }

        function resize()
        {
            canvas.width  = window.innerWidth;
            canvas.height = window.innerHeight;
            initStars();
            draw();
        }

        // 拖拽窗口边缘时 resize 事件可能每秒触发数十次，全量重绘
        // （数万次噪声采样 + 行进方块）代价高；用 rAF 合并为每帧至多一次
        let resizeQueued = false;

        function requestResize()
        {
            if (resizeQueued)
            {
                return;
            }
            resizeQueued = true;
            requestAnimationFrame(() =>
            {
                resizeQueued = false;
                resize();
            });
        }

        // 首次等高线生成包含大量噪声采样。让 HTML 与 WebGL 场景先完成首帧，
        // 再在下一帧绘制背景，避免它与目标星球初始化挤在同一个长任务里。
        requestResize();
        return {resize: requestResize};
    }

    global.createTopoBackground = createTopoBackground;
})(window);
