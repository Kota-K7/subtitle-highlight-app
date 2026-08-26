import { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header';
import Visualizer from './components/Visualizer';
import SubtitleList from './components/SubtitleList';
import HighlightManager from './components/HighlightManager';
import StatisticsPanel from './components/StatisticsPanel';
import WordDetailsModal from './components/WordDetailsModal';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { tokenizeBilingualText } from './utils/helpers';
import type { SubtitleItem, HighlightWord } from './utils/helpers';

export default function App() {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'dark' | 'light') || 'dark';
  });

  // Language state
  const [lang, setLang] = useState('en-US');

  // Transcription Mode ('web-speech' or 'local-whisper')
  const [transcriptionMode, setTranscriptionMode] = useState<'web-speech' | 'local-whisper'>('web-speech');
  // Whisper model name
  const [whisperModel, setWhisperModel] = useState('Xenova/whisper-base');

  // Subtitles transcription history
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);

  // Interim (temporary real-time speech results)
  const [interimText, setInterimText] = useState('');

  // Highlight words list
  const [highlightWords, setHighlightWords] = useState<HighlightWord[]>(() => {
    const saved = localStorage.getItem('highlightWords');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    // Default initial highlight words
    return [
      { word: 'DualLingua', color: 'indigo', notes: 'App Name', createdAt: Date.now() },
      { word: 'Chinese', color: 'amber', notes: '中文', createdAt: Date.now() },
      { word: 'English', color: 'emerald', notes: '英語', createdAt: Date.now() }
    ];
  });

  // Selected word details modal state
  const [selectedWord, setSelectedWord] = useState<{ text: string; type: 'en' | 'zh' } | null>(null);

  // Sync theme to root DOM node
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Sync highlight words list to local storage
  useEffect(() => {
    localStorage.setItem('highlightWords', JSON.stringify(highlightWords));
  }, [highlightWords]);

  // Re-tokenize existing subtitles whenever the highlightWords changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubtitles((prev) =>
      prev.map((item) => ({
        ...item,
        tokens: tokenizeBilingualText(item.text, highlightWords),
      }))
    );
  }, [highlightWords]);

  // Debug logs for speech recognition lifecycle
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addLog = useCallback((msg: string) => {
    setDebugLogs((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // Speech callbacks wrapped in useCallback to prevent infinite render loops
  const handleInterimResult = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const handleFinalResult = useCallback((text: string) => {
    if (!text.trim()) return;
    const id = `${Date.now()}`;
    const tokens = tokenizeBilingualText(text, highlightWords);
    const newItem: SubtitleItem = {
      id,
      text,
      timestamp: Date.now(),
      tokens,
    };
    setSubtitles((prev) => [...prev, newItem]);
    setInterimText('');
  }, [highlightWords]);

  // Speech Recognition hook
  const { supported, isListening, error, start, stop, localWhisperState, analyserNode } = useSpeechRecognition({
    lang,
    mode: transcriptionMode,
    modelName: whisperModel,
    interimResultCallback: handleInterimResult,
    finalResultCallback: handleFinalResult,
    onDebugLog: addLog
  });

  // When changing language, stop listening, clear interim, and switch language
  const handleLanguageChange = (newLang: string) => {
    if (isListening) {
      stop();
    }
    setLang(newLang);
    setInterimText('');
  };

  const handleToggleListening = () => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  };

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleClearSession = () => {
    if (window.confirm('Are you sure you want to clear current session transcriptions?')) {
      setSubtitles([]);
      setInterimText('');
    }
  };

  const handleAddHighlightWord = (newWord: HighlightWord) => {
    setHighlightWords((prev) => [...prev, newWord]);
  };

  const handleRemoveHighlightWord = (wordText: string) => {
    setHighlightWords((prev) => prev.filter((w) => w.word !== wordText));
  };

  const handleImportHighlightWords = (imported: HighlightWord[]) => {
    // Avoid duplicates
    setHighlightWords((prev) => {
      const merged = [...prev];
      imported.forEach((imp) => {
        if (!merged.some((m) => m.word.toLowerCase() === imp.word.toLowerCase())) {
          merged.push(imp);
        }
      });
      return merged;
    });
  };

  // Count highlight words occurrences
  const totalHighlightMatches = useMemo(() => {
    let count = 0;
    subtitles.forEach((item) => {
      item.tokens.forEach((tok) => {
        if (tok.isHighlighted) count++;
      });
    });
    return count;
  }, [subtitles]);

  // Is selected word already in highlights?
  const isSelectedWordHighlighted = useMemo(() => {
    if (!selectedWord) return false;
    return highlightWords.some(
      (hw) => hw.word.toLowerCase() === selectedWord.text.toLowerCase()
    );
  }, [selectedWord, highlightWords]);

  return (
    <div className="app-container">
      {/* Header bar */}
      <Header
        currentLang={lang}
        onChangeLang={handleLanguageChange}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onClearSession={handleClearSession}
        hasSubtitles={subtitles.length > 0}
      />

      {/* Main split dashboard layout */}
      <main className="main-content">
        
        {/* Left column: Transcript Subtitle list & Mic visualizer controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Visualizer header display */}
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
          />

          {/* Subtitles board */}
          <div className="glass-panel" style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>Live Subtitles</h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Target recognition: {lang === 'en-US' ? 'English' : 'Chinese'}
              </span>
            </div>
            
            <SubtitleList
              subtitles={subtitles}
              interimText={interimText}
              onSelectWord={(text, type) => setSelectedWord({ text, type })}
            />
          </div>

        </div>

        {/* Right column: Highlights and analysis side panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Real-time speech statistics */}
          <StatisticsPanel
            subtitles={subtitles}
            isListening={isListening}
            highlightCount={totalHighlightMatches}
          />

          {/* Highlight Manager sidebar */}
          <HighlightManager
            highlightWords={highlightWords}
            onAddWord={handleAddHighlightWord}
            onRemoveWord={handleRemoveHighlightWord}
            onImportWords={handleImportHighlightWords}
          />

        </div>

      </main>

      {/* Diagnostics panel */}
      <div className="glass-panel" style={{ margin: '0 24px 24px 24px', padding: '16px' }}>
        <details>
          <summary style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            ⚙️ Connection & Microphone Diagnostic Console (クリックして詳細を展開)
          </summary>
          <div style={{
            marginTop: '12px',
            backgroundColor: '#000',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            padding: '12px',
            borderRadius: '8px',
            maxHeight: '150px',
            overflowY: 'auto',
            color: '#10b981',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            textAlign: 'left'
          }}>
            {debugLogs.length === 0 ? (
              <span style={{ color: '#64748b' }}>No diagnostic events yet. Click recording to start diagnostics...</span>
            ) : (
              debugLogs.map((logStr, idx) => (
                <span key={idx}>{logStr}</span>
              ))
            )}
          </div>
        </details>
      </div>

      {/* Selected word overlay modal */}
      {selectedWord && (
        <WordDetailsModal
          word={selectedWord.text}
          type={selectedWord.type}
          isAlreadyHighlighted={isSelectedWordHighlighted}
          onClose={() => setSelectedWord(null)}
          onAddHighlight={handleAddHighlightWord}
        />
      )}

    </div>
  );
}
