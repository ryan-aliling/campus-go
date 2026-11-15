# AI Log — Live-location ball visibility

- **Date:** 2026-11-15
- **Team member:** ryan
- **AI tool / model:** Copilot SDK in VS Code
- **Objective:** Make the live-location ball easier to spot when the map is zoomed out and prepare the change as a separate merge request.

## AI Prompts Used
1. Asked the AI to make the ball easier to spot because it was too small when zoomed out.
2. Asked to keep this work in a separate AI log and prepare it as a new merge request.

## Decisions Made
- Increased the live-position ball from 42 px to 48 px.
- Increased the minimum zoomed-out scale from 30% to 55%.
- Increased the marker box and anchor to keep the larger marker centered.
- Added a regression test for the minimum zoomed-out scale.
- Kept the photo-integration work in its existing log and treated the live-ball change as a separate merge-request task.
- Verified the focused live-ball tests, ESLint, and Prettier successfully.
