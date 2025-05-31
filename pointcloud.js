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

        this.geometry.computeBoundingBox();
        this.geometry.computeBoundingSphere();
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
                scale: { value: window.innerHeight },
                cameraNear: { value: window.camera.near },
                cameraFar: { value: window.camera.far },
            },

            vertexShader: `
            precision highp float;

            attribute vec3 color;

            varying vec3 vColor;

            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                float minSize = 2.0;
                float maxSize = 13.0;
                float minDistance = 100.0;
                float maxDistance = 5.0;

                float distance = abs(mvPosition.z);
                float t = clamp((distance - maxDistance) / (minDistance - maxDistance), 0.0, 1.0);
                t = 1.0 - t;

                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = mix(minSize, maxSize, t);
            }
            `,
            fragmentShader: `
            precision highp float;

            varying vec3 vColor;
            void main() {
                gl_FragColor = vec4(vColor, 1.0);
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

            // const b3h = new Box3Helper(node.geometry.boundingBox);
            // scene.add(b3h);

            // node.b3h = b3h;
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

        console.log("*debug!* " + this.geometry.attributes.position.array.length + " positions")
        console.log("*debug!* " + this.geometry.attributes.color.array.length + " colors")

        this.needsRebuild = false;
    }

    getPointCount() {
        return Array.from(this.nodes.values()).reduce((a, b) => a + b.pointCount, 0);
    }
    
}