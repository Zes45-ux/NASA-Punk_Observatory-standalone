const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadTelemetry({angleStep = 0.31} = {}) {
    // 每次遥测调用旋转一个角度，确保读数持续变化；angleStep 为 0 时读数恒定
    let angle = 0;
    const sandbox = {
        THREE: {
            Matrix4: class {
                copy() { return this; }
                invert() { return this; }
            },
            Vector3: class {
                set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
                applyMatrix4() {
                    angle += angleStep;
                    this.x = Math.sin(angle);
                    this.y = 0.2;
                    this.z = Math.cos(angle);
                    return this;
                }
                normalize() { return this; }
            }
        },
        performance: {now: () => clock},
        document: null
    };
    vm.runInNewContext(fs.readFileSync('scripts/core/telemetry.js', 'utf8'), sandbox);
    return {update: sandbox.updatePlanetTelemetry};
}

let clock = 0;
const spinGroup = {matrixWorld: {}};

test('telemetry writes the first reading immediately', () => {
    clock = 0;
    const {update} = loadTelemetry();
    const label = {firstChild: {textContent: ''}};
    update(spinGroup, label, 1);
    assert.match(label.firstChild.textContent, /^TGT: RA \d{2}h \d{2}m \| DEC [+-]\d{2}° $/);
});

test('telemetry throttles DOM writes to 10 Hz', () => {
    clock = 0;
    const {update} = loadTelemetry();
    const label = {firstChild: {textContent: ''}};
    const write = () => label.firstChild.textContent;

    update(spinGroup, label, 1);
    const first = write();

    clock = 50;
    update(spinGroup, label, 1);
    assert.equal(write(), first, 'changed value inside the throttle window is deferred');

    clock = 150;
    update(spinGroup, label, 1);
    const second = write();
    assert.notEqual(second, first, 'changed value lands once the window elapses');

    clock = 175;
    update(spinGroup, label, 1);
    assert.equal(write(), second, 'next change inside the following window is deferred too');
});

test('telemetry skips DOM writes entirely for identical readings', () => {
    clock = 0;
    const {update} = loadTelemetry({angleStep: 0});
    const label = {firstChild: {textContent: ''}};

    update(spinGroup, label, 1);
    const first = label.firstChild.textContent;

    clock = 5000;
    update(spinGroup, label, 1);
    assert.equal(label.firstChild.textContent, first, 'identical reading never rewrites the DOM node');
});

test('telemetry ignores calls without a label target', () => {
    const {update} = loadTelemetry();
    assert.doesNotThrow(() => update(spinGroup, null, 1));
    assert.doesNotThrow(() => update(spinGroup, {firstChild: null}, 1));
});
