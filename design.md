# Idea Radar design system

Hallmark direction: **modern-minimal Bauhaus research workbench**. This is a product interface for social-science researchers, not a marketing site. The visual hierarchy should make evidence, provenance, limits, and the next action obvious.

## Design decisions

- Macrostructure: Workbench for analysis and private workspace routes; Long Document for generated reports.
- Navigation: compact N1b instrument rail with five real destinations; mobile collapses to a labelled drawer.
- Palette: warm paper and ink carry most of the surface. Bauhaus blue is the single interaction accent; red and yellow appear only as semantic signals and short construction marks.
- Type: Instrument Sans for UI and display, Newsreader for paper titles and report prose, DM Mono only for corpus counts and technical metadata.
- Motion: one route entrance, one radar sweep, one evidence-card stagger. Hover and press feedback are micro-only. Reduced motion removes spatial movement.
- Geometry: 4-point spacing scale, fluid `clamp()` sizing, 44 px minimum controls, one containment layer per component.

## Page family

| Route | Shape | Primary task |
| --- | --- | --- |
| New analysis | Workbench + H2 split | Define a question, select depth/model, start analysis |
| Progress | Workbench | Understand the current stage and expected wait |
| Results | Long Document | Read, verify, save, and export grounded findings |
| Conference library | Index/spec sheet | Filter and inspect indexed conference papers |
| Saved papers | Personal index | Find and manage a private reading list |
| Conversations | Personal index | Reopen, rename, export, or remove analyses |
| Submit a program | Compact form | Add a conference source with explicit provenance |
| Account | Settings workbench | Manage plan, data export, sign-out, and account deletion |

## Interaction contract

All buttons, links, inputs, and dialogs support default, hover, focus, pressed, disabled, loading, error, and success states where applicable. Focus rings are instant and visible. Forms retain a stable border width. Errors state what failed and the next action. Destructive account deletion remains confirmed; reversible list actions update optimistically.

## Responsive contract

The interface is verified at 320, 375, 414, 768, 1280, and 1920 CSS pixels. Clickable labels remain on one line; containers reflow instead. Multi-column regions collapse below 60 rem. The top navigation becomes a drawer below the content-driven desktop threshold. `html` and `body` use `overflow-x: clip`.

## Exports

`tokens.css` is the canonical source. Tailwind v4 mapping:

```css
@theme inline {
  --color-canvas: var(--color-paper);
  --color-surface: var(--color-paper-2);
  --color-ink: var(--color-ink);
  --color-muted: var(--color-muted);
  --color-accent: var(--color-accent);
  --font-sans: var(--font-body);
  --font-serif: var(--font-reading);
  --font-mono: var(--font-outlier);
}
```

DTCG mapping:

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(95.5% 0.018 88)", "$type": "color" },
    "ink": { "$value": "oklch(20.5% 0.014 82)", "$type": "color" },
    "accent": { "$value": "oklch(52% 0.220 264)", "$type": "color" }
  },
  "font": {
    "body": { "$value": "Instrument Sans", "$type": "fontFamily" },
    "reading": { "$value": "Newsreader", "$type": "fontFamily" }
  }
}
```

shadcn/ui mapping:

```css
:root {
  --background: 95.5% 0.018 88;
  --foreground: 20.5% 0.014 82;
  --card: 98.5% 0.010 88;
  --card-foreground: 20.5% 0.014 82;
  --primary: 52% 0.220 264;
  --primary-foreground: 98% 0.010 88;
  --secondary: 91.5% 0.022 88;
  --secondary-foreground: 31% 0.016 82;
  --border: 83% 0.018 88;
  --input: 83% 0.018 88;
  --ring: 58% 0.230 264;
  --destructive: 55% 0.210 25;
  --destructive-foreground: 98% 0.010 88;
  --radius: 0.625rem;
}
```

## Quality gates

No invented metrics, gradient text, pure black/white surfaces, card-in-card layouts, wrapped primary affordances, `transition-all`, universal hover scaling, decorative emojis, autoplay media, or unbounded scroll animation. Real corpus figures (8,906, APSA 5,493, ICA 3,413) may appear because they are live verified values.
