
interface HeaderProps {
  currentLang: string;
  onChangeLang: (lang: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onClearSession: () => void;
  hasSubtitles: boolean;
}

export default function Header({
  currentLang,
  onChangeLang,
  theme,
  onToggleTheme,
  onClearSession,
  hasSubtitles,
}: HeaderProps) {
  return (
    <header className="glass-panel" style={{ borderRadius: '0px 0px 16px 16px', borderTop: 'none', padding: '16px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #a855f7 100%)',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--accent-primary-glow) 0px 4px 14px'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 700 }}>DualLingua</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Bilingual Speech-to-Text & Highlighter</p>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          
          {/* Language Selector */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '4px', border: '1px solid var(--border-color)' }}>
            <button
              onClick={() => onChangeLang('ja-JP')}
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '8px',
                color: currentLang === 'ja-JP' ? '#fff' : 'var(--text-secondary)',
                backgroundColor: currentLang === 'ja-JP' ? 'var(--accent-primary)' : 'transparent',
                boxShadow: currentLang === 'ja-JP' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              🇯🇵 日本語 (テスト用)
            </button>
            <button
              onClick={() => onChangeLang('en-US')}
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '8px',
                color: currentLang === 'en-US' ? '#fff' : 'var(--text-secondary)',
                backgroundColor: currentLang === 'en-US' ? 'var(--accent-primary)' : 'transparent',
                boxShadow: currentLang === 'en-US' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              🇺🇸 English
            </button>
            <button
              onClick={() => onChangeLang('zh-TW')}
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '8px',
                color: currentLang === 'zh-TW' ? '#fff' : 'var(--text-secondary)',
                backgroundColor: currentLang === 'zh-TW' ? 'var(--accent-primary)' : 'transparent',
                boxShadow: currentLang === 'zh-TW' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              🇹🇼 繁體中文
            </button>
            <button
              onClick={() => onChangeLang('zh-CN')}
              style={{
                padding: '6px 12px',
                fontSize: '0.85rem',
                fontWeight: 600,
                borderRadius: '8px',
                color: currentLang === 'zh-CN' ? '#fff' : 'var(--text-secondary)',
                backgroundColor: currentLang === 'zh-CN' ? 'var(--accent-primary)' : 'transparent',
                boxShadow: currentLang === 'zh-CN' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              🇨🇳 简体中文
            </button>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Theme Toggle */}
            <button
              onClick={onToggleTheme}
              className="glass-panel"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)'
              }}
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/>
                  <path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                </svg>
              )}
            </button>

            {/* Clear All */}
            {hasSubtitles && (
              <button
                onClick={onClearSession}
                style={{
                  height: '38px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(244, 63, 94, 0.1)',
                  color: 'var(--accent-danger)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  gap: '6px'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
                </svg>
                Clear
              </button>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
