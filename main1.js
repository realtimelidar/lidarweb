import * as THREE from 'three';

import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'


let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 10000);
camera.position.set(0, 0, 100);

let renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

let controls = new OrbitControls(camera, renderer.domElement);

// Setup WebGL context
const gl = renderer.getContext();

// Shaders
const vsSource = `
attribute vec3 position;
attribute vec3 color;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float screenWidth;
uniform float spacing;

varying vec3 vColor;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = -mvPosition.z;
    float pointSize = screenWidth * spacing / dist;
    gl_PointSize = pointSize;
    gl_Position = projectionMatrix * mvPosition;
    vColor = color / 255.0;
}
`;

const fsSource = `
precision mediump float;
varying vec3 vColor;

void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, 1.0);
}
`;

function compileShader(src, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

const vertexShader = compileShader(vsSource, gl.VERTEX_SHADER);
const fragmentShader = compileShader(fsSource, gl.FRAGMENT_SHADER);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
}

// Setup buffers
const maxPoints = 10000;
const positions = new Float32Array([
    0, 0, 0,
    10, 0, 0,
    0, 10, 0,
    0, 0, 10
]);
const colors = new Uint8Array([
    255, 0, 0,
    0, 255, 0,
    0, 0, 255,
    255, 255, 0
]);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

const colorBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);

function render() {
    requestAnimationFrame(render);

    controls.update();
    renderer.clear();

    gl.useProgram(program);

    const projLoc = gl.getUniformLocation(program, "projectionMatrix");
    const mvLoc = gl.getUniformLocation(program, "modelViewMatrix");
    const screenWidthLoc = gl.getUniformLocation(program, "screenWidth");
    const spacingLoc = gl.getUniformLocation(program, "spacing");

    gl.uniformMatrix4fv(projLoc, false, camera.projectionMatrix.elements);
    const mv = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, new THREE.Matrix4());
    gl.uniformMatrix4fv(mvLoc, false, mv.elements);
    gl.uniform1f(screenWidthLoc, renderer.domElement.clientWidth);
    gl.uniform1f(spacingLoc, 1.0);

    const posLoc = gl.getAttribLocation(program, "position");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    const colLoc = gl.getAttribLocation(program, "color");
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colLoc);
    gl.vertexAttribPointer(colLoc, 3, gl.UNSIGNED_BYTE, true, 0, 0);

    gl.drawArrays(gl.POINTS, 0, positions.length / 3);

    gl.disableVertexAttribArray(posLoc);
    gl.disableVertexAttribArray(colLoc);
}

render();
