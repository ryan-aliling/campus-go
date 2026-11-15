// The checkpoint pins are plain HTML, so the flat (Leaflet) and the 3D (MapLibre) map show the same pins and both
// take their colours from the map style's CSS variables (BR48).
import { distanceM } from './geo.js';

/** Size of a pin's box and the point of it that sits on the checkpoint, in pixels. */
export const PIN_SIZE = [140, 70];
export const PIN_ANCHOR = [70, 22];

const stateOf = (checkpoint) => {
  if (checkpoint.completed) return 'done';
  return checkpoint.isActive ? 'open' : 'closed';
};

const PIN_ICON = {
  done: 'M4 12.5 9.5 18 20 6',
  open: 'M12 22S5 14.5 5 9.5a7 7 0 0 1 14 0C19 14.5 12 22 12 22ZM9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0',
  closed: 'M5 11H19V21H5ZM8 11V7a4 4 0 0 1 8 0V11',
};

/** One diamond pin: ringed = open, green tick = done, padlock = closed. The name is stripped of markup. */
export function pinHtml(checkpoint, selected) {
  const state = stateOf(checkpoint);
  const ring = state === 'open' ? '<span class="pin__ring"></span>' : '';
  const name = checkpoint.name.replace(/[&<>"]/g, '');
  return `<span class="pin pin--${state}${selected ? ' is-selected' : ''}">
    <span class="pin__shape">${ring}<span class="pin__diamond"><svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${PIN_ICON[state]}"/></svg></span></span>
    <span class="pin__label">${name}</span>
  </span>`;
}

/** The red chevron of the Re-center button. */
export const CHEVRON = 'M6.5 15.5 12 8l5.5 7.5';

/**
 * Zoom (Leaflet's numbers) of the view that follows the live position and that Re-center flies to on a larger
 * screen: 2.2 x 1.2 times as close as zoom 19 (about 20.4), so the ball and the next few metres fill the screen.
 */
export const FOLLOW_ZOOM = 19 + Math.log2(2.2 * 1.2);
/** How far below the middle of the map the ball is shown while following, as a share of the map's height. */
export const FOLLOW_LOW = 0.2;
const SMALLEST = 0.55;

/**
 * How large the ball is drawn at a Leaflet zoom: full size in the following view and closer, smaller
 * (down to 55 %) when zoomed out, so it remains easy to spot while still indicating distance from the
 * following view.
 */
export const puckScale = (zoom) => Math.min(1, Math.max(SMALLEST, 2 ** (zoom - FOLLOW_ZOOM)));

/** Hands the scale for `zoom` to the live-position markers inside a map's element (--puck-scale in screens.css). */
export function scalePuck(element, zoom) {
  element?.style.setProperty('--puck-scale', puckScale(zoom).toFixed(3));
}
const EARTH_M = 40075016.686;
const M_PER_DEG = EARTH_M / 360;

/** Metres on the ground per screen pixel at a Leaflet zoom level (256-pixel tiles). */
export const metresPerPixel = (lat, zoom) =>
  (EARTH_M * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);

/** Box of the ball marker in pixels (the ball is 48 px, see --puck-orb); its middle sits on the position. */
export const PUCK_SIZE = [52, 52];
export const PUCK_ANCHOR = [26, 26];
/** Box of the ground marker (sonar range ring and direction wedge) in pixels; its middle sits on the position. */
export const GROUND_SIZE = 96;

// The sonar range ring (like Sova's recon dart, or the range ring of a location game): one wave at a time runs out from
// the ball to the real unlock range, drawn to scale, and the next starts only once it has faded out; a faint edge marks
// the range. Its radius in pixels comes from the map
// (--sonar-r, set by sizeSonar); its look, speed and on/off from the map style's data attributes (BR48).
const SONAR = `<span class="puck-sonar"><span class="puck-sonar__wave"></span><span class="puck-sonar__edge"></span></span>`;

/**
 * How long one sonar wave takes from the ball to the edge, in ms, for each speed of the map style (screens.css); the
 * same for both looks. Each speed is 1.5 times the next faster one.
 */
export const SONAR_WAVE_MS = { slow: 6750, normal: 4500, fast: 3000 };

/** How far away a quest can be unlocked in metres: its radius plus the grace zone (`reachM` from the server). */
export const reachOf = (checkpoint) => checkpoint.reachM ?? checkpoint.radius;

/**
 * The reach of the range ring in metres: the smallest reach of the open quests, so every quest inside the ring can
 * really be unlocked (all quests when every open one is done, null without any open quest).
 */
export function ringReachM(checkpoints) {
  const open = checkpoints.filter((c) => c.isActive);
  const left = open.filter((c) => !c.completed);
  const reaches = (left.length > 0 ? left : open).map(reachOf).filter(Number.isFinite);
  return reaches.length > 0 ? Math.min(...reaches) : null;
}

/**
 * The ring's radius on screen in pixels at a Leaflet zoom. Capped at `maxPx` (the screen's diagonal): past that the
 * edge is off-screen anyway, and the waves stay a size the browser can draw smoothly.
 */
export function reachPx(reachM, lat, zoom, maxPx = Infinity) {
  if (!Number.isFinite(reachM) || !Number.isFinite(lat)) return 0;
  return Math.round(Math.min(maxPx, reachM / metresPerPixel(lat, zoom)));
}

/** Hands the ring's radius to the sonar inside a map's element (--sonar-r in screens.css). */
export function sizeSonar(element, { reachM, lat, zoom }) {
  if (!element) return;
  const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
  element.style.setProperty('--sonar-r', `${reachPx(reachM, lat, zoom, diagonal)}px`);
}

/** Whether a quest is close enough to unlock from `me` ({ lat, lng }), by its own reach. Display only (BR12). */
export function inRange(me, checkpoint) {
  const reach = reachOf(checkpoint);
  return (
    Number.isFinite(reach) &&
    distanceM([me.lat, me.lng], [checkpoint.latitude, checkpoint.longitude]) <= reach
  );
}

/**
 * Notices the quests that come into range: `update` returns the open quests that are in range now and were not at
 * the last update, each with its distance in metres, so each one flashes once per entry (leaving and coming back
 * flashes again). The first update counts as entering, so the quests already in range flash once when the map opens.
 * `canShow(id)` says whether the quest's pin is drawn yet: one that is not counts as not entered, so it still flashes
 * once its pin appears.
 */
export function createRangeWatch() {
  let inside = new Set();
  return {
    update(me, checkpoints, canShow = () => true) {
      const now = new Set();
      const entered = [];
      for (const checkpoint of checkpoints) {
        if (!checkpoint.isActive || !inRange(me, checkpoint) || !canShow(checkpoint.id)) continue;
        now.add(checkpoint.id);
        if (!inside.has(checkpoint.id)) {
          const metres = distanceM([me.lat, me.lng], [checkpoint.latitude, checkpoint.longitude]);
          entered.push({ id: checkpoint.id, metres });
        }
      }
      inside = now;
      return entered;
    },
  };
}

/**
 * When the flash of a quest that just came into range starts, in ms: when the next sonar wave reaches it, so the wave
 * seems to find the quest. `metres` is its distance, `ringM` the ring's reach.
 */
export function pingDelayMs(metres, ringM, speed) {
  const wave = SONAR_WAVE_MS[speed] ?? SONAR_WAVE_MS.normal;
  if (!Number.isFinite(ringM) || ringM <= 0) return 0;
  return Math.round(wave * Math.min(1, Math.max(0, metres / ringM)));
}

/** Flashes a quest's pin once after \`delayMs\` (pin--ping in screens.css), restarting a flash that is still running. */
export function pingPin(element, delayMs) {
  const pin = element?.querySelector('.pin');
  if (!pin) return;
  pin.classList.remove('pin--ping');
  pin.style.setProperty('--ping-delay', `${delayMs}ms`);
  // Reading the layout between removing and adding the class restarts the animation.
  void pin.offsetWidth;
  pin.classList.add('pin--ping');
  pin.addEventListener('animationend', () => pin.classList.remove('pin--ping'), { once: true });
}

/**
 * What lies on the ground under the ball, below the checkpoint pins: the sonar range ring and the soft red wedge that
 * points to the compass or walking direction (`heading`, 0 = north). The wedge always shows; until a direction is
 * known it points north.
 */
export function groundHtml(heading) {
  const turn = Math.round(Number.isFinite(heading) ? heading : 0);
  return `<span class="puck-ground" aria-hidden="true">
    ${SONAR}
    <span class="puck-ground__beam" data-turn="${turn}" style="transform: rotate(${turn}deg)"></span>
  </span>`;
}

/**
 * The angle (degrees, any number of turns) equal to `heading` that is nearest to `current`, so the wedge turns the short
 * way round: from 359 to 1 degree it moves 2 degrees forward instead of spinning back 358.
 */
export function nearestTurn(current, heading) {
  const delta = ((((heading - current) % 360) + 540) % 360) - 180;
  return Math.round((current + delta) * 10) / 10;
}

/** Updates the ground in place: the wedge turned to `heading`; without a direction it keeps pointing where it did. */
export function updateGround(element, heading) {
  const beam = element?.querySelector('.puck-ground__beam');
  if (!beam || !Number.isFinite(heading)) return;
  const angle = nearestTurn(Number(beam.dataset.turn ?? 0), heading);
  beam.dataset.turn = String(angle);
  beam.style.transform = `rotate(${angle}deg)`;
}

// The ball is low-poly, like a geodesic dome: an icosahedron with each triangle split in four and pushed out onto a
// sphere, drawn from the front (only the facets facing the viewer). Every facet is white, with a grey veil for its
// light from the top left, and red lines between the facets. Its turn is kept per ball, so it can roll.
const GOLDEN = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON = {
  points: [
    [-1, GOLDEN, 0],
    [1, GOLDEN, 0],
    [-1, -GOLDEN, 0],
    [1, -GOLDEN, 0],
    [0, -1, GOLDEN],
    [0, 1, GOLDEN],
    [0, -1, -GOLDEN],
    [0, 1, -GOLDEN],
    [GOLDEN, 0, -1],
    [GOLDEN, 0, 1],
    [-GOLDEN, 0, -1],
    [-GOLDEN, 0, 1],
  ],
  faces: [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ],
};
const BALL_RADIUS = 48; // in the ball's 100 x 100 drawing
const BALL_PX = 21; // radius of the 42 px ball on screen, if it cannot be measured
const LIGHT = [-0.45, 0.55, 0.7]; // from the top left, towards the viewer (y up, z to the viewer)

const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((c) => c / length);
};
const dot = (a, b) => a.reduce((sum, c, i) => sum + c * b[i], 0);
const cross = ([a, b, c], [x, y, z]) => [b * z - c * y, c * x - a * z, a * y - b * x];
const between = (a, b) => unit(a.map((c, i) => (c + b[i]) / 2));
const apply = (matrix, v) => matrix.map((row) => dot(row, v));
const times = (a, b) => a.map((row) => [0, 1, 2].map((j) => dot(row, [b[0][j], b[1][j], b[2][j]])));

/** Rotation by `angle` (radians) round a unit `axis`. */
function rotation([x, y, z], angle) {
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

// Tilted towards the viewer and turned a little at the start, so the facets do not line up with the screen.
const START = times(rotation([0, 1, 0], 0.3), rotation([1, 0, 0], 0.45));

const FACES = (() => {
  const points = ICOSAHEDRON.points.map(unit);
  return ICOSAHEDRON.faces.flatMap(([a, b, c]) => {
    const [A, B, C] = [points[a], points[b], points[c]];
    const [ab, bc, ca] = [between(A, B), between(B, C), between(C, A)];
    return [
      [A, ab, ca],
      [ab, B, bc],
      [ca, bc, C],
      [ab, bc, ca],
    ];
  });
})();
const normalOf = (corners) => unit(corners.reduce((s, p) => s.map((c, i) => c + p[i])));

/** The veil that shades a facet for its light from the top left, as fill and opacity. */
function veil(normal) {
  const light = dot(normal, unit(LIGHT));
  // White facing the light, turning a soft grey towards the far edge, like a white low-poly ball.
  return ['#000', Math.min(0.4, Math.max(0, (0.75 - light) * 0.3))];
}

/** Each facet as seen with the ball turned by `matrix` (no points when it faces away), and the inner edges. */
/** The convex hull of points [x, y], in order round it: the outline of the ball as drawn. */
function hull(points) {
  const side = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const chain = (list) =>
    list.reduce((kept, p) => {
      while (kept.length >= 2 && side(kept.at(-2), kept.at(-1), p) <= 0) kept.pop();
      kept.push(p);
      return kept;
    }, []);
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return [...chain(sorted).slice(0, -1), ...chain([...sorted].reverse()).slice(0, -1)];
}

function shapes(matrix) {
  const at = (n) => Math.round(n * BALL_RADIUS * 10) / 10;
  const edges = new Map();
  const corners = [];
  const faces = FACES.map((face) => {
    const turned = face.map((p) => apply(matrix, p));
    const normal = normalOf(turned);
    if (normal[2] <= 0) return { points: '', veil: ['#000', 0] };
    turned.forEach(([x, y]) => corners.push([at(x), at(-y)]));
    const xy = turned.map(([x, y]) => `${at(x)},${at(-y)}`);
    xy.forEach((p, i) => {
      const key = [p, xy[(i + 1) % 3]].sort().join(' ');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
    return { points: xy.join(' '), veil: veil(normal) };
  });
  // Red lines between the facets; the outline is drawn round the whole ball instead.
  const inner = [...edges]
    .filter(([, count]) => count === 2)
    .map(([key]) => `M${key.replace(' ', 'L')}`)
    .join('');
  const outline = hull(corners)
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return { faces, inner, outline };
}

// A white backing the shape of the ball under the facets, so the map never shows through between them, and a thin
// red outline round it, so the white ball never seems to have a bite out of it on a light map.
function ballSvg() {
  const { faces, inner, outline } = shapes(START);
  const white = faces.map(({ points }) => `<polygon class="puck__facet" points="${points}"/>`);
  const light = faces.map(
    ({ points, veil: [fill, opacity] }) =>
      `<polygon class="puck__veil" points="${points}" fill="${fill}" fill-opacity="${opacity.toFixed(2)}"/>`,
  );
  return `<svg class="puck__ball" viewBox="-50 -50 100 100"><polygon class="puck__hull" points="${outline}"/>${white.join('')}${light.join('')}<path class="puck__edges" d="${inner}"/><polygon class="puck__outline" points="${outline}"/></svg>`;
}

const BALL = ballSvg();
const turns = new WeakMap();

/**
 * The visitor's live position: a white low-poly ball with red lines between its facets, sitting on the position
 * on the flat and the 3D map alike. It keeps its size at every zoom.
 */
export function puckHtml() {
  return `<span class="puck" aria-hidden="true">
    <span class="puck__body">${BALL}</span>
  </span>`;
}

/**
 * Rolls the ball the way it moved. `east` and `north` are the step on the ground in screen pixels; `bearing` and
 * `pitch` (degrees) are the 3D map's camera, so it rolls the right way however that map is turned or tilted.
 */
export function rollBall(element, east, north, { bearing = 0, pitch = 0 } = {}) {
  const svg = element?.querySelector('.puck__ball');
  if (!svg || (!east && !north)) return;
  const [b, p] = [(bearing * Math.PI) / 180, (pitch * Math.PI) / 180];
  // The step seen from the camera: to the right, and forward (away from the viewer, up the screen).
  const right = east * Math.cos(b) - north * Math.sin(b);
  const forward = east * Math.sin(b) + north * Math.cos(b);
  const step = [right, forward * Math.cos(p), -forward * Math.sin(p)];
  const ground = [0, Math.sin(p), Math.cos(p)];
  // A ball rolls round the line on the ground at right angles to its step, one radius per radian.
  const axis = unit(cross(ground, step));
  const radius = svg.getBoundingClientRect().width / 2 || BALL_PX;
  const matrix = times(
    rotation(axis, Math.hypot(right, forward) / radius),
    turns.get(svg) ?? START,
  );
  turns.set(svg, matrix);
  const { faces, inner, outline } = shapes(matrix);
  const white = svg.querySelectorAll('.puck__facet');
  const light = svg.querySelectorAll('.puck__veil');
  faces.forEach(({ points, veil: [fill, opacity] }, i) => {
    white[i].setAttribute('points', points);
    light[i].setAttribute('points', points);
    light[i].setAttribute('fill', fill);
    light[i].setAttribute('fill-opacity', opacity.toFixed(2));
  });
  svg.querySelector('.puck__edges').setAttribute('d', inner);
  for (const shape of svg.querySelectorAll('.puck__hull, .puck__outline')) {
    shape.setAttribute('points', outline);
  }
}

// The ball follows the live position every frame instead of hopping from reading to reading: it eases towards the
// newest position (half the way in about FOLLOW_TAU_MS x 0.7) and, while the visitor walks, keeps walking on at the
// measured pace between two readings (for at most PREDICT_MAX_MS), so it moves as fluidly as the visitor does and
// even a step of a few centimetres shows. Slower than MOVING_SPEED_MPS counts as standing (GPS jitter, no walking on).
const FOLLOW_TAU_MS = 200;
const PREDICT_MAX_MS = 2000;
const MOVING_SPEED_MPS = 0.3;
const SETTLED_M = 0.01;
const LONGEST_FRAME_MS = 100; // a frame after a pause (hidden tab) is counted as this long, so the ball never leaps
const JUMP_M = 150; // further than a walk between two readings: jump instead of sliding across the map
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const nextFrame = (step) =>
  window.requestAnimationFrame ? window.requestAnimationFrame(step) : setTimeout(step, 16);
const cancelFrame = (frame) =>
  window.cancelAnimationFrame ? window.cancelAnimationFrame(frame) : clearTimeout(frame);

/** The step from `a` to `b` ([lat, lng]) on the ground in metres, [east, north]. */
const stepMetres = (a, b) => [
  (b[1] - a[1]) * M_PER_DEG * Math.cos((a[0] * Math.PI) / 180),
  (b[0] - a[0]) * M_PER_DEG,
];

/** A [lat, lng] moved `east` and `north` metres. */
const shifted = ([lat, lng], east, north) => [
  lat + north / M_PER_DEG,
  lng + east / (M_PER_DEG * Math.cos((lat * Math.PI) / 180)),
];

/**
 * Draws the live position fluidly. `draw(at, east, north)` gets every frame's position with its step on the ground in
 * metres, so the ball can roll along. `moveTo(point, velocity)` hands over a new reading ([lat, lng]) and the walking
 * velocity [east, north] in m/s (or none); `stop()` ends the animation. The animation sleeps while the ball is still.
 */
export function createFollower(start, draw) {
  let at = start;
  let target = { point: start, velocity: [0, 0], since: 0 };
  let frame = null;
  let last = null;

  const goalAt = (now) => {
    const [east, north] = target.velocity;
    if (Math.hypot(east, north) < MOVING_SPEED_MPS) return { goal: target.point, done: true };
    const ahead = Math.min(now - target.since, PREDICT_MAX_MS);
    return {
      goal: shifted(target.point, (east * ahead) / 1000, (north * ahead) / 1000),
      done: ahead >= PREDICT_MAX_MS,
    };
  };

  function step() {
    const now = performance.now();
    const elapsed = last === null ? 16 : Math.min(LONGEST_FRAME_MS, now - last);
    last = now;
    const { goal, done } = goalAt(now);
    const share = 1 - Math.exp(-elapsed / FOLLOW_TAU_MS);
    let next = [at[0] + (goal[0] - at[0]) * share, at[1] + (goal[1] - at[1]) * share];
    const settled = done && Math.hypot(...stepMetres(next, goal)) < SETTLED_M;
    if (settled) next = goal;
    const [east, north] = stepMetres(at, next);
    at = next;
    draw(at, east, north);
    frame = settled ? null : nextFrame(step);
    if (settled) last = null;
  }

  return {
    moveTo(point, velocity = [0, 0]) {
      target = { point, velocity: velocity ?? [0, 0], since: performance.now() };
      if (reducedMotion() || Math.hypot(...stepMetres(at, point)) > JUMP_M) {
        if (frame !== null) cancelFrame(frame);
        frame = null;
        last = null;
        target.velocity = [0, 0];
        at = point;
        draw(point, 0, 0);
        return;
      }
      if (frame === null) frame = nextFrame(step);
    },
    stop() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      last = null;
    },
  };
}

/** How long the map takes to pan to a new reading while following: about as long as the ball takes to get there. */
export const GLIDE_SECONDS = (FOLLOW_TAU_MS * 3) / 1000;
