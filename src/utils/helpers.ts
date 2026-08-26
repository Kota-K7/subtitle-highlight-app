export interface HighlightWord {
  word: string;
  color: 'amber' | 'emerald' | 'rose' | 'indigo';
  notes?: string;
  category?: string;
  createdAt: number;
}

export interface SubtitleToken {
  text: string;
  isHighlighted: boolean;
  highlightColor?: 'amber' | 'emerald' | 'rose' | 'indigo';
  type: 'en' | 'zh' | 'punctuation';
}

export interface SubtitleItem {
  id: string;
  text: string;
  timestamp: number; // Start timestamp
  duration?: number; // In ms
  tokens: SubtitleToken[];
}

/**
 * Helper to escape regex special characters
 */
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Tokenizes a sentence (English/Chinese) and identifies user-registered highlight words.
 * Non-highlighted parts are split into standard English words or Chinese characters.
 */
export function tokenizeBilingualText(
  text: string,
  highlightWords: HighlightWord[]
): SubtitleToken[] {
  if (!text.trim()) return [];

  // Sort highlight words by length descending to match longer phrases first
  const sortedHighlights = [...highlightWords].sort((a, b) => b.word.length - a.word.length);

  if (sortedHighlights.length === 0) {
    return splitBasicTokens(text);
  }

  // Build regex pattern matching any of the highlight words
  const pattern = sortedHighlights.map((hw) => escapeRegExp(hw.word)).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');

  const parts = text.split(regex);
  const tokens: SubtitleToken[] = [];

  parts.forEach((part) => {
    if (!part) return;

    // Check if this part matches a highlight word
    const matchedHighlight = sortedHighlights.find(
      (hw) => hw.word.toLowerCase() === part.toLowerCase()
    );

    if (matchedHighlight) {
      tokens.push({
        text: part,
        isHighlighted: true,
        highlightColor: matchedHighlight.color,
        type: isChineseText(part) ? 'zh' : 'en',
      });
    } else {
      // Basic tokenization for remaining part
      tokens.push(...splitBasicTokens(part));
    }
  });

  return tokens;
}

/**
 * Splits text into basic English words, Chinese characters, or punctuation
 */
function splitBasicTokens(text: string): SubtitleToken[] {
  const tokens: SubtitleToken[] = [];
  
  // Match English words, CJK characters (Chinese/Japanese), or spaces/punctuation
  const regex = /([a-zA-Z0-9'-]+|[\u3040-\u30ff\u4e00-\u9faf]|\s+|[^\w\s\u3040-\u30ff\u4e00-\u9faf]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const term = match[0];
    if (!term) continue;

    if (/\s+/.test(term)) {
      // Spaces can be tokenized as punctuation/separators
      tokens.push({ text: term, isHighlighted: false, type: 'punctuation' });
    } else if (/[a-zA-Z0-9'-]+/.test(term)) {
      tokens.push({ text: term, isHighlighted: false, type: 'en' });
    } else if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(term)) {
      tokens.push({ text: term, isHighlighted: false, type: 'zh' });
    } else {
      tokens.push({ text: term, isHighlighted: false, type: 'punctuation' });
    }
  }

  return tokens;
}

/**
 * Simple checker if a string contains Chinese/Japanese characters
 */
export function isChineseText(text: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(text);
}

/**
 * Format timestamp (ms) to SRT format time string (HH:MM:SS,mmm)
 */
export function formatSRTTime(ms: number): string {
  const date = new Date(ms);
  const hours = Math.floor(ms / 3600000).toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds},${milliseconds}`;
}

/**
 * Exports subtitle items as standard SRT format string
 */
export function exportToSRT(items: SubtitleItem[]): string {
  return items
    .map((item, index) => {
      const startTime = item.timestamp;
      const duration = item.duration || 3000; // fallback duration of 3s
      
      // We map the absolute timestamp relative to the first subtitle's timestamp
      const relativeStart = index === 0 ? 0 : startTime - items[0].timestamp;
      const relativeEnd = relativeStart + duration;

      return `${index + 1}\n${formatSRTTime(relativeStart)} --> ${formatSRTTime(relativeEnd)}\n${item.text}\n\n`;
    })
    .join('');
}

/**
 * Exports subtitle items as a plain text log
 */
export function exportToTXT(items: SubtitleItem[]): string {
  return items
    .map((item) => {
      const time = new Date(item.timestamp).toLocaleTimeString();
      return `[${time}] ${item.text}`;
    })
    .join('\n');
}
