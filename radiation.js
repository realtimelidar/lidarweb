export class RadiationNode {
    constructor(x, y, z, value) {
        this.position = new Float32Array([ x, y, z ]);
        this.value = value;
    }
}

export class RadiationCloud {
    constructor() {
        this.id = Node.getNodeId({ pos: { x, y, z } });

        this.data = [];

        this.material = new THREE.ShaderMaterial({
            transparent: false,

            vertexShader: `
            precision highp float;

            attribute vec3 color;

            varying vec3 vColor;

            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

                float minSize = 2.0;
                float maxSize = 30.0;
                float minDistance = 100.0;
                float maxDistance = 5.0;

                float distance = abs(mvPosition.z);
                float t = clamp((distance - maxDistance) / (minDistance - maxDistance), 0.0, 1.0);
                t = 1.0 - t;

                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = mix(minSize, maxSize, t);
            }
            `,
            fragmentShader: `
            precision highp float;

            varying vec3 vColor;
            void main() {
                gl_FragColor = vec4(vColor, 1.0);
                gl_FragColor = vec4(1,0, 0.0, 0.0, 1.0);
                return;
            }
            `,
        });

        /* Merged geometry of all inner nodes */
        /* Initially set to a dummy geometr */
        this.dummyGeometry = new THREE.BufferGeometry();
        this.geometry = this.dummyGeometry;
    }

    dispose() {
        if (this.geometry) {
            this.geometry.dispose();
        }
    }
}