/* eslint-disable @typescript-eslint/no-explicit-any */

// Intercept fetch calls to handle SPA fallback of local dev server returning HTML for missing assets
// This MUST be set up before importing @xenova/transformers to prevent it caching the original fetch
const originalFetch = self.fetch;
self.fetch = async (input: any, init?: any) => {
  const response = await originalFetch(input, init);
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('text/html')) {
    return new Response('Not Found', { status: 404, statusText: 'Not Found' });
  }
  return response;
};

let pipeline: any = null;
let env: any = null;

// Dynamically import @xenova/transformers after fetch interception is active
const transformersPromise = import('@xenova/transformers').then((m) => {
  pipeline = m.pipeline;
  env = m.env;

  // Allow loading model files locally (served from public/models)
  env.allowLocalModels = true;
  env.localModelPath = `${self.location.origin}/models/`;

  // Allow fallback to Hugging Face remote CDN if local files are missing
  env.allowRemoteModels = true;
});

let transcriber: any = null;

self.addEventListener('message', async (event: MessageEvent) => {
  const { type, data } = event.data;

  if (type === 'load') {
    const { modelName } = data;
    try {
      self.postMessage({ type: 'status', data: { status: 'loading', message: `Loading ${modelName}...` } });

      // Wait for @xenova/transformers dynamic import to complete
      await transformersPromise;

      transcriber = await pipeline('automatic-speech-recognition', modelName, {
        progress_callback: (x: any) => {
          if (x.status === 'progress') {
            self.postMessage({
              type: 'status',
              data: {
                status: 'progress',
                progress: x.progress,
                file: x.file,
              }
            });
          }
        }
      });

      self.postMessage({
        type: 'status',
        data: { status: 'ready', message: `Model ${modelName} loaded successfully!` }
      });
    } catch (err: any) {
      console.error('Whisper worker: Failed to load model', err);
      
      // Auto-clear cache to recover from corrupted cache entries (e.g. cached HTML responses)
      if (typeof caches !== 'undefined') {
        try {
          await caches.delete('transformers-cache');
          console.log('Cleared "transformers-cache" due to load failure to allow fresh download.');
        } catch (cacheErr) {
          console.error('Failed to clear cache:', cacheErr);
        }
      }

      self.postMessage({
        type: 'status',
        data: { status: 'error', error: err.message || String(err) }
      });
    }
  }

  if (type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', data: 'Model not loaded yet' });
      return;
    }

    const { audio, language, id } = data;
    try {
      const startTime = performance.now();

      // Determine correct language parameter for Whisper
      // Supported options are "chinese", "japanese", "english", etc.
      let whisperLang = 'english';
      if (language === 'zh-TW' || language === 'zh-CN') {
        whisperLang = 'chinese';
      } else if (language === 'ja-JP') {
        whisperLang = 'japanese';
      }

      // Transcribe audio using Whisper ONNX
      const response = await transcriber(audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: whisperLang,
        task: 'transcribe',
        return_timestamps: false,
      });

      const duration = performance.now() - startTime;

      self.postMessage({
        type: 'result',
        data: {
          text: response.text,
          duration,
          id,
        }
      });
    } catch (err: any) {
      console.error('Whisper worker: Transcription failed', err);
      self.postMessage({ type: 'error', data: err.message || String(err) });
    }
  }
});
