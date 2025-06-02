import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Box3Helper } from "./utils/Box3Helper.js"
import { InfiniteGridHelper } from "./utils/InfiniteGridHelper.js"
import { Node, Pointcloud } from './pointcloud.js';
import { RadiationCloud, RadiationNode } from './radiation/discrete.js';
import { RawRadiationCloud } from './radiation/continuous.js';

import GUI from 'lil-gui';
import { ExampleData } from './radiation/continuous.js';

const gui = new GUI({ title: 'Lidarweb - Options' });

let CAM_UPDATE_RATE = 50;
let PC_UPDATE_RATE = 100;
let RAD_UPDATE_RATE = PC_UPDATE_RATE;

const config = {
    nodeCount: 0,
    pointCount: 0,

    quality: 'Medium',

    pointSizeStyle: 'Adaptive',
    pointSize: 2.0,

    edl: true,
    edlStrength: 0.5,
    edlRadius: 1.5,

    showBB: false
};

const qualityConfig = {
    'Low': {
        camMaxDistance: 5.0,
        pcUpdateRate: 500,
        camUpdateRate: 250,
    },

    'Medium': {
        camMaxDistance: 2.5,
        pcUpdateRate: 250,
        camUpdateRate: 250,
    },

    'High': {
        camMaxDistance: 1.5,
        pcUpdateRate: 100,
        camUpdateRate: 100,
    },

    'Extreme': {
        camMaxDistance: 0.1,
        pcUpdateRate: 0,
        camUpdateRate: 10,
    }
}

window.config = config;

function buildGUI() {
    const stats = gui.addFolder('Stats');

    window.nodeCountGUI = stats.add(config, 'nodeCount', 0).name('Loaded nodes').disable();
    window.pointCountGUI = stats.add(config, 'pointCount', 0).name('Point count').disable();

    const appearance = gui.addFolder('Appearance');

    appearance.add(config, 'quality', [ 'Low', 'Medium', 'High', 'Extreme' ]).name('Quality').onChange(v => {
        PC_UPDATE_RATE = qualityConfig[config.quality].pcUpdateRate;
        CAM_UPDATE_RATE = qualityConfig[config.quality].camUpdateRate;
    });

    appearance.add(config, 'pointSizeStyle', [ 'Adaptive', 'Fixed' ]).name('Point Size').onChange(v => {
        if (v == 'Adaptive') {
            window.pointSizeGUI.hide();
            pointcloud.material.uniforms.fixedSize.value = 0.0;
        } else {
            window.pointSizeGUI.show();
            pointcloud.material.uniforms.fixedSize.value = config.pointSize;
        }
    });

    window.pointSizeGUI = appearance.add(config, 'pointSize', 2.0).name('Size').hide().onChange(v => {
        pointcloud.material.uniforms.fixedSize.value = v;
    });

    appearance.add(config, 'showBB', false).name('Show Bounding Boxes').onChange(v => {
        if (!v) {
            pointcloud.nodes.values().forEach(n => {
                if (n.b3h) {
                    scene.remove(n.b3h);
                }
            })
        } else {
            pointcloud.nodes.values().forEach(n => {
                if (n.b3h) {
                    scene.add(n.b3h);
                }
            })
        }
    });

    const edm = gui.addFolder('Eye-dome Lighting');

    edm.add(config, 'edl', true).name('Enable');

    edm.add(config, 'edlStrength', 0.5).min(0).max(10).name('Strength').onChange(v => {
        edlMaterial.uniforms.edlStrength.value = v;
    });

    edm.add(config, 'edlRadius', 1.5).min(0).max(10).name('Radius').onChange(v => {
        edlMaterial.uniforms.edlRadius.value = v;
    });


}

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

window.rawRadiation = rawRadiation;

const t3points = new THREE.Points(pointcloud.geometry, pointcloud.material);
t3points.frustumCulled = false;

const radMesh = new THREE.Mesh(radiation.geometry, radiation.material);

scene.add(radMesh);
scene.add(t3points);

let lastCameraValue = "";

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
    websocketWorker.postMessage({ t: "send", msg: a, isJson: true });
}

const edlRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
});

edlRenderTarget.depthTexture = new THREE.DepthTexture();
edlRenderTarget.depthTexture.type = THREE.FloatType;

const edlOrthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const edlQuadGeo = new THREE.PlaneGeometry(2, 2);

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
        tColor: { value: edlRenderTarget.texture },
        tDepth: { value: edlRenderTarget.depthTexture },
        screenWidth: { value: window.innerWidth },
        screenHeight: { value: window.innerHeight },
        edlStrength: { value: config.edlStrength },
        edlRadius: { value: config.edlRadius },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far }
    }
});

const edlScreenQuad = new THREE.Mesh(edlQuadGeo, edlMaterial);
const edlScreenScene = new THREE.Scene();
edlScreenScene.add(edlScreenQuad);

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
        radiation.buildMergedGeometry();
        radMesh.geometry = radiation.geometry;

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

    renderer.setRenderTarget(edlRenderTarget);
    renderer.clear();
    renderer.render(scene, camera);

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(edlScreenScene, edlOrthoCamera);
}

animate();

window.addEventListener('resize', () => {
    edlRenderTarget.setSize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    edlMaterial.uniforms.screenWidth.value = window.innerWidth;
    edlMaterial.uniforms.screenHeight.value = window.innerHeight;
});

// Initialize Websocket connection 
// We will put this in a WebWorker to avoid rendering interruption
const websocketWorker = new Worker("/workers/ws.js");
websocketWorker.postMessage({ t: "start", url: "wss://lidarweb.adrian.cat/ws/" });

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

            setTimeout(() => {
                console.log("radiation...");

                //
                // DISCRETE
                //

                const bbSize = new THREE.Vector3();
                bb3.getSize(bbSize);

                const bbCenter = new THREE.Vector3();
                bb3.getCenter(bbCenter);

                const innerSize = bbSize.clone().multiplyScalar(0.5);
                const innerMin = bbCenter.clone().sub(innerSize.clone().multiplyScalar(0.5));
                const innerMax = bbCenter.clone().add(innerSize.clone().multiplyScalar(0.5));

                const innerBox = new THREE.Box3(innerMin, innerMax);

                function getRandomPointInBox(box) {
                    const min = box.min;
                    const max = box.max;
                    return new THREE.Vector3(
                        THREE.MathUtils.lerp(min.x, max.x, Math.random()),
                        THREE.MathUtils.lerp(min.y, max.y, Math.random()),
                        THREE.MathUtils.lerp(min.z, max.z, Math.random())
                    );
                }

                // setInterval(() => {
                //     console.log("new radiation!");
                //     const pos = getRandomPointInBox(innerBox);
                //     const value = Math.random() * 100;

                //     let node = new RadiationNode(
                //         pos.x, pos.y, pos.z, value
                //     );

                //     radiation.addNode(node);
                // }, 500);

                //
                // CONTINUOUS
                //

                const string = ExampleData;
                string.split("\n").forEach(line => {
                    const items = line.split(',');
                    const value = parseFloat(items[2]);
                    const pos = getRandomPointInBox(bb3);

                    rawRadiation.add(pos.x, pos.y, value);
                });

                const radWorker = new Worker('./workers/continuousRadiation.js');
                window.radWorker = radWorker;

                radWorker.onmessage = e => {
                    const { nodeId, resultBuffer } = e.data;
                    if (pointcloud.nodes.has(nodeId)) {
                        pointcloud.nodes.get(nodeId).setRadiation(resultBuffer);
                    }
                }

            }, 100);

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
