import './style.css';

const STORAGE_KEY = 'voice-tool-recordings';
const DB_NAME = 'voice-tool-storage';
const DB_VERSION = 1;
const STORE_NAME = 'settings';
const DIRECTORY_HANDLE_KEY = 'save-directory-handle';

const state = {
  stream: null,
  mediaRecorder: null,
  audioChunks: [],
  recordings: [],
  activeRecordingId: '',
  saveDirectoryHandle: null,
  recordedBlob: null,
  recordedUrl: '',
  recordingStartedAt: 0,
  audioContext: null,
  analyser: null,
  meterFrame: 0,
  sourceNode: null,
};

const elements = {
  deviceStatus: document.querySelector('#device-status'),
  deviceDetail: document.querySelector('#device-detail'),
  startButton: document.querySelector('#start-button'),
  stopButton: document.querySelector('#stop-button'),
  playButton: document.querySelector('#play-button'),
  deleteButton: document.querySelector('#delete-button'),
  saveButton: document.querySelector('#save-button'),
  folderButton: document.querySelector('#folder-button'),
  folderStatus: document.querySelector('#folder-status'),
  playbackAudio: document.querySelector('#playback-audio'),
  recordingState: document.querySelector('#recording-state'),
  recordingMessage: document.querySelector('#recording-message'),
  recordingLength: document.querySelector('#recording-length'),
  meterBar: document.querySelector('#meter-bar'),
  historyCount: document.querySelector('#history-count'),
  historyList: document.querySelector('#history-list'),
};

initialize();

async function initialize() {
  bindEvents();
  await loadPersistedRecordings();
  await restoreSaveDirectoryHandle();
  renderHistory();
  await verifyAudioDevices();
}

function bindEvents() {
  elements.startButton.addEventListener('click', handleStartRecording);
  elements.stopButton.addEventListener('click', handleStopRecording);
  elements.playButton.addEventListener('click', handlePlayRecording);
  elements.deleteButton.addEventListener('click', handleDeleteRecording);
  elements.saveButton.addEventListener('click', handleSaveRecording);
  elements.folderButton.addEventListener('click', handleChooseSaveFolder);
  elements.historyList.addEventListener('click', handleHistoryAction);
}

async function verifyAudioDevices() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setDeviceStatus(
      'This browser does not support in-browser recording.',
      'Use a modern browser with microphone access enabled to use this tool.',
      false,
    );
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasMicrophone = devices.some((device) => device.kind === 'audioinput');
    const hasSpeakers = devices.some((device) => device.kind === 'audiooutput');
    const canPlayAudio = Boolean(window.AudioContext || window.webkitAudioContext);

    state.stream = stream;
    setupAudioMeter(stream);

    if (!hasMicrophone) {
      setDeviceStatus(
        'A microphone and speakers are required to use this tool.',
        'No working microphone was detected. Connect a microphone, allow audio permissions, and reload the page.',
        false,
      );
      elements.recordingMessage.textContent = 'Audio hardware check failed.';
      return;
    }

    if (!hasSpeakers && !canPlayAudio) {
      setDeviceStatus(
        'A microphone and speakers are required to use this tool.',
        'No browser audio output is available. Connect speakers or headphones and reload the page.',
        false,
      );
      elements.recordingMessage.textContent = 'Audio output check failed.';
      return;
    }

    if (!hasSpeakers) {
      setDeviceStatus(
        'Microphone is ready. Speaker detection is limited in this browser.',
        'Playback uses the default system output. If you cannot hear playback, connect speakers or headphones and verify your browser audio output settings.',
        true,
      );
      elements.startButton.disabled = false;
      return;
    }

    setDeviceStatus(
      'Microphone and speakers are ready.',
      'You can start and stop recording, play back the result, delete it, or save it as a WAV file.',
      true,
    );
    elements.startButton.disabled = false;
  } catch (error) {
    setDeviceStatus(
      'A microphone and speakers are required to use this tool.',
      'The browser could not access your microphone. Check device connections and browser permissions.',
      false,
    );
    elements.recordingMessage.textContent = 'Microphone access was denied or unavailable.';
    console.error(error);
  }
}

function setDeviceStatus(title, detail, isReady) {
  elements.deviceStatus.textContent = title;
  elements.deviceDetail.textContent = detail;
  document.body.dataset.ready = isReady ? 'true' : 'false';
}

function setupAudioMeter(stream) {
  const Context = window.AudioContext || window.webkitAudioContext;
  state.audioContext = new Context();
  state.sourceNode = state.audioContext.createMediaStreamSource(stream);
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 2048;
  state.sourceNode.connect(state.analyser);
  renderMeter();
}

async function handleStartRecording() {
  if (!state.stream) {
    await verifyAudioDevices();
    if (!state.stream) {
      return;
    }
  }

  if (!state.stream.active) {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setupAudioMeter(state.stream);
  }

  if (state.audioContext?.state === 'suspended') {
    await state.audioContext.resume();
  }

  resetSelectedRecording();

  state.audioChunks = [];
  state.recordingStartedAt = Date.now();
  state.activeRecordingId = '';

  try {
    state.mediaRecorder = createWorkingMediaRecorder(state.stream);
  } catch (error) {
    elements.recordingMessage.textContent = 'Recording could not be started in this browser configuration.';
    elements.recordingState.textContent = 'Idle';
    updateControlsAfterStop(false);
    console.error(error);
    return;
  }

  state.mediaRecorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      state.audioChunks.push(event.data);
    }
  });

  state.mediaRecorder.addEventListener('stop', async () => {
    if (state.audioChunks.length === 0) {
      elements.recordingMessage.textContent = 'No audio was captured.';
      updateControlsAfterStop(false);
      return;
    }

    const durationMs = Date.now() - state.recordingStartedAt;
    const startedAt = state.recordingStartedAt;
    const blob = new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType });
    const recording = createRecordingEntry(blob, startedAt, durationMs);

    state.recordings.unshift(recording);
    selectRecording(recording.id);
    await persistRecordings();
    renderHistory();
    elements.recordingMessage.textContent = 'Recording ready for playback, deletion, or WAV export.';
    updateControlsAfterStop(true);
  });

  try {
    startMediaRecorder(state.mediaRecorder);
    elements.recordingState.textContent = 'Recording';
    elements.recordingMessage.textContent = 'Recording in progress. Press stop when you want to finish.';
    elements.startButton.disabled = true;
    elements.stopButton.disabled = false;
    elements.playButton.disabled = true;
    elements.deleteButton.disabled = true;
    elements.saveButton.disabled = true;
  } catch (error) {
    state.mediaRecorder = null;
    elements.recordingMessage.textContent = 'Recording could not be started in this browser configuration.';
    elements.recordingState.textContent = 'Idle';
    updateControlsAfterStop(false);
    console.error(error);
  }
}

function handleStopRecording() {
  if (state.mediaRecorder?.state === 'recording') {
    state.mediaRecorder.stop();
    elements.recordingState.textContent = 'Stopped';
    elements.stopButton.disabled = true;
  }
}

function handlePlayRecording() {
  if (!state.recordedUrl) {
    return;
  }

  elements.playbackAudio.currentTime = 0;
  elements.playbackAudio.play().catch((error) => {
    console.error(error);
  });
}

function handleDeleteRecording() {
  if (!state.activeRecordingId) {
    return;
  }

  if (!window.confirm('Delete the selected recording?')) {
    return;
  }

  deleteRecording(state.activeRecordingId);
  elements.recordingMessage.textContent = 'Recording deleted. You can start a new one.';
  elements.recordingState.textContent = 'Idle';
  elements.startButton.disabled = document.body.dataset.ready !== 'true';
  elements.stopButton.disabled = true;
}

async function handleSaveRecording() {
  if (!state.recordedBlob) {
    return;
  }

  try {
    const wavBlob = await convertBlobToWav(state.recordedBlob);
    const fileName = `${getActiveRecording().fileLabel}.wav`;
    const directoryHandle = await ensureSaveDirectoryHandle();

    if (directoryHandle) {
      await saveRecordingToFolder(fileName, wavBlob);
      elements.recordingMessage.textContent = `Saved ${fileName} to ${directoryHandle.name}.`;
      return;
    }

    downloadRecording(fileName, wavBlob);
    elements.recordingMessage.textContent = `Saved ${fileName} to your browser downloads folder.`;
  } catch (error) {
    elements.recordingMessage.textContent = 'WAV export failed in this browser.';
    console.error(error);
  }
}

async function handleChooseSaveFolder() {
  await promptForSaveDirectory();
}

async function ensureSaveDirectoryHandle() {
  if (!window.showDirectoryPicker) {
    elements.folderStatus.textContent = 'Direct folder access is not supported in this browser.';
    return null;
  }

  if (state.saveDirectoryHandle) {
    const permission = await verifyDirectoryPermission(state.saveDirectoryHandle, true);
    if (permission === 'granted') {
      return state.saveDirectoryHandle;
    }

    await clearStoredDirectoryHandle();
    state.saveDirectoryHandle = null;
    updateFolderStatus();
  }

  return promptForSaveDirectory();
}

async function promptForSaveDirectory() {
  if (!window.showDirectoryPicker) {
    elements.folderStatus.textContent = 'Direct folder access is not supported in this browser.';
    elements.recordingMessage.textContent = 'This browser saves files through its normal download flow.';
    return null;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const permission = await verifyDirectoryPermission(directoryHandle, true);
    if (permission !== 'granted') {
      elements.recordingMessage.textContent = 'Folder access was not granted.';
      return null;
    }

    state.saveDirectoryHandle = directoryHandle;
    await setStoredDirectoryHandle(directoryHandle);
    updateFolderStatus();
    elements.recordingMessage.textContent = `Files will be saved to the ${directoryHandle.name} folder.`;
    return directoryHandle;
  } catch (error) {
    if (error.name !== 'AbortError') {
      elements.recordingMessage.textContent = 'Could not open the folder picker.';
      console.error(error);
    }
    return null;
  }
}

function updateControlsAfterStop(hasRecording) {
  elements.startButton.disabled = document.body.dataset.ready !== 'true';
  elements.stopButton.disabled = true;
  elements.playButton.disabled = !hasRecording;
  elements.deleteButton.disabled = !hasRecording;
  elements.saveButton.disabled = !hasRecording;
}

function clearRecording() {
  state.audioChunks = [];
  state.recordedBlob = null;
  state.recordedUrl = '';
  state.activeRecordingId = '';
  elements.playbackAudio.removeAttribute('src');
  elements.playbackAudio.load();
  elements.recordingLength.textContent = 'No recording yet';
  elements.playButton.disabled = true;
  elements.deleteButton.disabled = true;
  elements.saveButton.disabled = true;
}

function resetSelectedRecording() {
  state.audioChunks = [];
  state.recordedBlob = null;
  state.recordedUrl = '';
  state.activeRecordingId = '';
  elements.playbackAudio.removeAttribute('src');
  elements.playbackAudio.load();
  elements.recordingLength.textContent = 'No recording yet';
  elements.playButton.disabled = true;
  elements.deleteButton.disabled = true;
  elements.saveButton.disabled = true;
}

function handleHistoryAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const { action, id } = button.dataset;
  if (action === 'select') {
    selectRecording(id);
    persistRecordings().catch((error) => {
      console.error(error);
    });
    elements.recordingMessage.textContent = 'Selected a recording from history.';
    updateControlsAfterStop(true);
    return;
  }

  if (action === 'play') {
    selectRecording(id);
    persistRecordings().catch((error) => {
      console.error(error);
    });
    elements.recordingMessage.textContent = 'Playing a recording from history.';
    updateControlsAfterStop(true);
    handlePlayRecording();
    return;
  }

  if (action === 'delete') {
    if (!window.confirm('Delete this recording from history?')) {
      return;
    }

    deleteRecording(id);
    elements.recordingMessage.textContent = 'Recording deleted from history.';
  }
}

function createRecordingEntry(blob, startedAt, durationMs) {
  const id = `${startedAt}-${crypto.randomUUID()}`;
  const url = URL.createObjectURL(blob);

  return {
    id,
    blob,
    url,
    startedAt,
    durationMs,
    displayName: formatRecordingLabel(startedAt),
    fileLabel: formatRecordingFilename(startedAt),
    durationLabel: formatDuration(durationMs),
  };
}

function selectRecording(id) {
  const recording = state.recordings.find((entry) => entry.id === id);
  if (!recording) {
    clearRecording();
    renderHistory();
    return;
  }

  state.activeRecordingId = recording.id;
  state.recordedBlob = recording.blob;
  state.recordedUrl = recording.url;
  elements.playbackAudio.src = recording.url;
  elements.recordingLength.textContent = recording.durationLabel;
  renderHistory();
}

function deleteRecording(id) {
  const index = state.recordings.findIndex((entry) => entry.id === id);
  if (index === -1) {
    return;
  }

  const [removed] = state.recordings.splice(index, 1);
  URL.revokeObjectURL(removed.url);

  if (state.activeRecordingId === id) {
    clearRecording();
    if (state.recordings.length > 0) {
      selectRecording(state.recordings[0].id);
      updateControlsAfterStop(true);
      elements.recordingMessage.textContent = 'Latest remaining recording is now selected.';
    }
  }

  persistRecordings().catch((error) => {
    console.error(error);
  });
  renderHistory();
}

function renderHistory() {
  elements.historyCount.textContent = `${state.recordings.length} recording${state.recordings.length === 1 ? '' : 's'}`;

  if (state.recordings.length === 0) {
    elements.historyList.innerHTML = '<li class="history-empty">No recordings yet.</li>';
    return;
  }

  elements.historyList.innerHTML = state.recordings
    .map((recording) => {
      const isActive = recording.id === state.activeRecordingId;
      return `
        <li class="history-item${isActive ? ' active' : ''}">
          <div>
            <p class="history-title">${recording.displayName}</p>
            <p class="history-meta">Length ${recording.durationLabel}</p>
          </div>
          <div class="button-row compact history-actions">
            <button type="button" data-action="play" data-id="${recording.id}">Play</button>
            <button type="button" data-action="select" data-id="${recording.id}">${isActive ? 'Selected' : 'Load'}</button>
            <button type="button" data-action="delete" data-id="${recording.id}">Delete</button>
          </div>
        </li>
      `;
    })
    .join('');
}

function getActiveRecording() {
  return state.recordings.find((entry) => entry.id === state.activeRecordingId) || null;
}

function createWorkingMediaRecorder(stream) {
  const mimeType = pickMimeType();

  if (mimeType) {
    try {
      return new MediaRecorder(stream, { mimeType });
    } catch (error) {
      console.warn(`MediaRecorder rejected mimeType ${mimeType}. Falling back to default settings.`, error);
    }
  }

  return new MediaRecorder(stream);
}

function startMediaRecorder(mediaRecorder) {
  try {
    mediaRecorder.start(250);
  } catch (chunkedStartError) {
    if (mediaRecorder.state !== 'inactive') {
      throw chunkedStartError;
    }

    mediaRecorder.start();
  }
}

async function loadPersistedRecordings() {
  const storedValue = localStorage.getItem(STORAGE_KEY);
  if (!storedValue) {
    return;
  }

  try {
    const parsed = JSON.parse(storedValue);
    const recordings = await Promise.all(
      parsed.recordings.map(async (recording) => {
        const blob = await dataUrlToBlob(recording.dataUrl);
        return {
          id: recording.id,
          blob,
          url: URL.createObjectURL(blob),
          startedAt: recording.startedAt,
          durationMs: recording.durationMs,
          displayName: formatRecordingLabel(recording.startedAt),
          fileLabel: formatRecordingFilename(recording.startedAt),
          durationLabel: formatDuration(recording.durationMs),
        };
      }),
    );

    state.recordings = recordings;
    if (parsed.activeRecordingId) {
      selectRecording(parsed.activeRecordingId);
      updateControlsAfterStop(true);
    } else if (recordings.length > 0) {
      selectRecording(recordings[0].id);
      updateControlsAfterStop(true);
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    console.error(error);
  }
}

async function persistRecordings() {
  if (state.recordings.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const recordings = await Promise.all(
    state.recordings.map(async (recording) => ({
      id: recording.id,
      startedAt: recording.startedAt,
      durationMs: recording.durationMs,
      dataUrl: await blobToDataUrl(recording.blob),
    })),
  );

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      activeRecordingId: state.activeRecordingId,
      recordings,
    }),
  );
}

async function saveRecordingToFolder(fileName, wavBlob) {
  const fileHandle = await state.saveDirectoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(wavBlob);
  await writable.close();
}

async function restoreSaveDirectoryHandle() {
  if (!window.showDirectoryPicker) {
    updateFolderStatus();
    return;
  }

  try {
    const directoryHandle = await getStoredDirectoryHandle();
    if (!directoryHandle) {
      updateFolderStatus();
      return;
    }

    state.saveDirectoryHandle = directoryHandle;
    updateFolderStatus(await verifyDirectoryPermission(directoryHandle, false));
  } catch (error) {
    state.saveDirectoryHandle = null;
    updateFolderStatus();
    console.error(error);
  }
}

function updateFolderStatus(permissionState = 'prompt') {
  if (!window.showDirectoryPicker) {
    elements.folderStatus.textContent = 'Browser downloads folder';
    return;
  }

  if (!state.saveDirectoryHandle) {
    elements.folderStatus.textContent = 'No saved folder selected';
    return;
  }

  if (permissionState === 'granted') {
    elements.folderStatus.textContent = state.saveDirectoryHandle.name;
    return;
  }

  elements.folderStatus.textContent = `${state.saveDirectoryHandle.name} (permission needed)`;
}

async function verifyDirectoryPermission(directoryHandle, shouldRequest) {
  const options = { mode: 'readwrite' };
  if ((await directoryHandle.queryPermission(options)) === 'granted') {
    return 'granted';
  }

  if (shouldRequest) {
    return directoryHandle.requestPermission(options);
  }

  return 'prompt';
}

async function setStoredDirectoryHandle(directoryHandle) {
  const database = await openDatabase();
  await runTransaction(database, 'readwrite', (store) => store.put(directoryHandle, DIRECTORY_HANDLE_KEY));
}

async function getStoredDirectoryHandle() {
  const database = await openDatabase();
  return runTransaction(database, 'readonly', (store) => store.get(DIRECTORY_HANDLE_KEY));
}

async function clearStoredDirectoryHandle() {
  const database = await openDatabase();
  await runTransaction(database, 'readwrite', (store) => store.delete(DIRECTORY_HANDLE_KEY));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    });

    request.addEventListener('success', () => {
      resolve(request.result);
    });

    request.addEventListener('error', () => {
      reject(request.error);
    });
  });
}

function runTransaction(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);

    request.addEventListener('success', () => {
      resolve(request.result);
    });

    request.addEventListener('error', () => {
      reject(request.error);
    });
  });
}

function downloadRecording(fileName, wavBlob) {
  const exportUrl = URL.createObjectURL(wavBlob);
  const link = document.createElement('a');
  link.href = exportUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(exportUrl);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', () => {
      resolve(reader.result);
    });
    reader.addEventListener('error', () => {
      reject(reader.error);
    });
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || '';
}

function renderMeter() {
  if (!state.analyser) {
    return;
  }

  const samples = new Uint8Array(state.analyser.frequencyBinCount);
  const update = () => {
    state.analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / samples.length);
    const percentage = Math.min(100, Math.max(6, Math.round(rms * 240)));
    elements.meterBar.style.width = `${percentage}%`;
    state.meterFrame = requestAnimationFrame(update);
  };

  cancelAnimationFrame(state.meterFrame);
  update();
}

async function convertBlobToWav(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const Context = window.AudioContext || window.webkitAudioContext;
  const audioContext = new Context();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const wavBuffer = encodeWav(audioBuffer);
  await audioContext.close();
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function encodeWav(audioBuffer) {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length * channelCount * 2;
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, length, true);

  const channelData = [];
  for (let index = 0; index < channelCount; index += 1) {
    channelData.push(audioBuffer.getChannelData(index));
  }

  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < audioBuffer.length; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channelIndex][sampleIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function formatRecordingLabel(timestamp) {
  const date = new Date(timestamp);
  return `${padNumber(date.getMonth() + 1)}${padNumber(date.getDate())}${date.getFullYear()} ${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function formatRecordingFilename(timestamp) {
  return formatRecordingLabel(timestamp).replace(' ', '-');
}

function padNumber(value) {
  return String(value).padStart(2, '0');
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}