// Warn if overriding existing method
if(Array.prototype.equals)
    console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
    // if the other array is a falsy value, return
    if (!array)
        return false;
    // if the argument is the same array, we can be sure the contents are same as well
    if(array === this)
        return true;
    // compare lengths - can save a lot of time 
    if (this.length != array.length)
        return false;

    for (var i = 0, l=this.length; i < l; i++) {
        // Check if we have nested arrays
        if (this[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!this[i].equals(array[i]))
                return false;       
        }           
        else if (this[i] != array[i]) { 
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;   
        }           
    }       
    return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});

importScripts("../libs/cbor/cbor.js");

let _connection = null;
let _ready = false;

let _debug = true;

/*
    0 = Waiting magic number
    1 = Waiting HELLO
*/
let _state = 0;

let _magicNumber = Array.from(new TextEncoder().encode("LidarServ Protocol"));
let _protocolVersion = 4;

let _lastAck = 0;

const log = msg => {
    if (_debug) {
        console.log("[websocket] " + msg);
    }
};

const send = (message, isJson = true) => {
    if (!_ready) {
        console.error("[send] not yet ready!");
        return;
    }

    let encoded;

    if (isJson) {
        encoded = new TextEncoder("utf-8").encode(JSON.stringify(message));
    } else {
        encoded = CBOR.encode(message);
    }

    const msg = new Uint8Array(encoded.byteLength + 8);
    const dv = new DataView(msg.buffer);
    
    dv.setUint32(0, msg.byteLength, true);
    msg.set(new Uint8Array(encoded), 8);

    log("sending (" + msg.byteLength + " bytes), ", msg);
    _connection.send(msg);
};

const decoderWorker = new Worker("./decoder.js");
decoderWorker.onmessage = e => {
    const msg = e.data;
    if (msg.updateNumber >= _lastAck + 3) {
        send({
            'ResultAck': {
                'update_number': msg.updateNumber
            }
        });
    }
    postMessage(msg);
}

// Get messages from global context
onmessage = e => {
    const msg = e.data;
    switch (msg.t) {
        case 'start':
            _connection = new WebSocket(msg.url);
            _connection.binaryType = "arraybuffer";

            _connection.addEventListener("open", _ => {
                _ready = true;

                log("opened websocket connection");

                // send back magic number
                _connection.send(new Uint8Array(_magicNumber));
            });

            _connection.addEventListener("error", e => {
                console.error("[websocket] " + e);
            })

            _connection.addEventListener("message", event => {
                if (event.data instanceof ArrayBuffer) {
                    const u8data = new Uint8Array(event.data);
                    const data = Array.from(u8data);

                    log("received " + event.data.byteLength + " bytes");

                    // exchange hello messages and check each others protocol compatibility
                    if (_state == 0 && data.equals(_magicNumber)) {
                        log("got handshake");
                        _state = 1;

                        // send hello message
                        send({ 'Hello': { 'protocol_version': _protocolVersion }}, false);
                    } else if (_state == 1) {
                        const body = new Uint8Array(u8data.subarray(8)).buffer;
                        const decoded = CBOR.decode(body);

                        if (decoded["Hello"]) {
                            const pv = decoded["Hello"]["protocol_version"];

                            if (pv == _protocolVersion) {
                                log("got HELLO")
                                _state = 2;

                                // tell the server that we are a viewer, that will query points.
                                send({ 'ConnectionMode': { 'device': 'Viewer' }}, false);
                            }
                        }
                    } else if (_state == 2) {
                        // wait for the point cloud info.
                        // (we don't need that info at the moment, so all we do with it is ignoring it...)

                        const body = new Uint8Array(u8data.subarray(8)).buffer;
                        const decoded = CBOR.decode(body);

                        if (decoded["PointCloudInfo"]) {
                            _state = 3;

                            const coordinateSystem = decoded["PointCloudInfo"]["coordinate_system"];
                            const attributes = decoded["PointCloudInfo"]["attributes"];
                            const codec = decoded["PointCloudInfo"]["codec"];
                            const currentBoundingBox = decoded["PointCloudInfo"]["current_bounding_box"];

                            postMessage({ t: "bb", p: currentBoundingBox });
                            // WS.call('InitialBoundingBox', currentBoundingBox);
                        }
                    } else if (_state == 3) {
                        decoderWorker.postMessage(u8data.buffer, [u8data.buffer]);
                    }
                }
            });
            break;
        case "send":
            const payload = msg.msg;
            const isJson = msg.isJson;

            send(payload, isJson);
            break;
    }
};

// (function (WS, undefined) {
//     let _connection = null;
//     let _ready = false;

//     let _debug = false;

//     /*
//         0 = Waiting magic number
//         1 = Waiting HELLO
//     */
//     let _state = 0;
    
//     let _magicNumber = Array.from(new TextEncoder().encode("LidarServ Protocol"));
//     let _protocolVersion = 4;

//     let _lastAck = 0;

//     let _events = new Map();

//     log = msg => {
//         if (_debug) {
//             log(msg);
//         }
//     }

//     WS.on = (eventName, callback) => {
//         if (!_events.has(eventName)) {
//             _events.set(eventName, []);
//         }

//         _events.get(eventName).push(callback);
//     };

//     WS.call = (eventName, ...args) => {
//         if (!_events.has(eventName)) {
//             return;
//         }

//         for (const cb of _events.get(eventName)) {
//             cb(...args);
//         }
//     };

//     WS.connect = (url) => {
//         return new Promise((res, rej) => {
//             try {
//                 _connection = new WebSocket(url);
//                 _connection.binaryType = "arraybuffer";
    
//                 _connection.addEventListener("open", _ => {
//                     _ready = true;

//                     log("opened websocket connection");

//                     // send back magic number
//                     _connection.send(new Uint8Array(_magicNumber));

//                     // all good
//                     res();
//                 });
    
//                 _connection.addEventListener("error", e => {
//                     console.error("[ws error] " + e);
//                 })
    
//                 _connection.addEventListener("message", event => {
//                     if (event.data instanceof ArrayBuffer) {
//                         const u8data = new Uint8Array(event.data);
//                         const data = Array.from(u8data);

//                         log("received " + event.data.byteLength + " bytes");
//                         // log(data);

//                         // exchange hello messages and check each others protocol compatibility
//                         if (_state == 0 && data.equals(_magicNumber)) {
//                             log("got handshake");
//                             _state = 1;

//                             // send hello message
//                             WS.send({ 'Hello': { 'protocol_version': _protocolVersion }}, false);
//                         } else if (_state == 1) {
//                             const body = new Uint8Array(u8data.subarray(8)).buffer;
//                             const decoded = CBOR.decode(body);
//                             // const decoded = JSON.parse(new TextDecoder("utf-8").decode(body));

//                             if (decoded["Hello"]) {
//                                 const pv = decoded["Hello"]["protocol_version"];

//                                 if (pv == _protocolVersion) {
//                                     log("got HELLO")
//                                     _state = 2;

//                                     // tell the server that we are a viewer, that will query points.
//                                     WS.send({ 'ConnectionMode': { 'device': 'Viewer' }}, false);
//                                 }
//                             }
//                         } else if (_state == 2) {
//                             // wait for the point cloud info.
//                             // (we don't need that info at the moment, so all we do with it is ignoring it...)

//                             const body = new Uint8Array(u8data.subarray(8)).buffer;
//                             const decoded = CBOR.decode(body);
//                             // const decoded = JSON.parse(new TextDecoder("utf-8").decode(body));

//                             if (decoded["PointCloudInfo"]) {
//                                 _state = 3;

//                                 const coordinateSystem = decoded["PointCloudInfo"]["coordinate_system"];
//                                 const attributes = decoded["PointCloudInfo"]["attributes"];
//                                 const codec = decoded["PointCloudInfo"]["codec"];
//                                 const currentBoundingBox = decoded["PointCloudInfo"]["current_bounding_box"];

//                                 WS.call('InitialBoundingBox', currentBoundingBox);
//                             }
//                         } else if (_state == 3) {
//                             let dv = new DataView(u8data.buffer);
//                             const encodedSz = dv.getBigUint64(0, true);

//                             const messageLen = Number(encodedSz & 0xffffffn);
//                             const headerLen = Number(encodedSz >> 32n);

//                             const headerDecodedU8 = JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(u8data.subarray(8, headerLen+8)).buffer));
//                             const payload = new Uint8Array(u8data.subarray(headerLen+8));

//                             if (headerDecodedU8["Node"]) {
//                                 const lod = headerDecodedU8["Node"]["node"]["lod"];
//                                 const pos = headerDecodedU8["Node"]["node"]["pos"];
//                                 const updateNumber= headerDecodedU8["Node"]["update_number"];

//                                 // Do ack
//                                 if (updateNumber >= _lastAck + 3 /* one shot = false */) {
//                                     WS.send({
//                                         'ResultAck': {
//                                             'update_number': updateNumber
//                                         }
//                                     });
//                                 }

//                                 if (payload.byteLength <= 0) {
//                                     WS.call('DeleteNode', {
//                                         "node": {
//                                             lod,
//                                             pos,
//                                         },
//                                     });

//                                     return;
//                                 }

//                                 dv = new DataView(payload.buffer, 16);
//                                 let pByteOffset = 0;

//                                 // Version must be 1
//                                 if (dv.getUint8(pByteOffset) != 1) {
//                                     console.error("Version is expected to be 1");
//                                     return;
//                                 }

//                                 pByteOffset++;

//                                 const littleEndian = dv.getUint8(pByteOffset) == 0;
//                                 pByteOffset++;

//                                 const compression = dv.getUint8(pByteOffset);
//                                 pByteOffset++;

//                                 if (compression != 0) {
//                                     console.error("Compression is currenty unsupported");
//                                     return;
//                                 }

//                                 // point number is u64, however in practice i've not seen it exceeding even u16,
//                                 // so we cast to Number since its easier to work with
//                                 const pointCount = Number(dv.getBigUint64(pByteOffset, littleEndian));
//                                 pByteOffset += 8;

//                                 const attrCount = dv.getUint8(pByteOffset);
//                                 pByteOffset++;

//                                 // Start reading attributes
//                                 // attr: { "name: "xxx", "type": xxx, "length": xxx }
//                                 const attrs = [];

//                                 for (let i = 0; i < attrCount; i++) {
//                                     const szName = dv.getUint8(pByteOffset);
//                                     pByteOffset++;

//                                     const name = new TextDecoder("utf-8").decode(new Uint8Array(payload.subarray(dv.byteOffset + pByteOffset, szName + dv.byteOffset + pByteOffset)).buffer);
//                                     pByteOffset += szName;

//                                     const length = Number(dv.getBigUint64(pByteOffset, littleEndian));
//                                     pByteOffset += 8;

//                                     const type = dv.getUint8(pByteOffset);
//                                     pByteOffset++;

//                                     attrs.push({
//                                         name,
//                                         type,
//                                         length
//                                     });
//                                 }

//                                 // At this point we have parsed all the attributes
//                                 // So regarding the byte offset, we are just at the beggining
//                                 // of the first attribute value

//                                 // Start reading points
//                                 // We will only parse the following attributes:
//                                 // Position3D, Intensity, GpsTime, ColorRGB
//                                 const points = [];

//                                 for (let i = 0; i < pointCount * attrCount; i++) {
//                                     const attr = attrs[i % attrCount];
//                                     const pnt = (i / attrCount) >> 0;

//                                     const name = attr.name;
//                                     const type = attr.type;
//                                     const length = attr.length;

//                                     let attrValue;

//                                     switch (type) {
//                                         case 0:
//                                             attrValue = dv.getUint8(pByteOffset);
//                                             pByteOffset++;
//                                             break;
//                                         case 1:
//                                             attrValue = dv.getInt8(pByteOffset);
//                                             pByteOffset++;
//                                             break;
//                                         case 2:
//                                             attrValue = dv.getUint16(pByteOffset, littleEndian);
//                                             pByteOffset += 2;
//                                             break;
//                                         case 3:
//                                             attrValue = dv.getInt16(pByteOffset, littleEndian);
//                                             pByteOffset += 2;
//                                             break;
//                                         case 4:
//                                             attrValue = dv.getUint32(pByteOffset, littleEndian);
//                                             pByteOffset += 4;
//                                             break;
//                                         case 5:
//                                             attrValue = dv.getInt32(pByteOffset, littleEndian);
//                                             pByteOffset += 4;
//                                             break;
//                                         case 6:
//                                             attrValue = dv.getBigUint64(pByteOffset, littleEndian);
//                                             pByteOffset += 8;
//                                             break;
//                                         case 7:
//                                             attrValue = dv.getBigInt64(pByteOffset, littleEndian);
//                                             pByteOffset += 8;
//                                             break;
//                                         case 8:
//                                             attrValue = dv.getFloat32(pByteOffset, littleEndian);
//                                             pByteOffset += 4;
//                                             break;
//                                         case 9:
//                                             attrValue = dv.getFloat64(pByteOffset, littleEndian);
//                                             pByteOffset += 8;
//                                             break;
//                                         case 10:
//                                             attrValue = [
//                                                 dv.getUint8(pByteOffset),
//                                                 dv.getUint8(pByteOffset + 1),
//                                                 dv.getUint8(pByteOffset + 2)
//                                             ];
//                                             pByteOffset += 3;
//                                             break;
//                                         case 11:
//                                             attrValue = [
//                                                 dv.getUint16(pByteOffset, littleEndian),
//                                                 dv.getUint16(pByteOffset + 1 * 2, littleEndian),
//                                                 dv.getUint16(pByteOffset + 2 * 2, littleEndian)
//                                             ];
//                                             pByteOffset += 3 * 2;
//                                             break;
//                                         case 12:
//                                             attrValue = [
//                                                 dv.getFloat32(pByteOffset, littleEndian),
//                                                 dv.getFloat32(pByteOffset + 1 * 4, littleEndian),
//                                                 dv.getFloat32(pByteOffset + 2 * 4, littleEndian)
//                                             ];
//                                             pByteOffset += 3 * 4;
//                                             break;
//                                         case 13:
//                                             attrValue = [
//                                                 dv.getInt32(pByteOffset, littleEndian),
//                                                 dv.getInt32(pByteOffset + 1 * 4, littleEndian),
//                                                 dv.getInt32(pByteOffset + 2 * 4, littleEndian)
//                                             ];
//                                             pByteOffset += 3 * 4;
//                                             break;
//                                         case 14:
//                                             attrValue = [
//                                                 dv.getFloat64(pByteOffset, littleEndian),
//                                                 dv.getFloat64(pByteOffset + 1 * 8, littleEndian),
//                                                 dv.getFloat64(pByteOffset + 2 * 8, littleEndian)
//                                             ];
//                                             pByteOffset += 3 * 8;
//                                             break;
//                                         case 15:
//                                             attrValue = [
//                                                 dv.getUint8(pByteOffset),
//                                                 dv.getUint8(pByteOffset + 1),
//                                                 dv.getUint8(pByteOffset + 2),
//                                                 dv.getUint8(pByteOffset + 3)
//                                             ];
//                                             pByteOffset += 4;
//                                             break;
//                                         case 16:
//                                             attrValue = [];
//                                             for (let i = 0; i < length; i++) {
//                                                 attrValue.push(dv.getUint8(pByteOffset + i));
//                                             }
//                                             pByteOffset += length;
//                                             break;
//                                         default:
//                                             console.error("Unsupported attribute type " + type)

//                                     }

//                                     if (points.length <= pnt) {
//                                         points[pnt] = {
//                                             attrs: [],
//                                         };
//                                     }

//                                     points[pnt].attrs.push({
//                                         value: attrValue,
//                                         name   
//                                     });
//                                 }

//                                 WS.call('UpdateNode', {
//                                     "node": {
//                                         lod,
//                                         pos,
//                                     },
//                                     "points": points
//                                 });
//                                 // log('UpdateNode', {
//                                 //     "node": {
//                                 //         lod,
//                                 //         pos,
//                                 //     },
//                                 //     "points": points
//                                 // })
//                             }
//                         }
//                     }
//                 });
//             } catch(e) {
//                 console.error("failed to create websocket connection (" + url + "): " + e);
//                 rej();
//             }
//         });
//     };

//     WS.send = (message, isJson = true) => {
//         if (!_ready) {
//             console.error("[send] not yet ready!");
//             return;
//         }

//         let encoded;

//         if (isJson) {
//             encoded = new TextEncoder("utf-8").encode(JSON.stringify(message));
//         } else {
//             encoded = CBOR.encode(message);
//         }

//         const msg = new Uint8Array(encoded.byteLength + 8);
//         const dv = new DataView(msg.buffer);
        
//         dv.setUint32(0, msg.byteLength, true);
//         msg.set(new Uint8Array(encoded), 8);

//         log("sending (" + msg.byteLength + " bytes), ", msg);
//         _connection.send(msg);
//     };
// })( window.WS = window.WS || {} );