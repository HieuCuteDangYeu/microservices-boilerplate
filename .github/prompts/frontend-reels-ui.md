# Frontend Prompt 1: Reel Upload Flow

Use the current backend reel-processing flow as the source of truth.

- Before testing against the dev backend, run `pnpm migrate:content`.
- After a reel is created, immediately show it in the UI with `status: PENDING` or `PROCESSING`.
- Poll `GET /content/reels/:id/status` every 2 to 5 seconds until the reel becomes `COMPLETED` or `FAILED`.
- Render the backend fields `status`, `stage`, `message`, `progress`, `thumbnailUrl`, and `streamUrl`.
- Do not hide the reel while processing. The user should always see where the reel is in the flow.
- When the reel reaches `COMPLETED`, replace the loading state with the playable thumbnail or stream preview.
- If processing fails, show a concise failure state with a retry path that sends the user back to the camera flow.

Acceptance criteria:

- A newly created reel appears immediately.
- The reel card updates while processing without requiring a full refresh.
- The user can tell whether the reel is queued, downloading, transcoding, generating a thumbnail, indexing for AI, ready, or failed.

# Frontend Prompt 2: Preview Clip Screen

Adjust the preview clip screen so it fits the viewport without vertical scrolling.

- Remove the `Add Details` button.
- Remove the `Replace Clip` button from the preview screen.
- Keep a single primary action: `Next`.
- The video preview must use the available width cleanly and avoid black side bars that make the time unreadable.
- The time and playback controls must remain legible on all supported screen sizes.
- Reduce vertical spacing and container padding as needed so the full screen fits without scroll.
- Keep the preview visually stable when the clip is portrait video.

Acceptance criteria:

- No vertical scroll on the preview screen.
- No redundant action buttons.
- The timestamp is clearly visible and not blocked by black side bars.

# Frontend Prompt 3: Replace Clip Screen

Fix the replace-video screen so it matches the product style and does not use the wrong button chrome.

- Remove the black bordered rounded button style from `Replace` and `Discard`.
- Use the same button system as the camera/upload flow.
- Make `Replace` the primary action and `Discard` the destructive secondary action.
- Ensure spacing, border radius, and colors are consistent with the rest of the app.
- Avoid overcrowding the bottom action area on smaller screens.

Acceptance criteria:

- `Replace` and `Discard` no longer render with black bordered rounded styling.
- The replace screen looks consistent with the camera section.
- The bottom actions fit cleanly on small devices.
