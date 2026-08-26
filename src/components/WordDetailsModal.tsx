import { useState } from 'react';
import { X, Plus, ExternalLink, Trash2, Check, Bookmark, BookOpen } from 'lucide-react';
import type { DictionaryWord } from '../types';
import { toTraditional, toSimplified, isChinese } from '../utils/helpers';

interface WordDetailsModalProps {
  wordStr: string;
  matchedWord?: DictionaryWord;
  onClose: () => void;
  onAddWord: (word: DictionaryWord) => void;
  onRemoveWord: (id: string) => void;
}

export default function WordDetailsModal({
  wordStr,
  matchedWord,
  onClose,
  onAddWord,
  onRemoveWord,
}: WordDetailsModalProps) {
  const isRegistered = !!matchedWord;

  // Form states for quick adding initialized from wordStr
  const [traditional, setTraditional] = useState(() => {
    if (matchedWord) return matchedWord.traditional;
    return isChinese(wordStr) ? toTraditional(wordStr) : '';
  });

  const [simplified, setSimplified] = useState(() => {
    if (matchedWord) return matchedWord.simplified;
    return isChinese(wordStr) ? toSimplified(wordStr) : '';
  });

  const [pinyin, setPinyin] = useState(() => matchedWord?.pinyin || '');
  const [english, setEnglish] = useState(() => {
    if (matchedWord) return matchedWord.english;
    return !isChinese(wordStr) ? wordStr : '';
  });
  const [japanese, setJapanese] = useState(() => matchedWord?.japanese || '');
  const [category, setCategory] = useState(() => matchedWord?.category || '日常・学習');
  const [notes, setNotes] = useState(() => matchedWord?.notes || '');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const simVal = simplified.trim() || toSimplified(wordStr);
    const tradVal = traditional.trim() || toTraditional(wordStr);

    const newWord: DictionaryWord = {
      id: `word-${Date.now()}`,
      traditional: tradVal,
      simplified: simVal,
      pinyin: pinyin.trim(),
      english: english.trim(),
      japanese: japanese.trim(),
      category: category.trim() || '日常・学習',
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
    };

    onAddWord(newWord);
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  // External lookup URLs (The 4 user-specified dictionaries)
  const getDictUrls = () => {
    const searchTarget = matchedWord?.simplified || matchedWord?.traditional || wordStr;
    const tradTarget = matchedWord?.traditional || toTraditional(searchTarget);
    const encQuery = encodeURIComponent(searchTarget);
    const encTrad = encodeURIComponent(tradTarget);

    return [
      {
        name: '台湾教育部 國語辭典',
        sub: '台湾公式・繁体字辞書 / 萌典',
        url: `https://dict.revised.moe.edu.tw/search.jsp?md=1&word=${encTrad}`,
      },
      {
        name: '有道词典 (Youdao)',
        sub: '中英・英中・類語・豊富な例文',
        url: `https://dict.youdao.com/w/${encQuery}`,
      },
      {
        name: 'Cambridge Learners English Dictionary',
        sub: 'ケンブリッジ学習者英英・中英辞典',
        url: `https://dictionary.cambridge.org/search/learner-english/direct/?q=${encQuery}`,
      },
      {
        name: 'MDBG 中英辞典',
        sub: 'ピンイン・部首・筆順・詳細語義',
        url: `https://www.mdbg.net/chinese/dictionary?page=worddict&wdrst=0&wdqcol=1&wdqchi=${encQuery}`,
      },
    ];
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FAF8F5] border border-[#E8E2D8] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-5 py-4 bg-white border-b border-[#E8E2D8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E293B]">単語詳細 & 外部辞書検索</h3>
              <span className="text-[11px] text-[#64748B]">音声認識ハイライト連動（繁体字優先）</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          
          {/* Main Word Display Card */}
          <div className="bg-white p-4 rounded-xl border border-[#E8E2D8] shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-2xl font-bold text-indigo-900 tracking-tight">
                  {matchedWord?.traditional || toTraditional(matchedWord?.simplified || wordStr)}
                </span>
                {matchedWord?.simplified && matchedWord.simplified !== matchedWord.traditional && (
                  <span className="text-sm text-[#64748B] font-normal ml-2">
                    (简: {matchedWord.simplified})
                  </span>
                )}
                {matchedWord?.pinyin && (
                  <div className="text-xs font-semibold text-indigo-600 mt-1">
                    [{matchedWord.pinyin}]
                  </div>
                )}
              </div>

              {isRegistered ? (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <Bookmark className="w-3 h-3" />
                  辞書登録済み
                </span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[#FAF8F5] text-[#64748B] border border-[#E8E2D8]">
                  未登録
                </span>
              )}
            </div>

            {/* Registered translations view */}
            {isRegistered && matchedWord && (
              <div className="mt-3 pt-3 border-t border-[#F5F1EA] flex flex-col gap-1.5 text-xs">
                {matchedWord.english && (
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-[#64748B] w-14 shrink-0">🇺🇸 英語:</span>
                    <span className="text-[#1E293B] font-medium">{matchedWord.english}</span>
                  </div>
                )}
                {matchedWord.japanese && (
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-[#64748B] w-14 shrink-0">🇯🇵 日本語:</span>
                    <span className="text-[#1E293B] font-medium">{matchedWord.japanese}</span>
                  </div>
                )}
                {matchedWord.category && (
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-[#64748B] w-14 shrink-0">カテゴリ:</span>
                    <span className="text-[#475569]">{matchedWord.category}</span>
                  </div>
                )}
                {matchedWord.notes && (
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-[#64748B] w-14 shrink-0">メモ:</span>
                    <span className="text-[#475569]">{matchedWord.notes}</span>
                  </div>
                )}

                <div className="mt-2 pt-2 border-t border-[#F5F1EA] flex justify-end">
                  <button
                    onClick={() => {
                      onRemoveWord(matchedWord.id);
                      onClose();
                    }}
                    className="flex items-center gap-1 text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    辞書から登録解除
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* External Dictionary Search Links (4 standard dictionaries) */}
          <div className="bg-white p-4 rounded-xl border border-[#E8E2D8] flex flex-col gap-2 shadow-xs">
            <h4 className="text-xs font-bold text-[#475569] flex items-center justify-between">
              <span>外部辞書・語彙検索</span>
              <span className="text-[11px] font-normal text-[#94A3B8]">ワンクリックで外部検索</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {getDictUrls().map((dict, idx) => (
                <a
                  key={idx}
                  href={dict.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E8E2D8] hover:border-indigo-300 text-xs text-[#1E293B] font-medium transition-all group cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-[#1E293B] group-hover:text-indigo-700">{dict.name}</span>
                    <span className="text-[10px] text-[#64748B]">{dict.sub}</span>
                  </div>
                  <ExternalLink className="w-4 h-4 text-indigo-600 shrink-0 ml-1 group-hover:translate-x-0.5 transition-transform" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Registration Form (If not registered) */}
          {!isRegistered && (
            <form onSubmit={handleSave} className="bg-white p-4 rounded-xl border border-[#E8E2D8] flex flex-col gap-3 shadow-xs">
              <div className="text-xs font-bold text-[#1E293B] flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                この単語を補助辞書に追加
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-0.5">繁体字</label>
                  <input
                    type="text"
                    value={traditional}
                    onChange={(e) => setTraditional(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] outline-none focus:bg-white focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-0.5">簡体字</label>
                  <input
                    type="text"
                    value={simplified}
                    onChange={(e) => setSimplified(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] outline-none focus:bg-white focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-0.5">ピンイン</label>
                  <input
                    type="text"
                    value={pinyin}
                    onChange={(e) => setPinyin(e.target.value)}
                    placeholder="例: nǐ hǎo"
                    className="w-full text-xs px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] outline-none focus:bg-white focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-0.5">英語訳</label>
                  <input
                    type="text"
                    value={english}
                    onChange={(e) => setEnglish(e.target.value)}
                    placeholder="English"
                    className="w-full text-xs px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] outline-none focus:bg-white focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-0.5">日本語訳 (任意)</label>
                  <input
                    type="text"
                    value={japanese}
                    onChange={(e) => setJapanese(e.target.value)}
                    placeholder="日本語"
                    className="w-full text-xs px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] outline-none focus:bg-white focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-0.5">カテゴリ</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="台中現代史, 兩岸關係・臺灣政治..."
                    className="w-full text-xs px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] outline-none focus:bg-white focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#64748B] mb-0.5">メモ (任意)</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="補足や用例..."
                    className="w-full text-xs px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] outline-none focus:bg-white focus:border-indigo-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSaved}
                className="mt-1 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isSaved ? (
                  <>
                    <Check className="w-4 h-4" /> 辞書に登録しました
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> 辞書に登録する
                  </>
                )}
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
}

