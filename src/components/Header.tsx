import { useState } from 'react';
import { 
  Languages, 
  Copy, 
  Check, 
  Download, 
  FileText, 
  Trash2, 
  Volume2
} from 'lucide-react';

interface HeaderProps {
  currentLang: string;
  onChangeLang: (lang: string) => void;
  onClearSession: () => void;
  onCopyAll: () => void;
  onDownloadTXT: () => void;
  onDownloadSRT: () => void;
  hasSubtitles: boolean;
  isCopied: boolean;
}

export default function Header({
  currentLang,
  onChangeLang,
  onClearSession,
  onCopyAll,
  onDownloadTXT,
  onDownloadSRT,
  hasSubtitles,
  isCopied,
}: HeaderProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-[#E8E2D8] px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
        
        {/* Logo & Brand */}
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-[#1E293B]">DualLingua</h1>
                <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  繁體中文 STT
                </span>
              </div>
              <p className="text-xs text-[#64748B]">中英リアルタイム音声認識 ＆ 繁体字自動変換ハイライト</p>
            </div>
          </div>

          {/* Mobile Fast Action */}
          <div className="flex items-center gap-1.5 md:hidden">
            {hasSubtitles && (
              <>
                <button
                  id="mobile-copy-btn"
                  onClick={onCopyAll}
                  className="p-2 rounded-lg bg-white border border-[#E8E2D8] text-[#1E293B] hover:bg-[#F2ECE1] transition-colors"
                  title="全文字起こしをコピー"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={onClearSession}
                  className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors"
                  title="全文一括削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 w-full md:w-auto">
          
          {/* Recognition Target Language Selector (Priority selector: Chinese (default) vs English) */}
          <div className="flex items-center bg-white rounded-lg p-1 border border-[#E8E2D8] shadow-xs">
            <span className="text-xs font-medium text-[#64748B] px-2 hidden sm:inline-flex items-center gap-1">
              <Languages className="w-3.5 h-3.5" /> 認識優先:
            </span>
            <button
              onClick={() => onChangeLang('zh-CN')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                currentLang === 'zh-CN'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-[#475569] hover:bg-[#F5F1EA]'
              }`}
              title="中国語優先 (中英両方聞き取り可能・繁体字出力)"
            >
              🇨🇳 中国語 (優先)
            </button>
            <button
              onClick={() => onChangeLang('en-US')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                currentLang === 'en-US'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-[#475569] hover:bg-[#F5F1EA]'
              }`}
              title="英語優先 (中英両方聞き取り可能)"
            >
              🇺🇸 英語 (優先)
            </button>
          </div>

          {/* Copy All Button */}
          <button
            id="header-copy-all-btn"
            onClick={onCopyAll}
            disabled={!hasSubtitles}
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              isCopied
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : hasSubtitles
                ? 'bg-white hover:bg-[#F5F1EA] text-[#1E293B] border-[#E8E2D8] shadow-xs cursor-pointer'
                : 'bg-white/50 text-[#94A3B8] border-[#E8E2D8]/60 cursor-not-allowed'
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                コピー完了
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#475569]" />
                全テキストコピー
              </>
            )}
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="relative">
            <button
              id="export-menu-btn"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!hasSubtitles}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                hasSubtitles
                  ? 'bg-white hover:bg-[#F5F1EA] text-[#1E293B] border-[#E8E2D8] shadow-xs cursor-pointer'
                  : 'bg-white/50 text-[#94A3B8] border-[#E8E2D8]/60 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-[#475569]" />
              保存・出力
            </button>

            {showExportMenu && hasSubtitles && (
              <div 
                className="absolute right-0 mt-1 w-44 bg-white rounded-xl border border-[#E8E2D8] shadow-lg py-1 z-40"
                onClick={() => setShowExportMenu(false)}
              >
                <button
                  onClick={onDownloadTXT}
                  className="w-full text-left px-3 py-2 text-xs text-[#1E293B] hover:bg-[#FAF8F5] flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-indigo-600" />
                  テキストファイル (.txt)
                </button>
                <button
                  onClick={onDownloadSRT}
                  className="w-full text-left px-3 py-2 text-xs text-[#1E293B] hover:bg-[#FAF8F5] flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  字幕ファイル (.srt)
                </button>
              </div>
            )}
          </div>

          {/* Clear Session (全文一括削除) */}
          {hasSubtitles && (
            <button
              id="header-clear-btn"
              onClick={onClearSession}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              title="文字起こしを全文一括クリア"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">全文削除</span>
            </button>
          )}

        </div>

      </div>
    </header>
  );
}
