import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import { Box3Helper } from "./utils/Box3Helper.js"
import { Node, Pointcloud } from './pointcloud.js';

const pointcloud = new Pointcloud();

const t3points = new THREE.Points(pointcloud.geometry, pointcloud.material);
t3points.frustumCulled = false;

window.pcId = 0;

// Initialize THREE

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000*1000);

window.scene = scene;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

scene.add(t3points);

function sendCameraValues() {
    const cam = camera;
    cam.updateMatrixWorld(true);

    const pM = cam.projectionMatrix;
    const vM = cam.matrixWorldInverse;

    const vec3 = new THREE.Vector3();
    const camera_pos = vec3.setFromMatrixPosition(cam.matrixWorld).toArray();

    vec3.set(0, 0, -1);
    const camera_dir = vec3.applyQuaternion(cam.quaternion).normalize().toArray();
    const camera_up = [0.0, 0.0, 1.0];
    const fov_y = Math.PI / 4;
    const z_near = Math.abs(new THREE.Vector3(0.0, 0.0, -1.0).applyMatrix4(cam.projectionMatrixInverse).z);
    const z_far = Math.abs(new THREE.Vector3(0.0, 0.0, 1.0).applyMatrix4(cam.projectionMatrixInverse).z);

    const window_size = [window.innerWidth, window.innerHeight];
    const max_distance = 10.0;

    const a = {
        "Query": {
            "query": {
                "And": [
                    {
                        "ViewFrustum": {
                            "camera_pos": camera.getWorldPosition(new THREE.Vector3()).toArray(),
                            "camera_dir": camera.getWorldDirection(new THREE.Vector3()).toArray(),
                            "camera_up": camera.up.toArray(),
                            "fov_y": fov_y,
                            "z_near": cam.near, //z_near * 10, //11.190580082124141,//z_near ,//* 100,
                            "z_far": cam.far, //z_far * 100,//11190580.082987662,//z_far ,//* 10,
                            "window_size": window_size,
                            "max_distance": max_distance
                        }
                    }, "Full"
                ]
            },
            "config": {
                "one_shot": false,
                "point_filtering": true
            }
        }
    };
    const b = '{"Query":{"query":{"And":[{"ViewFrustum":{"camera_pos":[360320.0,4571304.706493851,791.2935061482602],"camera_dir":[0.0,0.70710678118662,-0.7071067811864751],"camera_up":[0.0,0.0,1.0],"fov_y":0.7853981633974483,"z_near":11.190580082124141,"z_far":11190580.082987662,"window_size":[500.0,500.0],"max_distance":10.0}},"Full"]},"config":{"one_shot":false,"point_filtering":true}}}';
    // console.log(JSON.stringify(a));
    websocketWorker.postMessage({ t: "send", msg: a, isJson: true });
    // WS.send(a);
}

// Render loop
let geometryTimeTracker;
let cameraTimeTracker;

function animate(timestamp) {

    if (geometryTimeTracker == undefined) {
        geometryTimeTracker = timestamp;
    }

    if (cameraTimeTracker == undefined) {
        cameraTimeTracker = timestamp;
    }

    if (timestamp - geometryTimeTracker >= 2000 && pointcloud.needsRebuild) {
        pointcloud.buildMergedGeometry();
        t3points.geometry = pointcloud.geometry;

        geometryTimeTracker = timestamp;
        document.getElementById("info").innerHTML = `${pointcloud.nodes.size} nodes`;
        // console.log("Updated!")
    }

    if (timestamp - cameraTimeTracker >= 100) {
        sendCameraValues();
        cameraTimeTracker = timestamp;
        // console.log("Camera sent!")
    }

    controls.update();

    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

animate();

// Initialize Websocket connection 
// We will put this in a WebWorker to avoid rendering interruption
const websocketWorker = new Worker("/workers/ws.js");
websocketWorker.postMessage({ t: "start", url: "ws://127.0.0.1:3000" });

websocketWorker.onmessage = e => {
    switch (e.data.t) {
        case 'UpdateNode':
            let updateInfo = e.data.payload;
            const updatedNodeInfo = e.data.payload.node;

            if (!updateInfo.points || updateInfo.points.length <= 0) {
                return;
            }

            // if (updatedNodeInfo.lod == 0) {
            //     return;
            // }

            let node = new Node(
                updatedNodeInfo.pos.x, updatedNodeInfo.pos.y, updatedNodeInfo.pos.z, updatedNodeInfo.lod,
                updateInfo.points.pBuff, updateInfo.points.cBuff
            );

            pointcloud.addNode(node);
            // console.log("Added node (" + node.id + ") to pointcloud");
            break;
        case 'DeleteNode':
            const deletedNodeInfo = e.data.payload.node;
            let nodeId = Node.getNodeId(deletedNodeInfo);

            pointcloud.removeNode(nodeId);
            // console.log("Removed node (" + nodeId + ")");
            break;
        case 'bb':
            const bb = e.data.p;
            console.log("got initial bounding box = ", bb);
        
            // Build visually the bounding box
            const bb3 = new THREE.Box3(new THREE.Vector3().fromArray(bb.min), new THREE.Vector3().fromArray(bb.max));
            const b3h = new Box3Helper(bb3);
            scene.add(b3h);

            // Set initial camera rotation same as lidarserv-viewer
            // const vPosition = new THREE.Vector3(360280.72611016943,4571987.929769906,324.67023094467004);
            // const vDirection = new THREE.Vector3(0.11402558543009306,0.3137649799207097,-0.9426291440660433).normalize();

            // const target = vPosition.clone().add(vDirection);

            const focus = bb3.getCenter(new THREE.Vector3());
            const vPosition = new THREE.Vector3(0.0, 0.0, 100).add(focus)


            camera.position.copy(vPosition);
            controls.target.copy(focus);
            controls.update();
            // setTimeout(() => {
            //     const vPosition = new THREE.Vector3(360280.72611016943,4571987.929769906,324.67023094467004);
            //     const vDirection = new THREE.Vector3(0.11402558543009306,0.3137649799207097,-0.9426291440660433).normalize();

            //     const target = vPosition.clone().add(vDirection);

            //     // const focus = bb3.getCenter(new THREE.Vector3());


            //     camera.position.copy(vPosition);
            //     controls.target.copy(target);
            //     controls.update();
            // }, 2000)

            // setInterval(() => {
            //     console.log("Updating...");
            //     pointcloud.updateT3Points();
            // }, 100);

            // WS.on('DeleteNode', node => {
            //     // pointcloud.removeNode(node);
            //     console.log("Removed node (" + JSON.stringify(node) + ") from pointcloud (" + pcId + ")");
            // });

            // Send one time this query to get some points on screen
            break;
    }
}

// WS.connect("ws://127.0.0.1:3000").then(() => {
//     WS.on('InitialBoundingBox', async bb => {
//         console.log("got initial bounding box = ", bb);
        
//         // Build visually the bounding box
//         const bb3 = new THREE.Box3(new THREE.Vector3().fromArray(bb.min), new THREE.Vector3().fromArray(bb.max));
//         const b3h = new Box3Helper(bb3);
//         scene.add(b3h);

//         // Set initial camera rotation same as lidarserv-viewer
//         const vPosition = new THREE.Vector3(360256.0, 4571304.706493851, 791.2935061482602);
//         // const vDirection = new THREE.Vector3(0.0, 0.70710678118662, -0.7071067811864751).normalize();

//         // const target = vPosition.clone().add(vDirection);

//         const focus = bb3.getCenter(new THREE.Vector3());


//         camera.position.copy(vPosition);
//         controls.target.copy(focus);
//         controls.update();

//         // Keep listening on new points
//         WS.on('UpdateNode', updateInfo => {
//             let nodeId = null;

//             if (!updateInfo.points || updateInfo.points.length <= 0) {
//                 return;
//             }

//             if (!pointcloud.doesNodeExist(updateInfo.node)) {
//                 // Insert
//                 // console.log("Received new node!");

//                 nodeId = pointcloud.addNodeToPointcloud(updateInfo.node, pcId);
//                 console.log("Added node (" + nodeId + ") to pointcloud (" + pcId + ")");
//             }

//             // Insert/Update
//             pointcloud.addPointsToNode(updateInfo.points, updateInfo.node);
//             // console.log("Set node (" + nodeId + ") points (" + updateInfo.points.length + ")");
            
//         });

//         setInterval(() => {
//             console.log("Updating...");
//             pointcloud.updateT3Points();
//         }, 1500);

//         WS.on('DeleteNode', node => {
//             // pointcloud.removeNode(node);
//             console.log("Removed node (" + JSON.stringify(node) + ") from pointcloud (" + pcId + ")");
//         });

//         // Send one time this query to get some points on screen
//         setInterval(() => {
//             const cam = camera;
//             cam.updateMatrixWorld(true);

//             const pM = cam.projectionMatrix;
//             const vM = cam.matrixWorldInverse;

//             const vec3 = new THREE.Vector3();
//             const camera_pos = vec3.setFromMatrixPosition(cam.matrixWorld).toArray();

//             vec3.set(0, 0, -1);
//             const camera_dir = vec3.applyQuaternion(cam.quaternion).normalize().toArray();
//             const camera_up = [0.0, 0.0, 1.0];
//             const fov_y = Math.PI / 4;
//             const z_near = Math.abs(new THREE.Vector3(0.0, 0.0, -1.0).applyMatrix4(cam.projectionMatrixInverse).z);
//             const z_far = Math.abs(new THREE.Vector3(0.0, 0.0, 1.0).applyMatrix4(cam.projectionMatrixInverse).z);

//             const window_size = [window.innerWidth, window.innerHeight];
//             const max_distance = 10.0;

//             const a = {
//                 "Query": {
//                     "query": {
//                         "And": [
//                             {
//                                 "ViewFrustum": {
//                                     "camera_pos": camera_pos,
//                                     "camera_dir": camera_dir,
//                                     "camera_up": camera_up,
//                                     "fov_y": fov_y,
//                                     "z_near": z_near, //11.190580082124141,//z_near ,//* 100,
//                                     "z_far": z_far,//11190580.082987662,//z_far ,//* 10,
//                                     "window_size": window_size,
//                                     "max_distance": max_distance
//                                 }
//                             }, "Full"
//                         ]
//                     },
//                     "config": {
//                         "one_shot": false,
//                         "point_filtering": true
//                     }
//                 }
//             };
//             const b = '{"Query":{"query":{"And":[{"ViewFrustum":{"camera_pos":[360320.0,4571304.706493851,791.2935061482602],"camera_dir":[0.0,0.70710678118662,-0.7071067811864751],"camera_up":[0.0,0.0,1.0],"fov_y":0.7853981633974483,"z_near":11.190580082124141,"z_far":11190580.082987662,"window_size":[500.0,500.0],"max_distance":10.0}},"Full"]},"config":{"one_shot":false,"point_filtering":true}}}';
//             // console.log(JSON.stringify(a));
//             WS.send(a);
//         }, 1000);
//     });
// });
