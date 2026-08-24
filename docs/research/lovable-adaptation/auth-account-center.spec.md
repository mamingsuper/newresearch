# Component spec: authentication and account center

## Target

- `public/index.html`: `#auth-dialog`
- `public/styles.css`: authentication and account rules
- Existing JavaScript bindings must not change.

## Anonymous state

- Compact centered card with product mark, short title and security copy.
- Enabled provider buttons appear first and span the available width.
- Email magic link follows a semantic separator.
- Google retains its official multicolor symbol.

## Authenticated state

- Dialog expands to a settings-center layout.
- Left rail names the three real areas: Overview, Plan and usage, Data and privacy.
- Right content presents identity, library counts, plan/usage, billing actions, export, sign out, and deletion.
- Required preserved IDs: `account-email`, `account-plan-name`, `account-plan-details`, `account-upgrade`, `account-manage-billing`, `account-saved-papers`, `account-conversations`, `account-saved-count`, `account-conversation-count`, `account-export`, `account-delete`, `account-status`, `auth-sign-out`.

## Responsive

- Settings rail collapses into a horizontal section index below `760px`.
- Account cards collapse to one column below `560px`.
- Dialog never exceeds the viewport and remains keyboard-scrollable.
