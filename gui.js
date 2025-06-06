import GUI from 'lil-gui';

const gui = new GUI({ title: 'Lidarweb - Options' });

const config = {
    nodeCount: 0,
    pointCount: 0,

    mode: 'Offline',

    quality: 'Medium',

    pointSizeStyle: 'Adaptive',
    pointSize: 2.0,

    edl: true,
    edlStrength: 0.5,
    edlRadius: 1.5,

    showBB: false
};

export const qualityConfig = {
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

export const buildGUI = function() {
    const stats = gui.addFolder('Stats');

    window.nodeCountGUI = stats.add(config, 'nodeCount', 0).name('Loaded nodes').disable();
    window.pointCountGUI = stats.add(config, 'pointCount', 0).name('Point count').disable();

    const mode = gui.addFolder('Mode');

    mode.add(config, 'mode', [ 'Offline', 'Realtime' ]).name('Mode').onChange(v => {
        
    });

    const appearance = gui.addFolder('Appearance');

    appearance.add(config, 'quality', [ 'Low', 'Medium', 'High', 'Extreme' ]).name('Quality').onChange(v => {
        window.PC_UPDATE_RATE = qualityConfig[config.quality].pcUpdateRate;
        window.CAM_UPDATE_RATE = qualityConfig[config.quality].camUpdateRate;
    });

    appearance.add(config, 'pointSizeStyle', [ 'Adaptive', 'Fixed' ]).name('Point Size').onChange(v => {
        if (v == 'Adaptive') {
            window.pointSizeGUI.hide();
            window.pointcloud.material.uniforms.fixedSize.value = 0.0;
        } else {
            window.pointSizeGUI.show();
            window.pointcloud.material.uniforms.fixedSize.value = config.pointSize;
        }
    });

    window.pointSizeGUI = appearance.add(config, 'pointSize', 2.0).name('Size').hide().onChange(v => {
        window.pointcloud.material.uniforms.fixedSize.value = v;
    });

    appearance.add(config, 'showBB', false).name('Show Bounding Boxes').onChange(v => {
        if (!v) {
            window.pointcloud.nodes.values().forEach(n => {
                if (n.b3h) {
                    window.scene.remove(n.b3h);
                }
            })
        } else {
            window.pointcloud.nodes.values().forEach(n => {
                if (n.b3h) {
                    window.scene.add(n.b3h);
                }
            })
        }
    });

    const edm = gui.addFolder('Eye-dome Lighting');

    edm.add(config, 'edl', true).name('Enable');

    edm.add(config, 'edlStrength', 0.5).min(0).max(10).name('Strength').onChange(v => {
        window.edl.params.strength = v;
        window.edl.updateUniforms();
    });

    edm.add(config, 'edlRadius', 1.5).min(0).max(10).name('Radius').onChange(v => {
        window.edl.params.radius = v;
        window.edl.updateUniforms();
    });
}