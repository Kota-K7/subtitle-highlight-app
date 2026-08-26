/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Converter } from 'opencc-js';

// Initialize Simplified to Traditional Chinese converter
const s2tConverter = Converter({ from: 'cn', to: 'tw' });

interface SpeechRecognitionParams {
  lang: string;
  mode: 'web-speech' | 'local-whisper';
  modelName: string; // e.g., 'Xenova/whisper-tiny' or 'Xenova/whisper-base'
  interimResultCallback?: (text: string) => void;
  finalResultCallback?: (text: string) => void;
  onDebugLog?: (msg: string) => void;
}

export interface LocalWhisperState {
  status: 'idle' | 'loading' | 'progress' | 'ready' | 'error';
  progress: number;
  message: string;
  error?: string;
}

export function useSpeechRecognition({
  lang,
  mode,
  modelName,
  interimResultCallback,
  finalResultCallback,
  onDebugLog,
}: SpeechRecognitionParams) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web Worker for Whisper
  const workerRef = useRef<Worker | null>(null);
  const [localWhisperState, setLocalWhisperState] = useState<LocalWhisperState>({
    status: 'idle',
    progress: 0,
    message: '',
  });

  // Web Audio refs for real recording and VAD
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Web Speech API refs
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const restartTimeoutRef = useRef<any>(null);

  // Local Whisper transcription variables
  const audioChunksRef = useRef<Float32Array[]>([]);
  const isSpeakingRef = useRef(false);
  const silenceTimerRef = useRef(0); // in seconds
  const lastInterimTimeRef = useRef(0); // timestamp of last interim transcription

  // Helper to log debug events
  const log = useCallback((msg: string) => {
    if (onDebugLog) onDebugLog(msg);
  }, [onDebugLog]);

  // Check browser support for Web Speech API
  useEffect(() => {
    const isBrowserSupported =
      typeof window !== 'undefined' &&
      ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(isBrowserSupported);
  }, []);

  // Initialize Web Worker for Local Whisper
  const initWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    log('Initializing Whisper worker...');
    const worker = new Worker(
      new URL('../utils/whisper.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.addEventListener('message', (event) => {
      const { type, data } = event.data;

      if (type === 'status') {
        const { status, progress, message, error: workerErr } = data;
        log(`Worker status: ${status} | ${message || ''}`);
        
        setLocalWhisperState({
          status,
          progress: progress || 0,
          message: message || '',
          error: workerErr,
        });

        if (status === 'error') {
          setError(`Whisper Error: ${workerErr}`);
          setIsListening(false);
          isListeningRef.current = false;
        }
      } else if (type === 'result') {
        let { text } = data;
        if (!text || !text.trim()) return;

        // Apply Traditional Chinese conversion if language is zh-TW
        if (lang === 'zh-TW') {
          text = s2tConverter(text);
        }

        log(`Whisper transcribed chunk: "${text}"`);
        
        // Callback handling
        if (data.id === 'final') {
          if (finalResultCallback) finalResultCallback(text);
        } else {
          if (interimResultCallback) interimResultCallback(text);
        }
      } else if (type === 'error') {
        log(`Worker error: ${data}`);
        setError(`Whisper transcribing error: ${data}`);
      }
    });

    workerRef.current = worker;
    return worker;
  }, [lang, finalResultCallback, interimResultCallback, log]);

  // Handle Whisper model load on mount or modelName changes (loads background startup)
  useEffect(() => {
    const worker = initWorker();
    log(`Background loading Whisper model: ${modelName}`);
    worker.postMessage({ type: 'load', data: { modelName } });
  }, [modelName, initWorker, log]);

  // Web Speech API Initialization
  useEffect(() => {
    if (!supported || mode !== 'web-speech') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => {
      setError(null);
      log('Web Speech API started (onstart)');
    };

    recognition.onaudiostart = () => log('Microphone audio capture started (onaudiostart)');
    recognition.onsoundstart = () => log('Sound detected (onsoundstart)');
    recognition.onspeechstart = () => log('Speech detected (onspeechstart)');
    recognition.onspeechend = () => log('Speech ended (onspeechend)');
    recognition.onsoundend = () => log('Sound ended (onsoundend)');
    recognition.onaudioend = () => log('Audio capture ended (onaudioend)');

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (interimTranscript) {
        log(`Interim text: "${interimTranscript}"`);
        if (interimResultCallback) interimResultCallback(interimTranscript);
      }
      if (finalTranscript) {
        log(`Final text: "${finalTranscript}"`);
        if (finalResultCallback) finalResultCallback(finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('SpeechRecognition error:', event.error);
      log(`Speech recognition error event: "${event.error}"`);
      
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please check browser settings.');
        setIsListening(false);
        isListeningRef.current = false;
      } else if (event.error === 'audio-capture') {
        setError('No microphone found or microphone is busy.');
        setIsListening(false);
        isListeningRef.current = false;
      } else if (event.error === 'no-speech') {
        log('No speech detected (silent).');
      } else if (event.error === 'network') {
        setError('Speech recognition network error occurred.');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      log('Web Speech API session ended (onend)');
      // Auto-restart if user still wants to listen
      if (isListeningRef.current) {
        log('Attempting Web Speech API auto-restart...');
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = setTimeout(() => {
          if (isListeningRef.current) {
            try {
              recognitionRef.current.start();
            } catch (err: any) {
              console.error('Failed to restart speech recognition:', err);
              log(`Auto-restart error: ${err?.message || err}`);
            }
          }
        }, 300);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (recognitionRef.current) {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onaudiostart = null;
        recognitionRef.current.onsoundstart = null;
        recognitionRef.current.onspeechstart = null;
        recognitionRef.current.onspeechend = null;
        recognitionRef.current.onsoundend = null;
        recognitionRef.current.onaudioend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.stop();
        } catch { /* ignore */ }
      }
    };
  }, [lang, mode, supported, interimResultCallback, finalResultCallback, log]);

  // Clean up worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Concatenate multiple Float32Array chunks into a single one
  const concatenateAudio = (buffers: Float32Array[]): Float32Array => {
    let totalLength = 0;
    for (const buf of buffers) {
      totalLength += buf.length;
    }
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }
    return result;
  };

  // Helper to send current audio chunks to Whisper for transcription
  const sendToWhisper = useCallback((isFinal: boolean) => {
    if (audioChunksRef.current.length === 0) return;
    if (!workerRef.current || localWhisperState.status !== 'ready') return;

    const mergedAudio = concatenateAudio(audioChunksRef.current);
    
    // We send data to worker
    workerRef.current.postMessage({
      type: 'transcribe',
      data: {
        audio: mergedAudio,
        language: lang,
        id: isFinal ? 'final' : 'interim',
      }
    });

    if (isFinal) {
      audioChunksRef.current = [];
    }
  }, [lang, localWhisperState.status]);

  // Stop recording resources
  const stopAudioRecording = useCallback(() => {
    log('Stopping Web Audio Context & recording...');

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch { /* ignore */ }
      processorRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch { /* ignore */ }
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch { /* ignore */ }
      analyserRef.current = null;
      setAnalyserNode(null);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch { /* ignore */ }
      audioContextRef.current = null;
    }

    // Send any remaining audio in buffer as final result
    if (mode === 'local-whisper' && audioChunksRef.current.length > 0) {
      sendToWhisper(true);
    }

    isSpeakingRef.current = false;
    silenceTimerRef.current = 0;
  }, [mode, sendToWhisper, log]);

  // Start recording resources
  const startAudioRecording = useCallback(async () => {
    log('Starting Web Audio Context & mic capture...');
    setError(null);
    audioChunksRef.current = [];
    isSpeakingRef.current = false;
    silenceTimerRef.current = 0;
    lastInterimTimeRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Initialize AudioContext at 16000Hz (downsamples mic signal)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // Source microphone node
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Analyser node for visualizer (real mic data!)
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);

      // Connect source to analyser
      source.connect(analyser);

      // In Local Whisper mode, we set up ScriptProcessor for VAD and buffer accumulation
      if (mode === 'local-whisper') {
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);
          
          // Copy chunk so it is not GC'd or modified before worker processes it
          const chunk = new Float32Array(inputData);
          
          // Calculate sound energy (RMS)
          let sumSquares = 0;
          for (let i = 0; i < chunk.length; i++) {
            sumSquares += chunk[i] * chunk[i];
          }
          const rms = Math.sqrt(sumSquares / chunk.length);

          // VAD logic: energy threshold
          const rmsThreshold = 0.015; // standard voice activity threshold
          const chunkDuration = chunk.length / 16000; // in seconds (~0.256s)

          if (rms > rmsThreshold) {
            // User is speaking
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true;
              log('Voice Activity Detected (VAD: Speaking)');
            }
            silenceTimerRef.current = 0;
            audioChunksRef.current.push(chunk);
          } else {
            // User is silent
            if (isSpeakingRef.current) {
              silenceTimerRef.current += chunkDuration;
              // Still push silent buffer to avoid cutting off ending syllables
              audioChunksRef.current.push(chunk);

              // If silence exceeds conversational threshold, finalize transcription
              if (silenceTimerRef.current >= 1.2) {
                log('VAD: Silence detected. Finalizing transcription chunk.');
                sendToWhisper(true);
                isSpeakingRef.current = false;
                silenceTimerRef.current = 0;
              }
            }
          }

          // Periodically send interim transcriptions while speaking (every 1.5s)
          const now = Date.now();
          if (isSpeakingRef.current && now - lastInterimTimeRef.current >= 1500) {
            sendToWhisper(false);
            lastInterimTimeRef.current = now;
          }
        };

        // Connect source to processor, processor to destination (required for script processor execution)
        source.connect(processor);
        processor.connect(audioContext.destination);
      }
    } catch (err: any) {
      console.error('Audio capture failed:', err);
      setError(`Microphone access failed: ${err.message || String(err)}`);
      setIsListening(false);
      isListeningRef.current = false;
      stopAudioRecording();
    }
  }, [mode, sendToWhisper, stopAudioRecording, log]);

  // Main start command
  const start = useCallback(async () => {
    setError(null);
    isListeningRef.current = true;
    setIsListening(true);

    if (mode === 'web-speech') {
      if (!supported || !recognitionRef.current) {
        setError('Web Speech API is not supported in this browser.');
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }

      // Start Web Speech API
      try {
        if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
        recognitionRef.current.start();
        log('Web Speech API start() called');
      } catch (err: any) {
        console.error('Failed to start Web Speech API:', err);
        log(`Web Speech API start failed: ${err.message || err}`);
      }

      // Simultaneously start real audio recording just for the visualizer!
      await startAudioRecording();
    } else {
      // Local Whisper mode
      if (localWhisperState.status !== 'ready') {
        setError('Whisper model is not loaded yet. Please wait for it to load.');
        setIsListening(false);
        isListeningRef.current = false;
        return;
      }

      // Start Web Audio recording + VAD
      await startAudioRecording();
    }
  }, [mode, supported, localWhisperState.status, startAudioRecording, log]);

  // Main stop command
  const stop = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);

    if (mode === 'web-speech') {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          log('Web Speech API stop() called');
        } catch { /* ignore */ }
      }
    }

    stopAudioRecording();
  }, [mode, stopAudioRecording, log]);

  return {
    supported,
    isListening,
    error,
    start,
    stop,
    localWhisperState,
    analyserNode,
  };
}
