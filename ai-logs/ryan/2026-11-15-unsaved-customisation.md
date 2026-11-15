# AI Log — Unsaved customisation confirmation

- **Date:** 2026-11-15
- **Team member:** ryan
- **AI tool / model:** Copilot SDK in VS Code
- **Objective:** Add a confirmation before leaving the map customisation panel when there are unsaved changes, and prepare the change as a separate task.

## AI Prompts Used
1. Asked to add a confirmation such as “You have unsaved changes” when exiting customisation without saving.
2. Clarified that “exit” means the Profile page close button that returns to the map, not only collapsing the Customisation panel.
3. Clarified that the confirmation must offer “Save and leave” and “Keep editing”.
4. Asked to add all three actions with visually distinct and obvious buttons.
5. Asked for help writing the commit message and merge-request description.

## Decisions Made
- Reused the existing saved-versus-draft style comparison to detect unsaved changes.
- Kept closing without a confirmation when no changes exist.
- Added an accessible confirmation modal with “Keep editing” and “Leave without saving”.
- Added a regression test covering confirmation, cancellation, and discard behavior.
- Verified the focused customisation tests (9 passed), ESLint, Prettier, and diff checks.
- Fixed the first implementation after testing showed the native `<details>` toggle could close before its `onToggle` handler ran; the confirmation now intercepts the summary click before the panel closes.
- Re-ran the focused customisation tests (9 passed) and ESLint successfully after the fix.
- Added the page-close navigation guard so the Profile close button also shows the confirmation before returning to the map.
- Added a regression test for page-close navigation; the focused suite now passes 10 tests.
- Replaced the discard action with “Save and leave”; saving completes before the customisation panel or Profile page closes.
- Restored the third “Leave without saving” action, with green save, neutral keep-editing, and dark-red discard styling.
- Re-ran the focused customisation tests (10 passed), ESLint, Prettier, and diff checks successfully.
- Prepared the commit message, merge-request title, summary, testing notes, and checklist wording for this change.
- Diagnosed the frontend pipeline failure: the German translation completeness test found five new confirmation strings without translations.
- Added German translations for “Unsaved changes”, the confirmation message, and all three exit actions.
- Re-ran the full frontend suite (31 files, 248 tests), lint, formatting, and production build successfully.
