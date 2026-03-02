"use client";

import { type PointerEvent, type ReactNode, useRef, useState } from "react";

type DragScrollProps = {
  className?: string;
  children: ReactNode;
};

export default function DragScroll({ className, children }: DragScrollProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;

    const container = containerRef.current;
    if (!container) return;

    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = event.clientX;
    scrollLeftRef.current = container.scrollLeft;

    container.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    if (!isDraggingRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    event.preventDefault();

    const deltaX = event.clientX - startXRef.current;
    container.scrollLeft = scrollLeftRef.current + deltaX;
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;

    const container = containerRef.current;
    if (!container) return;

    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      container.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={containerRef}
      className={[
        className,
        "cursor-grab",
        isDragging ? "cursor-grabbing" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // Keep vertical page scroll working on touch/trackpads.
      style={{ touchAction: "pan-y" }}
    >
      {children}
    </div>
  );
}
