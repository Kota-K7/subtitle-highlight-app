import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  X,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { WordImportSummary, WordImportError } from '../types';
import { copyToClipboard } from '../utils/helpers';

interface ImportResultModalProps {
  summary: WordImportSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ImportResultModal: React.FC<ImportResultModalProps> = ({
  summary,
  isOpen,
  onClose,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [copiedErrorIndex, setCopiedErrorIndex] = useState<number | null>(null);
  const [copiedAllErrors, setCopiedAllErrors] = useState(false);
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'errors' | 'added'>('errors');

  if (!isOpen || !summary) return null;

  const toggleExpand = (idx: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCopySingleError = async (err: WordImportError, idx: number) => {
    const text = typeof err.rawItem === 'object' ? JSON.stringify(err.rawItem, null, 2) : err.itemPreview;
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedErrorIndex(idx);
      setTimeout(() => setCopiedErrorIndex(null), 2000);
    }
  };

  const handleCopyAllFailed = async () => {
    const failedList = summary.errors.map((e) => e.rawItem || { preview: e.itemPreview, reason: e.reasonMessage });
    const ok = await copyToClipboard(JSON.stringify(failedList, null, 2));
    if (ok) {
      setCopiedAllErrors(true);
      setTimeout(() => setCopiedAllErrors(false), 2000);
    }
  };

  const filteredErrors = summary.errors.filter((err) => {
    if (filterType === 'all') return true;
    if (filterType === 'duplicate') return err.reasonType === 'duplicate_existing' || err.reasonType === 'duplicate_batch';
    if (filterType === 'missing') return err.reasonType === 'missing_required';
    if (filterType === 'format') return err.reasonType === 'invalid_format';
    return true;
  });

  const duplicateCount = summary.errors.filter(
    (e) => e.reasonType === 'duplicate_existing' || e.reasonType === 'duplicate_batch'
  ).length;
  const missingCount = summary.errors.filter((e) => e.reasonType === 'missing_required').length;
  const formatCount = summary.errors.filter((e) => e.reasonType === 'invalid_format').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white border border-[#E8E2D8] rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8E2D8] flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${summary.skippedCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {summary.skippedCount > 0 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1E293B]">単語インポート処理結果</h3>
              <p className="text-xs text-[#64748B]">
                不備や重複のある項目のみを除外し、有効な単語を追加しました
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#E8E2D8] text-[#64748B] hover:text-[#1E293B] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="px-5 py-3 bg-[#FAF8F5]/50 border-b border-[#E8E2D8] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-emerald-200 text-emerald-800 font-bold rounded-lg shadow-2xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              追加成功: {summary.addedCount} 件
            </div>

            {summary.skippedCount > 0 ? (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-rose-200 text-rose-800 font-bold rounded-lg shadow-2xs">
                <XCircle className="w-4 h-4 text-rose-600" />
                除外・スキップ: {summary.skippedCount} 件
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-[#64748B] font-medium rounded-lg shadow-2xs">
                除外なし (全件正常)
              </div>
            )}
          </div>

          <div className="text-[11px] text-[#64748B]">
            提出総数: <span className="font-semibold text-[#1E293B]">{summary.totalSubmitted}</span> 件
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-5 pt-3 pb-2 flex items-center justify-between border-b border-[#E8E2D8]">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('errors')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'errors'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'text-[#64748B] hover:bg-[#FAF8F5]'
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              除外単語・エラーリスト ({summary.skippedCount})
            </button>
            <button
              onClick={() => setActiveTab('added')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'added'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'text-[#64748B] hover:bg-[#FAF8F5]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              追加された単語 ({summary.addedCount})
            </button>
          </div>

          {activeTab === 'errors' && summary.errors.length > 0 && (
            <button
              onClick={handleCopyAllFailed}
              className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              title="除外されたデータをJSON形式でクリップボードにコピー"
            >
              {copiedAllErrors ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  コピー完了
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  除外リストをコピー
                </>
              )}
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {activeTab === 'errors' && (
            <>
              {/* Category Filter Chips for errors */}
              {summary.errors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                      filterType === 'all'
                        ? 'bg-[#1E293B] text-white border-[#1E293B]'
                        : 'bg-[#FAF8F5] text-[#64748B] border-[#E8E2D8] hover:bg-[#F2ECE1]'
                    }`}
                  >
                    すべて ({summary.errors.length})
                  </button>
                  {duplicateCount > 0 && (
                    <button
                      onClick={() => setFilterType('duplicate')}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                        filterType === 'duplicate'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      重複 ({duplicateCount})
                    </button>
                  )}
                  {missingCount > 0 && (
                    <button
                      onClick={() => setFilterType('missing')}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                        filterType === 'missing'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      必須項目不足 ({missingCount})
                    </button>
                  )}
                  {formatCount > 0 && (
                    <button
                      onClick={() => setFilterType('format')}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                        filterType === 'format'
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      形式不備 ({formatCount})
                    </button>
                  )}
                </div>
              )}

              {/* Empty state for errors */}
              {summary.errors.length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-[#1E293B]">エラーや重複はありません</p>
                  <p className="text-xs text-[#64748B]">
                    すべての単語が正常に検証され、辞書へ追加されました。
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {filteredErrors.map((err, idx) => {
                    const isExpanded = expandedIndices.has(idx);
                    const isDuplicate = err.reasonType.startsWith('duplicate');
                    const isMissing = err.reasonType === 'missing_required';

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3 flex flex-col gap-2 transition-all ${
                          isDuplicate
                            ? 'bg-amber-50/40 border-amber-200'
                            : isMissing
                            ? 'bg-rose-50/40 border-rose-200'
                            : 'bg-[#FAF8F5] border-[#E8E2D8]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1">
                            <span
                              className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-tight shrink-0 ${
                                isDuplicate
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : isMissing
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : 'bg-slate-200 text-slate-700 border border-slate-300'
                              }`}
                            >
                              {isDuplicate ? '重複' : isMissing ? '入力不備' : '形式不良'}
                            </span>

                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-[#1E293B] break-all">
                                {err.wordName || err.itemPreview}
                              </span>
                              <span className="text-[11px] text-[#475569] mt-0.5 font-medium">
                                原因: {err.reasonMessage}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleCopySingleError(err, idx)}
                              className="p-1 rounded-md bg-white border border-[#E8E2D8] hover:bg-[#FAF8F5] text-[#64748B] hover:text-[#1E293B] text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="この項目のJSONをコピー"
                            >
                              {copiedErrorIndex === idx ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                            {err.rawItem != null && (
                              <button
                                onClick={() => toggleExpand(idx)}
                                className="p-1 rounded-md bg-white border border-[#E8E2D8] hover:bg-[#FAF8F5] text-[#64748B] hover:text-[#1E293B] text-[10px] flex items-center cursor-pointer transition-colors"
                                title="データ詳細を展開"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Raw JSON detail snippet when expanded */}
                        {isExpanded && err.rawItem != null && (
                          <div className="mt-1 p-2 bg-[#1E293B] text-slate-200 rounded-lg text-[10px] font-mono overflow-x-auto">
                            <pre>{JSON.stringify(err.rawItem, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'added' && (
            <>
              {summary.addedWords.length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                    <Layers className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-[#1E293B]">追加された単語はありません</p>
                  <p className="text-xs text-[#64748B]">すべての項目が重複または不備により除外されました。</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {summary.addedWords.map((word) => (
                    <div
                      key={word.id}
                      className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8E2D8] flex flex-col gap-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-950 text-sm">
                          {word.traditional || word.simplified}
                        </span>
                        <span className="text-[10px] font-semibold bg-white px-2 py-0.5 rounded border border-[#E8E2D8] text-[#64748B]">
                          {word.category}
                        </span>
                      </div>
                      {word.simplified && word.simplified !== word.traditional && (
                        <div className="text-[11px] text-[#64748B]">
                          簡: {word.simplified}
                        </div>
                      )}
                      {word.pinyin && (
                        <div className="text-[11px] text-indigo-700 font-mono">
                          [{word.pinyin}]
                        </div>
                      )}
                      {word.english && (
                        <div className="text-[11px] text-[#475569] truncate">
                          {word.english}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E8E2D8] bg-[#FAF8F5] flex items-center justify-between">
          <span className="text-[11px] text-[#64748B]">
            ※ 追加された単語は自動的に保存され、字幕ハイライトに反映されます
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1E293B] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
