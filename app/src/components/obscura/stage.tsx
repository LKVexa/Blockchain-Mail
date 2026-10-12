import { useEffect, useRef, useState } from "react";
import {
  AXIS_COLOR,
  PLANES,
  defaultPose,
  geometry,
  rotationInverseError,
  samplingLatticeError,
  type Pose,
} from "@/lib/penteract";

function clamp(value: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, value));
}

export function PenteractStage({
  opened,
  active,
  onSelect,
}: {
  opened: boolean[];
  active: number;
  onSelect: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pose, setPose] = useState<Pose>(defaultPose);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#100e0c";
    ctx.fillRect(0, 0, w, h);

    const field = geometry(pose);
    const scale = Math.min(w, h) * 0.7 * zoom;
    const pts = field.points.map((v) => [w / 2 + v[0] * scale, h / 2 - v[1] * scale, v[2]] as const);
    const edges = [...field.edges].sort(
      (a, b) => pts[a[0]]![2] + pts[a[1]]![2] - (pts[b[0]]![2] + pts[b[1]]![2]),
    );
    ctx.lineCap = "round";
    for (const [a, b, axis] of edges) {
      const p = pts[a]!;
      const q = pts[b]!;
      const depth = clamp((p[2] + q[2]) / 2, 0, 1);
      ctx.globalAlpha = 0.35 + 0.65 * depth;
      ctx.strokeStyle = AXIS_COLOR[axis] ?? "#efe8dc";
      ctx.lineWidth = a === active || b === active ? 2.2 : 1.1;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    pts.forEach((p, index) => {
      const on = opened[index];
      ctx.beginPath();
      ctx.arc(p[0], p[1], index === active ? 6.5 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = index === active ? "#d24a2c" : on ? "#efe8dc" : "#1e1b16";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = on ? "#8eae78" : "#d24a2c";
      ctx.stroke();
    });
  }, [pose, zoom, opened, active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => clamp(value * Math.exp(-event.deltaY * 0.001), 0.6, 2.2));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  function pick(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const field = geometry(pose);
    const scale = Math.min(rect.width, rect.height) * 0.7 * zoom;
    let best = 16;
    let id: number | null = null;
    field.points.forEach((v, index) => {
      const x = rect.width / 2 + v[0] * scale;
      const y = rect.height / 2 - v[1] * scale;
      const d = Math.hypot(event.clientX - rect.left - x, event.clientY - rect.top - y);
      if (d < best) {
        best = d;
        id = index;
      }
    });
    if (id !== null) onSelect(id);
  }

  const error = rotationInverseError(pose);
  const latticeError = samplingLatticeError();
  const sliders: { plane: number; label: string }[] = [
    { plane: 0, label: "θ45 · t4/t5" },
    { plane: 1, label: "θ67 · t6/t7" },
    { plane: 2, label: "θ48 · t4/t8" },
    { plane: 9, label: "θ78 · t7/t8" },
  ];

  return (
    <section className="border border-line bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-seal">5-CUBE · BENCH PROJECTION</p>
          <h2 className="mt-1 font-serif text-2xl">Thirty-two vertices, eighty edges</h2>
        </div>
        <p className="font-mono text-xs text-muted">
          Rotation inverse {error < 1e-9 ? error.toExponential(1) : error.toFixed(6)}
          {" · "}
          FFT lattice {latticeError < 1e-9 ? latticeError.toExponential(1) : latticeError.toFixed(8)}
        </p>
      </div>
      <canvas
        ref={canvasRef}
        className="h-80 w-full touch-none md:h-96"
        aria-label="Penteract projection. Drag to orbit. Click a vertex."
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x;
          const dy = event.clientY - drag.current.y;
          drag.current = { x: event.clientX, y: event.clientY, sx: drag.current.sx, sy: drag.current.sy };
          setPose((current) => ({
            ...current,
            yaw: clamp(current.yaw + dx * 0.4, -180, 180),
            pitch: clamp(current.pitch + dy * 0.4, -85, 85),
          }));
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          drag.current = null;
          if (start && Math.hypot(event.clientX - start.sx, event.clientY - start.sy) < 6) pick(event);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2 lg:grid-cols-5">
        {sliders.map(({ plane, label }) => {
          const [a, b] = PLANES[plane]!;
          return (
            <label key={plane} className="font-mono text-xs text-muted">
              <span className="flex items-center justify-between gap-2">
                {label}
                <span className="text-fg tabular-nums">{(pose.rotations[plane] ?? 0).toFixed(0)}°</span>
              </span>
              <input
                className="mt-2 w-full accent-seal"
                type="range"
                min={-180}
                max={180}
                step={1}
                aria-label={`Rotation plane t${a + 4} t${b + 4}`}
                value={pose.rotations[plane] ?? 0}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setPose((current) => {
                    const rotations = current.rotations.slice();
                    rotations[plane] = value;
                    return { ...current, rotations };
                  });
                }}
              />
            </label>
          );
        })}
        <label className="font-mono text-xs text-muted">
          <span className="flex items-center justify-between gap-2">
            ρ8 · fifth-axis scale
            <span className="text-fg tabular-nums">{pose.rho.toFixed(2)}</span>
          </span>
          <input
            className="mt-2 w-full accent-seal"
            type="range"
            min={0.35}
            max={1.65}
            step={0.01}
            aria-label="Fifth axis scale"
            value={pose.rho}
            onChange={(event) => setPose((current) => ({ ...current, rho: Number(event.target.value) }))}
          />
        </label>
      </div>
      <p className="border-t border-line px-4 py-3 font-mono text-xs text-muted">
        Drag orbits the camera. The ten plane rotations stay invertible: untransform after transform returns each ±1 coordinate.
        Perspective is the bench reduction, 5D to 4D to 3D to 2D. Bone nodes are open. Seal nodes are still ciphertext.
      </p>
    </section>
  );
}
