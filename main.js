import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Box3Helper } from "./utils/Box3Helper.js"
import { InfiniteGridHelper } from "./utils/InfiniteGridHelper.js"
import { Node, Pointcloud } from './pointcloud.js';
import { RadiationCloud, RadiationNode } from './radiation/discrete.js';
import { RawRadiationCloud } from './radiation/continuous.js';

import { ExampleData } from './radiation/continuous.js';
import EDL from './edl.js';
import { buildGUI, qualityConfig } from './gui.js'

let CAM_UPDATE_RATE = 50;
let PC_UPDATE_RATE = 100;
let RAD_UPDATE_RATE = PC_UPDATE_RATE;

window.CAM_UPDATE_RATE = CAM_UPDATE_RATE;
window.PC_UPDATE_RATE = PC_UPDATE_RATE;
window.RAD_UPDATE_RATE = RAD_UPDATE_RATE;

let visualOffset = { x: 0, y: 0, z: 0};
window.visualOffset = visualOffset;

buildGUI();

// Initialize THREE
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 10000); // 1000*1000

window.camera = camera;
window.scene = scene;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

const pointcloud = new Pointcloud();
const radiation = new RadiationCloud();
const rawRadiation = new RawRadiationCloud();

window.pointcloud = pointcloud;
window.rawRadiation = rawRadiation;

const t3points = new THREE.Points(pointcloud.geometry, pointcloud.material);
t3points.frustumCulled = false;

const radMesh = new THREE.Mesh(radiation.geometry, radiation.material);

scene.add(radMesh);
scene.add(t3points);

const edl = new EDL(
    window.innerWidth, window.innerHeight,
    camera.near, camera.far,
    config.edlRadius, config.edlStrength
);

window.edl = edl;

let lastCameraValue = "";

function sendCameraValues() {
    const pos = camera.getWorldPosition(new THREE.Vector3()).toArray();

    pos[0] += visualOffset.x;
    pos[1] += visualOffset.y;
    pos[2] += visualOffset.z;

    const a = {
        "Query": {
            "query": {
                "And": [
                    {
                        "ViewFrustum": {
                            "camera_pos": pos,
                            "camera_dir": camera.getWorldDirection(new THREE.Vector3()).toArray(),
                            "camera_up": camera.up.toArray(),
                            "fov_y": Math.PI / 4,
                            "z_near": camera.near * 100,
                            "z_far": camera.far * 100,
                            "window_size": [window.innerWidth, window.innerHeight],
                            "max_distance": qualityConfig[config.quality].camMaxDistance
                        }
                    }, "Full"
                ]
            },
            "config": {
                "one_shot": false,
                "point_filtering": false
            }
        }
    };

    if (JSON.stringify(a) == lastCameraValue) {
        return;
    }

    lastCameraValue = JSON.stringify(a);
    console.log(lastCameraValue);
    console.log("real cam pos", camera.getWorldPosition(new THREE.Vector3()).toArray());
    websocketWorker.postMessage({ t: "send", msg: a, isJson: true });
}

// Render loop
let geometryTimeTracker;
let radiationTimeTracker;
let cameraTimeTracker;
let start;

function animate(timestamp) {
    if (start == undefined) {
        start = timestamp;
    }

    if (geometryTimeTracker == undefined) {
        geometryTimeTracker = timestamp;
    }

    if (cameraTimeTracker == undefined) {
        cameraTimeTracker = timestamp;
    }

    if (radiationTimeTracker == undefined) {
        radiationTimeTracker = timestamp;
    }

    if (timestamp - radiationTimeTracker >= RAD_UPDATE_RATE && radiation.needsRebuild) {
        // radiation.buildMergedGeometry();
        // radMesh.geometry = radiation.geometry;

        radiationTimeTracker = timestamp;
    }

    
    if (timestamp - geometryTimeTracker >= CAM_UPDATE_RATE && (pointcloud.needsRebuild && timestamp - lastRecvNode > CAM_UPDATE_RATE)) {
        pointcloud.buildMergedGeometry();
        t3points.geometry = pointcloud.geometry;

        geometryTimeTracker = timestamp;

        config.nodeCount = pointcloud.nodes.size;
        window.nodeCountGUI.updateDisplay();

        config.pointCount = pointcloud.getPointCount().toLocaleString();
        window.pointCountGUI.updateDisplay();
    }

    if (timestamp - cameraTimeTracker >= CAM_UPDATE_RATE) {
        sendCameraValues();
        cameraTimeTracker = timestamp;
    }

    controls.update();
    requestAnimationFrame(animate);

    if (!config.edl) {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
        return;
    }

    renderer.setRenderTarget(edl.renderTarget);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(edl.scene, edl.camera);
}

animate();

window.addEventListener('resize', () => {
    edl.renderTarget.setSize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    edl.viewport = { width: window.innerWidth, height: window.innerHeight };
    edl.updateUniforms();
});

// Initialize Websocket connection 
// We will put this in a WebWorker to avoid rendering interruption
const websocketWorker = new Worker("/workers/ws.js");
// websocketWorker.postMessage({ t: "start", url: "wss://lidarweb.adrian.cat/ws/" });
websocketWorker.postMessage({ t: "start", url: "ws://127.0.0.01:3000/ws/" });

let lastRecvNode = 0;

websocketWorker.onmessage = e => {
    switch (e.data.t) {
        case 'UpdateNode':
            let updateInfo = e.data.payload;
            const updatedNodeInfo = e.data.payload.node;

            if (!updateInfo.points || updateInfo.points.length <= 0) {
                return;
            }

            const updatedNodeId = Node.getNodeId({ pos: updatedNodeInfo.pos, lod: updatedNodeInfo.lod });

            if (pointcloud.hasNode(updatedNodeId)) {
                pointcloud.removeNode(updatedNodeId, false);
            }

            lastRecvNode = document.timeline.currentTime;

            let node = new Node(
                updatedNodeInfo.pos.x, updatedNodeInfo.pos.y, updatedNodeInfo.pos.z, updatedNodeInfo.lod,
                updateInfo.points.pBuff, updateInfo.points.cBuff
            );

            pointcloud.addNode(node);
            break;
        case 'DeleteNode':
            const deletedNodeInfo = e.data.payload.node;
            let nodeId = Node.getNodeId(deletedNodeInfo);

            pointcloud.removeNode(nodeId);
            break;
        case 'bb':
            const { bb, cs } = e.data.p;
            console.log("got initial bounding box = ", bb);
            console.log("got coordinate system = ", cs);

            visualOffset = { x: cs["offset"][0], y: cs["offset"][1], z: cs["offset"][2] };
            console.log("updated visual offset: ", visualOffset);

            bb.min[0] -= visualOffset.x;
            bb.min[1] -= visualOffset.y;
            bb.min[2] -= visualOffset.z;

            bb.max[0] -= visualOffset.x;
            bb.max[1] -= visualOffset.y;
            bb.max[2] -= visualOffset.z;
        
            // Build visually the bounding box
            const bb3 = new THREE.Box3(new THREE.Vector3().fromArray(bb.min), new THREE.Vector3().fromArray(bb.max));

            const b3h = new Box3Helper(bb3);
            scene.add(b3h);

            // Build a pretty infinite grid
            // const grid = new InfiniteGridHelper(10, 100);

            // grid.rotateX(Math.PI * 0.5);
            // grid.position.z = bb3.min.z;

            // scene.add( grid );

            // setTimeout(() => {
            //     console.log("radiation...");

            //     //
            //     // DISCRETE
            //     //

            //     const bbSize = new THREE.Vector3();
            //     bb3.getSize(bbSize);

            //     const bbCenter = new THREE.Vector3();
            //     bb3.getCenter(bbCenter);

            //     const innerSize = bbSize.clone().multiplyScalar(0.5);
            //     const innerMin = bbCenter.clone().sub(innerSize.clone().multiplyScalar(0.5));
            //     const innerMax = bbCenter.clone().add(innerSize.clone().multiplyScalar(0.5));

            //     const innerBox = new THREE.Box3(innerMin, innerMax);

            //     function getRandomPointInBox(box) {
            //         const min = box.min;
            //         const max = box.max;
            //         return new THREE.Vector3(
            //             THREE.MathUtils.lerp(min.x, max.x, Math.random()),
            //             THREE.MathUtils.lerp(min.y, max.y, Math.random()),
            //             THREE.MathUtils.lerp(min.z, max.z, Math.random())
            //         );
            //     }

            //     // setInterval(() => {
            //     //     console.log("new radiation!");
            //     //     const pos = getRandomPointInBox(innerBox);
            //     //     const value = Math.random() * 100;

            //     //     let node = new RadiationNode(
            //     //         pos.x, pos.y, pos.z, value
            //     //     );

            //     //     radiation.addNode(node);
            //     // }, 500);

            //     //
            //     // CONTINUOUS
            //     //

            //     // const string = ExampleData;
            //     // string.split("\n").forEach(line => {
            //     //     const items = line.split(',');
            //     //     const value = parseFloat(items[2]);
            //     //     const pos = getRandomPointInBox(bb3);

            //     //     rawRadiation.add(pos.x, pos.y, value);
            //     // });

            //     // const radWorker = new Worker('./workers/continuousRadiation.js');
            //     // window.radWorker = radWorker;

            //     // radWorker.onmessage = e => {
            //     //     const { nodeId, resultBuffer } = e.data;
            //     //     if (pointcloud.nodes.has(nodeId)) {
            //     //         pointcloud.nodes.get(nodeId).setRadiation(resultBuffer);
            //     //     }
            //     // }

            // }, 100);

            const bbCenter = bb3.getCenter(new THREE.Vector3());

            const bbSize = bb3.getSize(new THREE.Vector3());
            const maxSize = Math.max(bbSize.x, bbSize.y, bbSize.z);

            const d = maxSize;
            const direction = new THREE.Vector3(0, -1, 0.5).normalize();
            const camPos = bbCenter.clone().addScaledVector(direction, d);

            camera.position.copy(camPos);
            controls.target.copy(bbCenter);
            controls.update();
            break;
    }
}
