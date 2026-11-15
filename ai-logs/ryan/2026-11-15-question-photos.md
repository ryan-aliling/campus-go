# AI Log — CampusGO checkpoint and question photos

- **Date:** 2026-11-15
- **Team member:** ryan
- **AI tool / model:** Copilot SDK in VS Code
- **Objective:** Integrate the `CampusGO_Photos` folder into the checkpoint carousel and quiz question photos, update the frontend mock data, and document the new asset location.

## AI Prompts Used
1. Asked where to put a folder containing checkpoint and question photos.
2. Asked the AI to inspect `CampusGO_Photos` and edit the code to use the photos where necessary.
3. Asked the AI to create AI logs for the changes made.
4. Reported that the CI pipeline failed and provided the failing static-photo test output.
5. Asked for help completing the merge-request title, summary, testing section, and checklist.
6. Asked to make the live-location ball easier to spot when the map is zoomed out.

## Decisions Made
- Kept the supplied photos under `frontend/public/places/CampusGO_Photos/`.
- Reused the existing database image support instead of changing the schema.
- Updated checkpoint photo references in `frontend/src/api/places.json`.
- Updated question photo references in `backend/src/db/question-bank.js`.
- Synchronized `frontend/src/api/question-bank.json` with the backend question bank.
- Updated the related README, question-bank, and photo-credit documentation.
- Verified the photo URLs, linting, formatting, and frontend tests. Backend tests were not run successfully because MySQL was unavailable at `127.0.0.1:3307`.
- After the pipeline reported an unused-photo failure, removed the obsolete duplicate `frontend/public/quests` assets, updated the static photo test to use the canonical `CampusGO_Photos` folder, and compressed the oversized CAS Cafe image below the 400 KB test limit.
- Re-ran the Python unit tests, Black, and Pylint successfully; the Python unit suite passed with 58 tests passed and 6 platform-specific skips.
- Prepared a merge-request title and description targeting `preproduction`, with no issue link because no issue number was provided.
- Increased the live-position ball size, raised its minimum zoomed-out scale to 55%, and added a regression test for the visibility behavior.
