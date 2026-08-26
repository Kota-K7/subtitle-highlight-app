import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header';
import Visualizer from './components/Visualizer';
import SubtitleList from './components/SubtitleList';
import HighlightManager from './components/HighlightManager';
import StatisticsPanel from './components/StatisticsPanel';
import WordDetailsModal from './components/WordDetailsModal';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { 
  tokenizeBilingualText, 
  copyToClipboard, 
  exportToTXT, 
  downloadFile, 
  DEFAULT_DICTIONARY 
} from './utils/helpers';
import type { DictionaryWord, SubtitleItem } from './types';
import { Sparkles, MessageSquare } from 'lucide-react';

interface RawSubtitle {
  id: string;
  rawText: string;
  timestamp: number;
}

export default function App() {
  // Speech Recognition Language (Default: Chinese zh-CN)
  const [lang, setLang] = useState('zh-CN');

  // Transcription Engine Mode ('web-speech' or 'local-whisper')
  const [transcriptionMode, setTranscriptionMode] = useState<'web-speech' | 'local-whisper'>('web-speech');
  const [whisperModel, setWhisperModel] = useState('Xenova/whisper-base');

  // Raw Subtitles History
  const [rawSubtitles, setRawSubtitles] = useState<RawSubtitle[]>([]);
  const [interimText, setInterimText] = useState('');

  // Dictionary Words (Persisted in localStorage with new history/politics categories)
  const [dictionaryWords, setDictionaryWords] = useState<DictionaryWord[]>(() => {
    const saved = localStorage.getItem('duallingua_dict_history_v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        return DEFAULT_DICTIONARY;
      }
    }
    return DEFAULT_DICTIONARY;
  });

  // Selected Word Modal state
  const [selectedWordModal, setSelectedWordModal] = useState<{
    wordStr: string;
    matchedWord?: DictionaryWord;
  } | null>(null);

  // Copy Feedback state
  const [isAllCopied, setIsAllCopied] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync dictionary to localStorage
  useEffect(() => {
    localStorage.setItem('duallingua_dict_history_v1', JSON.stringify(dictionaryWords));
  }, [dictionaryWords]);

  // Derive dynamic subtitles with tokenization (Traditional Chinese by default)
  const subtitles: SubtitleItem[] = useMemo(() => {
    return rawSubtitles.map((item) => ({
      ...item,
      tokens: tokenizeBilingualText(item.rawText, dictionaryWords, 'traditional'),
    }));
  }, [rawSubtitles, dictionaryWords]);

  // Show brief toast helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2000);
  };

  // Speech Recognition callbacks
  const handleInterimResult = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const handleFinalResult = useCallback((rawText: string) => {
    if (!rawText.trim()) return;
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setRawSubtitles((prev) => [...prev, { id, rawText, timestamp: Date.now() }]);
    setInterimText('');
  }, []);

  // Speech Recognition Hook
  const { supported, isListening, error, start, stop, localWhisperState, analyserNode } =
    useSpeechRecognition({
      lang,
      mode: transcriptionMode,
      modelName: whisperModel,
      interimResultCallback: handleInterimResult,
      finalResultCallback: handleFinalResult,
    });

  // Language Change Handler
  const handleLanguageChange = (newLang: string) => {
    if (isListening) {
      stop();
    }
    setLang(newLang);
    setInterimText('');
  };

  // Start / Stop Toggle
  const handleToggleListening = () => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  };

  // Clear Session Transcriptions
  const handleClearSession = () => {
    if (window.confirm('現在の文字起こし履歴をクリアしますか？')) {
      setRawSubtitles([]);
      setInterimText('');
      showToast('文字起こし履歴をクリアしました');
    }
  };

  // Copy All Text
  const handleCopyAll = async () => {
    if (subtitles.length === 0) return;
    const fullText = subtitles
      .map((item) => item.tokens.map((t) => t.text).join(''))
      .join('\n');
    const success = await copyToClipboard(fullText);
    if (success) {
      setIsAllCopied(true);
      showToast('すべての文字起こしをクリップボードにコピーしました！');
      setTimeout(() => setIsAllCopied(false), 2000);
    }
  };

  // Copy Single Subtitle Line
  const handleCopyLine = async (text: string, id: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedItemId(id);
      showToast('行テキストをコピーしました');
      setTimeout(() => setCopiedItemId(null), 1500);
    }
  };

  // Download plain text (.txt)
  const handleDownloadTXT = () => {
    if (subtitles.length === 0) return;
    const txtContent = exportToTXT(subtitles);
    downloadFile(
      txtContent,
      `duallingua_transcription_${new Date().toISOString().slice(0, 10)}.txt`,
      'text/plain;charset=utf-8'
    );
    showToast('TXTファイルを保存しました');
  };

  // Download standard SRT subtitle file (.srt)
  const handleDownloadSRT = () => {
    if (subtitles.length === 0) return;
    const srtContent = subtitles
      .map((item, index) => {
        const text = item.tokens.map((t) => t.text).join('');
        const startSec = index * 4;
        const endSec = startSec + 3;
        const pad = (n: number) => n.toString().padStart(2, '0');
        const sTime = `00:${pad(Math.floor(startSec / 60))}:${pad(startSec % 60)},000`;
        const eTime = `00:${pad(Math.floor(endSec / 60))}:${pad(endSec % 60)},000`;
        return `${index + 1}\n${sTime} --> ${eTime}\n${text}\n\n`;
      })
      .join('');

    downloadFile(
      srtContent,
      `duallingua_subtitles_${new Date().toISOString().slice(0, 10)}.srt`,
      'text/plain;charset=utf-8'
    );
    showToast('SRTファイルを保存しました');
  };

  // Delete individual subtitle line
  const handleDeleteLine = (id: string) => {
    setRawSubtitles((prev) => prev.filter((item) => item.id !== id));
    showToast('発話行を削除しました');
  };

  // Add Word to Dictionary
  const handleAddDictionaryWord = (newWord: DictionaryWord) => {
    setDictionaryWords((prev) => [newWord, ...prev]);
    showToast(`「${newWord.traditional || newWord.simplified || newWord.english}」を辞書に登録しました`);
  };

  // Remove Word from Dictionary
  const handleRemoveDictionaryWord = (id: string) => {
    setDictionaryWords((prev) => prev.filter((w) => w.id !== id));
    showToast('辞書から単語を削除しました');
  };

  // Import Words to Dictionary
  const handleImportDictionaryWords = (imported: DictionaryWord[]) => {
    if (imported.length === 0) return;
    setDictionaryWords((prev) => {
      const merged = [...prev];
      imported.forEach((imp) => {
        const key = (imp.traditional || imp.simplified || imp.english || '').toLowerCase();
        if (
          key &&
          !merged.some(
            (m) =>
              (m.traditional || '').toLowerCase() === key ||
              (m.simplified || '').toLowerCase() === key ||
              (m.english || '').toLowerCase() === key
          )
        ) {
          merged.push(imp);
        }
      });
      return merged;
    });
    showToast(`${imported.length} 件の新しい単語を辞書に追加しました`);
  };

  // Count total highlighted token occurrences
  const totalHighlightMatches = useMemo(() => {
    let count = 0;
    subtitles.forEach((item) => {
      item.tokens.forEach((tok) => {
        if (tok.isHighlighted) count++;
      });
    });
    return count;
  }, [subtitles]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1E293B] flex flex-col selection:bg-rose-100 selection:text-rose-900">
      
      {/* Top Header */}
      <Header
        currentLang={lang}
        onChangeLang={handleLanguageChange}
        onClearSession={handleClearSession}
        onCopyAll={handleCopyAll}
        onDownloadTXT={handleDownloadTXT}
        onDownloadSRT={handleDownloadSRT}
        hasSubtitles={subtitles.length > 0}
        isCopied={isAllCopied}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Speech Controller & Live Subtitles Board (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          
          {/* Audio Visualizer & Big Mic Switch */}
          <Visualizer
            isListening={isListening}
            onToggleListening={handleToggleListening}
            supported={supported}
            speechError={error}
            analyserNode={analyserNode}
            transcriptionMode={transcriptionMode}
            setTranscriptionMode={setTranscriptionMode}
            whisperModel={whisperModel}
            setWhisperModel={setWhisperModel}
            localWhisperState={localWhisperState}
            currentLang={lang}
          />

          {/* Subtitles Area */}
          <div className="cream-card p-5 flex flex-col gap-3 flex-1">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-[#1E293B]">リアルタイム字幕</h2>
              </div>
              <span className="text-xs text-[#64748B]">
                {subtitles.length} 件の文
              </span>
            </div>

            <SubtitleList
              subtitles={subtitles}
              interimText={interimText}
              onSelectWord={(wordStr, matchedWord) => setSelectedWordModal({ wordStr, matchedWord })}
              onCopyText={handleCopyLine}
              onDeleteLine={handleDeleteLine}
              copiedId={copiedItemId}
            />
          </div>

        </div>

        {/* Right Column: User Dictionary Manager & Statistics (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          
          {/* Real-time speech statistics */}
          <StatisticsPanel
            subtitles={subtitles}
            isListening={isListening}
            highlightCount={totalHighlightMatches}
          />

          {/* Dictionary Manager */}
          <HighlightManager
            dictionaryWords={dictionaryWords}
            onAddWord={handleAddDictionaryWord}
            onRemoveWord={handleRemoveDictionaryWord}
            onImportWords={handleImportDictionaryWords}
            onSelectWordForDetail={(wordStr, matchedWord) => setSelectedWordModal({ wordStr, matchedWord })}
          />

        </div>

      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1E293B] text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Word Details & Dictionary Register Modal */}
      {selectedWordModal && (
        <WordDetailsModal
          wordStr={selectedWordModal.wordStr}
          matchedWord={selectedWordModal.matchedWord}
          onClose={() => setSelectedWordModal(null)}
          onAddWord={handleAddDictionaryWord}
          onRemoveWord={handleRemoveDictionaryWord}
        />
      )}

    </div>
  );
}
