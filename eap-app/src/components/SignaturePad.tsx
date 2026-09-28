"use client";

import { useEffect, useRef, useState } from "react";

// A box to sign in with a finger, pen or mouse. The drawing goes into a hidden field as a PNG.
export function SignaturePad({ name, invalid }: { name: string; invalid?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState("");
  const drawing = useRef(false);
  const drawn = useRef(false);

  useEffect(() => {
    const c = canvas.current!;
    // Sharp lines on high-resolution screens.
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1b2233";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawn.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (drawn.current) setValue(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    drawn.current = false;
    setValue("");
  };

  return (
    <div className="signature">
      <canvas
        ref={canvas}
        className={`signature-pad${invalid ? " invalid" : ""}`}
        aria-label="Sign here with your finger or mouse"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
      />
      <input type="hidden" name={name} value={value} />
      <div className="actions" style={{ justifyContent: "space-between" }}>
        <span className="small">{value ? "Signed." : "Sign in the box above."}</span>
        <button type="button" className="ghost small-btn" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}
