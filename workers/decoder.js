
let a = false;
onmessage = e => {
    const u8data = new Uint8Array(e.data.buffer);
    const offset = e.data.cs;

    let dv = new DataView(e.data.buffer);
    const encodedSz = dv.getBigUint64(0, true);

    const messageLen = Number(encodedSz & 0xffffffffn);
    const headerLen = Number(encodedSz >> 32n);

    let headerDecodedU8;
    try {
        headerDecodedU8 = JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(u8data.subarray(8, headerLen+8)).buffer));
    } catch (e) {
        console.error("Failed to parse header");
        console.log(new Uint8Array(u8data.subarray(8, headerLen+8)));
        console.log(encodedSz);
        console.log(messageLen);
        console.log(headerLen);

        postMessage(null);
        return;
    }
    
    const payload = new Uint8Array(u8data.subarray(headerLen+8));

    let result = {
        t: "",
        payload: {}
    };

    if (headerDecodedU8["Node"]) {
        const lod = headerDecodedU8["Node"]["node"]["lod"];
        const pos = headerDecodedU8["Node"]["node"]["pos"];
        const updateNumber= headerDecodedU8["Node"]["update_number"];

        // if (lod <= 0) {
        //     postMessage(result);
        //     return;
        // }

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

        if (pointCount <= 0) {
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

        const attrCount = dv.getUint8(pByteOffset);
        pByteOffset++;

        // Start reading attributes
        // attr: { "name: "xxx", "type": xxx, "length": xxx }
        // const attrs = [];

        // Byte size of each point
        let pointSize = 0;

        // Byte offset of Position3D attribute in each point
        let positionOffset = 0;

        // Byte offset of ColorRGB attribute in each point
        let colorOffset = 0;

        // Current byte offset in attributes
        let attrOffset = 0;

        for (let i = 0; i < attrCount; i++) {
            const szName = dv.getUint8(pByteOffset);
            pByteOffset++;

            const name = new TextDecoder("utf-8").decode(new Uint8Array(payload.subarray(dv.byteOffset + pByteOffset, szName + dv.byteOffset + pByteOffset)).buffer);
            pByteOffset += szName;

            const length = Number(dv.getBigUint64(pByteOffset, littleEndian));
            pByteOffset += 8;

            // const type = dv.getUint8(pByteOffset);
            pByteOffset++;

            pointSize += length;

            if (name == "Position3D") {
                positionOffset = attrOffset;
            } else if (name == "ColorRGB") {
                colorOffset = attrOffset;
            }

            attrOffset += length;

            // attrs.push({
            //     name,
            //     type,
            //     length
            // });
        }

        // At this point we have parsed all the attributes
        // So regarding the byte offset, we are just at the beggining
        // of the first attribute value

        // Start reading points
        // We will only parse the following attributes:
        // Position3D, ColorRGB
        const pBuff = new ArrayBuffer(pointCount * 3 * 4);
        const cBuff = new ArrayBuffer(pointCount * 3);

        const positions = new Float32Array(pBuff);
        const colors = new Uint8Array(cBuff);

        // For each point, get its position and color
        for (let i = 0; i < pointCount; i++) {
            let ppOffset = pByteOffset + i * pointSize + positionOffset;
            let pcOffset = pByteOffset + i * pointSize + colorOffset;

            positions[i * 3] = dv.getFloat64(ppOffset, littleEndian);// * 0.001 + 359834;
            positions[i * 3 + 1] = dv.getFloat64(ppOffset + 1 * 8, littleEndian);// * 0.001 + 4571492;
            positions[i * 3 + 2] = dv.getFloat64(ppOffset + 2 * 8, littleEndian);// * 0.001 + 259;

            if (!a) {
                console.log("original", positions);
            }

            positions[i * 3] *= 0.001;
            positions[i * 3 + 1] *= 0.001;
            positions[i * 3 + 2] *= 0.001;

            // positions[i * 3] -= offset[0];
            // positions[i * 3 + 1] -= offset[1];
            // positions[i * 3 + 2] -= offset[2];

            // positions[i * 3] -= offset[0];
            // positions[i * 3 + 1] -= offset[1];
            // positions[i * 3 + 2] -= offset[2];

            if (!a) {
                console.log("transform", positions);
                console.log("offset", offset);
                a = true;
            }

            colors[i * 3] = dv.getUint16(pcOffset, littleEndian);//>> 8;
            colors[i * 3 + 1] = dv.getUint16(pcOffset + 1 * 2, littleEndian);// >> 8;
            colors[i * 3 + 2] = dv.getUint16(pcOffset + 2 * 2, littleEndian);// >> 8;
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