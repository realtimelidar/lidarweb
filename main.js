import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import { Box3Helper } from "./utils/Box3Helper.js"
import { Pointcloud } from './pointcloud.js';

import "./ws.js"

const pointcloud = new Pointcloud();

window.pcId = 0;

// Initialize THREE

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000*1000);

window.scene = scene;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

// Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Initialize Websocket connection 
WS.connect("ws://10.0.0.12:3000").then(() => {
    WS.on('InitialBoundingBox', async bb => {
        console.log("got initial bounding box = ", bb);
        
        // Build visually the bounding box
        const bb3 = new THREE.Box3(new THREE.Vector3().fromArray(bb.min), new THREE.Vector3().fromArray(bb.max));
        const b3h = new Box3Helper(bb3);
        scene.add(b3h);

        // Set initial camera rotation same as lidarserv-viewer
        const vPosition = new THREE.Vector3(360256.0, 4571304.706493851, 791.2935061482602);
        // const vDirection = new THREE.Vector3(0.0, 0.70710678118662, -0.7071067811864751).normalize();

        // const target = vPosition.clone().add(vDirection);

        const focus = bb3.getCenter(new THREE.Vector3());


        camera.position.copy(vPosition);
        controls.target.copy(focus);
        controls.update();

        // Keep listening on new points
        WS.on('UpdateNode', updateInfo => {
            let nodeId = null;

            if (!updateInfo.points || updateInfo.points.length <= 0) {
                return;
            }

            if (!pointcloud.doesNodeExist(updateInfo.node)) {
                // Insert
                // console.log("Received new node!");

                nodeId = pointcloud.addNodeToPointcloud(updateInfo.node, pcId);
                console.log("Added node (" + nodeId + ") to pointcloud (" + pcId + ")");
            }

            // Insert/Update
            pointcloud.addPointsToNode(updateInfo.points, updateInfo.node);
            // console.log("Set node (" + nodeId + ") points (" + updateInfo.points.length + ")");
            
        });

        setInterval(() => {
            console.log("Updating...");
            pointcloud.updateT3Points();
        }, 1500);

        WS.on('DeleteNode', node => {
            // pointcloud.removeNode(node);
            console.log("Removed node (" + JSON.stringify(node) + ") from pointcloud (" + pcId + ")");
        });

        // Send one time this query to get some points on screen
        setInterval(() => {
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
                                    "camera_pos": camera_pos,
                                    "camera_dir": camera_dir,
                                    "camera_up": camera_up,
                                    "fov_y": fov_y,
                                    "z_near": z_near, //11.190580082124141,//z_near ,//* 100,
                                    "z_far": z_far,//11190580.082987662,//z_far ,//* 10,
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
            WS.send(a);
        }, 1000);
    });
});