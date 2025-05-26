

onmessage = e => {
    const u8data = new Uint8Array(e.data);
    let dv = new DataView(e.data);
    const encodedSz = dv.getBigUint64(0, true);

    const messageLen = Number(encodedSz & 0xffffffn);
    const headerLen = Number(encodedSz >> 32n);

    const headerDecodedU8 = JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(u8data.subarray(8, headerLen+8)).buffer));
    const payload = new Uint8Array(u8data.subarray(headerLen+8));

    let result = {
        t: "",
        payload: {}
    };

    if (headerDecodedU8["Node"]) {
        const lod = headerDecodedU8["Node"]["node"]["lod"];
        const pos = headerDecodedU8["Node"]["node"]["pos"];
        const updateNumber= headerDecodedU8["Node"]["update_number"];

        // Do ack
        result.updateNumber = updateNumber;

        if (payload.byteLength <= 0) {
            result.t = 'DeleteNode';
            result.payload = {
                "node": {
                    lod,
                    pos,
                },
            };

            postMessage(result);
            return;
        }

        dv = new DataView(payload.buffer, 16);
        let pByteOffset = 0;

        // Version must be 1
        if (dv.getUint8(pByteOffset) != 1) {
            console.error("[decoder] Version is expected to be 1");

            postMessage(result);
            return;
        }

        pByteOffset++;

        const littleEndian = dv.getUint8(pByteOffset) == 0;
        pByteOffset++;

        const compression = dv.getUint8(pByteOffset);
        pByteOffset++;

        if (compression != 0) {
            console.error("[decoder] Compression is currenty unsupported");

            postMessage(result);
            return;
        }

        // point number is u64, however in practice i've not seen it exceeding even u16,
        // so we cast to Number since its easier to work with
        const pointCount = Number(dv.getBigUint64(pByteOffset, littleEndian));
        pByteOffset += 8;

        const attrCount = dv.getUint8(pByteOffset);
        pByteOffset++;

        // Start reading attributes
        // attr: { "name: "xxx", "type": xxx, "length": xxx }
        const attrs = [];

        for (let i = 0; i < attrCount; i++) {
            const szName = dv.getUint8(pByteOffset);
            pByteOffset++;

            const name = new TextDecoder("utf-8").decode(new Uint8Array(payload.subarray(dv.byteOffset + pByteOffset, szName + dv.byteOffset + pByteOffset)).buffer);
            pByteOffset += szName;

            const length = Number(dv.getBigUint64(pByteOffset, littleEndian));
            pByteOffset += 8;

            const type = dv.getUint8(pByteOffset);
            pByteOffset++;

            attrs.push({
                name,
                type,
                length
            });
        }

        // At this point we have parsed all the attributes
        // So regarding the byte offset, we are just at the beggining
        // of the first attribute value

        // Start reading points
        // We will only parse the following attributes:
        // Position3D, ColorRGB
        const points = [];

        const pBuff = new ArrayBuffer(pointCount * 3 * 4);
        const cBuff = new ArrayBuffer(pointCount * 3);

        const positions = new Float32Array(pBuff);
        const colors = new Uint8Array(cBuff);

        for (let i = 0; i < pointCount * attrCount; i++) {
            const attr = attrs[i % attrCount];
            const pnt = (i / attrCount) >> 0;

            switch (attr.name) {
                case 'Position3D':
                    positions[pnt * 3] = dv.getFloat64(pByteOffset, littleEndian);
                    positions[pnt * 3 + 1] = dv.getFloat64(pByteOffset + 1 * 8, littleEndian);
                    positions[pnt * 3 + 2] = dv.getFloat64(pByteOffset + 2 * 8, littleEndian);

                    // pByteOffset += 3 * 8;
                    break;
                case 'ColorRGB':
                    colors[pnt * 3] = dv.getUint16(pByteOffset, littleEndian) >> 8;
                    colors[pnt * 3 + 1] = dv.getUint16(pByteOffset + 1 * 2, littleEndian) >> 8;
                    colors[pnt * 3 + 2] = dv.getUint16(pByteOffset + 2 * 2, littleEndian) >> 8;

                    // pByteOffset += 3 * 2;
                    break;
            }

            switch (attr.type) {
                case 0:
                    pByteOffset++;
                    break;
                case 1:
                    pByteOffset++;
                    break;
                case 2:
                    pByteOffset += 2;
                    break;
                case 3:
                    pByteOffset += 2;
                    break;
                case 4:
                    pByteOffset += 4;
                    break;
                case 5:
                    pByteOffset += 4;
                    break;
                case 6:
                    pByteOffset += 8;
                    break;
                case 7:
                    pByteOffset += 8;
                    break;
                case 8:
                    pByteOffset += 4;
                    break;
                case 9:
                    pByteOffset += 8;
                    break;
                case 10:
                    pByteOffset += 3;
                    break;
                case 11:
                    pByteOffset += 3 * 2;
                    break;
                case 12:
                    pByteOffset += 3 * 4;
                    break;
                case 13:
                    pByteOffset += 3 * 4;
                    break;
                case 14:
                    pByteOffset += 3 * 8;
                    break;
                case 15:
                    pByteOffset += 4;
                    break;
                case 16:
                    pByteOffset += length;
                    break;
                default:
                    console.error("Unsupported attribute type " + type)

            }
        }

        result.t = 'UpdateNode';
        result.payload = {
            "node": {
                lod,
                pos,
            },
            "points": { pBuff, cBuff }
        };

        postMessage(result, [ result.payload.points.pBuff, result.payload.points.cBuff ]);
    }
};