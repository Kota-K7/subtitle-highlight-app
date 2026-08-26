import { useRef } from 'react';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';
import type { LocalWhisperState } from '../hooks/useSpeechRecognition';

interface VisualizerProps {
  isListening: boolean;
  onToggleListening: () => void;
  supported: boolean;
  speechError?: string | null;
  analyserNode?: AnalyserNode | null;
  transcriptionMode: 'web-speech' | 'local-whisper';
  setTranscriptionMode: (mode: 'web-speech' | 'local-whisper') => void;
  whisperModel: string;
  setWhisperModel: (model: string) => void;
  localWhisperState: LocalWhisperState;
}

export default function Visualizer({
  isListening,
  onToggleListening,
  supported,
  speechError,
  analyserNode,
  transcriptionMode,
  setTranscriptionMode,
  whisperModel,
  setWhisperModel,
  localWhisperState,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use the visualizer hook.
  const { micVolume } = useAudioVisualizer({
    isListening,
    canvasRef,
    analyserNode,
    accentColor: '#6366f1',
  });

  const isWhisperLoading = transcriptionMode === 'local-whisper' && 
    (localWhisperState.status === 'loading' || localWhisperState.status === 'progress');

  // Disable start listening if browser doesn't support Web Speech API AND we are in Web Speech mode,
  // or if Whisper is loading, or if Whisper has errored out.
  const isStartDisabled = (transcriptionMode === 'web-speech' && !supported) ||
                          (transcriptionMode === 'local-whisper' && localWhisperState.status !== 'ready');

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', position: 'relative', overflow: 'hidden' }}>
      
      {/* Background radial glow */}
      {isListening && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '300px',
          height: '300px',
          background: `radial-gradient(circle, rgba(99, 102, 241, ${0.05 + (micVolume / 255) * 0.15}) 0%, transparent 70%)`,
          zIndex: 0,
          pointerEvents: 'none',
          borderRadius: '50%'
        }} />
      )}

      {/* Engine Selection & Settings */}
      <div style={{ width: '100%', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Transcription Engine</span>
        </div>
        
        {/* Mode Selector buttons */}
        <div style={{ display: 'flex', backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px', padding: '4px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setTranscriptionMode('web-speech')}
            disabled={isListening}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: isListening ? 'not-allowed' : 'pointer',
              color: transcriptionMode === 'web-speech' ? '#fff' : 'var(--text-secondary)',
              backgroundColor: transcriptionMode === 'web-speech' ? 'var(--accent-primary)' : 'transparent',
              transition: 'all 0.2s ease',
              opacity: isListening && transcriptionMode !== 'web-speech' ? 0.5 : 1,
              boxShadow: transcriptionMode === 'web-speech' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            Web Speech (Online)
          </button>
          <button
            onClick={() => setTranscriptionMode('local-whisper')}
            disabled={isListening}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: isListening ? 'not-allowed' : 'pointer',
              color: transcriptionMode === 'local-whisper' ? '#fff' : 'var(--text-secondary)',
              backgroundColor: transcriptionMode === 'local-whisper' ? 'var(--accent-primary)' : 'transparent',
              transition: 'all 0.2s ease',
              opacity: isListening && transcriptionMode !== 'local-whisper' ? 0.5 : 1,
              boxShadow: transcriptionMode === 'local-whisper' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            Local Whisper (Offline)
          </button>
        </div>

        {/* Local Whisper specific UI */}
        {transcriptionMode === 'local-whisper' && (
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: '10px',
            padding: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'fadeIn 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Model Size:</span>
              <select
                value={whisperModel}
                onChange={(e) => setWhisperModel(e.target.value)}
                disabled={isListening || isWhisperLoading}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="Xenova/whisper-tiny">Tiny (~75MB - Fast)</option>
                <option value="Xenova/whisper-base">Base (~140MB - Accurate)</option>
              </select>
            </div>

            {/* Model status/download progress */}
            {localWhisperState.status === 'idle' && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                ℹ️ Whisper model will be downloaded to browser cache on first use.
              </div>
            )}
            
            {isWhisperLoading && (() => {
              const rawProgress = localWhisperState.progress;
              const hasValidProgress = typeof rawProgress === 'number' && !isNaN(rawProgress) && rawProgress > 0;
              const progressVal = hasValidProgress ? rawProgress : 0;
              const isIndeterminate = !hasValidProgress;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                      {localWhisperState.status === 'progress' 
                        ? (hasValidProgress 
                            ? `Downloading: ${Math.round(progressVal)}%` 
                            : 'Loading local model files...') 
                        : 'Initializing...'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                      {localWhisperState.message}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ 
                    width: '100%', 
                    height: '6px', 
                    backgroundColor: 'var(--bg-tertiary)', 
                    borderRadius: '3px', 
                    overflow: 'hidden',
                    position: 'relative'
                  }}>
                    {isIndeterminate ? (
                      <div className="indeterminate-progress-bar" style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '40%',
                        backgroundColor: 'var(--accent-primary)',
                        borderRadius: '3px',
                        boxShadow: 'var(--accent-primary-glow) 0 0 8px'
                      }} />
                    ) : (
                      <div style={{
                        width: `${progressVal}%`,
                        height: '100%',
                        backgroundColor: 'var(--accent-primary)',
                        borderRadius: '3px',
                        transition: 'width 0.1s ease',
                        boxShadow: 'var(--accent-primary-glow) 0 0 8px'
                      }} />
                    )}
                  </div>
                </div>
              );
            })()}

            {localWhisperState.status === 'ready' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                Model Ready (ON-DEVICE OFFLINE)
              </div>
            )}

            {localWhisperState.status === 'error' && (
              <div style={{ fontSize: '0.75rem', color: 'var(--accent-danger)' }}>
                ❌ {localWhisperState.message || 'Failed to load model.'}
              </div>
            )}
          </div>
        )}
      </div>

      <hr style={{ width: '100%', border: 'none', borderTop: '1px solid var(--border-color)', margin: '0', zIndex: 1 }} />

      {/* Waveform Canvas */}
      <div style={{ position: 'relative', width: '100%', height: '80px', display: 'flex', justifyContent: 'center', zIndex: 1 }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={80}
          style={{ width: '100%', height: '100%', borderRadius: '12px' }}
        />
        {transcriptionMode === 'web-speech' && !supported && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(11, 15, 25, 0.85)',
            color: 'var(--accent-danger)',
            fontSize: '0.85rem',
            fontWeight: 600,
            borderRadius: '12px',
            border: '1px solid rgba(244, 63, 94, 0.2)'
          }}>
            Browser does not support Web Speech API. Switch to Local Whisper!
          </div>
        )}
      </div>

      {/* Mic toggle and status */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 1 }}>
        <button
          onClick={onToggleListening}
          disabled={isStartDisabled}
          className={isListening ? 'mic-active-pulse' : ''}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: isListening ? 'var(--accent-danger)' : 'var(--accent-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            boxShadow: isListening 
              ? '0 0 25px 2px rgba(244, 63, 94, 0.4)' 
              : '0 0 20px 2px rgba(99, 102, 241, 0.25)',
            opacity: isStartDisabled ? 0.4 : 1,
            cursor: isStartDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {isListening ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          )}
        </button>
        
        <span style={{
          fontSize: '0.85rem',
          fontWeight: 600,
          color: isListening ? 'var(--accent-danger)' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginTop: '6px'
        }}>
          {isListening ? (
            <>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-danger)', display: 'inline-block' }} />
              LISTENING (Volume: {Math.round((micVolume / 255) * 100)}%)
            </>
          ) : (
            'Microphone Inactive'
          )}
        </span>
      </div>

      {speechError && (
        <div style={{
          width: '100%',
          padding: '10px 14px',
          backgroundColor: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.2)',
          borderRadius: '8px',
          color: 'var(--accent-danger)',
          fontSize: '0.85rem',
          textAlign: 'center',
          fontWeight: 500,
          zIndex: 1,
          animation: 'fadeIn 0.2s ease'
        }}>
          ⚠️ {speechError}
        </div>
      )}

    </div>
  );
}
