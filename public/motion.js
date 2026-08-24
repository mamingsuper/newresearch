const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const revealSelectors = [
  '.section-intro',
  '.method-grid article',
  '.conference-library-shell > .eyebrow',
  '.conference-library-shell > h2',
  '.program-intro',
  '.conference-card',
  '.report-heading',
  '.report-card',
  '.related-paper-card',
  '.privacy-strip',
  '.program-submission-shell > *',
  '.saved-paper-card',
  '.conversation-card',
];

const materialSelectors = [
  '.corpus-overview',
  '.idea-console',
  '.report-card',
  '.related-paper-card',
];

export function initPremiumMotion() {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  const cleanups = [];

  if (reducedMotion) {
    root.classList.add('motion-reduced');
    return () => root.classList.remove('motion-reduced');
  }

  const heroElements = [
    '.query-intro .eyebrow',
    '#hero-title',
    '.hero-copy',
    '.corpus-overview',
    '.idea-console',
    '.example-row',
  ];

  heroElements.forEach((selector, index) => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.classList.add('motion-enter');
    element.style.setProperty('--motion-order', String(index));
  });

  root.classList.add('motion-ready');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('motion-in')));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

  const registerReveal = (scope = document) => {
    const selector = revealSelectors.join(',');
    const elements = scope.matches?.(selector) ? [scope] : [...scope.querySelectorAll(selector)];

    elements.forEach((element, index) => {
      if (element.classList.contains('motion-reveal')) return;
      element.classList.add('motion-reveal');
      element.style.setProperty('--reveal-order', String(index % 4));
      observer.observe(element);
    });
  };

  registerReveal();

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) registerReveal(node);
      });
    });
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  const materialCleanups = [];
  const registerMaterial = (element) => {
    if (element.dataset.materialMotion === 'ready') return;
    element.dataset.materialMotion = 'ready';

    const handlePointerMove = (event) => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
      element.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
    };
    const handlePointerLeave = () => {
      element.style.removeProperty('--spot-x');
      element.style.removeProperty('--spot-y');
    };

    element.addEventListener('pointermove', handlePointerMove, { passive: true });
    element.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    materialCleanups.push(() => {
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerleave', handlePointerLeave);
      delete element.dataset.materialMotion;
    });
  };

  const registerMaterials = (scope = document) => {
    const selector = materialSelectors.join(',');
    const elements = scope.matches?.(selector) ? [scope] : [...scope.querySelectorAll(selector)];
    elements.forEach(registerMaterial);
  };
  registerMaterials();

  const materialObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) registerMaterials(node);
      });
    });
  });
  materialObserver.observe(document.body, { childList: true, subtree: true });

  cleanups.push(
    () => observer.disconnect(),
    () => mutationObserver.disconnect(),
    () => materialObserver.disconnect(),
    () => materialCleanups.forEach((cleanup) => cleanup()),
    () => root.classList.remove('motion-ready', 'motion-in'),
  );

  return () => cleanups.forEach((cleanup) => cleanup());
}
