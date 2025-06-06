import * as THREE from "three";
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Box3Helper } from "./utils/Box3Helper.js"

export class Node {
    static getNodeId(nodeInfo) {
        return `${nodeInfo.pos.x}_${nodeInfo.pos.y}_${nodeInfo.pos.z}_${nodeInfo.lod}`;
    }

    constructor(x, y, z, lod, positionBuffer, colorBuffer) {
        this.id = Node.getNodeId({ pos: { x, y, z }, lod: lod });

        this.x = x;
        this.y = y;
        this.z = z;
        this.lod = lod;

        // Each point is represented by 3 float32 = 4 * 3 = 12 position bytes per point
        this.pointCount = positionBuffer.byteLength / 12;

        this.geometry = new THREE.BufferGeometry();

        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positionBuffer), 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(colorBuffer), 3, true));

        // console.log(new Float32Array(positionBuffer));

        //
        // RADIATION
        //

        // const radiation = window.rawRadiation;

        // const radiationAttrib = new Float32Array(this.pointCount);
        // this.geometry.setAttribute('radiation', new THREE.BufferAttribute(radiationAttrib, 1));

        // for (let i = 0; i < this.pointCount; i++) {
        //     const pX = this.geometry.attributes.position.array[i * 3];
        //     const pY = this.geometry.attributes.position.array[i * 3 + 1];
            
        //     let value = radiation.get(pX, pY);

        //     // clamp
        //     if (value > radiation.maxValue) {
        //         value = radiation.maxValue;
        //     }

        //     // Normalize
        //     value = value / radiation.maxValue;

        //     radiationAttrib[i] = value;
        // }

        // const msg = {
        //     nodeId: this.id,
        //     radiation: new Float32Array(radiation.data.map(x => [ x.x, x.y, x.value ]).flat()).buffer,
        //     positionBuffer: positionBuffer,
        //     pointCount: this.pointCount
        // };

        // window.radWorker.postMessage(msg, [ msg.radiation ]);

        this.geometry.computeBoundingBox();
        this.geometry.computeBoundingSphere();
    }

    setRadiation(buffer) {
        // this.geometry.attributes.radiation.set(new Float32Array(buffer));
        // this.geometry.attributes.radiation.needsUpdate = true;
    }

    dispose() {
        if (this.geometry) {
            this.geometry.dispose();
        }
    }
}

export class Pointcloud {
    constructor() {
        /* node id -> Node */
        /* What nodes are loaded into this pointcloud? */
        this.nodes = new Map();

        /* Material used to render this pointcloud's nodes */
        this.material = new THREE.ShaderMaterial({
            // transparent: false,
            depthWrite: true,
            depthTest: true,

            uniforms: {
                size: { value: 2.0 },
                fixedSize: { value: 0.0 },
                scale: { value: window.innerHeight },
                cameraNear: { value: window.camera.near },
                cameraFar: { value: window.camera.far },
            },

            vertexShader: `
            precision highp float;

            uniform float fixedSize;

            attribute vec3 color;
            // attribute float radiation;

            varying vec3 vColor;
            // varying float vRadiation;

            void main() {
                vColor = color;
                // vRadiation = radiation;

                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                if (fixedSize > 0.0) {
                    gl_PointSize = fixedSize;
                } else {
                    float minSize = 2.0;
                    float maxSize = 13.0;
                    float minDistance = 100.0;
                    float maxDistance = 5.0;

                    float distance = abs(mvPosition.z);
                    float t = clamp((distance - maxDistance) / (minDistance - maxDistance), 0.0, 1.0);
                    t = 1.0 - t;

                    gl_PointSize = mix(minSize, maxSize, t);
                }

                gl_Position = projectionMatrix * mvPosition;
                
            }
            `,
            fragmentShader: `
            precision highp float;

            varying vec3 vColor;
            // varying float vRadiation;

            vec3 INFERNO(float value) {
                if (value <= 0.0) return vec3(0.077, 0.042, 0.206);
                if (value <= 0.1) return mix(vec3(0.077, 0.042, 0.206), vec3(0.225, 0.036, 0.388), (value - 0.0) / 0.1);
                if (value <= 0.2) return mix(vec3(0.225, 0.036, 0.388), vec3(0.373, 0.074, 0.432), (value - 0.1) / 0.1);
                if (value <= 0.3) return mix(vec3(0.373, 0.074, 0.432), vec3(0.522, 0.128, 0.420), (value - 0.2) / 0.1);
                if (value <= 0.4) return mix(vec3(0.522, 0.128, 0.420), vec3(0.665, 0.182, 0.370), (value - 0.3) / 0.1);
                if (value <= 0.5) return mix(vec3(0.665, 0.182, 0.370), vec3(0.797, 0.255, 0.287), (value - 0.4) / 0.1);
                if (value <= 0.6) return mix(vec3(0.797, 0.255, 0.287), vec3(0.902, 0.364, 0.184), (value - 0.5) / 0.1);
                if (value <= 0.7) return mix(vec3(0.902, 0.364, 0.184), vec3(0.969, 0.516, 0.063), (value - 0.6) / 0.1);
                if (value <= 0.8) return mix(vec3(0.969, 0.516, 0.063), vec3(0.988, 0.683, 0.072), (value - 0.7) / 0.1);
                if (value <= 0.9) return mix(vec3(0.988, 0.683, 0.072), vec3(0.961, 0.859, 0.298), (value - 0.8) / 0.1);
                if (value < 1.0)  return mix(vec3(0.961, 0.859, 0.298), vec3(0.988, 0.998, 0.645), (value - 0.9) / 0.1);
                return vec3(0.988, 0.998, 0.645); // fallback if value >= 1.0
            }

            vec3 RAINBOW(float value) {
                if (value <= 0.0) return vec3(0.278, 0.0, 0.714);
                if (value <= 1.0 / 6.0) {
                    float t = value / (1.0 / 6.0);
                    return mix(vec3(0.278, 0.0, 0.714), vec3(0.0, 0.0, 1.0), t);
                }
                if (value <= 2.0 / 6.0) {
                    float t = (value - 1.0 / 6.0) / (1.0 / 6.0);
                    return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), t);
                }
                if (value <= 3.0 / 6.0) {
                    float t = (value - 2.0 / 6.0) / (1.0 / 6.0);
                    return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), t);
                }
                if (value <= 4.0 / 6.0) {
                    float t = (value - 3.0 / 6.0) / (1.0 / 6.0);
                    return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), t);
                }
                if (value <= 5.0 / 6.0) {
                    float t = (value - 4.0 / 6.0) / (1.0 / 6.0);
                    return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.64, 0.0), t);
                }
                if (value < 1.0) {
                    float t = (value - 5.0 / 6.0) / (1.0 / 6.0);
                    return mix(vec3(1.0, 0.64, 0.0), vec3(1.0, 0.0, 0.0), t);
                }
                return vec3(1.0, 0.0, 0.0); // fallback (value >= 1)
            }

            void main() {
                gl_FragColor = vec4(vColor, 1.0);
                // float normalized = vRadiation / 100.0;
                // if (normalized <= 0.6) {
                //     gl_FragColor = vec4(vColor, 1.0);
                // } else {
                //     // vec3 result = RAINBOW(normalized) * vColor;
                //     vec3 result = mix(vColor, RAINBOW(normalized), 0.5);
                //     gl_FragColor = vec4(result, 1.0);
                // }

                // 
                return;
            }
            `,
        });

        /* Merged geometry of all inner nodes */
        /* Initially set to a dummy geometr */
        this.dummyGeometry = new THREE.BufferGeometry();
        this.geometry = this.dummyGeometry;

        this.needsRebuild = false;
    }

    hasNode(nodeId) {
        return this.nodes.has(nodeId);
    }

    addNode(node, rebuild = true) {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node);

            if (rebuild) {
                this.needsRebuild = true;
            }

            const b3h = new Box3Helper(node.geometry.boundingBox);
            node.b3h = b3h;

            if (window.config.showBB) {
                scene.add(b3h);
            }
        }
    }

    removeNode(nodeId, rebuild = true) {
        if (this.nodes.has(nodeId)) {
            const node = this.nodes.get(nodeId);
            node.dispose();
            this.nodes.delete(nodeId);

            if (node.b3h) {
                scene.remove(node.b3h);
                node.b3h.geometry.dispose();
            }

            if (rebuild) {
                this.needsRebuild = true;
            }
        }
    }

    removeAllNodes() {
        for (const node of this.nodes.values()) {
            node.dispose();
        }
        this.nodes.clear();
        this.needsRebuild = true;
    }

    buildMergedGeometry() {
        if (!this.needsRebuild) {
            return;
        }

        if (this.geometry) {
            this.geometry.dispose();
        }

        if (this.nodes.size <= 0) {
            this.geometry = this.dummyGeometry;
            return;
        }

        const geometries = Array.from(this.nodes.values()).map(x => x.geometry);
        this.geometry = BufferGeometryUtils.mergeGeometries(geometries, false);

        this.geometry.computeBoundingBox();
        this.geometry.computeBoundingSphere();

        this.needsRebuild = false;
    }

    getPointCount() {
        return Array.from(this.nodes.values()).reduce((a, b) => a + b.pointCount, 0);
    }

    getNearestPoints(position, radius) {
        
    }
    
}