# Lovable-inspired product shell: behavior contract

This adaptation borrows public interaction patterns, not Lovable branding, copy, assets, or implementation code.

## Navigation

- At `1200px` and wider, the workspace uses a persistent left rail and the page scrolls independently to its right.
- Below `1200px`, the rail becomes an inert off-canvas drawer opened by the visible Menu button.
- The drawer closes after navigation, authentication intent selection, Escape, or a breakpoint change.
- The account entry stays at the bottom of the desktop rail and remains visible in the compact header.

## Authentication

- Anonymous users see a provider-first sign-in card: Google when enabled, optional GitHub, then email magic link.
- Disabled providers remain visibly unavailable instead of failing after a click.
- Authenticated users see a product settings center rather than the sign-in form.
- Existing authentication state, intent restoration, focus restoration, and element IDs remain unchanged.

## Account center

- Overview shows identity and private-library counts.
- Plan and usage shows the current Free or Pro plan, remaining daily analyses for Free, and the relevant Stripe action.
- Data and privacy keeps export, sign out, and delete-account actions visually separated from routine controls.
- Saved papers and Conversations buttons continue routing to their existing workspace sections.

## Motion and accessibility

- Hover and reveal motion is subtle, communicates hierarchy, and never blocks interaction.
- `prefers-reduced-motion` disables drawer and reveal animation.
- Focus remains visible, dialog content remains scrollable, and controls keep at least a 44px target height.
