const deg2rad = 0.017453292519943295;
const w84_F = 1/298.257223563;
const w84_A = 6378137.0;
const utmK0 = 0.9996;

export const lla2utm = (latDeg, lonDeg) => {
    let lat = latDeg;
    let lon = lonDeg;

    lat *= deg2rad;
    lon *= deg2rad;

    const zone = (((lonDeg + 180.0) / 6.0) + 1) >> 0;
    
    const lon0 = ((zone - 1) * 6 - 180 + 3) * deg2rad;

    const e2 = w84_F * (2 - w84_F);
    const ep2 = e2 / (1 - e2);

    const N = w84_A / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
    const T = Math.tan(lat) * Math.tan(lat);
    const C = ep2 * Math.cos(lat) * Math.cos(lat);
    const A = Math.cos(lat) * (lon - lon0);

    const M = w84_A * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * lat
        - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * lat)
        + (15 * e2 * e2 / 256 + 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * lat)
        - (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * lat));

    const easting = utmK0 * N * (A + (1 - T + C) * Math.pow(A,3)/6
                + (5 - 18*T + T*T + 72*C - 58*ep2) * Math.pow(A,5)/120) + 500000.0;

    let northing = utmK0 * (M + N * Math.tan(lat) * (A*A/2 + (5 - T + 9*C + 4*C*C) * Math.pow(A,4)/24
                + (61 - 58*T + T*T + 600*C - 330*ep2) * Math.pow(A,6)/720));

    if (latDeg < 0)
        northing += 10000000.0;

    return { x: easting, y : northing };
};