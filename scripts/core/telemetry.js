const _tempMatrix = new THREE.Matrix4();
const _viewVector = new THREE.Vector3();

// 遥测读数变化缓慢，DOM 写入按 10Hz 节流即可覆盖读数分辨率，
// 避免逐帧 textContent 写入带来的多余布局/绘制开销
const TELEMETRY_WRITE_INTERVAL_MS = 100;

let _lastWriteTime = -Infinity;
let _lastText      = '';

function updatePlanetTelemetry(spinGroup, tgtLabel, decSignFactor = 1)
{
    if (!tgtLabel || !tgtLabel.firstChild)
    {
        return;
    }

    const now = performance.now();
    if (now - _lastWriteTime < TELEMETRY_WRITE_INTERVAL_MS)
    {
        return;
    }

    _viewVector.set(0, 0, 1);
    _tempMatrix.copy(spinGroup.matrixWorld).invert();
    const local = _viewVector.applyMatrix4(_tempMatrix).normalize();

    let decRad   = Math.asin(local.y);
    decRad *= decSignFactor;
    const decDeg = decRad * (180 / Math.PI);

    let raLongRad = Math.atan2(-local.x, local.z);
    raLongRad     = raLongRad % (Math.PI * 2);
    if (raLongRad < 0)
    {
        raLongRad += Math.PI * 2;
    }

    const raLongTotalMinutes = (raLongRad / (Math.PI * 2)) * 24 * 60;
    const raLongH            = Math.floor(raLongTotalMinutes / 60);
    const raLongM            = Math.floor(raLongTotalMinutes % 60);
    const decSign            = decDeg >= 0 ? '+' : '-';
    const decVal             = Math.abs(Math.floor(decDeg));

    const text =
        `TGT: RA ${raLongH.toString().padStart(2, '0')}h ${raLongM.toString().padStart(2, '0')}m | DEC ${decSign}${decVal.toString().padStart(2, '0')}° `;
    _lastWriteTime = now;
    if (text === _lastText)
    {
        return;
    }
    _lastText      = text;
    tgtLabel.firstChild.textContent = text;
}
