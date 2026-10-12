import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ROTATIONS,
  EDGES,
  PLANES,
  VERTICES,
  defaultPose,
  faceCount,
  geometry,
  neighbors,
  rotationInverseError,
  untransform,
  transform,
  entropyFromLattice,
  samplingLatticeError,
  assertGeneration,
} from "./penteract.ts";

test("penteract graph matches the bench", () => {
  assert.equal(VERTICES.length, 32);
  assert.equal(EDGES.length, 80);
  assert.equal(PLANES.length, 10);
  assert.deepEqual(DEFAULT_ROTATIONS, [24, -18, 16, 0, 0, 0, 0, 0, 0, 32]);
  assert.deepEqual(VERTICES[0], [-1, -1, -1, -1, -1]);
  assert.deepEqual(VERTICES[1], [1, -1, -1, -1, -1]);
  assert.deepEqual(VERTICES[31], [1, 1, 1, 1, 1]);
  for (let i = 0; i < 32; i++) {
    assert.equal(neighbors(i).length, 5);
    VERTICES[i]!.forEach((coord, axis) => {
      assert.equal(coord, (i >> axis) & 1 ? 1 : -1);
    });
  }
  assert.equal(faceCount(0), 32);
  assert.equal(faceCount(1), 80);
  assert.equal(faceCount(2), 80);
  assert.equal(faceCount(3), 40);
  assert.equal(faceCount(4), 10);
});

test("plane rotations are invertible on every vertex", () => {
  const pose = defaultPose();
  assert.ok(rotationInverseError(pose) < 1e-9);
  pose.rotations = [24, -18, 16, 40, -12, 7, 90, -33, 15, 32];
  pose.rho = 1.25;
  assert.ok(rotationInverseError(pose) < 1e-9);
  const back = untransform(transform(VERTICES[13]!, pose), pose);
  VERTICES[13]!.forEach((coord, i) => assert.ok(Math.abs(back[i]! - coord) < 1e-9));
});

test("vertex entropy is a function of the coordinate, and the FFT lattice round-trips", () => {
  const a = entropyFromLattice(8, 1);
  const b = entropyFromLattice(8, 1);
  assert.equal(a.length, 16);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, entropyFromLattice(9, 1));
  assert.notDeepEqual(a, entropyFromLattice(8, 2));
  assert.ok(samplingLatticeError() < 1e-10);
});
test("generation wrap and a zero scale are rejected", () => {
  assert.throws(() => entropyFromLattice(0, 1 + 2 ** 32), /generation/);
  assert.throws(() => assertGeneration(Number.NaN), /generation/);
  const pose = defaultPose();
  pose.rho = 0;
  assert.throws(() => untransform(VERTICES[0]!, pose), /rho/);
});

test("default projection stays finite", () => {
  const g = geometry(defaultPose());
  assert.equal(g.points.length, 32);
  assert.equal(g.sliceEdges.length, 32);
  for (const point of g.points) {
    for (const value of point) assert.equal(Number.isFinite(value), true);
  }
});
