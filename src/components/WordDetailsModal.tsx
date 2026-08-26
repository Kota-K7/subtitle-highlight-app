import { useState } from 'react';
import type { HighlightWord } from '../utils/helpers';

interface WordDetailsModalProps {
  word: string;
  type: 'en' | 'zh';
  isAlreadyHighlighted: boolean;
  onClose: () => void;
  onAddHighlight: (word: HighlightWord) => void;
}

export default function WordDetailsModal({
  word,
  type,
  isAlreadyHighlighted,
  onClose,
  onAddHighlight,
}: WordDetailsModalProps) {
  const [selectedColor, setSelectedColor] = useState<HighlightWord['color']>('amber');
  const [notes, setNotes] = useState('');

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    onAddHighlight({
      word: word.trim(),
      color: selectedColor,
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
    });
    onClose();
  };

  // Build high-quality external dictionary search URLs
  const getDictUrls = () => {
    const isJapanese = /[\u3040-\u309f\u30a0-\u30ff]/.test(word);
    if (isJapanese) {
      return [
        { name: 'Jisho.org (Japanese-English)', url: `https://jisho.org/search/${encodeURIComponent(word)}` },
        { name: 'Weblio 辞書 (国語・日中・日英)', url: `https://www.weblio.jp/content/${encodeURIComponent(word)}` },
        { name: 'Yahoo! 辞書', url: `https://dic.yahoo.co.jp/search/?query=${encodeURIComponent(word)}` }
      ];
    }

    if (type === 'zh') {
      return [
        { name: 'MDBG English-Chinese Dictionary', url: `https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqcol=1&wdqchi=${encodeURIComponent(word)}` },
        { name: 'LINE Dict (Chinese-English)', url: `https://dict.naver.com/linedict/zhendict/#/cnen/home?query=${encodeURIComponent(word)}` },
        { name: 'Jukuu Sentences', url: `http://www.jukuu.com/search.php?q=${encodeURIComponent(word)}` }
      ];
    } else {
      return [
        { name: 'Cambridge Dictionary', url: `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}` },
        { name: 'Merriam-Webster', url: `https://www.merriam-webster.com/dictionary/${encodeURIComponent(word)}` },
        { name: 'Youdao Dictionary', url: `https://dict.youdao.com/w/${encodeURIComponent(word)}` }
      ];
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(11, 15, 25, 0.7)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '16px'
    }}>
      <div 
        className="glass-panel fade-in" 
        style={{ 
          width: '100%', 
          maxWidth: '460px', 
          padding: '24px', 
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
          position: 'relative'
        }}
      >
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            color: 'var(--text-muted)',
            padding: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-tertiary)'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>

        {/* Modal Header */}
        <div style={{ marginBottom: '20px' }}>
          <span style={{
            fontSize: '0.7rem',
            backgroundColor: 'var(--bg-tertiary)',
            padding: '3px 8px',
            borderRadius: '10px',
            color: 'var(--accent-primary)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            {type === 'zh' ? '🇨🇳 Chinese Word' : '🇺🇸 English Word'}
          </span>
          <h2 style={{ fontSize: '2rem', color: 'var(--text-primary)', marginTop: '8px', wordBreak: 'break-all' }}>
            {word}
          </h2>
        </div>

        {/* External Resources */}
        <div style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>External Lookup Tools</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {getDictUrls().map((dict, idx) => (
              <a
                key={idx}
                href={dict.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '10px',
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  border: '1px solid var(--border-color)'
                }}
              >
                <span>{dict.name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}>
                  <path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* Quick Add Highlights */}
        <div>
          {isAlreadyHighlighted ? (
            <div style={{
              padding: '12px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '8px',
              textAlign: 'center',
              color: 'var(--accent-success)',
              fontSize: '0.85rem',
              fontWeight: 600
            }}>
              ✨ This word is already in your highlights!
            </div>
          ) : (
            <form onSubmit={handleQuickAdd} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Quick Add to Highlights</h3>
              
              {/* Color options */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {(['amber', 'emerald', 'rose', 'indigo'] as HighlightWord['color'][]).map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSelectedColor(col)}
                    style={{
                      padding: '6px 0',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      border: `1.5px solid ${selectedColor === col ? 'var(--accent-primary)' : 'transparent'}`,
                      backgroundColor: `var(--hl-${col})`,
                      color: 'var(--text-primary)'
                    }}
                  >
                    {col}
                  </button>
                ))}
              </div>

              {/* Translation/Notes */}
              <input
                type="text"
                placeholder="Translation / Custom notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem'
                }}
              />

              <button
                type="submit"
                style={{
                  padding: '10px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  boxShadow: 'var(--accent-primary-glow) 0 4px 10px'
                }}
              >
                Register Word
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
