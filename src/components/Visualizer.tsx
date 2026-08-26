import { useRef } from 'react';
import { Mic, Square, Wifi, HardDrive, AlertCircle } from 'lucide-react';
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
  currentLang: string;
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
  currentLang,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Audio waveform visualizer
  const { micVolume } = useAudioVisualizer({
    isListening,
    canvasRef,
    analyserNode,
    accentColor: isListening ? '#4F46E5' : '#6366F1',
  });

  const isWhisperLoading =
    transcriptionMode === 'local-whisper' &&
    (localWhisperState.status === 'loading' || localWhisperState.status === 'progress');

  const isStartDisabled =
    (transcriptionMode === 'web-speech' && !supported) ||
    (transcriptionMode === 'local-whisper' && localWhisperState.status !== 'ready');

  const getLangLabel = () => {
    switch (currentLang) {
      case 'zh-CN':
      case 'zh-TW':
        return '中国語優先 (繁体字表示・中英両対応)';
      case 'en-US':
        return '英語優先 (中英両対応)';
      default:
        return '中国語優先 (繁体字表示・中英両対応)';
    }
  };

  return (
    <div className="cream-card p-5 relative overflow-hidden">
      
      {/* Engine Switch & Header - strictly single line layout */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#E8E2D8] flex-nowrap">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
          <h2 className="text-xs sm:text-sm font-bold text-[#1E293B] whitespace-nowrap">
            音声認識コントロール
          </h2>
          <span className="text-[10px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0.5 bg-rose-50 text-rose-800 rounded-md border border-rose-200 whitespace-nowrap">
            {getLangLabel()}
          </span>
        </div>

        {/* Mode Selector (Online Web Speech vs Offline Whisper) */}
        <div className="flex items-center bg-[#FAF8F5] p-0.5 sm:p-1 rounded-lg border border-[#E8E2D8] shrink-0">
          <button
            onClick={() => setTranscriptionMode('web-speech')}
            disabled={isListening}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
              transcriptionMode === 'web-speech'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#1E293B]'
            } ${isListening ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>オンライン</span>
            <span className="hidden sm:inline">(高速・高精度)</span>
          </button>
          <button
            onClick={() => setTranscriptionMode('local-whisper')}
            disabled={isListening}
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
              transcriptionMode === 'local-whisper'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#1E293B]'
            } ${isListening ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <HardDrive className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>オフライン</span>
            <span className="hidden sm:inline">(Whisper)</span>
          </button>
        </div>
      </div>

      {/* Whisper Model Downloader & Status bar (Shown only if offline mode chosen) */}
      {transcriptionMode === 'local-whisper' && (
        <div className="mt-3 p-3 bg-[#FAF8F5] rounded-xl border border-[#E8E2D8] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#475569]">モデルサイズ:</span>
            <select
              value={whisperModel}
              onChange={(e) => setWhisperModel(e.target.value)}
              disabled={isListening || isWhisperLoading}
              className="text-xs bg-white border border-[#E8E2D8] rounded-md px-2 py-1 text-[#1E293B] outline-none"
            >
              <option value="Xenova/whisper-tiny">Tiny (~75MB - 高速)</option>
              <option value="Xenova/whisper-base">Base (~140MB - 高精度)</option>
            </select>
          </div>

          {isWhisperLoading && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-[#475569]">
                <span>モデルを準備中...</span>
                <span>{Math.round(localWhisperState.progress || 0)}%</span>
              </div>
              <div className="w-full bg-[#E8E2D8] rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-rose-700 h-full transition-all duration-200"
                  style={{ width: `${localWhisperState.progress || 10}%` }}
                />
              </div>
            </div>
          )}

          {localWhisperState.status === 'ready' && (
            <span className="text-xs text-emerald-700 font-medium">
              ✓ オフラインモデル準備完了（ブラウザ内で安全に動作）
            </span>
          )}
        </div>
      )}

      {/* Canvas Audio Waveform Area */}
      <div className="my-4 relative h-16 w-full bg-[#FAF8F5] rounded-xl border border-[#E8E2D8] overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={600}
          height={64}
          className="w-full h-full"
        />
        
        {!isListening && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs font-medium text-[#94A3B8]">
            マイクボタンを押して聞き取りを開始してください
          </div>
        )}
      </div>

      {/* Big One-Tap Toggle Button & Status */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Status text */}
        <div className="flex items-center gap-2.5">
          <div className={`w-3 h-3 rounded-full ${
            isListening ? 'bg-rose-600 animate-ping' : 'bg-[#CBD5E1]'
          }`} />
          <div>
            <div className="text-xs font-bold text-[#1E293B]">
              {isListening ? 'リアルタイム認識中 (聞き取り中)' : '待機中 (マイク停止)'}
            </div>
            <div className="text-[11px] text-[#64748B]">
              {isListening
                ? `入力音量: ${Math.round((micVolume / 255) * 100)}%`
                : 'ボタンを押すと自動的に文字起こしされます'}
            </div>
          </div>
        </div>

        {/* Big Start / Stop Button */}
        <button
          id="toggle-mic-btn"
          onClick={onToggleListening}
          disabled={isStartDisabled}
          className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white transition-all shadow-sm ${
            isListening
              ? 'bg-rose-800 hover:bg-rose-900 mic-active-pulse'
              : 'bg-rose-700 hover:bg-rose-800 shadow-rose-100 hover:shadow-md'
          } ${isStartDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {isListening ? (
            <>
              <Square className="w-4 h-4 fill-white" />
              <span>聞き取りを停止</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span>音声認識を開始</span>
            </>
          )}
        </button>

      </div>

      {/* Error alert */}
      {speechError && (
        <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{speechError}</span>
        </div>
      )}

    </div>
  );
}
