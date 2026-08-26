import { useState } from 'react';
import type { HighlightWord } from '../utils/helpers';

interface HighlightManagerProps {
  highlightWords: HighlightWord[];
  onAddWord: (word: HighlightWord) => void;
  onRemoveWord: (wordText: string) => void;
  onImportWords: (words: HighlightWord[]) => void;
}

const COLOR_OPTIONS: Array<{ value: HighlightWord['color']; label: string; bg: string; border: string }> = [
  { value: 'amber', label: 'Amber', bg: 'var(--hl-amber)', border: 'var(--hl-amber-border)' },
  { value: 'emerald', label: 'Emerald', bg: 'var(--hl-emerald)', border: 'var(--hl-emerald-border)' },
  { value: 'rose', label: 'Rose', bg: 'var(--hl-rose)', border: 'var(--hl-rose-border)' },
  { value: 'indigo', label: 'Indigo', bg: 'var(--hl-indigo)', border: 'var(--hl-indigo-border)' },
];

export default function HighlightManager({
  highlightWords,
  onAddWord,
  onRemoveWord,
  onImportWords,
}: HighlightManagerProps) {
  const [newWord, setNewWord] = useState('');
  const [selectedColor, setSelectedColor] = useState<HighlightWord['color']>('amber');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim()) return;

    const exists = highlightWords.some(
      (w) => w.word.toLowerCase() === newWord.trim().toLowerCase()
    );
    if (exists) {
      alert('This word is already registered!');
      return;
    }

    onAddWord({
      word: newWord.trim(),
      color: selectedColor,
      notes: notes.trim() || undefined,
      category: category.trim() || undefined,
      createdAt: Date.now(),
    });

    setNewWord('');
    setNotes('');
    setCategory('');
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(highlightWords, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "highlight_words.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            // Basic validation
            const valid = parsed.every(item => typeof item.word === 'string' && typeof item.color === 'string');
            if (valid) {
              onImportWords(parsed);
            } else {
              alert('Invalid file format. Word and color properties are required.');
            }
          }
        } catch {
          alert('Error parsing JSON file.');
        }
      };
    }
  };

  // Filter highlights by search query
  const filteredWords = highlightWords.filter((w) =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (w.notes && w.notes.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      
      <div>
        <h2 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '4px' }}>Highlight Manager</h2>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Words highlighted instantly in subtitles</p>
      </div>

      {/* Add New Word Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Word or Phrase</label>
          <input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="e.g. hello, 謝謝"
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {/* Color Selection */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Highlight Color</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedColor(opt.value)}
                style={{
                  padding: '6px 0',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1.5px solid ${selectedColor === opt.value ? 'var(--accent-primary)' : 'transparent'}`,
                  backgroundColor: opt.bg,
                  color: 'var(--text-primary)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes (Optional) */}
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Notes / Translation (Optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Vocabulary word, Translation..."
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          />
        </div>

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-primary)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.85rem',
            marginTop: '4px',
            boxShadow: 'var(--accent-primary-glow) 0 4px 10px'
          }}
        >
          Add Highlight Word
        </button>
      </form>

      {/* List Header and Search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Registered Words ({highlightWords.length})</h3>
          
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Import Button */}
            <label style={{
              cursor: 'pointer',
              fontSize: '0.75rem',
              color: 'var(--accent-primary)',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: 'var(--border-glow)'
            }}>
              Import
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={highlightWords.length === 0}
              style={{
                fontSize: '0.75rem',
                color: 'var(--accent-primary)',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'var(--border-glow)',
                opacity: highlightWords.length === 0 ? 0.5 : 1
              }}
            >
              Export
            </button>
          </div>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search highlight words..."
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem'
          }}
        />
      </div>

      {/* Words List container */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px' }}>
        {filteredWords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            {searchQuery ? 'No matching words found.' : 'No highlight words registered.'}
          </div>
        ) : (
          filteredWords.map((w) => (
            <div
              key={w.word}
              className={`hl-color-${w.color}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.85rem'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{w.word}</span>
                {w.notes && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.9 }}>
                    {w.notes}
                  </span>
                )}
              </div>

              <button
                onClick={() => onRemoveWord(w.word)}
                style={{
                  color: 'var(--accent-danger)',
                  padding: '4px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255,255,255,0.15)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
