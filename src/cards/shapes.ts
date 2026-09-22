import type { Shapes, Shape, Point } from "@desert-ant-labs/shapes";
import { load, timed } from "../runtime";
import { card, el } from "../ui";

export const shapesCard = () => card("shapes", (c) => {
  const canvas = el("canvas", { class: "sketch" });
  const clearBtn = el("button", { class: "ghost small", text: "Clear canvas" });
  const info = el("div", { class: "muted small", text: "Draw one stroke: a line, rectangle, triangle, ellipse or star." });
  c.body.append(canvas, el("div", { class: "row" }, clearBtn, info));
  const ctx = canvas.getContext("2d")!;
  const dpr = () => window.devicePixelRatio || 1;
  const size = () => canvas.getBoundingClientRect();
  function resize() { const r = size(); canvas.width = r.width * dpr(); canvas.height = r.height * dpr(); ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0); }
  new ResizeObserver(resize).observe(canvas);

  let stroke: Point[] = []; let drawing = false;
  const pos = (e: PointerEvent): Point => { const r = size(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const wipe = () => { const r = size(); ctx.clearRect(0, 0, r.width, r.height); };
  const style = (color: string, w = 2.5) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = ctx.lineCap = "round"; };

  function drawStroke() {
    style(getComputedStyle(canvas).getPropertyValue("--ink") || "#888");
    ctx.beginPath(); stroke.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
  }
  function drawShape(s: Shape) {
    style(getComputedStyle(canvas).getPropertyValue("--accent") || "#2d52c8", 3);
    ctx.beginPath();
    switch (s.kind) {
      case "line": ctx.moveTo(s.from.x, s.from.y); ctx.lineTo(s.to.x, s.to.y); break;
      case "rectangle": s.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); break;
      case "triangle": s.vertices.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); break;
      case "ellipse": ctx.ellipse(s.center.x, s.center.y, s.semiMajor, s.semiMinor, s.rotation, 0, 2 * Math.PI); break;
      case "star": {
        const n = s.pointCount * 2;
        for (let i = 0; i < n; i++) {
          const r = i % 2 === 0 ? s.outerRadius : s.innerRadius;
          const a = s.rotation + (i * Math.PI) / s.pointCount - Math.PI / 2;
          const x = s.center.x + r * Math.cos(a), y = s.center.y + r * Math.sin(a);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
      }
    }
    ctx.stroke();
  }
  function describe(s: Shape): string {
    const r = (n: number) => Math.round(n);
    switch (s.kind) {
      case "line": return `line (${r(s.from.x)},${r(s.from.y)}) → (${r(s.to.x)},${r(s.to.y)})`;
      case "rectangle": return `rectangle, corners ${s.corners.map((p) => `(${r(p.x)},${r(p.y)})`).join(" ")}`;
      case "triangle": return `triangle, vertices ${s.vertices.map((p) => `(${r(p.x)},${r(p.y)})`).join(" ")}`;
      case "ellipse": return `ellipse centre (${r(s.center.x)},${r(s.center.y)}) axes ${r(s.semiMajor)}×${r(s.semiMinor)} rot ${(s.rotation * 180 / Math.PI).toFixed(0)}°${Math.abs(s.semiMajor - s.semiMinor) < 0.5 ? " (snapped to a circle)" : ""}`;
      case "star": return `${s.pointCount}-point star, radii ${r(s.outerRadius)}/${r(s.innerRadius)}`;
    }
  }

  canvas.addEventListener("pointerdown", (e) => { drawing = true; stroke = [pos(e)]; wipe(); c.out.textContent = ""; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!drawing) return; stroke.push(pos(e)); wipe(); drawStroke(); });
  canvas.addEventListener("pointerup", async () => {
    drawing = false;
    if (stroke.length < 2) return;
    c.setBusy("Recognising…");
    try {
      const shapes = await load<Shapes>("shapes");
      const shape = await timed("shapes", "recognize", () => shapes.recognize(stroke));
      wipe(); drawStroke();
      if (shape) { drawShape(shape); c.out.replaceChildren(el("p", { text: `Recognised: ${describe(shape)} (${stroke.length} points)` })); }
      else c.out.replaceChildren(el("p", { class: "muted", text: "No shape recognised. The model rejects rough or ambiguous strokes on purpose." }));
    } catch (e) { c.showError(e); }
  });
  clearBtn.onclick = () => { stroke = []; wipe(); c.out.textContent = ""; };
  // Warm the model when the card opens: it is 1.3 MB.
  c.root.addEventListener("toggle", () => { if (c.root.open) load("shapes").catch(() => {}); });
});
