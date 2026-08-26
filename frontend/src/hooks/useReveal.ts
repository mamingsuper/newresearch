import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function useInView<T extends HTMLElement>(threshold = 0.24) {
  const ref = useRef<T>(null);
  const reducedMotion = useReducedMotion();
  const [isInView, setIsInView] = useState(reducedMotion);

  useEffect(() => {
    const element = ref.current;
    if (!element || reducedMotion || !("IntersectionObserver" in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsInView(true);
        observer.disconnect();
      },
      { threshold, rootMargin: "0px 0px -8%" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion, threshold]);

  return { ref, isInView, reducedMotion };
}

export function useReveal(rootRef: React.RefObject<HTMLElement | null>, routeKey: string) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const seen = new WeakSet<Element>();
    const revealImmediately = reducedMotion || !("IntersectionObserver" in window);
    const observer = revealImmediately
      ? null
      : new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("is-revealed");
              observer?.unobserve(entry.target);
            });
          },
          { threshold: 0.14, rootMargin: "0px 0px -7%" },
        );

    const register = (scope: ParentNode) => {
      const elements = scope instanceof HTMLElement && scope.matches("[data-reveal]")
        ? [scope, ...scope.querySelectorAll<HTMLElement>("[data-reveal]")]
        : [...scope.querySelectorAll<HTMLElement>("[data-reveal]")];

      elements.forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        if (revealImmediately) element.classList.add("is-revealed");
        else observer?.observe(element);
      });
    };

    register(root);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) register(node);
      }));
    });
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer?.disconnect();
    };
  }, [reducedMotion, rootRef, routeKey]);
}
