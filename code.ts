const selectedNodes = figma.currentPage.selection;

type FillableNode =
  | RectangleNode
  | EllipseNode
  | PolygonNode
  | StarNode
  | VectorNode
  | BooleanOperationNode
  | FrameNode;

interface Pos {
  x: number;
  y: number;
  sX: number;
  sY: number;
  rotation: number;
}

function isFillable(node: SceneNode): node is FillableNode {
  return node && "fills" in node;
}

const nodes = selectedNodes.filter(isFillable);

const img = nodes.reduce((main, node) => {
  if (node.fills[0]?.type !== "IMAGE") return main;
  if (isFillable(main)) {
    let mainSqr = main.width * main.height;
    let nodeSqr = node.width * node.height;
    return nodeSqr > mainSqr ? node : main;
  } else {
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

rects.forEach((rect) => copyFill(img, rect));
figma.notify(`✅ ${rects.length} slice(s) ready`);

// Make sure to close the plugin when you're done. Otherwise the plugin will
// keep running, which shows the cancel button at the bottom of the screen.
figma.closePlugin();

function copyFill(img: FillableNode, node: FillableNode) {
  const absoluteFillPos = addPosition(
    getNodePosition(img),
    getFillPosition(img)
  );
  const nodeFillPos = subPosition(getNodePosition(node), absoluteFillPos);

  let newFills = [
    {
      ...img.fills[0],
      scaleMode: "CROP",
      imageTransform: createFillTransform(img, node, nodeFillPos),
    },
  ];
  node.fills = newFills;
}

function getFillPosition(node: FillableNode): Pos {
  if (node.fills[0].scaleMode !== "CROP")
    return { x: 0, y: 0, sX: 1, sY: 1, rotation: 0 };
  const T = node.fills[0].imageTransform;

  const w = node.width;
  const h = node.height;
  const rotate = [
    [T[0][0], -(w / h) * T[0][1], 0],
    [-(h / w) * T[1][0], T[1][1], 0],
  ] as Transform;
  const translate = [
    [1, 0, -w * T[0][2]],
    [0, 1, -h * T[1][2]],
  ] as Transform;

  let [[a, b, x], [c, d, y]] = multiply(rotate, translate);

  let sX = 1 / (Math.sign(a) * Math.sqrt(a * a + c * c));
  let sY = 1 / (Math.sign(d) * Math.sqrt(b * b + d * d));
  let rad = Math.asin(b / sX);
  if (isNaN(rad)) {
    figma.notify(`⚠️ Scaled images are not supported`);
    figma.closePlugin();
  }

  let rotation = rad / (Math.PI / 180);
  return { x, y, sX, sY, rotation };
}

function getNodePosition(node: FillableNode): Pos {
  let [[a, b, x], [c, d, y]] = node.absoluteTransform;
  let sX = Math.sign(a) * Math.sqrt(a * a + c * c);
  let sY = Math.sign(d) * Math.sqrt(b * b + d * d);
  let rad = Math.asin(b / sX);
  let rotation = rad / (Math.PI / 180);
  return { x, y, sX, sY, rotation };
}

function getFillTransform(from: FillableNode, to: FillableNode): Transform {
  const T1 = from.fills[0].imageTransform;
  const w1 = from.width;
  const h1 = from.height;
  const w2 = to.width;
  const h2 = to.height;
  let sX = to.width / from.width;
  let sY = to.height / from.height;
  const scale = [
    [sX, 0, 0],
    [0, sY, 0],
  ] as Transform;
  const rotate = [
    [T1[0][0], (w1 / h1) * (h2 / w2) * T1[0][1], 0],
    [(h1 / w1) * (w2 / h2) * T1[1][0], T1[1][1], 0],
  ] as Transform;
  const translate = [
    [1, 0, (w1 * T1[0][2]) / w2],
    [0, 1, (h1 * T1[1][2]) / h2],
  ] as Transform;
  return multiply(scale, rotate, translate);
}

//  HELPERS

function multiply(...toMultiply: Transform[]): Transform {
  return toMultiply.reduce((t1, t2) => multiplyMatrices(t1, t2));
  function multiplyMatrices(m1: Transform, m2: Transform): Transform {
    if (!m1) return m2;
    if (!m2) return m1;
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
}

function rotate(
  cx: number,
  cy: number,
  x: number,
  y: number,
  angle: number
): [number, number] {
  let radians = (Math.PI / 180) * angle,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = cos * (x - cx) + sin * (y - cy) + cx,
    ny = cos * (y - cy) - sin * (x - cx) + cy;
  return [nx, ny];
}

function addPosition(pos1: Pos, pos2: Pos): Pos {
  const [x, y] = rotate(
    pos1.x,
    pos1.y,
    pos1.x + pos2.x,
    pos1.y + pos2.y,
    pos1.rotation
  );
  return {
    x,
    y,
    sX: 1,
    sY: 1,
    rotation: pos1.rotation + pos2.rotation,
  };
}

function subPosition(pos1: Pos, pos2: Pos): Pos {
  const [x, y] = rotate(0, 0, pos2.x - pos1.x, pos2.y - pos1.y, -pos1.rotation);

  return {
    x,
    y,
    sX: 1,
    sY: 1,
    rotation: pos1.rotation - pos2.rotation,
  };
}

function createFillTransform(
  img: FillableNode,
  node: FillableNode,
  pos: Pos
): Transform {
  let w = node.width;
  let h = node.height;
  const { x = 0, y = 0, rotation = 0 } = pos;
  const rad = rotation * (Math.PI / 180);

  let sX = node.width / img.width;
  let sY = node.height / img.height;

  const scale = [
    [sX, 0, 0],
    [0, sY, 0],
  ] as Transform;

  let rotate = [
    [Math.cos(rad), (h / w) * Math.sin(rad), 0],
    [-(w / h) * Math.sin(rad), Math.cos(rad), 0],
  ] as Transform;

  let translate = [
    [1, 0, x / -w],
    [0, 1, y / -h],
  ] as Transform;
  return multiply(scale, rotate, translate);
}
