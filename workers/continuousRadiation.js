onmessage = e => {
    // all radiation data, [ x, y, value, x, y, value ]
    const radiation = new Float32Array(e.data.radiation);

    // all node's points positions, [ x, y, z, x, y, z ]
    const positions = new Float32Array(e.data.positionBuffer);

    // total node point count
    const pointCount = e.data.pointCount;

    // total radiation data count
    const radiationCount = radiation.byteLength / 12;

    const visualOffset = e.data.offset;

    // interpolated values
    const result = new Float32Array(pointCount);

    for (let i = 0; i < pointCount; i++) {
        let pX = positions[i * 3];
        let pY = positions[i * 3 + 1]

        let num = 0, den = 0, p = 4;
        for (let j = 0; j < radiationCount; j++) {
            const dx = radiation[j * 3] - pX;
            const dy = radiation[j * 3 + 1] - pY;

            const d2 = dx * dx + dy * dy;

            if (d2 > 35**2) {
                continue;
            }

            const w = d2 === 0 ? 1e10 : 1 / Math.pow(d2, p/2);

            num += w * radiation[j * 3 + 2];
            den += w;
        }

        result[i] = num/den;

        if (isNaN(result[i])) {
            result[i] = 0.0;
        }
    }

    const msg = { nodeId: e.data.nodeId, resultBuffer: result.buffer };
    postMessage(msg, [ msg.resultBuffer ]);
};