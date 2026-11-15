import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOW_ZOOM,
  createFollower,
  metresPerPixel,
  nearestTurn,
  puckHtml,
  puckScale,
  rollBall,
} from '../src/map-pins.js';

// Made-up positions near the Bildungscampus; no real student location is used.
const HERE = [49.148, 9.216];

/** A drawn ball, and the middle of one facet that faces the viewer (its index and y in the drawing). */
function ball() {
  const element = document.createElement('div');
  element.innerHTML = puckHtml();
  const facets = [...element.querySelectorAll('.puck__facet')];
  const middle = (facet) => {
    const points = facet
      .getAttribute('points')
      .split(' ')
      .map((p) => p.split(',').map(Number));
    return [0, 1].map((i) => points.reduce((sum, p) => sum + p[i], 0) / points.length);
  };
  // The facet nearest the middle of the drawing, well away from the outline.
  const index = facets
    .map((facet, i) => ({ i, d: facet.getAttribute('points') ? Math.hypot(...middle(facet)) : 99 }))
    .sort((a, b) => a.d - b.d)[0].i;
  return { element, facets, middle: () => middle(facets[index]) };
}

describe('the live position on the map', () => {
  afterEach(() => vi.useRealTimers());

  it('measures the map at the following zoom, which is 1.2 times closer than zoom 19 x 2.2', () => {
    // At zoom 19 x 2.2 one pixel is about 0.09 m here; the sonar ring is drawn to scale with this.
    expect(metresPerPixel(HERE[0], 19 + Math.log2(2.2))).toBeCloseTo(0.0883, 3);
    expect(FOLLOW_ZOOM).toBeCloseTo(19 + Math.log2(2.2) + Math.log2(1.2), 6);
  });

  it('keeps the live ball easy to spot when zoomed out', () => {
    expect(puckScale(FOLLOW_ZOOM)).toBe(1);
    expect(puckScale(FOLLOW_ZOOM - 10)).toBe(0.55);
  });

  it('rolls the ball the way it moves: walking north turns its front up', () => {
    const { element, middle } = ball();
    const [, before] = middle();
    rollBall(element, 0, 3); // 3 pixels north
    const [, after] = middle();
    expect(after).toBeLessThan(before); // up in the drawing (y grows downwards)
  });

  it('does not turn the ball without a step', () => {
    const { element, facets } = ball();
    const before = facets.map((f) => f.getAttribute('points'));
    rollBall(element, 0, 0);
    expect(facets.map((f) => f.getAttribute('points'))).toEqual(before);
  });

  // Fake frames: requestAnimationFrame and the clock move on together, 16 ms a frame.
  const frames = () =>
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  const north = (draw) => draw.mock.calls.reduce((sum, [, , metres]) => sum + metres, 0);

  it('BR12 follows a new reading fluidly instead of jumping, and ends exactly on it', () => {
    frames();
    const draw = vi.fn();
    const to = [HERE[0] + 0.00001, HERE[1]]; // about 1.1 m north
    createFollower(HERE, draw).moveTo(to);
    vi.advanceTimersByTime(100);
    const [early] = draw.mock.calls.at(-1);
    expect(early[0]).toBeGreaterThan(HERE[0]);
    expect(early[0]).toBeLessThan(to[0]);
    vi.advanceTimersByTime(3000);
    expect(draw.mock.calls.at(-1)[0]).toEqual(to);
    // The steps on the ground add up to the whole walk north, so the ball rolls exactly that far.
    expect(north(draw)).toBeCloseTo(1.11, 2);
  });

  it('BR12 even a move of 10 cm shows on the ball', () => {
    frames();
    const draw = vi.fn();
    const to = [HERE[0] + 0.1 / 111_320, HERE[1]];
    createFollower(HERE, draw).moveTo(to);
    vi.advanceTimersByTime(3000);
    expect(draw.mock.calls.at(-1)[0][0]).toBeCloseTo(to[0], 9);
    expect(north(draw)).toBeCloseTo(0.1, 3);
  });

  it('BR12 while walking, the ball walks on between two readings instead of stopping', () => {
    frames();
    const draw = vi.fn();
    createFollower(HERE, draw).moveTo(HERE, [0, 1.4]); // a walk north at 1.4 m/s
    vi.advanceTimersByTime(1000);
    const after1s = north(draw);
    expect(after1s).toBeGreaterThan(0.6);
    vi.advanceTimersByTime(1000);
    expect(north(draw)).toBeGreaterThan(after1s + 0.8); // still moving in the second second
    // At most 2 s ahead of the last reading: without a new one it stops near 2.8 m.
    vi.advanceTimersByTime(5000);
    expect(north(draw)).toBeCloseTo(2.8, 1);
  });

  it('BR12 standing still (GPS jitter speed) does not walk the ball away', () => {
    frames();
    const draw = vi.fn();
    createFollower(HERE, draw).moveTo(HERE, [0.1, 0.1]);
    vi.advanceTimersByTime(3000);
    expect(Math.abs(north(draw))).toBeLessThan(0.001);
  });

  it('BR12 the animation sleeps once the ball is still (no battery spent)', () => {
    frames();
    const draw = vi.fn();
    createFollower(HERE, draw).moveTo([HERE[0] + 0.00001, HERE[1]]);
    vi.advanceTimersByTime(4000);
    const calls = draw.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(draw.mock.calls.length).toBe(calls);
  });

  it('jumps instead of sliding across the map after a long way', () => {
    const draw = vi.fn();
    createFollower(HERE, draw).moveTo([HERE[0] + 0.01, HERE[1]]); // about 1.1 km
    expect(draw).toHaveBeenCalledWith([HERE[0] + 0.01, HERE[1]], 0, 0);
  });

  it('turns the direction wedge the short way round', () => {
    expect(nearestTurn(359, 1)).toBe(361);
    expect(nearestTurn(10, 350)).toBe(-10);
    expect(nearestTurn(720, 90)).toBe(810);
  });
});
