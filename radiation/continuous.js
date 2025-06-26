//
// What we have: Discrete radiation counts values per x-y values
// What we want: Make a color gradient for the point cloud to visualize
//               the radiation in a continuous form.
//

export class RawRadiationNode {
    constructor(x, y, value) {
        this.x = x;
        this.y = y;
        this.value = value;
    }
}

export class RawRadiationCloud {
    constructor() {
        this.data = [];
    }

    add(x, y, value) {
        this.data.push(new RawRadiationNode(x, y, value));
    }

    clear() {
        this.data.length = 0;
    }
}