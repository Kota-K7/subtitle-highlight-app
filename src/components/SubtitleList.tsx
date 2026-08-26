import { useEffect, useRef } from 'react';
import { Copy, Check, Clock, Sparkles, Trash2 } from 'lucide-react';
import type { SubtitleItem, SubtitleToken, DictionaryWord } from '../types';
import { toTraditional } from '../utils/helpers';

interface SubtitleListProps {
  subtitles: SubtitleItem[];
  interimText: string;
  onSelectWord: (wordStr: string, matchedWord?: DictionaryWord) => void;
  onCopyText: (text: string, id: string) => void;
  onDeleteLine: (id: string) => void;
  copiedId: string | null;
}

export default function SubtitleList({
  subtitles,
  interimText,
  onSelectWord,
  onCopyText,
  onDeleteLine,
  copiedId,
}: SubtitleListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new subtitles or interim text
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [subtitles, interimText]);

  const displayInterim = toTraditional(interimText);

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-[380px] max-h-[calc(100vh-320px)] overflow-y-auto pr-1 flex flex-col gap-3 scroll-smooth"
    >
      {subtitles.length === 0 && !interimText ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#94A3B8] gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F1EA] flex items-center justify-center text-[#64748B]">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#475569]">まだ字幕はありません</p>
            <p className="text-xs text-[#94A3B8] mt-1">「音声認識を開始」を押してマイクに向かって話してください</p>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">※ 登録された単語は自動的に青色太字で強調されます（繁体字表示）</p>
          </div>
        </div>
      ) : (
        <>
          {/* Subtitle Items List */}
          {subtitles.map((item, index) => {
            const isItemCopied = copiedId === item.id;
            const fullSentence = item.tokens.map((t) => t.text).join('');

            return (
              <div
                key={item.id}
                className="bg-white border border-[#E8E2D8] rounded-xl p-4 shadow-xs hover:border-[#DDD5C9] transition-all group"
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#F5F1EA] text-xs text-[#64748B]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-100">
                      #{index + 1}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-[#94A3B8]">
                      <Clock className="w-3 h-3" />
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Actions: Copy and Delete */}
                  <div className="flex items-center gap-1.5">
                    {/* Copy Row Button */}
                    <button
                      onClick={() => onCopyText(fullSentence, item.id)}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#475569] border border-[#E8E2D8] transition-colors cursor-pointer"
                      title="この行のテキストをコピー"
                    >
                      {isItemCopied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-700 font-medium">コピー完了</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#64748B]" />
                          <span>コピー</span>
                        </>
                      )}
                    </button>

                    {/* Delete Sentence Button (文ごと削除) */}
                    <button
                      onClick={() => onDeleteLine(item.id)}
                      className="p-1 rounded-md text-[#94A3B8] hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
                      title="この文を削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Subtitle Text Content (Segmented into clickable tokens) */}
                <div className="text-[1.05rem] leading-relaxed text-[#1E293B] flex flex-wrap items-center">
                  {item.tokens.map((token: SubtitleToken, tIdx: number) => {
                    if (token.type === 'punctuation') {
                      return (
                        <span key={tIdx} className="text-[#64748B] px-0.5 select-none">
                          {token.text}
                        </span>
                      );
                    }

                    const isHl = token.isHighlighted;

                    return (
                      <span
                        key={tIdx}
                        onClick={() => onSelectWord(token.text, token.matchedWord)}
                        className={`word-token ${isHl ? 'is-highlighted' : ''}`}
                        title={
                          isHl
                            ? `登録単語: ${token.matchedWord?.english || token.matchedWord?.japanese || ''} (タップして辞書・詳細を開く)`
                            : 'タップして辞書登録または外部辞書検索'
                        }
                      >
                        {token.text}
                      </span>
                    );
                  })}
                </div>

              </div>
            );
          })}

          {/* Interim Real-time Transcription Display (Visual Distinction) */}
          {displayInterim && (
            <div className="bg-[#FAF8F5] border border-dashed border-rose-300 rounded-xl p-4 shadow-xs animate-pulse">
              <div className="flex items-center gap-2 mb-1.5 text-xs text-rose-700 font-semibold">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                <span>聞き取り中 (リアルタイム変換)...</span>
              </div>
              <p className="text-[1.05rem] italic text-[#475569] leading-relaxed">
                {displayInterim}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
