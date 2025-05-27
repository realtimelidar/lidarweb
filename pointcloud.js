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
        this.geometry.setAttribute('lod', new THREE.BufferAttribute(new Uint8Array(Array(this.pointCount).fill(this.lod)), 1));

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
            depthTest: true,
            depthWrite: false,

            uniforms: {
                size: { value: 1.0 },
                scale: { value: window.innerHeight }
            },

            vertexShader: `
                uniform float scale;
                uniform float size;

                attribute vec3 color;
                attribute float lod;

                varying vec3 vColor;

                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                    // float size = 2.0;
                    // gl_PointSize = size * (300.0 / -mvPosition.z); // optional size attenuation

                    gl_PointSize = size * (scale / -mvPosition.z) * pow(0.5, lod);

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision mediump float;
                varying vec3 vColor;

                void main() {
                    gl_FragColor = vec4(vColor, 1.0);
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

    addNode(node) {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node);
            this.needsRebuild = true;

            const b3h = new Box3Helper(node.geometry.boundingBox);
            scene.add(b3h);

            this.b3h = b3h;
        }
    }

    removeNode(nodeId, rebuild = true) {
        if (this.nodes.has(nodeId)) {
            const node = this.nodes.get(nodeId);
            node.dispose();
            this.nodes.delete(nodeId);

            if (this.b3h) {
                this.b3h.geometry.dispose();
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
        console.log("*debug!* " + this.geometry.attributes.lod.array.length + " lods")

        this.needsRebuild = false;
    }
    
}