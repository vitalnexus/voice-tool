# voice-tool

Browser-based voice recording tool with continuous recording, live transcription, instant playback, persistent history, delete confirmation, and WAV export.

## Run locally


Browser-based voice recording tool with continuous recording, live preview transcription, post-recording speech-to-text, instant playback, persistent history, delete confirmation, and WAV/TXT export.
```bash
npm install
npm run dev
```

## What it does

- Checks browser audio recording support when the page loads.
- Requests microphone access and verifies that a microphone is available.
- Starts recording when the user presses Start.
- Stops recording when the user presses Stop.
- Shows live speech-to-text output while you speak when the browser supports speech recognition.
- Stores the captured transcript with each recording and shows it again after the recording is loaded.
- Lets the user play back the latest recording immediately.
- Keeps a recording history in the browser across page reloads.
- Shows each history entry using the recording start time in `MMDDYYYY HH:MM` 24-hour format.
- Shows the length of each recording in the history list.
- Lets the user play any recording directly from its history row.
- Asks for confirmation before deleting the selected recording or a history item.
- Saves exported files as `.wav` using the recording start time as the filename.
- Saves a matching `.txt` file with the transcript in the same location as the `.wav` file.
- Prompts for a save folder only when one has not already been saved for this browser.
- Remembers the chosen save folder across browser reloads when the browser supports persisted file handles.
- Saves `.wav` files directly to the hard drive when the browser supports folder access.

## Recording history

- History is stored in browser local storage, so recordings remain available after a page reload in the same browser profile.
- The history list lets you play, load, or delete each recording independently.
- The main playback panel always reflects the currently selected history item, including its stored transcript text.

## Browser note

Browsers do not expose perfectly reliable cross-browser speaker detection. This app verifies microphone access directly and uses browser output-device information when available. If speaker enumeration is limited by the browser, the app falls back to default system playback and tells the user that output verification is limited.

## Transcription note

- Live transcription uses the browser Speech Recognition API, which is best supported in Chromium-based browsers.
- When speech recognition is unavailable or fails, recording still works, but transcript capture may be empty.
- The current implementation stores the transcript captured during recording; it does not perform offline transcription of an already-saved WAV file.

## Storage note

Persistent history uses browser storage limits. Very large or many recordings may eventually exceed the available storage in a given browser.
- After recording stops, the app also runs a browser-side Whisper transcription pass to generate the final text.
- The first transcription run downloads the model into the browser cache, so it is slower than later runs.
- Saving the WAV and TXT files is disabled until the transcript is ready.

## File saving note

- In browsers that support the File System Access API, the app stores the chosen folder handle in browser storage and reuses it on later loads.
- If a remembered folder still needs permission, the app asks for that permission when you save again instead of asking for a new path immediately.
- Saving now writes both a `.wav` file and a matching `.txt` transcript file.
- Before playback, the app verifies that both saved files exist when the recording was saved to a chosen folder. If either file is missing, playback is blocked and the page shows which file is missing.
- In browsers that do not support direct folder access, the app falls back to the normal browser download location.
