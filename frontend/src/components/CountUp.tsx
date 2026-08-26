import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/useReveal";

interface CountUpProps {
  value: number;
  duration?: number;
  className?: string;
}

export function CountUp({ value, duration = 1500, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();
  const [isInView, setIsInView] = useState(reducedMotion);
  const [displayValue, setDisplayValue] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    const element = ref.current;
    if (!element || reducedMotion || !("IntersectionObserver" in window)) {
      setIsInView(true);
      return;
    }

    const bounds = element.getBoundingClientRect();
    const isInitiallyVisible =
      bounds.bottom >= 0 &&
      bounds.top <= window.innerHeight &&
      bounds.right >= 0 &&
      bounds.left <= window.innerWidth;

    if (isInitiallyVisible) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsInView(true);
        observer.disconnect();
      },
      { threshold: 0, rootMargin: "0px 0px -8%" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || duration <= 0) {
      setDisplayValue(value);
      return;
    }
    if (!isInView) {
      return;
    }

    let frame = 0;
    const startedAt = performance.now();
    setDisplayValue(0);

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, isInView, reducedMotion, value]);

  return (
    <span ref={ref} className={className} aria-label={value.toLocaleString("en-US")}>
      {displayValue.toLocaleString("en-US")}
    </span>
  );
}
