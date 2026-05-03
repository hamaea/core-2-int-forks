// Your file names (must be in the same folder as this HTML)
const NODES_FILE = "./NODES.json";
const CHOICES_FILE = "./CHOICES.json";

// Data stores
let nodesById = {};
let choicesByParent = {};
let currentNodeId = "A01"; // start here (canon)

// Path recording for end summary
let path = []; // [{ nodeId, text, chosenLabel }]
let lastChoiceLabel = null;
let asciiColumns = 0;
let asciiRows = 0;
let asciiCellWidth = 8;
let asciiCellHeight = 12;
let asciiPointer = null;
let asciiFramePending = false;
let focusBoxProgress = 0;
let focusBoxTarget = 0;
let asciiCtx = null;
let asciiViewportWidth = 0;
let asciiViewportHeight = 0;
let focusBoxOrigin = null;
let previousAsciiPointer = null;
let narrativeMergeProgress = 0;
let landingStoryCells = new Map();

const ASCII_BASE_CHAR = ".";
const ASCII_MIN_COLUMNS = 40;
const ASCII_MIN_ROWS = 30;
const ASCII_RING_RADIUS = 3.7;
const ASCII_RING_THICKNESS = 0.22;
const ASCII_BOX_PADDING_X = 1.5;
const ASCII_BOX_PADDING_Y = 1.1;
const ASCII_BOX_BORDER_THICKNESS = 0.36;
const ASCII_FOCUS_ANIMATION_SPEED = 8;
const ASCII_TEXT_BOX_PADDING_X = 1.25;
const ASCII_TEXT_BOX_PADDING_TOP = 0.05;
const ASCII_TEXT_BOX_PADDING_BOTTOM = 0.45;
const ASCII_COLOR = "rgba(255, 255, 255, 0.88)";
const ASCII_LANDING_STORY_COLOR = "rgba(255, 74, 51, 0.96)";
const ASCII_COLLAPSE_START = 0.78;

// DOM refs (landing)
const landingViewEl = document.getElementById("landingView");
const asciiFieldEl = document.getElementById("asciiField");
const enterBtn = document.getElementById("enterBtn");

// DOM refs (reader)
const nodeIdEl = document.getElementById("nodeId");
const nodeTypeEl = document.getElementById("nodeType");
const nodeTextEl = document.getElementById("nodeText");
const choicesEl = document.getElementById("choices");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

// DOM refs (views + summary)
const readerViewEl = document.getElementById("readerView");
const summaryViewEl = document.getElementById("summaryView");
const summaryScrollEl = document.getElementById("summaryScroll");
const restartBtn = document.getElementById("restartBtn");

function buildAsciiField() {
  if (!asciiFieldEl) return;

  const width = window.innerWidth || 1440;
  const height = window.innerHeight || 900;
  measureAsciiMetrics();
  const dpr = window.devicePixelRatio || 1;

  asciiViewportWidth = width;
  asciiViewportHeight = height;
  asciiFieldEl.width = Math.round(width * dpr);
  asciiFieldEl.height = Math.round(height * dpr);
  asciiCtx = asciiFieldEl.getContext("2d");
  asciiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  asciiCtx.textAlign = "center";
  asciiCtx.textBaseline = "middle";
  asciiCtx.fillStyle = ASCII_COLOR;
  asciiCtx.font = getAsciiFont();

  asciiColumns = Math.max(ASCII_MIN_COLUMNS, Math.ceil(width / asciiCellWidth));
  asciiRows = Math.max(ASCII_MIN_ROWS, Math.ceil(height / asciiCellHeight));
  landingStoryCells = new Map();

  renderAsciiField();
}

function measureAsciiMetrics() {
  if (!asciiFieldEl) return;
  const bodyStyles = window.getComputedStyle(document.body);

  const probe = document.createElement("span");
  probe.textContent = ". ";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  probe.style.font = bodyStyles.font;
  probe.style.letterSpacing = bodyStyles.letterSpacing;
  document.body.appendChild(probe);

  const probeRect = probe.getBoundingClientRect();
  const lineHeight = parseFloat(bodyStyles.lineHeight);

  asciiCellWidth = probeRect.width || 8;
  asciiCellHeight = lineHeight || 12;

  probe.remove();
}

function getAsciiFont() {
  const computed = window.getComputedStyle(document.body);
  return `${computed.fontSize} ${computed.fontFamily}`;
}

function queueAsciiRender() {
  if (asciiFramePending) return;

  asciiFramePending = true;
  window.requestAnimationFrame(() => {
    asciiFramePending = false;
    renderAsciiField();
  });
}

function renderAsciiField() {
  if (!asciiFieldEl || !asciiColumns || !asciiRows || !asciiCtx) return;

  asciiCtx.clearRect(0, 0, asciiViewportWidth, asciiViewportHeight);
  asciiCtx.fillStyle = ASCII_COLOR;
  asciiCtx.font = getAsciiFont();

  const centerOffsetX = asciiCellWidth * 0.5;
  const centerOffsetY = asciiCellHeight * 0.5;
  const textRect = getNarrativeRect();
  const textFullRect = textRect ? expandRectAsymmetric(
    textRect,
    asciiCellWidth * ASCII_TEXT_BOX_PADDING_X,
    asciiCellWidth * ASCII_TEXT_BOX_PADDING_X,
    asciiCellHeight * ASCII_TEXT_BOX_PADDING_TOP,
    asciiCellHeight * ASCII_TEXT_BOX_PADDING_BOTTOM
  ) : null;
  const activeRect = getActiveInteractiveRect();
  const choiceBaseRect = activeRect ? getChoiceFullRect(activeRect) : null;
  const choiceFullRect = (focusBoxProgress > 0 && choiceBaseRect)
    ? (focusBoxProgress >= ASCII_COLLAPSE_START
        ? choiceBaseRect
        : getAnimatedBoxRectFromRect(choiceBaseRect, focusBoxProgress, focusBoxOrigin))
    : null;
  const circleCollapseProgress = getCircleCollapseProgress(
    Math.max(focusBoxProgress, narrativeMergeProgress)
  );
  const sceneShapes = getSceneShapes(
    textFullRect,
    choiceFullRect,
    circleCollapseProgress
  );
  const boundaryThreshold = asciiCellHeight * ASCII_RING_THICKNESS;

  for (let row = 0; row < asciiRows; row += 1) {
    for (let col = 0; col < asciiColumns; col += 1) {
      let char = ASCII_BASE_CHAR;
      let color = ASCII_COLOR;
      const cellCenterX = (col * asciiCellWidth) + centerOffsetX;
      const cellCenterY = (row * asciiCellHeight) + centerOffsetY;
      const sceneSample = getSceneSample(cellCenterX, cellCenterY, sceneShapes);

      if (sceneSample.distance < -boundaryThreshold) {
        char = " ";
      } else if (Math.abs(sceneSample.distance) <= boundaryThreshold) {
        char = getMergedBoundaryCharacter(cellCenterX, cellCenterY, sceneShapes, sceneSample.shape);
      } else {
        char = ASCII_BASE_CHAR;
      }

      const landingStoryCell = getLandingStoryCell(row, col);
      if (landingStoryCell) {
        char = landingStoryCell.char;
        color = landingStoryCell.color;
      }

      drawAsciiChar(char, cellCenterX, cellCenterY, color);
    }
  }
}

function buildLandingArtCells() {
  const cells = new Map();
  if (!landingArtText.trim()) return cells;

  const lines = landingArtText.split(/\r?\n/);
  const keepChar = (char) => char && char !== " " && char !== "." && char !== ":";
  const rows = [];

  for (const line of lines) {
    const kept = [];
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (keepChar(char)) {
        kept.push([index, char]);
      }
    }
    rows.push(kept);
  }

  const visibleRows = rows
    .map((entries, rowIndex) => ({ rowIndex, entries }))
    .filter((row) => row.entries.length > 0);

  if (visibleRows.length === 0) return cells;

  const minRow = visibleRows[0].rowIndex;
  const maxRow = visibleRows[visibleRows.length - 1].rowIndex;
  let minCol = Infinity;
  let maxCol = -Infinity;

  for (const row of visibleRows) {
    for (const [col] of row.entries) {
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
    }
  }

  const sampleX = 2;
  const sampleY = 2;
  const offsetCol = -8;
  const offsetRow = Math.max(2, Math.round(asciiRows * 0.11));

  for (const { rowIndex, entries } of visibleRows) {
    if ((rowIndex - minRow) % sampleY !== 0) continue;

    const targetRow = offsetRow + Math.floor((rowIndex - minRow) / sampleY);
    if (targetRow < 0 || targetRow >= asciiRows) continue;

    for (const [sourceCol, char] of entries) {
      if ((sourceCol - minCol) % sampleX !== 0) continue;

      const targetCol = offsetCol + Math.floor((sourceCol - minCol) / sampleX);
      if (targetCol < 0 || targetCol >= asciiColumns) continue;

      cells.set(`${targetRow}:${targetCol}`, {
        char,
        color: ASCII_LANDING_STORY_COLOR
      });
    }
  }

  return cells;
}

function sampleCurve(points, samplesPerSegment) {
  if (points.length < 2) return points.slice();
  const sampled = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] || p2;

    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      sampled.push(catmullRomPoint(p0, p1, p2, p3, t));
    }
  }

  sampled.push(points[points.length - 1]);
  return sampled;
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      ((2 * p0.x) - (5 * p1.x) + (4 * p2.x) - p3.x) * t2 +
      ((-p0.x) + (3 * p1.x) - (3 * p2.x) + p3.x) * t3
    ),
    y: 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      ((2 * p0.y) - (5 * p1.y) + (4 * p2.y) - p3.y) * t2 +
      ((-p0.y) + (3 * p1.y) - (3 * p2.y) + p3.y) * t3
    )
  };
}

function getLandingStoryCell(row, col) {
  return null;
}

function getSceneShapes(textFullRect, choiceFullRect, circleCollapseProgress) {
  const shapes = [];

  if (textFullRect) {
    shapes.push({ kind: "rect", rect: textFullRect });
  }

  if (choiceFullRect) {
    shapes.push({ kind: "rect", rect: choiceFullRect });
  }

  if (asciiPointer && circleCollapseProgress < 0.999) {
    shapes.push({
      kind: "circle",
      x: asciiPointer.x,
      y: asciiPointer.y,
      radius: (ASCII_RING_RADIUS * asciiCellHeight) * (1 - circleCollapseProgress)
    });
  }

  return shapes;
}

function getCircleCollapseProgress(mergeProgress) {
  if (mergeProgress <= ASCII_COLLAPSE_START) return 0;
  return Math.max(0, Math.min(1, (mergeProgress - ASCII_COLLAPSE_START) / (1 - ASCII_COLLAPSE_START)));
}

function getSceneSample(x, y, shapes) {
  if (shapes.length === 0) {
    return { distance: Infinity, shape: null };
  }

  let minDistance = Infinity;
  let minShape = null;

  for (const shape of shapes) {
    const distance = getShapeSignedDistance(x, y, shape);
    if (distance < minDistance) {
      minDistance = distance;
      minShape = shape;
    }
  }

  return { distance: minDistance, shape: minShape };
}

function getShapeSignedDistance(x, y, shape) {
  if (shape.kind === "circle") {
    return Math.hypot(x - shape.x, y - shape.y) - shape.radius;
  }

  const cx = (shape.rect.left + shape.rect.right) * 0.5;
  const cy = (shape.rect.top + shape.rect.bottom) * 0.5;
  const hx = (shape.rect.right - shape.rect.left) * 0.5;
  const hy = (shape.rect.bottom - shape.rect.top) * 0.5;
  const qx = Math.abs(x - cx) - hx;
  const qy = Math.abs(y - cy) - hy;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const outside = Math.hypot(ox, oy);
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside;
}

function getMergedBoundaryCharacter(x, y, shapes, nearestShape) {
  if (nearestShape?.kind === "rect") {
    const rectChar = getRectBoundaryCharacter(x, y, nearestShape.rect);
    if (rectChar) return rectChar;
  }

  const epsilon = Math.max(1, asciiCellHeight * 0.35);
  const dx = getSceneSample(x + epsilon, y, shapes).distance - getSceneSample(x - epsilon, y, shapes).distance;
  const dy = getSceneSample(x, y + epsilon, shapes).distance - getSceneSample(x, y - epsilon, shapes).distance;
  const angle = Math.atan2(dy, dx);
  return getRingCharacter(angle);
}

function getRectBoundaryCharacter(x, y, rect) {
  const edgeThreshold = Math.max(asciiCellWidth, asciiCellHeight) * 0.6;
  const cornerThreshold = Math.max(asciiCellWidth, asciiCellHeight) * 0.8;
  const nearLeft = Math.abs(x - rect.left) <= edgeThreshold;
  const nearRight = Math.abs(x - rect.right) <= edgeThreshold;
  const nearTop = Math.abs(y - rect.top) <= edgeThreshold;
  const nearBottom = Math.abs(y - rect.bottom) <= edgeThreshold;

  const corners = [
    [rect.left, rect.top],
    [rect.right, rect.top],
    [rect.left, rect.bottom],
    [rect.right, rect.bottom]
  ];

  const nearCorner = corners.some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= cornerThreshold);
  if (nearCorner) return "+";
  if (nearTop || nearBottom) return "-";
  if (nearLeft || nearRight) return "|";
  return null;
}

function updateAsciiPointer(clientX, clientY) {
  previousAsciiPointer = asciiPointer ? { ...asciiPointer } : null;
  asciiPointer = {
    x: clientX,
    y: clientY
  };
  refreshAsciiInteraction();
  queueAsciiRender();
}

function clearAsciiPointer() {
  if (!asciiPointer) return;
  asciiPointer = null;
  setFocusBoxTarget(0);
  focusBoxOrigin = null;
  narrativeMergeProgress = 0;
  queueAsciiRender();
}

function drawAsciiChar(char, x, y, color = ASCII_COLOR) {
  if (!asciiCtx || char === " ") return;
  asciiCtx.fillStyle = color;
  asciiCtx.fillText(char, x, y);
}

function getCircleCharacter(cellCenterX, cellCenterY, circleProgress) {
  const dx = cellCenterX - asciiPointer.x;
  const dy = cellCenterY - asciiPointer.y;
  const distance = Math.sqrt((dx * dx) + (dy * dy)) / asciiCellHeight;
  const angle = Math.atan2(dy, dx);
  const radius = ASCII_RING_RADIUS * circleProgress;
  const thickness = ASCII_RING_THICKNESS;

  if (radius <= 0) return null;

  if (distance < radius - thickness) {
    return " ";
  }

  if (Math.abs(distance - radius) <= thickness) {
    return getRingCharacter(angle);
  }

  return null;
}

function getBoxCharacter(col, row, boxRect) {
  if (
    col < boxRect.leftCol ||
    col > boxRect.rightCol ||
    row < boxRect.topRow ||
    row > boxRect.bottomRow
  ) {
    return null;
  }

  const nearLeft = col === boxRect.leftCol;
  const nearRight = col === boxRect.rightCol;
  const nearTop = row === boxRect.topRow;
  const nearBottom = row === boxRect.bottomRow;

  if ((nearTop && nearLeft) || (nearBottom && nearRight)) {
    return "+";
  }

  if ((nearTop && nearRight) || (nearBottom && nearLeft)) {
    return "+";
  }

  if (nearTop || nearBottom) {
    return "-";
  }

  if (nearLeft || nearRight) {
    return "|";
  }

  return " ";
}

function getRingCharacter(angle) {
  const degrees = (angle * 180) / Math.PI;
  const normalized = (degrees + 360) % 360;

  if ((normalized >= 345 && normalized <= 360) || (normalized >= 0 && normalized < 15)) {
    return "|";
  }

  if (normalized >= 15 && normalized < 55) {
    return "\\";
  }

  if (normalized >= 55 && normalized < 125) {
    return "_";
  }

  if (normalized >= 125 && normalized < 165) {
    return "/";
  }

  if (normalized >= 165 && normalized < 195) {
    return "|";
  }

  if (normalized >= 195 && normalized < 235) {
    return "\\";
  }

  if (normalized >= 235 && normalized < 305) {
    return "_";
  }

  return "/";
}

function getActiveInteractiveRect() {
  const visibleButtons = [];

  if (readerViewEl.style.display !== "none") {
    visibleButtons.push(...Array.from(choicesEl.querySelectorAll("button.choice")));
  } else if (landingViewEl.style.display !== "none" && enterBtn) {
    visibleButtons.push(enterBtn);
  } else if (summaryViewEl.style.display !== "none" && restartBtn) {
    visibleButtons.push(restartBtn);
  }

  const rects = visibleButtons
    .filter(isElementVisible)
    .map((element) => element.getBoundingClientRect());

  if (rects.length === 0) {
    return null;
  }

  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom))
  };
}

function getNarrativeRect() {
  if (readerViewEl.style.display !== "none" && nodeTextEl.textContent.trim()) {
    return nodeTextEl.getBoundingClientRect();
  }

  if (landingViewEl.style.display !== "none") {
    const landingCopyText = document.querySelector(".landing-copy-text");
    if (landingCopyText) return landingCopyText.getBoundingClientRect();
  }

  if (summaryViewEl.style.display !== "none" && summaryScrollEl.textContent.trim()) {
    return summaryScrollEl.getBoundingClientRect();
  }

  return null;
}

function isElementVisible(element) {
  if (!element) return false;
  const styles = window.getComputedStyle(element);
  return styles.display !== "none" && styles.visibility !== "hidden";
}

function refreshAsciiInteraction() {
  const circleRadius = ASCII_RING_RADIUS * asciiCellHeight;

  if (!asciiPointer) {
    setFocusBoxTarget(0);
    focusBoxOrigin = null;
    narrativeMergeProgress = 0;
    return;
  }

  const activeRect = getActiveInteractiveRect();
  const choiceTriggerRect = activeRect ? getChoiceTriggerRect(activeRect) : null;
  const choiceFullRect = activeRect ? getChoiceFullRect(activeRect) : null;
  if (!activeRect || !choiceTriggerRect || !choiceFullRect) {
    setFocusBoxTarget(0);
    focusBoxOrigin = null;
  } else {
    const choiceProgress = getChoiceMergeProgress(
      asciiPointer.x,
      asciiPointer.y,
      circleRadius,
      choiceTriggerRect,
      choiceFullRect
    );
    const choiceTouched = choiceProgress > 0;

    if (choiceTouched && (!previousAsciiPointer || !circleTouchesRect(previousAsciiPointer.x, previousAsciiPointer.y, circleRadius, choiceTriggerRect))) {
      focusBoxOrigin = getEntryPoint(previousAsciiPointer, asciiPointer, choiceTriggerRect);
    }

    if (!choiceTouched) {
      focusBoxOrigin = null;
      setFocusBoxTarget(0);
    } else {
      setFocusBoxTarget(choiceProgress);
    }
  }

  const narrativeRect = getNarrativeRect();
  const narrativeFullRect = narrativeRect ? expandRectAsymmetric(
    narrativeRect,
    asciiCellWidth * ASCII_TEXT_BOX_PADDING_X,
    asciiCellWidth * ASCII_TEXT_BOX_PADDING_X,
    asciiCellHeight * ASCII_TEXT_BOX_PADDING_TOP,
    asciiCellHeight * ASCII_TEXT_BOX_PADDING_BOTTOM
  ) : null;
  narrativeMergeProgress = narrativeFullRect
    ? getRectMergeProgress(asciiPointer.x, asciiPointer.y, circleRadius, narrativeFullRect)
    : 0;
}

function pointInRect(pointX, pointY, rect) {
  return pointX >= rect.left && pointX <= rect.right && pointY >= rect.top && pointY <= rect.bottom;
}

function distanceFromPointToRect(pointX, pointY, rect) {
  const nearestX = Math.max(rect.left, Math.min(pointX, rect.right));
  const nearestY = Math.max(rect.top, Math.min(pointY, rect.bottom));
  const dx = pointX - nearestX;
  const dy = pointY - nearestY;
  return Math.sqrt((dx * dx) + (dy * dy));
}

function getAnimatedBoxRectFromRect(fullRect, progress, originPoint) {
  const eased = 1 - ((1 - progress) * (1 - progress));
  const origin = originPoint || {
    x: (fullRect.left + fullRect.right) * 0.5,
    y: (fullRect.top + fullRect.bottom) * 0.5
  };

  return {
    left: lerp(origin.x, fullRect.left, eased),
    top: lerp(origin.y, fullRect.top, eased),
    right: lerp(origin.x, fullRect.right, eased),
    bottom: lerp(origin.y, fullRect.bottom, eased)
  };
}

function expandRect(rect, padX, padY) {
  return {
    left: rect.left - padX,
    top: rect.top - padY,
    right: rect.right + padX,
    bottom: rect.bottom + padY
  };
}

function expandRectAsymmetric(rect, padLeft, padRight, padTop, padBottom) {
  return {
    left: rect.left - padLeft,
    top: rect.top - padTop,
    right: rect.right + padRight,
    bottom: rect.bottom + padBottom
  };
}

function getChoiceFullRect(rect) {
  return expandRect(
    rect,
    asciiCellWidth * 1.3,
    asciiCellHeight * 0.95
  );
}

function getChoiceTriggerRect(rect) {
  return expandRect(
    getChoiceFullRect(rect),
    asciiCellWidth * 1.05,
    asciiCellHeight * 0.8
  );
}

function getGridBoxRect(rect) {
  const leftCol = Math.max(0, Math.floor(rect.left / asciiCellWidth));
  const rightCol = Math.min(asciiColumns - 1, Math.ceil(rect.right / asciiCellWidth) - 1);
  const topRow = Math.max(0, Math.floor(rect.top / asciiCellHeight));
  const bottomRow = Math.min(asciiRows - 1, Math.ceil(rect.bottom / asciiCellHeight) - 1);

  return { leftCol, rightCol, topRow, bottomRow };
}

function getEntryPoint(previousPoint, currentPoint, rect) {
  if (!previousPoint) {
    return {
      x: clamp(currentPoint.x, rect.left, rect.right),
      y: clamp(currentPoint.y, rect.top, rect.bottom)
    };
  }

  const intersections = [];
  const deltaX = currentPoint.x - previousPoint.x;
  const deltaY = currentPoint.y - previousPoint.y;

  const candidates = [
    { edge: "left", value: rect.left },
    { edge: "right", value: rect.right },
    { edge: "top", value: rect.top },
    { edge: "bottom", value: rect.bottom }
  ];

  for (const candidate of candidates) {
    if ((candidate.edge === "left" || candidate.edge === "right") && deltaX !== 0) {
      const t = (candidate.value - previousPoint.x) / deltaX;
      const y = previousPoint.y + (deltaY * t);
      if (t >= 0 && t <= 1 && y >= rect.top && y <= rect.bottom) {
        intersections.push({ t, x: candidate.value, y });
      }
    }

    if ((candidate.edge === "top" || candidate.edge === "bottom") && deltaY !== 0) {
      const t = (candidate.value - previousPoint.y) / deltaY;
      const x = previousPoint.x + (deltaX * t);
      if (t >= 0 && t <= 1 && x >= rect.left && x <= rect.right) {
        intersections.push({ t, x, y: candidate.value });
      }
    }
  }

  if (intersections.length > 0) {
    intersections.sort((a, b) => a.t - b.t);
    return intersections[0];
  }

  return {
    x: clamp(currentPoint.x, rect.left, rect.right),
    y: clamp(currentPoint.y, rect.top, rect.bottom)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, progress) {
  return start + ((end - start) * progress);
}

function setFocusBoxTarget(target) {
  focusBoxTarget = target;
  if (focusBoxProgress !== target) {
    focusBoxProgress = target;
  }
}

function circleTouchesRect(pointX, pointY, radius, rect) {
  return distanceFromPointToRect(pointX, pointY, rect) <= radius;
}

function getRectMergeProgress(pointX, pointY, radius, rect) {
  if (radius <= 0) return 0;

  if (pointInRect(pointX, pointY, rect)) {
    const insideDepth = Math.min(
      pointX - rect.left,
      rect.right - pointX,
      pointY - rect.top,
      rect.bottom - pointY
    );
    return Math.max(0, Math.min(1, 0.5 + ((insideDepth / radius) * 0.5)));
  }

  const distance = distanceFromPointToRect(pointX, pointY, rect);
  if (distance >= radius) return 0;

  return Math.max(0, Math.min(0.5, ((radius - distance) / radius) * 0.5));
}

function getChoiceMergeProgress(pointX, pointY, radius, triggerRect, fullRect) {
  const triggerDistance = distanceFromPointToRect(pointX, pointY, triggerRect);
  if (triggerDistance >= radius) return 0;

  if (pointInRect(pointX, pointY, fullRect)) {
    const actualRect = contractRect(
      fullRect,
      asciiCellWidth * 0.9,
      asciiCellHeight * 0.7
    );

    if (pointInRect(pointX, pointY, actualRect)) {
      const insideDepth = Math.min(
        pointX - actualRect.left,
        actualRect.right - pointX,
        pointY - actualRect.top,
        actualRect.bottom - pointY
      );
      const completionDepth = Math.max(asciiCellWidth, asciiCellHeight) * 0.9;
      const completion = Math.max(0, Math.min(1, insideDepth / completionDepth));
      return 0.78 + (completion * 0.22);
    }

    const actualDistance = distanceFromPointToRect(pointX, pointY, actualRect);
    const approachToCore = 1 - Math.max(0, Math.min(1, actualDistance / radius));
    return 0.5 + (approachToCore * 0.28);
  }

  const fullDistance = distanceFromPointToRect(pointX, pointY, fullRect);
  const approach = 1 - Math.max(0, Math.min(1, fullDistance / radius));
  return Math.max(0, Math.min(0.5, approach * 0.5));
}

function contractRect(rect, padX, padY) {
  return {
    left: rect.left + padX,
    top: rect.top + padY,
    right: rect.right - padX,
    bottom: rect.bottom - padY
  };
}

function showLanding() {
  path = [];
  lastChoiceLabel = null;
  currentNodeId = "A01";
  landingViewEl.style.display = "block";
  readerViewEl.style.display = "none";
  summaryViewEl.style.display = "none";
  refreshAsciiInteraction();
  queueAsciiRender();
}

function startStory() {
  path = [];
  lastChoiceLabel = null;
  landingViewEl.style.display = "none";
  summaryViewEl.style.display = "none";
  readerViewEl.style.display = "grid";
  renderNode("A01");
  refreshAsciiInteraction();
}

if (enterBtn) {
  enterBtn.addEventListener("click", startStory);
}

if (restartBtn) {
  restartBtn.addEventListener("click", showLanding);
}

function showError(message) {
  errorEl.style.display = "block";
  errorEl.textContent = message;
}

function clearError() {
  errorEl.style.display = "none";
  errorEl.textContent = "";
}

async function loadData() {
  clearError();

  // Load both JSON files (arrays of objects)
  const [nodesRes, choicesRes] = await Promise.all([
    fetch(NODES_FILE),
    fetch(CHOICES_FILE)
  ]);

  if (!nodesRes.ok) throw new Error(`Failed to load ${NODES_FILE} (${nodesRes.status})`);
  if (!choicesRes.ok) throw new Error(`Failed to load ${CHOICES_FILE} (${choicesRes.status})`);

  const nodesArr = await nodesRes.json();
  const choicesArr = await choicesRes.json();

  // Index nodes by NODE_ID
  nodesById = {};
  for (const n of nodesArr) {
    if (!n.NODE_ID) continue;
    nodesById[n.NODE_ID] = n;
  }

  // Group choices by PARENT_NODE
  choicesByParent = {};
  for (const c of choicesArr) {
    if (!c.PARENT_NODE) continue;
    if (!choicesByParent[c.PARENT_NODE]) choicesByParent[c.PARENT_NODE] = [];
    choicesByParent[c.PARENT_NODE].push(c);
  }

  // Keep choice order stable (AC01, AC02…)
  for (const parent in choicesByParent) {
    choicesByParent[parent].sort((a, b) =>
      (a.CHOICE_ID || "").localeCompare(b.CHOICE_ID || "")
    );
  }
}

function renderNode(nodeId) {
  clearError();
  currentNodeId = nodeId;

  const node = nodesById[nodeId];
  if (!node) {
    nodeIdEl.textContent = nodeId;
    nodeTypeEl.textContent = "";
    nodeTextEl.textContent = "";
    choicesEl.innerHTML = "";
    showError(`Missing node in NODES.json: ${nodeId}`);
    return;
  }

  // Record this node in the path, storing the choice label that led here
  path.push({
    nodeId: node.NODE_ID,
    text: node.TEXT || "",
    chosenLabel: lastChoiceLabel
  });
  lastChoiceLabel = null;

  // Render node content
  // nodeIdEl.textContent = node.NODE_ID;
  // nodeTypeEl.textContent = node.NODE_TYPE ? `(${node.NODE_TYPE})` : "";
  nodeTextEl.textContent = node.TEXT || "";

  // Render choices for this parent node
  const options = choicesByParent[nodeId] || [];
  choicesEl.innerHTML = "";
  statusEl.textContent = "";

  // End: no choices => show summary view
  if (options.length === 0) {
    showSummary();
    return;
  }

  for (const opt of options) {
    const btn = document.createElement("button");
    btn.className = "choice";

    const labelLine = document.createElement("span");
    labelLine.textContent = `>> ${(opt.OPTION_LABEL || "").toUpperCase()}`;
    btn.appendChild(labelLine);

    btn.addEventListener("click", () => {
      const next = opt.LEADS_TO;
      if (!next) {
        showError(`Choice has no LEADS_TO value.`);
        return;
      }

      // Remember what the user clicked so we can render it in the summary
      lastChoiceLabel = opt.OPTION_LABEL || "";

      renderNode(next);
    });

    choicesEl.appendChild(btn);
  }

  refreshAsciiInteraction();
  queueAsciiRender();
}

function showSummary() {
  // Hide reader, show summary
  readerViewEl.style.display = "none";
  summaryViewEl.style.display = "grid";

  // Build scroll content
  summaryScrollEl.innerHTML = "";

  path.forEach((step, idx) => {
    const block = document.createElement("div");
    block.className = "summary-block";

    // If a choice led to this node, show it before the node text
    if (step.chosenLabel) {
      const choiceDiv = document.createElement("div");
      choiceDiv.className = "summary-choice";
      choiceDiv.textContent = step.chosenLabel;
      block.appendChild(choiceDiv);
    }

    const textDiv = document.createElement("div");
    textDiv.className = "summary-text";
    textDiv.textContent = step.text || "";
    block.appendChild(textDiv);

    // If there was a choice, place the divider immediately after the choice
    // if (step.chosenLabel && idx < path.length - 1) {
    //   const divider = document.createElement("div");
    //   divider.className = "summary-divider";
    //   block.appendChild(divider);
    // }

    summaryScrollEl.appendChild(block);
  });

  summaryScrollEl.scrollTop = 0;
  refreshAsciiInteraction();
  queueAsciiRender();
}

// Boot
(async function init() {
  try {
    buildAsciiField();
    window.addEventListener("resize", () => {
      buildAsciiField();
      refreshAsciiInteraction();
    });
    window.addEventListener("mousemove", (event) => {
      updateAsciiPointer(event.clientX, event.clientY);
    });
    window.addEventListener("mouseleave", clearAsciiPointer);
    await loadData();
    buildAsciiField();
    showLanding();
  } catch (err) {
    landingViewEl.style.display = "none";
    readerViewEl.style.display = "grid";
    nodeTextEl.textContent = "";
    choicesEl.innerHTML = "";
    showError(
      `${err.message}\n\n` +
      `If you're opening index.html directly (file://), fetch() may be blocked.\n` +
      `Use VS Code "Live Server" or run: python -m http.server`
    );
  }
})();
