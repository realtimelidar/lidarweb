import * as THREE from "three";
import { vertexColor } from "three/tsl";
// import {PointCloudMaterial} from "./materials/PointCloudMaterial.js";

export class Pointcloud {
    constructor() {
        /* node id -> node */
        this.nodes = new Map();

        /* node id -> pointcloud id */
        this.nodes2cloud = new Map();

        /* node id -> points array */
        this.points = new Map();

        /* list of pointcloud ids */
        this.clouds = [];

        // this.updateT3Points();
    }

    newPointcloud() {
        let id = 0;
        while (this.clouds.includes(id)) {
            id++;
        }

        this.clouds.push(id);
        return id;
    }

    getNodeId(node) {
        return JSON.stringify({ lod: node.lod, pos: node.pos });
    }

    addNodeToPointcloud(node, pointcloudId) {
        const key = this.getNodeId(node);

        if (!this.nodes2cloud.has(key)) {
            this.nodes2cloud.set(key, pointcloudId)
        }
        if (!this.nodes.has(key)) {
            this.nodes.set(key, node);
        }

        return key;
    }

    doesNodeExist(node) {
        const key = this.getNodeId(node);
        return this.nodes.has(key);
    }

    addPointsToNode(points, node) {
        const key = this.getNodeId(node);
        
        if (this.nodes.has(key)) {
            this.points.set(key, points);

            // const bb = this.computeBoundingBox3D(points);
            // const n = this.nodes.get(key);
            // n["boundingBox"] = bb;
            this.nodes.set(key, node);

            // this.updateT3Points();
        }
    }

    updateT3Points() {
        if (!this.material) {
            this.material = new THREE.ShaderMaterial({
                vertexShader: `
                    attribute float size;
                    attribute vec3 color;
                    varying vec3 vColor;

                    void main() {
                        vColor = color;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (300.0 / -mvPosition.z); // optional size attenuation
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
        }

        if (!this.t3Points) {
            // This is what is going to be rendered,
            // the representation of the pointcloud's points in THREE terms
            const geometry = new THREE.BufferGeometry();

            // all points
            const pnts = Array.from(this.points.values()).flat();

            const positions = new Float32Array(pnts.map(x => x.attrs.find(x => x.name == "Position3D").value).flat());
            const rgba = new Uint8Array(pnts.map(x => x.attrs.find(x => x.name == "ColorRGB").value).map(inner => inner.map(x => x >> 8))/*.map(x => x.concat(255 << 8))*/.flat());//.map(x => 255.0 /* x >> 8 */));
            const intensity = new Float32Array(pnts.map(x => x.attrs.find(x => x.name == "Intensity").value).flat())
            const sizes = new Float32Array(new Array(pnts.length).fill(2.0));

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 3, true));
            geometry.setAttribute('intensity', new THREE.BufferAttribute(intensity, 1));
            geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

            geometry.computeBoundingBox();

            this.geometry = geometry;

            if (!this.t3Points) {
                this.t3Points = new THREE.Points(this.geometry, this.material);
                scene.add(this.t3Points);
            }
        } else {
            // all points
            const pnts = Array.from(this.points.values()).flat();

            const positions = new Float32Array(pnts.map(x => x.attrs.find(x => x.name == "Position3D").value).flat());
            const rgba = new Uint8Array(pnts.map(x => x.attrs.find(x => x.name == "ColorRGB").value).map(inner => inner.map(x => x >> 8))/*.map(x => x.concat(255 << 8))*/.flat());//.map(x => 255.0 /* x >> 8 */));
            const intensity = new Float32Array(pnts.map(x => x.attrs.find(x => x.name == "Intensity").value).flat())
            const sizes = new Float32Array(new Array(pnts.length).fill(2.0));

            this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            this.geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 3, true));
            this.geometry.setAttribute('intensity', new THREE.BufferAttribute(intensity, 1));
            this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

            this.geometry.computeBoundingBox();
        }
    }

    removeNode(node) {
        const key = this.getNodeId(node);

        if (this.nodes.has(key)) {
            this.nodes.remove(key);
        }

        if (this.points.has(key)) {
            this.points.remove(key);
        }

        if (this.nodes2cloud.has(key)) {
            this.nodes2cloud.remove(key);
        }
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId);
    }

    getNodePoints(nodeId) {
        const key = nodeId; //this.getNodeId(node);
        
        if (this.points.has(key)) {
            return this.points.get(key);
        }

        return [];
    }

    computeBoundingBox3D(points) {
        const [x0, y0, z0] = points[0].attrs.find(x => x.name == "Position3D").value;

        let minX = x0, minY = y0, minZ = z0;
        let maxX = x0, maxY = y0, maxZ = z0;

        for (let i = 1; i < points.length; i++) {
            const [x, y, z] = points[i].attrs.find(x => x.name == "Position3D").value;

            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;

            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;
        }

        return [
            [minX, minY, minZ],
            [maxX, maxY, maxZ]
        ];
    }
}