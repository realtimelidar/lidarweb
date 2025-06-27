import GUI from 'lil-gui';
import { lla2utm } from './utils/CoordinatesHelper';

const gui = new GUI({ title: 'Lidarweb - Options' });

const config = {
    nodeCount: 0,
    pointCount: 0,

    pointcloudMode: 'Realtime',
    radiationMode: 'Offline',
    showRadiation: true,

    quality: 'Medium',

    pointSizeStyle: 'Adaptive',
    pointSize: 2.0,

    edl: true,
    edlStrength: 0.5,
    edlRadius: 1.5,

    showBB: false,

    radThreshold: 0.4,
    radMaxValue: 100,
    hqPoints: false,

    loadLAS: function() {

    },

    loadN42: async function() {
        const fileHandler = await window.showDirectoryPicker({ mode: "read" });
        const reader = new FileReader();
        const fileQueue = [];

        // Setup radiation worker
        if (!window.radWorker) {
            const radWorker = new Worker('./workers/continuousRadiation.js');
            window.radWorker = radWorker;

            radWorker.onmessage = e => {
                const { nodeId, resultBuffer } = e.data;
                if (window.pointcloud.nodes.has(nodeId)) {
                    window.pointcloud.nodes.get(nodeId).setRadiation(resultBuffer);
                    window.pointcloud.needsRebuild = true;
                }
            }
        }

        reader.onload = () => {
            const text = reader.result;
            
            let lon, lat;
            {
                const lonIdx0 = text.indexOf("<LongitudeValue>");
                const lonIdx1 = text.indexOf("</LongitudeValue>");
                lon = parseFloat(text.substring(lonIdx0 + ("<LongitudeValue>").length, lonIdx1));

                const latIdx0 = text.indexOf("<LatitudeValue>");
                const latIdx1 = text.indexOf("</LatitudeValue>");
                lat = parseFloat(text.substring(latIdx0 + ("<LatitudeValue>").length, latIdx1));
            }

            let val;
            {
                const valIdx0  = text.indexOf("<AmbientDoseEquivalentRateValue_1m>");
                const valIdx1 = text.indexOf("</AmbientDoseEquivalentRateValue_1m>");
                val = parseFloat(text.substring(valIdx0 + ("<AmbientDoseEquivalentRateValue_1m>").length, valIdx1));
            }

            {
                let { x, y } = lla2utm(lat, lon);

                x -= window.visualOffset.x;
                y -= window.visualOffset.y;

                window.rawRadiation.add(x, y, val);
            }

            if (fileQueue.length > 0) {
                reader.readAsText(fileQueue.shift());
            } else {
                window.pointcloud.nodes.values().forEach(n => {
                    n.updateRadiation();
                })
            }
        };

        for await (const entry of fileHandler.values()) {
            if (entry.kind == "file" && entry.name.endsWith(".n42")) {
                const file = await entry.getFile();
                fileQueue.push(file);
            }
        }

        reader.readAsText(fileQueue.shift());

    }
};

export const qualityConfig = {
    'Low': {
        camMaxDistance: 5.0,
        pcUpdateRate: 500,
        camUpdateRate: 250,
    },

    'Medium': {
        camMaxDistance: 3.0,
        pcUpdateRate: 300,
        camUpdateRate: 200,
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

    mode.add(config, 'pointcloudMode', [ 'Offline', 'Realtime' ]).name('Pointcloud Mode').onChange(v => {
        window.pointcloud.removeAllNodes();

        if (v == 'Offline') {
            loadLASGUI.show();

            if (window.websocketWorker != null) {
                window.websocketWorker.terminate();
                window.websocketWorker = null;
            }
        } else {
            loadLASGUI.hide();

            if (!window.websocketWorker) {
                window.initRealtime();
            }
        }
    });

    window.loadLASGUI = mode.add(config, 'loadLAS').name('Load LAS file').hide();

    mode.add(config, 'radiationMode', [ 'Offline', 'Realtime', 'Hidden' ]).name('Radiation Mode').onChange(v => {
        if (v == 'Offline') {
            loadN42GUI.show();
        } else {
            loadN42GUI.hide();
        }
    });

    mode.add(config, 'showRadiation', true).name("Show radiation").onChange(v => {
        if (v) {
            pointcloud.material.uniforms.gradientShow.value = 1.0;
        } else {
            pointcloud.material.uniforms.gradientShow.value = 0.0;
        }
    });

    window.loadN42GUI = mode.add(config, 'loadN42').name('Load N42 files');

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

    appearance.add(config, 'hqPoints', false).name('High Quality Points').onChange(v => {
        if (v) {
            window.pointcloud.material.uniforms.hqPoints.value = 1.0;
        } else {
            window.pointcloud.material.uniforms.hqPoints.value = 0.0;
        }
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

    const rad = gui.addFolder("Radiation");

    rad.add(config, 'radThreshold', 0.4).min(0).max(1).name("Threshold").onChange(v => {
        pointcloud.material.uniforms.gradientThreshold.value = v;
    });

    rad.add(config, 'radMaxValue', 100).min(1).name('Maximum').onChange(v => {
        pointcloud.material.uniforms.gradientMaxValue.value = v;
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