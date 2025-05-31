import * as THREE from "three";
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class RadiationNode {
    static getNodeId(nodeInfo) {
        return `R_${nodeInfo.pos.x}_${nodeInfo.pos.y}_${nodeInfo.pos.z}_${nodeInfo.value}`;
    }

    
    constructor(x, y, z, value) {
        this.id = RadiationNode.getNodeId({ pos: { x, y, z }, value: value });

        this.position = new Float32Array([ x, y, z ]);

        this.x = x;
        this.y = y;
        this.z = z;

        this.value = value;

        this.geometry = new THREE.BoxGeometry(2, 2, this.value);

        this.geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z + value/2));

        const vertexCount = this.geometry.attributes.position.count;
        const values = new Float32Array(vertexCount);

        for (let i = 0; i < vertexCount; i++) {
            values[i] = this.value;
        }

        this.geometry.setAttribute('value', new THREE.BufferAttribute(values, 1));
    }
}

export class RadiationCloud {
    constructor() {
        /* node id -> Node */
        /* What nodes are loaded into this pointcloud? */
        this.nodes = new Map();

        /* Material used to render this pointcloud's nodes */
        this.material = new THREE.ShaderMaterial({
            vertexShader: `
                precision highp float;

                attribute float value; 

                varying float vValue;

                void main() {
                    vValue = value;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;

                varying float vValue;

                void main() {
                    vec3 color;

                    if (vValue < 150.0) {
                        color = vec3(0.0, 1.0, 0.0); // green
                    } else if (vValue < 300.0) {
                        color = vec3(1.0, 1.0, 0.0); // yellow
                    } else {
                        color = vec3(1.0, 0.0, 0.0); // red
                    }

                    gl_FragColor = vec4(color, 1.0);
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

    dispose() {
        if (this.geometry) {
            this.geometry.dispose();
        }
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
}