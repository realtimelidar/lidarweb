import * as THREE from 'three';

export default class EDL {
    constructor(viewportWidth, viewportHeight, cameraNear, cameraFar, radius, strength) {
        this.viewport = { width: viewportWidth, height: viewportHeight };
        this.camera = { near: cameraNear, far: cameraFar };
        this.params = { radius, strength };

        this.renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });

        this.renderTarget.depthTexture = new THREE.DepthTexture();
        this.renderTarget.depthTexture.type = THREE.FloatType;

        this.material = new THREE.ShaderMaterial({
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
                tColor: { value: this.renderTarget.texture },
                tDepth: { value: this.renderTarget.depthTexture },
                screenWidth: { value: window.innerWidth },
                screenHeight: { value: window.innerHeight },
                edlStrength: { value: config.edlStrength },
                edlRadius: { value: config.edlRadius },
                cameraNear: { value: camera.near },
                cameraFar: { value: camera.far }
            }
        });

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quad = new THREE.PlaneGeometry(2, 2);

        this.mesh = new THREE.Mesh(this.quad, this.material);
        this.scene = new THREE.Scene();

        this.scene.add(this.mesh);
    }

    updateUniforms() {
        this.material.uniforms.screenWidth.value = this.viewport.width;
        this.material.uniforms.screenHeight.value = this.viewport.height;

        this.material.uniforms.edlStrength.value = this.params.strength;
        this.material.uniforms.edlRadius.value = this.params.radius;
    }
}

