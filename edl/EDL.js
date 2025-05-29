import { EDLMaterial } from "./EDLMaterial";

export class EDL {
    constructor(rootRenderer) {
        this.rootRenderer = rootRenderer;

        this.material = null;
    }

    init() {
        if (this.material != null) {
            return;
        }

        this.material = new EDLMaterial();
        this.material.depthTest = true;
		this.material.depthWrite = true;
		this.material.transparent = true;

        this.renderTargetEDL = new THREE.WebGLRenderTarget(1024, 1024, {
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			depthTexture: new THREE.DepthTexture(undefined, undefined, THREE.UnsignedIntType)
		});

		this.renderTargetRegular = new THREE.WebGLRenderTarget(1024, 1024, {
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			depthTexture: new THREE.DepthTexture(undefined, undefined, THREE.UnsignedIntType)
		});
    }

    resize(width, height) {
		this.renderTargetEDL.setSize(width, height);
		this.renderTargetRegular.setSize(width, height);
	}

    clearTargets() {
		const oldTarget = this.rootRenderer.getRenderTarget();

		renderer.setRenderTarget( this.renderTargetEDL );
		renderer.clear( true, true, true );

		renderer.setRenderTarget( this.renderTargetRegular );
		renderer.clear( true, true, false );

		renderer.setRenderTarget(oldTarget);
	}

    clear() {
		this.init();
        this.rootRenderer.setClearColor(0x000000, 0);
		this.rootRenderer.clear();
		this.clearTargets();
	}

    
}