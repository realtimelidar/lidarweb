import * as THREE from 'three';
import { qualityConfig } from './gui.js';

let lastCameraValue = "";

function sendCameraValues() {
    const a = {
        "Query": {
            "query": {
                "And": [
                    {
                        "ViewFrustum": {
                            "camera_pos": window.camera.getWorldPosition(new THREE.Vector3()).toArray(),
                            "camera_dir": window.camera.getWorldDirection(new THREE.Vector3()).toArray(),
                            "camera_up": window.camera.up.toArray(),
                            "fov_y": Math.PI / 4,
                            "z_near": window.camera.near * 100,
                            "z_far": window.camera.far * 100,
                            "window_size": [window.innerWidth, window.innerHeight],
                            "max_distance": qualityConfig[window.config.quality].camMaxDistance
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

    if (timestamp - radiationTimeTracker >= window.RAD_UPDATE_RATE && window.radiation.needsRebuild) {
        // window.radiation.buildMergedGeometry();
        // window.radMesh.geometry = window.radiation.geometry;

        // radiationTimeTracker = timestamp;
    }

    
    if (timestamp - geometryTimeTracker >= window.CAM_UPDATE_RATE && (window.pointcloud.needsRebuild && timestamp - window.lastRecvNode > window.CAM_UPDATE_RATE)) {
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