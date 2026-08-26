import { useState, useEffect } from 'react';
import { exportToSRT, exportToTXT } from '../utils/helpers';
import type { SubtitleItem } from '../utils/helpers';

interface StatisticsPanelProps {
  subtitles: SubtitleItem[];
  isListening: boolean;
  highlightCount: number;
}

export default function StatisticsPanel({
  subtitles,
  isListening,
  highlightCount,
}: StatisticsPanelProps) {
  const [duration, setDuration] = useState(0);

  // Timer effect when recording is active
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isListening) {
      timer = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isListening]);

  // Calculate stats
  
  const totalWords = subtitles.reduce((acc, curr) => {
    // Count tokens that are not punctuation/whitespace
    const wordTokens = curr.tokens.filter(t => t.type !== 'punctuation');
    return acc + wordTokens.length;
  }, 0);

  const calculateWPM = () => {
    if (duration === 0) return 0;
    const minutes = duration / 60;
    return Math.round(totalWords / minutes);
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const handleDownloadSRT = () => {
    if (subtitles.length === 0) return;
    const srtText = exportToSRT(subtitles);
    downloadFile(srtText, 'transcript.srt', 'text/srt');
  };

  const handleDownloadTXT = () => {
    if (subtitles.length === 0) return;
    const txtText = exportToTXT(subtitles);
    downloadFile(txtText, 'transcript.txt', 'text/plain');
  };

  const downloadFile = (content: string, filename: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      <div>
        <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>Session Analysis</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real-time statistics & Export tools</p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        
        {/* WPM / Speech Rate */}
        <div style={{ backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>SPEECH SPEED</span>
          <span style={{ fontSize: '1.5rem', color: 'var(--text-primary)', fontWeight: 700 }}>
            {calculateWPM()} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-muted)' }}>WPM</span>
          </span>
        </div>

        {/* Duration */}
        <div style={{ backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>DURATION</span>
          <span style={{ fontSize: '1.5rem', color: 'var(--text-primary)', fontWeight: 700 }}>
            {formatDuration(duration)}
          </span>
        </div>

        {/* Word count */}
        <div style={{ backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>TOTAL WORDS</span>
          <span style={{ fontSize: '1.5rem', color: 'var(--text-primary)', fontWeight: 700 }}>
            {totalWords}
          </span>
        </div>

        {/* Highlight Matches */}
        <div style={{ backgroundColor: 'var(--bg-tertiary)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>HIGHLIGHTS MATCHED</span>
          <span style={{ fontSize: '1.5rem', color: 'var(--accent-primary)', fontWeight: 700 }}>
            {highlightCount}
          </span>
        </div>

      </div>

      {/* Export Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
        <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>Export Subtitles</h3>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleDownloadSRT}
            disabled={subtitles.length === 0}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: subtitles.length === 0 ? 'var(--bg-tertiary)' : 'var(--border-glow)',
              color: subtitles.length === 0 ? 'var(--text-muted)' : 'var(--accent-primary)',
              border: subtitles.length === 0 ? '1px solid var(--border-color)' : '1px solid rgba(99, 102, 241, 0.2)',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            Export SRT
          </button>
          
          <button
            onClick={handleDownloadTXT}
            disabled={subtitles.length === 0}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: subtitles.length === 0 ? 'var(--bg-tertiary)' : 'var(--border-glow)',
              color: subtitles.length === 0 ? 'var(--text-muted)' : 'var(--accent-primary)',
              border: subtitles.length === 0 ? '1px solid var(--border-color)' : '1px solid rgba(99, 102, 241, 0.2)',
              fontWeight: 600,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            Export TXT
          </button>
        </div>
      </div>

    </div>
  );
}
