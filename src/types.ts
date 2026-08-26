export interface DictionaryWord {
  id: string;
  traditional: string; // 繁体字 (例: 人工智能 / 機器學習)
  simplified: string;  // 簡体字 (例: 人工智能 / 机器学习)
  pinyin: string;      // ピンイン (例: rén gōng zhì néng)
  english: string;     // 英語 (例: Artificial Intelligence)
  japanese?: string;   // 日本語 (任意)
  category: string;    // カテゴリ (例: 台中現代史, 兩岸關係・臺灣政治, etc.)
  notes?: string;      // 補足メモ・用例
  createdAt: number;
}

export interface WordImportError {
  index: number;
  itemPreview: string;
  wordName?: string;
  reasonType: 'duplicate_existing' | 'duplicate_batch' | 'missing_required' | 'invalid_format';
  reasonMessage: string;
  rawItem?: unknown;
}

export interface WordImportSummary {
  totalSubmitted: number;
  addedCount: number;
  skippedCount: number;
  addedWords: DictionaryWord[];
  errors: WordImportError[];
}

export interface SubtitleToken {
  text: string;
  isHighlighted: boolean;
  matchedWord?: DictionaryWord;
  type: 'zh' | 'en' | 'punctuation';
}

export interface SubtitleItem {
  id: string;
  rawText: string;
  timestamp: number;
  tokens: SubtitleToken[];
  duration?: number;
}

export type ScriptMode = 'original' | 'simplified' | 'traditional';

