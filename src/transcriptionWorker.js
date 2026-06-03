import { pipeline } from '@xenova/transformers';

let transcriberPromise;

async function getTranscriber() {
  if (!transcriberPromise) {
    postMessage({
      type: 'status',
      status: 'Loading model',
      message: 'Downloading the speech-to-text model. This may take a minute on first use.',
    });

    transcriberPromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
  }

  return transcriberPromise;
}

self.addEventListener('message', async ({ data }) => {
  if (data.type !== 'transcribe') {
    return;
  }

  try {
    postMessage({
      type: 'status',
      status: 'Transcribing',
      message: 'Transcribing the recorded audio into text.',
    });

    const transcriber = await getTranscriber();
    const result = await transcriber(data.audioData, {
      chunk_length_s: 20,
      stride_length_s: 5,
      language: 'english',
      return_timestamps: false,
      sampling_rate: data.sampleRate,
    });

    postMessage({
      type: 'result',
      jobId: data.jobId,
      text: typeof result === 'string' ? result : result.text,
    });
  } catch (error) {
    postMessage({
      type: 'error',
      jobId: data.jobId,
      message: error?.message || 'Transcription failed.',
    });
  }
});