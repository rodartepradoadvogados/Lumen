"use client";

import { createElement, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

// Animação sutil de "reveal on scroll" para a homepage pública do Gestão Jurídica
// (app/page.tsx) — mesmo comportamento do mockup aprovado (proposta-homepage.html):
// os blocos entram com fade + leve translateY quando cruzam a viewport, via
// IntersectionObserver, e respeitam prefers-reduced-motion (nesse caso aparecem
// direto, sem animação, exatamente como no script do mockup).
export default function HomepageReveal({
  as: Tag = "div",
  className,
  visibleClassName,
  children,
}: {
  as?: ElementType;
  className?: string;
  visibleClassName: string;
  children: ReactNode;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return createElement(
    Tag,
    { ref, className: `${className ?? ""} ${visible ? visibleClassName : ""}` },
    children
  );
}
