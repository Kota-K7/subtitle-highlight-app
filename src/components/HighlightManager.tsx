import { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Upload, 
  Download, 
  BookOpen, 
  ChevronDown, 
  ChevronUp,
  Tag,
  Code2,
  FileCode,
  Check,
  X,
  AlertTriangle,
  Info,
  Copy,
  FileText
} from 'lucide-react';
import type { DictionaryWord, WordImportSummary } from '../types';
import { 
  toTraditional, 
  toSimplified, 
  SAMPLE_WORD_JSON_TEMPLATE, 
  SAMPLE_CODE_TEMPLATE,
  copyToClipboard,
  validateAndFilterWordBatch
} from '../utils/helpers';
import { ImportResultModal } from './ImportResultModal';

interface HighlightManagerProps {
  dictionaryWords: DictionaryWord[];
  onAddWord: (word: DictionaryWord) => void;
  onRemoveWord: (id: string) => void;
  onImportWords: (words: DictionaryWord[]) => void;
  onSelectWordForDetail: (wordStr: string, matchedWord?: DictionaryWord) => void;
}

export default function HighlightManager({
  dictionaryWords,
  onAddWord,
  onRemoveWord,
  onImportWords,
  onSelectWordForDetail,
}: HighlightManagerProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState<'json' | 'code' | 'paste'>('json');
  const [pasteJsonText, setPasteJsonText] = useState('');
  const [copiedTemplate, setCopiedTemplate] = useState<string | null>(null);

  // Import Result / Error modal state
  const [importSummary, setImportSummary] = useState<WordImportSummary | null>(null);
  const [isImportResultModalOpen, setIsImportResultModalOpen] = useState(false);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // New Word Form fields
  const [traditional, setTraditional] = useState('');
  const [simplified, setSimplified] = useState('');
  const [pinyin, setPinyin] = useState('');
  const [english, setEnglish] = useState('');
  const [japanese, setJapanese] = useState('');
  const [category, setCategory] = useState('兩岸關係・臺灣政治');
  const [notes, setNotes] = useState('');

  // Extract all available categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    dictionaryWords.forEach((w) => {
      if (w.category) set.add(w.category);
    });
    return ['all', ...Array.from(set)];
  }, [dictionaryWords]);

  // Handle auto-converting simplified/traditional when user inputs
  const handleSimplifiedChange = (val: string) => {
    setSimplified(val);
    if (!traditional) {
      setTraditional(toTraditional(val));
    }
  };

  const handleTraditionalChange = (val: string) => {
    setTraditional(val);
    if (!simplified) {
      setSimplified(toSimplified(val));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormValidationError(null);

    const trad = traditional.trim();
    const simp = simplified.trim();
    const eng = english.trim();

    if (!simp && !trad && !eng) {
      setFormValidationError('繁体字、簡体字、または英単語のいずれかを入力してください。');
      return;
    }

    const simVal = simp || toSimplified(trad);
    const tradVal = trad || toTraditional(simp);

    // Check duplicate
    const existing = dictionaryWords.find(
      (w) =>
        (simVal && w.simplified.toLowerCase() === simVal.toLowerCase()) ||
        (tradVal && w.traditional.toLowerCase() === tradVal.toLowerCase()) ||
        (eng && w.english.toLowerCase() === eng.toLowerCase())
    );

    if (existing) {
      const matchName = existing.traditional || existing.simplified || existing.english;
      setFormValidationError(`単語「${matchName}」は既に辞書に登録されています（重複）。`);
      return;
    }

    const newEntry: DictionaryWord = {
      id: `word-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      traditional: tradVal,
      simplified: simVal,
      pinyin: pinyin.trim(),
      english: eng,
      japanese: japanese.trim() || undefined,
      category: category.trim() || 'その他',
      notes: notes.trim() || undefined,
      createdAt: Date.now(),
    };

    onAddWord(newEntry);

    // Reset Form
    setTraditional('');
    setSimplified('');
    setPinyin('');
    setEnglish('');
    setJapanese('');
    setNotes('');
    setFormValidationError(null);
    setIsFormOpen(false);
  };

  // Export JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dictionaryWords, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `duallingua_dictionary_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Flexible process and import input (file / paste text / array)
  const processAndImportData = (data: unknown) => {
    const itemsArray: unknown[] = Array.isArray(data)
      ? data
      : typeof data === 'object' && data !== null
      ? [data]
      : [data];

    // Run validator that isolates defects/duplicates and keeps all valid ones
    const summary = validateAndFilterWordBatch(itemsArray, dictionaryWords, {
      defaultCategory: 'インポート',
    });

    if (summary.addedWords.length > 0) {
      onImportWords(summary.addedWords);
    }

    setImportSummary(summary);
    setIsImportResultModalOpen(true);
    setIsTemplateModalOpen(false);
    setPasteJsonText('');
  };

  // Import JSON file
  const handleImportJSONFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) || '';
        const parsed = JSON.parse(text);
        processAndImportData(parsed);
      } catch (err) {
        setImportSummary({
          totalSubmitted: 1,
          addedCount: 0,
          skippedCount: 1,
          addedWords: [],
          errors: [
            {
              index: 0,
              itemPreview: file.name,
              wordName: file.name,
              reasonType: 'invalid_format',
              reasonMessage: `JSONファイルの構文解析に失敗しました: ${(err as Error).message}`,
            },
          ],
        });
        setIsImportResultModalOpen(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handle paste import
  const handlePasteImport = () => {
    const text = pasteJsonText.trim();
    if (!text) return;

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        if (text.startsWith('{') && text.endsWith('}')) {
          parsed = JSON.parse(`[${text}]`);
        } else {
          throw new Error('無効なJSON構文です。');
        }
      }
      processAndImportData(parsed);
    } catch (err) {
      setImportSummary({
        totalSubmitted: 1,
        addedCount: 0,
        skippedCount: 1,
        addedWords: [],
        errors: [
          {
            index: 0,
            itemPreview: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
            wordName: '貼り付けテキスト',
            reasonType: 'invalid_format',
            reasonMessage: `JSON形式として正しく解析できませんでした: ${(err as Error).message}`,
          },
        ],
      });
      setIsImportResultModalOpen(true);
    }
  };

  // Copy template helper
  const handleCopyTemplateText = async (text: string, type: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedTemplate(type);
      setTimeout(() => setCopiedTemplate(null), 2000);
    }
  };

  // Filter words
  const filteredWords = useMemo(() => {
    return dictionaryWords.filter((w) => {
      const matchCat = selectedCategory === 'all' || w.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        w.simplified.toLowerCase().includes(q) ||
        w.traditional.toLowerCase().includes(q) ||
        w.pinyin.toLowerCase().includes(q) ||
        w.english.toLowerCase().includes(q) ||
        (w.japanese && w.japanese.toLowerCase().includes(q)) ||
        (w.notes && w.notes.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [dictionaryWords, selectedCategory, searchQuery]);

  return (
    <div className="cream-card p-5 flex flex-col gap-4">
      
      {/* Header with Title & Action tools */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E8E2D8]">
        <div>
          <h2 className="text-sm font-bold text-[#1E293B] flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            音声認識補助 ユーザー辞書
          </h2>
          <p className="text-[11px] text-[#64748B]">登録単語を字幕内で自動検出＆青色太字で強調</p>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Template & Bulk register */}
          <button
            onClick={() => setIsTemplateModalOpen(true)}
            className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold cursor-pointer flex items-center gap-1 transition-colors"
            title="単語登録テンプレート・コード形式を確認"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">テンプレ</span>
          </button>

          {/* Import JSON */}
          <label 
            className="p-1.5 rounded-lg bg-[#FAF8F5] border border-[#E8E2D8] hover:bg-[#F2ECE1] text-[#475569] text-xs font-medium cursor-pointer flex items-center gap-1"
            title="JSONから辞書をインポート"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">インポート</span>
            <input type="file" accept=".json" onChange={handleImportJSONFile} className="hidden" />
          </label>

          {/* Export JSON */}
          <button
            onClick={handleExportJSON}
            disabled={dictionaryWords.length === 0}
            className="p-1.5 rounded-lg bg-[#FAF8F5] border border-[#E8E2D8] hover:bg-[#F2ECE1] text-[#475569] text-xs font-medium cursor-pointer disabled:opacity-50 flex items-center gap-1"
            title="辞書データをJSONで保存"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">保存</span>
          </button>
        </div>
      </div>

      {/* Toggle Add Word Form Button */}
      <button
        id="toggle-add-word-form-btn"
        onClick={() => setIsFormOpen(!isFormOpen)}
        className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold flex items-center justify-between border border-indigo-200 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          新しく単語・専門用語を登録
        </span>
        {isFormOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Recent Import Result quick link if available */}
      {importSummary && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-xs">
          <div className="flex items-center gap-1.5 text-[#475569]">
            <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="text-[11px]">
              直近のインポート結果: <strong className="text-emerald-700">{importSummary.addedCount}件追加</strong>
              {importSummary.skippedCount > 0 && (
                <span className="ml-1 text-rose-700 font-semibold">({importSummary.skippedCount}件除外)</span>
              )}
            </span>
          </div>
          <button
            onClick={() => setIsImportResultModalOpen(true)}
            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline cursor-pointer"
          >
            詳細・エラー一覧を見る
          </button>
        </div>
      )}

      {/* Expandable Add Word Form */}
      {isFormOpen && (
        <form onSubmit={handleSubmit} className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E8E2D8] flex flex-col gap-3">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                🇹🇼 繁体字 (Traditional) <span className="text-indigo-600">*</span>
              </label>
              <input
                type="text"
                value={traditional}
                onChange={(e) => handleTraditionalChange(e.target.value)}
                placeholder="例: 九二共識, 二二八事件, 臥薪嚐膽"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                🇨🇳 簡体字 (Simplified)
              </label>
              <input
                type="text"
                value={simplified}
                onChange={(e) => handleSimplifiedChange(e.target.value)}
                placeholder="例: 九二共识, 二二八事件, 卧薪尝胆"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                ピンイン (Pinyin)
              </label>
              <input
                type="text"
                value={pinyin}
                onChange={(e) => setPinyin(e.target.value)}
                placeholder="例: jiǔ èr gòng shí"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                🇺🇸 英語 (English)
              </label>
              <input
                type="text"
                value={english}
                onChange={(e) => setEnglish(e.target.value)}
                placeholder="例: 1992 Consensus"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                🇯🇵 日本語 (任意)
              </label>
              <input
                type="text"
                value={japanese}
                onChange={(e) => setJapanese(e.target.value)}
                placeholder="例: 九二共識"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                カテゴリ
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: 台中現代史, 兩岸關係・臺灣政治, 成語・典故"
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                メモ・用例 (任意)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="例: 歴史的背景や政治的文脈の補足..."
                className="w-full text-xs px-2.5 py-1.5 bg-white border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {formValidationError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{formValidationError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-3 py-1.5 text-xs text-[#64748B] hover:bg-[#F2ECE1] rounded-lg transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              単語を辞書に登録
            </button>
          </div>

        </form>
      )}

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="登録単語・ピンイン・英語・訳語を検索..."
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-lg text-[#1E293B] focus:bg-white outline-none"
          />
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-[#FAF8F5] text-[#64748B] border-[#E8E2D8] hover:bg-[#F2ECE1]'
              }`}
            >
              {cat === 'all' ? `すべて (${dictionaryWords.length})` : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Dictionary Words List */}
      <div className="max-h-[340px] overflow-y-auto flex flex-col gap-2 pr-1">
        {filteredWords.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#94A3B8]">
            {searchQuery ? '検索条件に一致する単語がありません。' : '登録された単語はありません。'}
          </div>
        ) : (
          filteredWords.map((w) => (
            <div
              key={w.id}
              className="p-3 bg-white hover:bg-[#FAF8F5] rounded-xl border border-[#E8E2D8] hover:border-[#DDD5C9] flex items-start justify-between gap-2 transition-all shadow-xs"
            >
              <div 
                className="flex-1 cursor-pointer"
                onClick={() => onSelectWordForDetail(w.traditional || w.simplified, w)}
                title="クリックして詳細・外部辞書を開く"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-indigo-900">
                    {w.traditional || w.simplified}
                    {w.simplified && w.simplified !== w.traditional && (
                      <span className="text-xs font-normal text-[#64748B] ml-1">
                        (简: {w.simplified})
                      </span>
                    )}
                  </span>
                  {w.pinyin && (
                    <span className="text-xs text-[#475569] font-medium">
                      [{w.pinyin}]
                    </span>
                  )}
                  {w.category && (
                    <span className="text-[10px] bg-[#FAF8F5] text-[#475569] px-1.5 py-0.5 rounded border border-[#E8E2D8] flex items-center gap-0.5">
                      <Tag className="w-2.5 h-2.5 text-[#64748B]" />
                      {w.category}
                    </span>
                  )}
                </div>

                {/* English / Japanese meanings */}
                <div className="text-xs text-[#334155] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {w.english && <span>🇺🇸 {w.english}</span>}
                  {w.japanese && <span>🇯🇵 {w.japanese}</span>}
                </div>

                {w.notes && (
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    💡 {w.notes}
                  </div>
                )}
              </div>

              {/* Remove button */}
              <button
                onClick={() => onRemoveWord(w.id)}
                className="p-1 rounded-lg text-[#94A3B8] hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                title="辞書から削除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Template & Code Reference Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E8E2D8] shadow-2xl max-w-lg w-full p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-[#1E293B]">
                  単語登録テンプレート ＆ コード形式
                </h3>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 rounded-lg text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F2ECE1]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="flex rounded-lg bg-[#FAF8F5] p-1 border border-[#E8E2D8]">
              <button
                onClick={() => setTemplateTab('json')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  templateTab === 'json' ? 'bg-indigo-600 text-white shadow-xs' : 'text-[#64748B]'
                }`}
              >
                JSON形式 (一括インポート用)
              </button>
              <button
                onClick={() => setTemplateTab('code')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  templateTab === 'code' ? 'bg-indigo-600 text-white shadow-xs' : 'text-[#64748B]'
                }`}
              >
                TSコード形式 (コードベース用)
              </button>
              <button
                onClick={() => setTemplateTab('paste')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  templateTab === 'paste' ? 'bg-indigo-600 text-white shadow-xs' : 'text-[#64748B]'
                }`}
              >
                テキスト貼り付け追加
              </button>
            </div>

            {/* Content per Tab */}
            {templateTab === 'json' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#475569]">
                    以下のJSONテンプレートをコピーして編集し、一括登録できます。
                  </p>
                  <button
                    onClick={() => {
                      setPasteJsonText(SAMPLE_WORD_JSON_TEMPLATE);
                      setTemplateTab('paste');
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    貼り付け枠に挿入して編集
                  </button>
                </div>
                <div className="relative bg-[#1E293B] text-slate-200 p-3 rounded-xl font-mono text-[11px] overflow-x-auto max-h-56 select-all group">
                  <button
                    onClick={() => handleCopyTemplateText(SAMPLE_WORD_JSON_TEMPLATE, 'json')}
                    className="absolute top-2 right-2 px-2 py-1 bg-slate-700/80 hover:bg-slate-600 text-slate-200 hover:text-white rounded-md text-[10px] font-sans flex items-center gap-1 transition-colors cursor-pointer"
                    title="コピー"
                  >
                    {copiedTemplate === 'json' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>コピー完了</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>コピー</span>
                      </>
                    )}
                  </button>
                  <pre>{SAMPLE_WORD_JSON_TEMPLATE}</pre>
                </div>
                <button
                  onClick={() => handleCopyTemplateText(SAMPLE_WORD_JSON_TEMPLATE, 'json')}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedTemplate === 'json' ? (
                    <>
                      <Check className="w-4 h-4" />
                      JSONテンプレートをコピーしました
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      JSONテンプレートをコピー
                    </>
                  )}
                </button>
              </div>
            )}

            {templateTab === 'code' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-[#475569]">
                  開発時に初期辞書（<code className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded">src/utils/helpers.ts</code> の <code className="text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded">DEFAULT_DICTIONARY</code>）へ直接追加するコード形式です。
                </p>
                <div className="relative bg-[#1E293B] text-slate-200 p-3 rounded-xl font-mono text-[11px] overflow-x-auto max-h-56 select-all group">
                  <button
                    onClick={() => handleCopyTemplateText(SAMPLE_CODE_TEMPLATE, 'code')}
                    className="absolute top-2 right-2 px-2 py-1 bg-slate-700/80 hover:bg-slate-600 text-slate-200 hover:text-white rounded-md text-[10px] font-sans flex items-center gap-1 transition-colors cursor-pointer"
                    title="コピー"
                  >
                    {copiedTemplate === 'code' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>コピー完了</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>コピー</span>
                      </>
                    )}
                  </button>
                  <pre>{SAMPLE_CODE_TEMPLATE}</pre>
                </div>
                <button
                  onClick={() => handleCopyTemplateText(SAMPLE_CODE_TEMPLATE, 'code')}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedTemplate === 'code' ? (
                    <>
                      <Check className="w-4 h-4" />
                      TypeScriptコードをコピーしました
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      コードスニペットをコピー
                    </>
                  )}
                </button>
              </div>
            )}

            {templateTab === 'paste' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-[#475569]">
                    JSON配列データを貼り付けて、辞書に一括インポートできます。
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPasteJsonText(SAMPLE_WORD_JSON_TEMPLATE)}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="サンプル形式を入力欄に自動セット"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      テンプレを挿入
                    </button>
                    <button
                      onClick={() => handleCopyTemplateText(SAMPLE_WORD_JSON_TEMPLATE, 'paste-sample')}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#475569] border border-[#E8E2D8] rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                      title="サンプル形式をクリップボードにコピー"
                    >
                      {copiedTemplate === 'paste-sample' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-bold">コピー完了</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>テンプレをコピー</span>
                        </>
                      )}
                    </button>
                    {pasteJsonText && (
                      <button
                        onClick={() => setPasteJsonText('')}
                        className="px-2 py-1 text-[11px] text-[#94A3B8] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="入力欄をクリア"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={pasteJsonText}
                    onChange={(e) => setPasteJsonText(e.target.value)}
                    placeholder={`[\n  {\n    "traditional": "九二共識",\n    "simplified": "九二共识",\n    "pinyin": "jiǔ èr gòng shí",\n    "english": "1992 Consensus",\n    "japanese": "九二共識",\n    "category": "兩岸關係・臺灣政治"\n  }\n]`}
                    rows={8}
                    className="w-full text-xs font-mono p-3 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl text-[#1E293B] focus:bg-white outline-none"
                  />
                  {!pasteJsonText && (
                    <button
                      onClick={() => setPasteJsonText(SAMPLE_WORD_JSON_TEMPLATE)}
                      className="absolute bottom-4 right-4 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      サンプル形式を挿入して試す
                    </button>
                  )}
                </div>

                <div className="p-2.5 bg-[#FAF8F5] border border-[#E8E2D8] rounded-xl flex items-start gap-2 text-[11px] text-[#64748B]">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-semibold text-[#334155]">利用可能な項目: </span>
                    <code className="text-indigo-700 font-mono">traditional</code> (必須),{' '}
                    <code className="text-[#475569] font-mono">simplified</code>,{' '}
                    <code className="text-[#475569] font-mono">pinyin</code>,{' '}
                    <code className="text-[#475569] font-mono">english</code>,{' '}
                    <code className="text-[#475569] font-mono">japanese</code>,{' '}
                    <code className="text-[#475569] font-mono">category</code>,{' '}
                    <code className="text-[#475569] font-mono">notes</code>
                  </div>
                </div>

                <button
                  onClick={handlePasteImport}
                  disabled={!pasteJsonText.trim()}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  辞書に一括インポート実行
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Import Result & Error List Modal */}
      <ImportResultModal
        summary={importSummary}
        isOpen={isImportResultModalOpen}
        onClose={() => setIsImportResultModalOpen(false)}
      />

    </div>
  );
}

