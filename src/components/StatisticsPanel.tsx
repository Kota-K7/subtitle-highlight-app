import { useState, useEffect } from 'react';
import { Activity, Clock, FileSpreadsheet, Sparkles } from 'lucide-react';
import type { SubtitleItem } from '../types';

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

  // Timer effect while listening
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
    const validTokens = curr.tokens.filter((t) => t.type !== 'punctuation');
    return acc + validTokens.length;
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

  return (
    <div className="cream-card p-5 flex flex-col gap-3">
      <div className="pb-2 border-b border-[#E8E2D8] flex items-center justify-between">
        <h3 className="text-xs font-bold text-[#1E293B] flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-indigo-600" />
          セッション統計
        </h3>
        <span className="text-[11px] text-[#64748B]">リアルタイム集計</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Speed */}
        <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E8E2D8]">
          <span className="text-[10px] font-semibold text-[#64748B] block">発話速度</span>
          <div className="text-base font-bold text-[#1E293B] mt-0.5">
            {calculateWPM()} <span className="text-[10px] font-normal text-[#94A3B8]">WPM</span>
          </div>
        </div>

        {/* Duration */}
        <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E8E2D8]">
          <span className="text-[10px] font-semibold text-[#64748B] flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> 認識時間
          </span>
          <div className="text-base font-bold text-[#1E293B] mt-0.5">
            {formatDuration(duration)}
          </div>
        </div>

        {/* Word count */}
        <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E8E2D8]">
          <span className="text-[10px] font-semibold text-[#64748B] flex items-center gap-1">
            <FileSpreadsheet className="w-2.5 h-2.5" /> 認識文字数
          </span>
          <div className="text-base font-bold text-[#1E293B] mt-0.5">
            {totalWords}
          </div>
        </div>

        {/* Highlights match count */}
        <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-200">
          <span className="text-[10px] font-semibold text-indigo-900 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-indigo-600" /> 強調検出数
          </span>
          <div className="text-base font-bold text-indigo-700 mt-0.5">
            {highlightCount}
          </div>
        </div>
      </div>
    </div>
  );
}
