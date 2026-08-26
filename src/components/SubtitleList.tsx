import { useEffect, useRef } from 'react';
import type { SubtitleItem } from '../utils/helpers';

interface SubtitleListProps {
  subtitles: SubtitleItem[];
  interimText: string;
  onSelectWord: (text: string, type: 'en' | 'zh') => void;
}

export default function SubtitleList({
  subtitles,
  interimText,
  onSelectWord,
}: SubtitleListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the bottom when new transcriptions or interim text arrives
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [subtitles, interimText]);

  return (
    <div 
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: '400px',
        maxHeight: 'calc(100vh - 280px)',
        overflowY: 'auto',
        paddingRight: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        scrollBehavior: 'smooth'
      }}
    >
      {subtitles.length === 0 && !interimText ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          gap: '12px',
          padding: '48px 0'
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p style={{ fontWeight: 500, fontSize: '0.95rem' }}>No subtitles transcribed yet.</p>
          <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Turn on the microphone and start speaking!</p>
        </div>
      ) : (
        <>
          {subtitles.map((item, idx) => (
            <div 
              key={item.id} 
              className="glass-panel fade-in" 
              style={{ 
                padding: '16px 20px', 
                borderLeft: '4px solid var(--accent-primary)',
                animationDelay: `${Math.min(idx * 0.05, 0.3)}s` 
              }}
            >
              {/* Header metadata */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--text-muted)', 
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px' 
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  color: 'var(--text-tertiary)',
                  fontWeight: 600
                }}>
                  #{idx + 1}
                </span>
              </div>

              {/* Subtitle Words */}
              <div style={{ display: 'flow-root', wordBreak: 'break-word' }}>
                {item.tokens.map((token, tIdx) => {
                  if (token.type === 'punctuation') {
                    return (
                      <span key={tIdx} style={{ fontSize: '1.125rem', color: 'var(--text-muted)', padding: '0 2px' }}>
                        {token.text}
                      </span>
                    );
                  }

                  const isHighlight = token.isHighlighted;
                  const hlClass = isHighlight ? `hl-color-${token.highlightColor}` : '';

                  return (
                    <span
                      key={tIdx}
                      className={`word-token ${hlClass}`}
                      onClick={() => onSelectWord(token.text, token.type as 'en' | 'zh')}
                      title="Click to view translation / highlight tools"
                    >
                      {token.text}
                    </span>
                  );
                })}
              </div>

            </div>
          ))}

          {/* Interim Real-time Text */}
          {interimText && (
            <div 
              className="glass-panel" 
              style={{ 
                padding: '16px 20px', 
                borderStyle: 'dashed',
                borderColor: 'var(--accent-primary-glow)',
                background: 'rgba(99, 102, 241, 0.02)',
                opacity: 0.85
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', animation: 'pulseGlow 1s infinite' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600 }}>Transcribing...</span>
              </div>
              <p style={{ fontSize: '1.125rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6 }}>
                {interimText}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
