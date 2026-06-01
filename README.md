# voice-tool

Browser-based voice recording tool with continuous recording, instant playback, persistent history, delete confirmation, and WAV export.

## Run locally

```bash
npm install
npm run dev
```

## What it does

- Checks browser audio recording support when the page loads.
- Requests microphone access and verifies that a microphone is available.
- Starts recording when the user presses Start.
- Stops recording when the user presses Stop.
- Lets the user play back the latest recording immediately.
- Keeps a recording history in the browser across page reloads.
- Shows each history entry using the recording start time in `MMDDYYYY HH:MM` 24-hour format.
- Shows the length of each recording in the history list.
- Lets the user play any recording directly from its history row.
- Asks for confirmation before deleting the selected recording or a history item.
- Saves exported files as `.wav` using the recording start time as the filename.

## Recording history

- History is stored in browser local storage, so recordings remain available after a page reload in the same browser profile.
- The history list lets you play, load, or delete each recording independently.
- The main playback panel always reflects the currently selected history item.

## Browser note

Browsers do not expose perfectly reliable cross-browser speaker detection. This app verifies microphone access directly and uses browser output-device information when available. If speaker enumeration is limited by the browser, the app falls back to default system playback and tells the user that output verification is limited.

## Storage note

Persistent history uses browser storage limits. Very large or many recordings may eventually exceed the available storage in a given browser.
