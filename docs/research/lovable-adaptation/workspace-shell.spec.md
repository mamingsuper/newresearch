# Component spec: workspace shell

## Target

- `public/index.html`: `#workspace-nav`, `.workspace-content`, `.mobile-workspace-header`
- `public/styles.css`: workspace shell, sidebar, navigation and compact breakpoints
- `public/workspace.js`: compact navigation media query

## Desktop

- Two-column shell: `15.5rem` rail plus fluid content.
- Rail is sticky, full viewport height, vertically grouped, and separated by a quiet border.
- Current route uses the existing lilac/blue treatment. Hover uses a low-contrast surface shift.
- Corpus, locale, and account controls form the rail footer.

## Compact

- Breakpoint: `max-width: 1199px`.
- Existing drawer behavior and focus management are preserved.
- Header shows brand, account entry, and Menu without label overlap.

## Visual constraints

- Preserve `--paper`, `--blue`, `--yellow`, and `--green`.
- No Lovable logo, pink/purple brand gradient, copied icons, or copied text.
- Desktop labels must remain on one line inside the rail; content labels may wrap normally.
