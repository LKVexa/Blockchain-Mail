/** Geometry from Penteract Bench 0.3.0 — same vertex bits, edge rule, plane order, and projection. */

export const TAU = 2 * Math.PI;

/** Ten rotation planes. Index order matches the bench, including the first three. */
export const PLANES: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [0, 4],
  [0, 2],
  [0, 3],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 4],
  [3, 4],
];

/** Vertex m is the 5-tuple ((m>>a & 1) ? +1 : −1) for a = 0..4. */
export const VERTICES: readonly (readonly [number, number, number, number, number])[] = Array.from(
  { length: 32 },
  (_, m) =>
    Array.from({ length: 5 }, (_, a) => ((m >> a) & 1 ? 1 : -1)) as [number, number, number, number, number],
);

export type Edge = readonly [number, number, number];

/** Each undirected edge once: bit k clear on the lower index, set on the higher. Axis k is the differing coordinate. */
export const EDGES: readonly Edge[] = (() => {
  const edges: Edge[] = [];
  for (let a = 0; a < 32; a++) {
    for (let k = 0; k < 5; k++) {
      if ((a & (1 << k)) === 0) edges.push([a, a | (1 << k), k]);
    }
  }
  return edges;
})();

/** Bench default pose. The last angle is 32°, not zero. */
export const DEFAULT_ROTATIONS = [24, -18, 16, 0, 0, 0, 0, 0, 0, 32];

export type Pose = {
  rotations: number[];
  rho: number;
  yaw: number;
  pitch: number;
  projection: "perspective" | "original";
  slice: number;
};

export function defaultPose(): Pose {
  return {
    rotations: DEFAULT_ROTATIONS.slice(),
    rho: 1,
    yaw: -22,
    pitch: 16,
    projection: "perspective",
    slice: 0,
  };
}

export function rotate(v: number[], i: number, j: number, angle: number): number[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = v[i]!;
  const y = v[j]!;
  v[i] = c * x - s * y;
  v[j] = s * x + c * y;
  return v;
}

export function transform(v: readonly number[], pose: Pose): number[] {
  const u = v.slice();
  PLANES.forEach(([i, j], k) => rotate(u, i, j, (pose.rotations[k] ?? 0) * Math.PI / 180));
  u[4] = u[4]! * pose.rho;
  return u;
}

export function assertGeneration(generation: number): void {
  if (!Number.isSafeInteger(generation) || generation < 1 || generation >= 2 ** 32) {
    throw new Error("generation must be an integer from 1 through 2^32-1");
  }
}

export function assertPose(pose: Pose): void {
  if (!Number.isFinite(pose.rho) || pose.rho === 0) throw new Error("rho must be a finite non-zero scale");
  if (!pose.rotations.every((angle) => Number.isFinite(angle))) throw new Error("rotation angles must be finite");
}

/** Inverse of transform: undo ρ, then the ten plane rotations in reverse. */
export function untransform(v: readonly number[], pose: Pose): number[] {
  assertPose(pose);
  const u = v.slice();
  u[4] = u[4]! / pose.rho;
  for (let k = PLANES.length - 1; k >= 0; k--) {
    const [i, j] = PLANES[k]!;
    rotate(u, i, j, -(pose.rotations[k] ?? 0) * Math.PI / 180);
  }
  return u;
}

export function project(u: readonly number[], pose: Pose): [number, number, number] {
  let x: number;
  let y: number;
  let z: number;
  if (pose.projection === "original") {
    const f = 1 / Math.max(0.72, 1.82 - u[4]! * 0.18);
    x = (0.6 * u[0]! + 0.3 * u[2]! + 0.17 * u[3]! + 0.2 * u[4]!) * f;
    y = (0.6 * u[1]! - 0.24 * u[2]! + 0.3 * u[3]! - 0.16 * u[4]!) * f;
    z = (0.5 * u[2]! + 0.3 * u[3]! + 0.4 * u[4]!) * f;
  } else {
    const f5 = 6 / (6 - u[4]!);
    const a = u.slice(0, 4).map((t) => t * f5);
    const f4 = 7 / (7 - a[3]!);
    const p3 = a.slice(0, 3).map((t) => t * f4);
    x = p3[0]!;
    y = p3[1]!;
    z = p3[2]!;
  }
  const p = [x, y, z];
  rotate(p, 0, 2, pose.yaw * Math.PI / 180);
  rotate(p, 1, 2, pose.pitch * Math.PI / 180);
  if (pose.projection === "perspective") {
    const f3 = 10 / (10 - p[2]!);
    return [p[0]! * f3, p[1]! * f3, p[2]!];
  }
  return [p[0]!, p[1]!, p[2]!];
}

export function geometry(pose: Pose) {
  const raw = VERTICES.map((v) => project(transform(v, pose), pose));
  const bounds = [0, 1, 2].map((k) => {
    const vals = raw.map((v) => v[k]);
    return [Math.min(...vals), Math.max(...vals)] as const;
  });
  const span = Math.max(bounds[0][1] - bounds[0][0], bounds[1][1] - bounds[1][0], 1e-9);
  const mid = bounds.map(([a, b]) => (a + b) / 2);
  const dep = Math.max(bounds[2][1] - bounds[2][0], 1e-9);
  const norm = (v: readonly number[]): [number, number, number] => [
    (v[0]! - mid[0]!) / span,
    (v[1]! - mid[1]!) / span,
    (v[2]! - bounds[2][0]) / dep,
  ];
  const points = raw.map(norm);
  const slice = VERTICES.slice(0, 16).map((v) => {
    const q = v.slice();
    q[4] = pose.slice;
    return norm(project(transform(q, pose), pose));
  });
  return {
    points,
    slice,
    edges: EDGES,
    sliceEdges: EDGES.filter((edge) => edge[0] < 16 && edge[1] < 16),
    raw,
    span,
  };
}

export function neighbors(index: number): number[] {
  const found: number[] = [];
  for (const [a, b] of EDGES) {
    if (a === index) found.push(b);
    else if (b === index) found.push(a);
  }
  return found.sort((a, b) => a - b);
}

function binom(n: number, k: number): number {
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

/** k-faces of a 5-cube: C(5, k) · 2^(5−k). */
export function faceCount(k: number): number {
  return binom(5, k) * 2 ** (5 - k);
}

export function rotationInverseError(pose: Pose): number {
  let max = 0;
  for (const vertex of VERTICES) {
    const back = untransform(transform(vertex, pose), pose);
    for (let i = 0; i < 5; i++) max = Math.max(max, Math.abs(back[i]! - vertex[i]!));
  }
  return max;
}

export function vertexAad(index: number): Uint8Array {
  const t = VERTICES[index];
  if (!t) throw new Error("vertex index is outside the penteract");
  return new TextEncoder().encode(`PENTERACT/0.3.0|i=${index}|t=${t.join(",")}`);
}

export function formatCoordinate(index: number): string {
  const t = VERTICES[index];
  if (!t) return "";
  return `[${t.map((n) => (n > 0 ? "+1" : "−1")).join(", ")}]`;
}

/** Integer mixer from the bench path-texture hash. 1337 is that file's default seed. */
export const LATTICE_SEED = 1337;

export function mix(x: number, y: number, seed: number): number {
  let h = Math.imul(x + 374761393, y + 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Public sampler only. These bytes are not a private seal key and must not be used to encrypt a payload.
 */
export function entropyFromLattice(index: number, generation = 1): Uint8Array {
  assertGeneration(generation);
  const t = VERTICES[index];
  if (!t) throw new Error("vertex index is outside the penteract");
  const raw = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const axis = i % 5;
    raw[i] = mix((t[axis]! + 2) * (i + 1), (index + 1) * (generation + 1), LATTICE_SEED + i) & 0xff;
  }
  return raw;
}

/** In-place radix-2 FFT. Forward convention exp(−2πi kn/N), matching the bench. */
export function fft1(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length || n < 2 || n & (n - 1)) throw new Error("FFT requires equal power-of-two arrays.");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const reSwap = re[i]!;
      re[i] = re[j]!;
      re[j] = reSwap;
      const imSwap = im[i]!;
      im[i] = im[j]!;
      im[j] = imSwap;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? TAU : -TAU) / len;
    const wr0 = Math.cos(ang);
    const wi0 = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const tr = re[b]! * wr - im[b]! * wi;
        const ti = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = wr * wr0 - wi * wi0;
        wi = wr * wi0 + wi * wr0;
        wr = nr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

/** Bench self-check: forward FFT then inverse on the published 8-sample vector. */
export function samplingLatticeError(): number {
  const re = Float64Array.from([1, 0.2, -0.4, 2, 0.1, 1.7, -0.2, 0.3]);
  const im = new Float64Array(8);
  const orig = re.slice();
  fft1(re, im, false);
  fft1(re, im, true);
  let max = 0;
  for (let k = 0; k < re.length; k++) max = Math.max(max, Math.abs(re[k]! - orig[k]!));
  return max;
}
export const AXIS_COLOR = ["#e7b86d", "#e7b86d", "#65caba", "#63bce0", "#d9e1cc"] as const;
