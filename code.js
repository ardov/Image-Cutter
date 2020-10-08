const selectedNodes = figma.currentPage.selection;
function isFillable(node) {
    return node && "fills" in node;
}
const nodes = selectedNodes.filter(isFillable);
console.log(nodes);
const img = nodes.reduce((main, node) => {
    var _a;
    if (((_a = node.fills[0]) === null || _a === void 0 ? void 0 : _a.type) !== "IMAGE")
        return main;
    if (isFillable(main)) {
        let mainSqr = main.width * main.height;
        let nodeSqr = node.width * node.height;
        return nodeSqr > mainSqr ? node : main;
    }
    else {
        return node;
    }
}, null);
if (!img) {
    figma.notify(`⚠️ No image selected`);
    figma.closePlugin();
}
// TODO: Check overlapping
const rects = nodes.filter((node) => node.id !== img.id);
if (!rects.length) {
    figma.notify(`⚠️ Select shapes over the image`);
    figma.closePlugin();
}
console.log(img);
rects.forEach((rect) => {
    console.log(getImageTransform(img, rect));
    let newFills = [
        Object.assign(Object.assign({}, img.fills[0]), { imageTransform: affine(img, rect), scaleMode: "CROP" }),
    ];
    rect.fills = newFills;
});
figma.notify(`✅ ${rects.length} slice(s) ready`);
function getImageTransform(img, shape) {
    const imgMatrix = getImgMatrix(img);
    const shapeMatrix = shape.relativeTransform;
    console.log(imgMatrix);
    console.log(shapeMatrix);
    return multiplyTransforms(shapeMatrix, imgMatrix);
}
function affine(from, to) {
    let sX = to.width / from.width;
    let sY = to.height / from.height;
    let tX = (to.x - from.x) / from.width;
    let tY = (to.y - from.y) / from.height;
    return [
        [sX, 0, tX],
        [0, sY, tY],
    ];
}
function multiplyTransforms(m1, m2) {
    const a = [...m1, [0, 0, 1]];
    const b = [...m2, [0, 0, 1]];
    const m = new Array(a.length);
    for (let row = 0; row < a.length; row++) {
        m[row] = new Array(b[0].length);
        for (let column = 0; column < b[0].length; column++) {
            m[row][column] = 0;
            for (let i = 0; i < a[0].length; i++) {
                m[row][column] += a[row][i] * b[i][column];
            }
        }
    }
    return [m[0], m[1]];
}
function getImgMatrix(node) {
    let w = node.width;
    let h = node.height;
    let m = node.fills[0].imageTransform;
    let imgM = [
        [m[0][0], m[0][1], m[0][2] * w],
        [m[1][0], m[1][1], m[1][2] * h],
    ];
    console.log(imgM);
    console.log(node.relativeTransform);
    return multiplyTransforms(imgM, node.relativeTransform);
}
// Make sure to close the plugin when you're done. Otherwise the plugin will
// keep running, which shows the cancel button at the bottom of the screen.
figma.closePlugin();
