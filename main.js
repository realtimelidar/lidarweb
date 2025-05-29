import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Box3Helper } from "./utils/Box3Helper.js"
import { InfiniteGridHelper } from "./utils/InfiniteGridHelper.js"
import { Node, Pointcloud } from './pointcloud.js';

window.fps = 0;

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

const t3points = new THREE.Points(pointcloud.geometry, pointcloud.material);
t3points.frustumCulled = false;

// t3points.layers.set(1);

scene.add(t3points);

let lastCameraValue = "";

const CAM_UPDATE_RATE = 50;
const PC_UPDATE_RATE = 0;

function sendCameraValues() {
    const a = {
        "Query": {
            "query": {
                "And": [
                    {
                        "ViewFrustum": {
                            "camera_pos": camera.getWorldPosition(new THREE.Vector3()).toArray(),
                            "camera_dir": camera.getWorldDirection(new THREE.Vector3()).toArray(),
                            "camera_up": camera.up.toArray(),
                            "fov_y": Math.PI / 4,
                            "z_near": camera.near * 100,
                            "z_far": camera.far * 100,
                            "window_size": [window.innerWidth, window.innerHeight],
                            "max_distance": 2.5
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

const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
});
renderTarget.depthTexture = new THREE.DepthTexture();
// renderTarget.depthTexture.type = THREE.UnsignedShortType;
renderTarget.depthTexture.type = THREE.FloatType;

const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadGeo = new THREE.PlaneGeometry(2, 2);

const edlMaterial = new THREE.ShaderMaterial({
    vertexShader: `
        void main() {
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform float screenWidth;
        uniform float screenHeight;
        uniform float edlStrength;
        uniform float edlRadius;
        uniform float cameraNear;
        uniform float cameraFar;

        float linearizeDepth(float depth) {
            float z = depth * 2.0 - 1.0;
            return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / vec2(screenWidth, screenHeight);
            float centerDepth = linearizeDepth(texture2D(tDepth, uv).x);
            float response = 0.0;
            vec2 texel = vec2(edlRadius / screenWidth, edlRadius / screenHeight);

            vec2 offsets[8];
            offsets[0] = vec2(-1,  0); offsets[1] = vec2(1, 0);
            offsets[2] = vec2(0, -1); offsets[3] = vec2(0, 1);
            offsets[4] = vec2(-1, -1); offsets[5] = vec2(1, -1);
            offsets[6] = vec2(-1,  1); offsets[7] = vec2(1, 1);

            for (int i = 0; i < 8; i++) {
            vec2 offsetUV = uv + texel * offsets[i];
            if (offsetUV.x < 0.0 || offsetUV.x > 1.0 || offsetUV.y < 0.0 || offsetUV.y > 1.0) {
                continue;
            }
            float neighborDepth = linearizeDepth(texture2D(tDepth, offsetUV).x);
            response += max(0.0, centerDepth - neighborDepth);
            }

            response /= 8.0;
            float shading = exp(-response * edlStrength);
            vec3 color = texture2D(tColor, uv).rgb * shading;
            gl_FragColor = vec4(color, 1.0);
        }
    `,
    uniforms: {
        tColor: { value: renderTarget.texture },
        tDepth: { value: renderTarget.depthTexture },
        screenWidth: { value: window.innerWidth },
        screenHeight: { value: window.innerHeight },
        edlStrength: { value: 0.5 },
        edlRadius: { value: 1.5 },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far }
    }
});

const screenQuad = new THREE.Mesh(quadGeo, edlMaterial);
const screenScene = new THREE.Scene();
screenScene.add(screenQuad);

// Render loop
let geometryTimeTracker;
let cameraTimeTracker;
let start;

let frames = 0;
let prevTime = 0;

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

    if (timestamp - geometryTimeTracker >= 250 && (pointcloud.needsRebuild && timestamp - lastRecvNode > CAM_UPDATE_RATE)) {
        pointcloud.buildMergedGeometry();
        t3points.geometry = pointcloud.geometry;

        geometryTimeTracker = timestamp;
        document.getElementById("info-nodes").innerHTML = `${pointcloud.nodes.size} nodes`;
    }

    if (timestamp - cameraTimeTracker >= CAM_UPDATE_RATE) {
        sendCameraValues();
        cameraTimeTracker = timestamp;
    }

    // FPS
    
    frames ++;
    const time = performance.now();
    
    if ( time >= prevTime + 1000 ) {
        fps =  Math.round((frames * 1000)/(time - prevTime));
        document.getElementById("info-fps").innerHTML = `fps: ${fps}`;

        fps = 0;
        prevTime = time;
    }
      

    controls.update();
    requestAnimationFrame(animate);

    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(screenScene, orthoCamera);
}

animate();

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Initialize Websocket connection 
// We will put this in a WebWorker to avoid rendering interruption
const websocketWorker = new Worker("/workers/ws.js");
websocketWorker.postMessage({ t: "start", url: "ws://10.0.1.14:3000" });

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
            const bb = e.data.p;
            console.log("got initial bounding box = ", bb);
        
            // Build visually the bounding box
            const bb3 = new THREE.Box3(new THREE.Vector3().fromArray(bb.min), new THREE.Vector3().fromArray(bb.max));

            // Build a pretty infinite grid
            const grid = new InfiniteGridHelper(10, 100);

            grid.rotateX(Math.PI * 0.5);
            grid.position.z = bb3.min.z;

            scene.add( grid );

            const focus = bb3.getCenter(new THREE.Vector3());
            const vPosition = new THREE.Vector3(0.0, 0.0, 400).add(focus)


            camera.position.copy(vPosition);
            controls.target.copy(focus);
            controls.update();
            break;
    }
}
