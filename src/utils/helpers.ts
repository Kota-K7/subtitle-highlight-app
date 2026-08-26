import * as OpenCC from 'opencc-js';
import type { DictionaryWord, SubtitleItem, SubtitleToken, ScriptMode, WordImportError, WordImportSummary } from '../types';

// OpenCC Converters (Cached)
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' });
const t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });

/**
 * Convert text to Simplified or Traditional Chinese
 */
export function convertChineseScript(text: string, mode: ScriptMode): string {
  if (!text) return '';
  if (mode === 'simplified') {
    return t2sConverter(text);
  }
  if (mode === 'traditional') {
    return s2tConverter(text);
  }
  return text;
}

/**
 * Automatically get Traditional version of a Chinese string
 */
export function toTraditional(text: string): string {
  if (!text) return '';
  try {
    return s2tConverter(text);
  } catch {
    return text;
  }
}

/**
 * Automatically get Simplified version of a Chinese string
 */
export function toSimplified(text: string): string {
  if (!text) return '';
  try {
    return t2sConverter(text);
  } catch {
    return text;
  }
}

/**
 * Check if a character or text has Chinese characters
 */
export function isChinese(text: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);
}

/**
 * Escape regex special characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Segment text into natural words using native Intl.Segmenter
 */
function segmentTextIntoWords(text: string): string[] {
  if (!text) return [];

  // Check if Intl.Segmenter is supported
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    try {
      const segmenter = new Intl.Segmenter(['zh-CN', 'zh-TW', 'en'], {
        granularity: 'word',
      });
      const segments = Array.from(segmenter.segment(text));
      return segments.map((s) => s.segment);
    } catch {
      // fallback if constructor failed
    }
  }

  // Fallback tokenizer regex
  const tokens: string[] = [];
  const regex = /([a-zA-Z0-9'-]+|[\u4e00-\u9fa5]+|\s+|[^\w\s\u4e00-\u9fa5]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[0]) tokens.push(match[0]);
  }
  return tokens;
}

/**
 * Tokenize speech text into subtitle tokens with dictionary highlighting.
 * Handles both Simplified and Traditional Chinese and English terms gracefully.
 * Default output is Traditional Chinese (繁體中文).
 */
export function tokenizeBilingualText(
  text: string,
  dictionaryWords: DictionaryWord[],
  scriptMode: ScriptMode = 'traditional'
): SubtitleToken[] {
  if (!text.trim()) return [];

  // Apply script transformation (Default: Traditional)
  const displaySentence = convertChineseScript(text, scriptMode);

  if (dictionaryWords.length === 0) {
    return splitBasicWords(displaySentence);
  }

  // Collect all forms to match (simplified, traditional, english, etc.)
  interface MatchTarget {
    patternStr: string;
    word: DictionaryWord;
  }

  const matchTargets: MatchTarget[] = [];
  dictionaryWords.forEach((dw) => {
    if (dw.simplified) matchTargets.push({ patternStr: dw.simplified, word: dw });
    if (dw.traditional && dw.traditional !== dw.simplified) {
      matchTargets.push({ patternStr: dw.traditional, word: dw });
    }
    if (dw.english) matchTargets.push({ patternStr: dw.english, word: dw });
  });

  // Sort by length descending to match longest phrases first
  matchTargets.sort((a, b) => b.patternStr.length - a.patternStr.length);

  // Deduplicate patterns
  const uniquePatterns: string[] = [];
  const patternMap = new Map<string, DictionaryWord>();

  matchTargets.forEach((item) => {
    const key = item.patternStr.trim();
    if (key && !patternMap.has(key.toLowerCase())) {
      uniquePatterns.push(key);
      patternMap.set(key.toLowerCase(), item.word);
    }
  });

  if (uniquePatterns.length === 0) {
    return splitBasicWords(displaySentence);
  }

  // Build regex matching any dictionary patterns
  const regexPattern = uniquePatterns.map((p) => escapeRegExp(p)).join('|');
  const regex = new RegExp(`(${regexPattern})`, 'gi');

  const parts = displaySentence.split(regex);
  const result: SubtitleToken[] = [];

  parts.forEach((part) => {
    if (!part) return;

    const matchedWord = patternMap.get(part.toLowerCase());

    if (matchedWord) {
      result.push({
        text: part,
        isHighlighted: true,
        matchedWord,
        type: isChinese(part) ? 'zh' : 'en',
      });
    } else {
      // Split non-highlighted part with Intl.Segmenter into clean words
      result.push(...splitBasicWords(part));
    }
  });

  return result;
}

/**
 * Split text using Intl.Segmenter and mark types
 */
function splitBasicWords(text: string): SubtitleToken[] {
  const words = segmentTextIntoWords(text);
  const tokens: SubtitleToken[] = [];

  words.forEach((w) => {
    if (!w) return;

    if (/^\s+$/.test(w)) {
      tokens.push({ text: w, isHighlighted: false, type: 'punctuation' });
    } else if (/^[\p{P}\p{S}]+$/u.test(w)) {
      tokens.push({ text: w, isHighlighted: false, type: 'punctuation' });
    } else if (/[a-zA-Z0-9'-]+/.test(w)) {
      tokens.push({ text: w, isHighlighted: false, type: 'en' });
    } else if (/[\u4e00-\u9fa5]/.test(w)) {
      tokens.push({ text: w, isHighlighted: false, type: 'zh' });
    } else {
      tokens.push({ text: w, isHighlighted: false, type: 'punctuation' });
    }
  });

  return tokens;
}

/**
 * Copy text to clipboard safely
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    }
  } catch (err) {
    console.error('Failed to copy: ', err);
    return false;
  }
}

/**
 * Export subtitles as plain text
 */
export function exportToTXT(items: SubtitleItem[], scriptMode: ScriptMode = 'traditional'): string {
  return items
    .map((item, idx) => {
      const time = new Date(item.timestamp).toLocaleTimeString();
      const text = convertChineseScript(item.rawText, scriptMode);
      return `[${time}] #${idx + 1}  ${text}`;
    })
    .join('\n\n');
}

/**
 * Download string content as a file
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Single word template sample for developer/user reference
 */
export const SAMPLE_WORD_JSON_TEMPLATE = `[
  {
    "traditional": "二二八事件",
    "simplified": "二二八事件",
    "pinyin": "èr èr bā shì jiàn",
    "english": "February 28 Incident",
    "japanese": "2・28事件（台湾現代史の重大な転換点）",
    "category": "台中現代史",
    "notes": "1947年台湾で発生した民衆蜂起と国民政府による鎮圧事件"
  },
  {
    "traditional": "九二共識",
    "simplified": "九二共识",
    "pinyin": "jiǔ èr gòng shí",
    "english": "1992 Consensus",
    "japanese": "九二共識（1992年合意）",
    "category": "兩岸關係・臺灣政治",
    "notes": "両岸関係における基本的政治合意の枠組み"
  },
  {
    "traditional": "臥薪嚐膽",
    "simplified": "卧薪尝胆",
    "pinyin": "wò xīn cháng dǎn",
    "english": "endure hardship to achieve a long-term goal",
    "japanese": "臥薪嘗胆（将来の成功のために苦難に耐え忍ぶこと）",
    "category": "成語・典故",
    "notes": "越王勾践と呉王夫差の故事に基づく四字熟語"
  }
]`;

export const SAMPLE_CODE_TEMPLATE = `// src/utils/helpers.ts の DEFAULT_DICTIONARY に追加する場合の形式:
{
  id: 'custom-${Date.now()}',
  traditional: '美麗島事件',
  simplified: '美丽岛事件',
  pinyin: 'měi lì dǎo shì jiàn',
  english: 'Formosa Magazine Incident (1979)',
  japanese: '美麗島事件（台湾民主化運動の画期）',
  category: '台中現代史',
  notes: '1979年高雄市で発生した党外民主化運動の弾圧事件',
  createdAt: Date.now(),
},`;

/**
 * Initial curated vocabulary dataset for Taiwan/China history, cross-strait politics, military, and idioms
 */
export const DEFAULT_DICTIONARY: DictionaryWord[] = [
  // 1. 台中現代史
  {
    id: 'tw-hist-1',
    traditional: '二二八事件',
    simplified: '二二八事件',
    pinyin: 'èr èr bā shì jiàn',
    english: 'February 28 Incident (1947)',
    japanese: '2・28事件',
    category: '台中現代史',
    notes: '1947年台湾で発生した民衆蜂起とそれに続く国民政府による武力弾圧事件',
    createdAt: Date.now() - 300000,
  },
  {
    id: 'tw-hist-2',
    traditional: '戒嚴令',
    simplified: '戒严令',
    pinyin: 'jiè yán lìng',
    english: 'Martial Law',
    japanese: '戒厳令',
    category: '台中現代史',
    notes: '1949年から1987年まで台湾で38年間続いた長期戒厳体制',
    createdAt: Date.now() - 290000,
  },
  {
    id: 'tw-hist-3',
    traditional: '美麗島事件',
    simplified: '美丽岛事件',
    pinyin: 'měi lì dǎo shì jiàn',
    english: 'Formosa Magazine Incident (1979)',
    japanese: '美麗島事件',
    category: '台中現代史',
    notes: '1979年に高雄で起きた台湾民主化運動（党外運動）の転換点となった事件',
    createdAt: Date.now() - 280000,
  },
  {
    id: 'tw-hist-4',
    traditional: '動員戡亂',
    simplified: '动员戡乱',
    pinyin: 'dòng yuán kān luàn',
    english: 'Mobilization for Suppression of Communist Rebellion',
    japanese: '動員戡乱（戡乱時期）',
    category: '台中現代史',
    notes: '冷戦期の中華民国において敷かれた国家非常事態体制',
    createdAt: Date.now() - 270000,
  },
  {
    id: 'tw-hist-5',
    traditional: '白色恐怖',
    simplified: '白色恐怖',
    pinyin: 'bái sè kǒng bù',
    english: 'White Terror',
    japanese: '白色テロ',
    category: '台中現代史',
    notes: '戒厳令下の台湾において政治的反体制派や知識人が弾圧された時代',
    createdAt: Date.now() - 260000,
  },

  // 2. 兩岸關係・臺灣政治
  {
    id: 'tw-pol-1',
    traditional: '九二共識',
    simplified: '九二共识',
    pinyin: 'jiǔ èr gòng shí',
    english: '1992 Consensus',
    japanese: '九二共識（1992年合意）',
    category: '兩岸關係・臺灣政治',
    notes: '1992年の香港会談における両岸関係の政治的合意',
    createdAt: Date.now() - 250000,
  },
  {
    id: 'tw-pol-2',
    traditional: '海峽兩岸',
    simplified: '海峡两岸',
    pinyin: 'hǎi xiá liǎng àn',
    english: 'Cross-Strait (Taiwan & Mainland)',
    japanese: '海峡両岸・中台',
    category: '兩岸關係・臺灣政治',
    notes: '台湾海峡を挟んだ台湾と中国本土の総称',
    createdAt: Date.now() - 240000,
  },
  {
    id: 'tw-pol-3',
    traditional: '陸委會',
    simplified: '陆委会',
    pinyin: 'lù wěi huì',
    english: 'Mainland Affairs Council (MAC)',
    japanese: '大陸委員会',
    category: '兩岸關係・臺灣政治',
    notes: '台湾行政院における対中国大陸政策の企画・推進官庁',
    createdAt: Date.now() - 230000,
  },
  {
    id: 'tw-pol-4',
    traditional: '一國兩制',
    simplified: '一国两制',
    pinyin: 'yì guó liǎng zhì',
    english: 'One Country, Two Systems',
    japanese: '一国二制度',
    category: '兩岸關係・臺灣政治',
    notes: '中国が提唱する香港・マカオおよび台湾統一の統治方針',
    createdAt: Date.now() - 220000,
  },
  {
    id: 'tw-pol-5',
    traditional: '兩岸關係',
    simplified: '两岸关系',
    pinyin: 'liǎng àn guān xì',
    english: 'Cross-Strait Relations',
    japanese: '中台関係・両岸関係',
    category: '兩岸關係・臺灣政治',
    notes: '台湾と中国大陸の政治・外交・経済・安全保障上の関係',
    createdAt: Date.now() - 210000,
  },
  {
    id: 'tw-pol-6',
    traditional: '國安法',
    simplified: '国安法',
    pinyin: 'guó ān fǎ',
    english: 'National Security Law',
    japanese: '国家安全法',
    category: '兩岸關係・臺灣政治',
    notes: '国家の主権と安全を保障するための法制度',
    createdAt: Date.now() - 200000,
  },

  // 3. 中國近現代史
  {
    id: 'cn-hist-1',
    traditional: '辛亥革命',
    simplified: '辛亥革命',
    pinyin: 'xīn hài gé mìng',
    english: '1911 Revolution (Xinhai Revolution)',
    japanese: '辛亥革命',
    category: '中國近現代史',
    notes: '清朝を倒し中華民国を樹立した1911年の民主革命',
    createdAt: Date.now() - 190000,
  },
  {
    id: 'cn-hist-2',
    traditional: '五四運動',
    simplified: '五四运动',
    pinyin: 'wǔ sì yùn dòng',
    english: 'May Fourth Movement (1919)',
    japanese: '五四運動',
    category: '中國近現代史',
    notes: '1919年に北京で始まった反帝国主義・新文化運動',
    createdAt: Date.now() - 180000,
  },
  {
    id: 'cn-hist-3',
    traditional: '改革開放',
    simplified: '改革开放',
    pinyin: 'gǎi gé kāi fàng',
    english: 'Reform and Opening-up',
    japanese: '改革開放',
    category: '中國近現代史',
    notes: '1978年より鄧小平の指導下で開始された市場経済導入と対外開放政策',
    createdAt: Date.now() - 170000,
  },
  {
    id: 'cn-hist-4',
    traditional: '文化大革命',
    simplified: '文化大革命',
    pinyin: 'wén huà dà gé mìng',
    english: 'Cultural Revolution (1966-1976)',
    japanese: '文化大革命',
    category: '中國近現代史',
    notes: '毛沢東主導による10年間に及んだ政治的・社会的動乱',
    createdAt: Date.now() - 160000,
  },
  {
    id: 'cn-hist-5',
    traditional: '北伐',
    simplified: '北伐',
    pinyin: 'běi fá',
    english: 'Northern Expedition (1926-1928)',
    japanese: '北伐',
    category: '中國近現代史',
    notes: '国民革命軍が北方軍閥を討伐し中国再統一を図った軍事行動',
    createdAt: Date.now() - 150000,
  },

  // 4. 古代史
  {
    id: 'anc-1',
    traditional: '春秋戰國',
    simplified: '春秋战国',
    pinyin: 'chūn qiū zhàn guó',
    english: 'Spring and Autumn and Warring States Periods',
    japanese: '春秋戦国時代',
    category: '古代史',
    notes: '諸侯が争い思想と文化が大きく発展した先秦時代',
    createdAt: Date.now() - 140000,
  },
  {
    id: 'anc-2',
    traditional: '百家爭鳴',
    simplified: '百家争鸣',
    pinyin: 'bǎi jiā zhēng míng',
    english: 'Contention of a Hundred Schools of Thought',
    japanese: '百家争鳴',
    category: '古代史',
    notes: '儒家、道家、墨家、法家など多様な思想が栄えた時代',
    createdAt: Date.now() - 130000,
  },
  {
    id: 'anc-3',
    traditional: '貞觀之治',
    simplified: '贞观之治',
    pinyin: 'zhēn guān zhī zhì',
    english: 'Reign of Zhenguan (Tang Dynasty)',
    japanese: '貞観の治',
    category: '古代史',
    notes: '唐の太宗・李世民による善政と繁栄の時代',
    createdAt: Date.now() - 120000,
  },
  {
    id: 'anc-4',
    traditional: '絲綢之路',
    simplified: '丝绸之路',
    pinyin: 'sī chóu zhī lù',
    english: 'Silk Road',
    japanese: 'シルクロード（絹の道）',
    category: '古代史',
    notes: 'ユーラシア大陸を横断し東西交易と文化交流を支えた古道',
    createdAt: Date.now() - 110000,
  },
  {
    id: 'anc-5',
    traditional: '大一統',
    simplified: '大一统',
    pinyin: 'dà yī tǒng',
    english: 'Grand Unification',
    japanese: '大一統（天下統一）',
    category: '古代史',
    notes: '天下を一つに統一し中央集権秩序を重んじる政治思想',
    createdAt: Date.now() - 100000,
  },

  // 5. 人物
  {
    id: 'fig-1',
    traditional: '孫中山',
    simplified: '孙中山',
    pinyin: 'sūn zhōng shān',
    english: 'Sun Yat-sen',
    japanese: '孫文（孫中山）',
    category: '人物',
    notes: '辛亥革命の指導者・中華民国の臨時大総統・国父',
    createdAt: Date.now() - 90000,
  },
  {
    id: 'fig-2',
    traditional: '蔣中正',
    simplified: '蒋中正',
    pinyin: 'jiǎng zhōng zhèng',
    english: 'Chiang Kai-shek',
    japanese: '蒋介石（蒋中正）',
    category: '人物',
    notes: '国民政府軍事委員会委員長・中華民国総統',
    createdAt: Date.now() - 80000,
  },
  {
    id: 'fig-3',
    traditional: '毛澤東',
    simplified: '毛泽东',
    pinyin: 'máo zé dōng',
    english: 'Mao Zedong',
    japanese: '毛沢東',
    category: '人物',
    notes: '中国共産党初代中央委員会主席・中華人民共和国建国指導者',
    createdAt: Date.now() - 70000,
  },
  {
    id: 'fig-4',
    traditional: '鄧小平',
    simplified: '邓小平',
    pinyin: 'dèng xiǎo píng',
    english: 'Deng Xiaoping',
    japanese: '鄧小平',
    category: '人物',
    notes: '改革開放政策を主導した中国第二世代最高指導者',
    createdAt: Date.now() - 60000,
  },
  {
    id: 'fig-5',
    traditional: '李登輝',
    simplified: '李登辉',
    pinyin: 'lǐ dēng huī',
    english: 'Lee Teng-hui',
    japanese: '李登輝',
    category: '人物',
    notes: '台湾初の直接選挙総統・台湾民主化の立役者',
    createdAt: Date.now() - 50000,
  },
  {
    id: 'fig-6',
    traditional: '蔣經國',
    simplified: '蒋经国',
    pinyin: 'jiǎng jīng guó',
    english: 'Chiang Ching-kuo',
    japanese: '蒋経国',
    category: '人物',
    notes: '十大建設による経済発展と戒厳令解除を断行した台湾総統',
    createdAt: Date.now() - 40000,
  },

  // 6. 軍事・戰爭
  {
    id: 'mil-1',
    traditional: '八二三砲戰',
    simplified: '八二三炮战',
    pinyin: 'bā èr sān pào zhàn',
    english: '823 Artillery Bombardment (1958)',
    japanese: '金門砲戦（823砲戦）',
    category: '軍事・戰爭',
    notes: '1958年金門島をめぐり国共両軍の間で繰り広げられた激しい砲撃戦',
    createdAt: Date.now() - 35000,
  },
  {
    id: 'mil-2',
    traditional: '國共內戰',
    simplified: '国共内战',
    pinyin: 'guó gòng nèi zhàn',
    english: 'Chinese Civil War',
    japanese: '国共内戦',
    category: '軍事・戰爭',
    notes: '中国国民党と中国共産党の間で戦われた内戦',
    createdAt: Date.now() - 30000,
  },
  {
    id: 'mil-3',
    traditional: '抗日戰爭',
    simplified: '抗日战争',
    pinyin: 'kàng rì zhàn zhēng',
    english: 'Second Sino-Japanese War (1937-1945)',
    japanese: '日中戦争・抗日戦争',
    category: '軍事・戰爭',
    notes: '1937年から1945年にかけて行われた全面対日戦争',
    createdAt: Date.now() - 25000,
  },
  {
    id: 'mil-4',
    traditional: '甲午戰爭',
    simplified: '甲午战争',
    pinyin: 'jiǎ wǔ zhàn zhēng',
    english: 'First Sino-Japanese War (1894-1895)',
    japanese: '日清戦争（甲午戦争）',
    category: '軍事・戰爭',
    notes: '1894年勃発、下関条約により台湾が日本に割譲された戦争',
    createdAt: Date.now() - 20000,
  },
  {
    id: 'mil-5',
    traditional: '古寧頭戰役',
    simplified: '古宁头战役',
    pinyin: 'gǔ níng tóu zhàn yì',
    english: 'Battle of Guningtou (1949)',
    japanese: '古寧頭の戦い',
    category: '軍事・戰爭',
    notes: '1949年金門島に上陸した共産党軍を国民党軍が撃退した戦い',
    createdAt: Date.now() - 15000,
  },

  // 7. 成語・典故
  {
    id: 'idiom-1',
    traditional: '臥薪嚐膽',
    simplified: '卧薪尝胆',
    pinyin: 'wò xīn cháng dǎn',
    english: 'endure hardships and bide one\'s time for vengeance',
    japanese: '臥薪嘗胆',
    category: '成語・典故',
    notes: '越王勾践と呉王夫差の故事。目的を遂げるため苦難に耐えること',
    createdAt: Date.now() - 12000,
  },
  {
    id: 'idiom-2',
    traditional: '破釜沉舟',
    simplified: '破釜沉舟',
    pinyin: 'pò fǔ chén zhōu',
    english: 'burn one\'s bridges / point of no return',
    japanese: '破釜沈舟（背水の陣・決死の覚悟）',
    category: '成語・典故',
    notes: '項羽が巨鹿の戦いで船を沈め鍋を壊して必死の覚悟を示した故事',
    createdAt: Date.now() - 9000,
  },
  {
    id: 'idiom-3',
    traditional: '四面楚歌',
    simplified: '四面楚歌',
    pinyin: 'sì miàn chǔ gē',
    english: 'isolated and besieged by enemies on all sides',
    japanese: '四面楚歌',
    category: '成語・典故',
    notes: '項羽が垓下の戦いで敵に包囲され楚の歌を聴いた故事。孤立無援',
    createdAt: Date.now() - 6000,
  },
  {
    id: 'idiom-4',
    traditional: '朝秦暮楚',
    simplified: '朝秦暮楚',
    pinyin: 'zhāo qín mù chǔ',
    english: 'fickle / shifting allegiance constantly',
    japanese: '朝秦暮楚（節操のない変節）',
    category: '成語・典故',
    notes: '戦国時代の小国が朝は秦、夕は楚に従った故事',
    createdAt: Date.now() - 3000,
  },
  {
    id: 'idiom-5',
    traditional: '風雲變色',
    simplified: '风云变色',
    pinyin: 'fēng yún biàn sè',
    english: 'sudden dramatic turn of events',
    japanese: '風雲急を告げる・情勢の激変',
    category: '成語・典故',
    notes: '政治情勢や局面が急激に変化すること',
    createdAt: Date.now(),
  },
];

/**
 * Validates, normalizes and filters a batch of words to be added to the dictionary.
 * Duplicates and defective entries are skipped and recorded with detailed error reasons,
 * while all valid entries are prepared for addition.
 */
export function validateAndFilterWordBatch(
  rawItems: unknown[],
  existingDictionary: DictionaryWord[],
  options?: { defaultCategory?: string }
): WordImportSummary {
  const errors: WordImportError[] = [];
  const addedWords: DictionaryWord[] = [];
  const defaultCategory = options?.defaultCategory || 'インポート';

  // Helper set to track duplicates within the current batch
  const batchKeys = new Set<string>();

  rawItems.forEach((raw, index) => {
    const itemNum = index + 1;
    let previewStr: string;
    try {
      const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
      previewStr = s.length > 60 ? s.slice(0, 57) + '...' : s;
    } catch {
      previewStr = `項目 #${itemNum}`;
    }

    // 1. Format check: Must be an object
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      errors.push({
        index,
        itemPreview: previewStr,
        wordName: typeof raw === 'string' ? raw : `項目 #${itemNum}`,
        reasonType: 'invalid_format',
        reasonMessage: 'オブジェクト形式（{...}）ではない不正なデータ形式です。',
        rawItem: raw,
      });
      return;
    }

    const obj = raw as Record<string, unknown>;

    // Extract text fields
    const rawTrad = String(obj.traditional || '').trim();
    const rawSimp = String(obj.simplified || '').trim();
    const rawWord = String(obj.word || '').trim();
    const rawEng = String(obj.english || '').trim();
    const rawPinyin = String(obj.pinyin || '').trim();
    const rawJap = String(obj.japanese || '').trim();
    const rawCat = String(obj.category || '').trim();
    const rawNotes = String(obj.notes || '').trim();

    // 2. Missing required check: Must have at least one valid word representation
    if (!rawTrad && !rawSimp && !rawWord && !rawEng) {
      errors.push({
        index,
        itemPreview: previewStr,
        wordName: `項目 #${itemNum}`,
        reasonType: 'missing_required',
        reasonMessage: '繁体字、簡体字、英単語のいずれも入力されていないため除外されました。',
        rawItem: raw,
      });
      return;
    }

    // Resolve traditional and simplified scripts
    let trad = rawTrad;
    let simp = rawSimp;

    if (!trad && rawWord) trad = toTraditional(rawWord);
    if (!simp && rawWord) simp = toSimplified(rawWord);

    if (!trad && simp) trad = toTraditional(simp);
    if (!simp && trad) simp = toSimplified(trad);

    const displayName = trad || simp || rawEng;

    // 3. Duplicate check with existing dictionary
    const existingMatch = existingDictionary.find((existing) => {
      const matchTrad = trad && existing.traditional && existing.traditional.toLowerCase() === trad.toLowerCase();
      const matchSimp = simp && existing.simplified && existing.simplified.toLowerCase() === simp.toLowerCase();
      const matchEng = rawEng && existing.english && existing.english.toLowerCase() === rawEng.toLowerCase();
      return matchTrad || matchSimp || matchEng;
    });

    if (existingMatch) {
      const matchedWith = existingMatch.traditional || existingMatch.simplified || existingMatch.english;
      errors.push({
        index,
        itemPreview: previewStr,
        wordName: displayName,
        reasonType: 'duplicate_existing',
        reasonMessage: `既存の辞書単語「${matchedWith}」と重複しているためスキップされました。`,
        rawItem: raw,
      });
      return;
    }

    // 4. Duplicate check within the current batch
    const batchKeyTrad = trad ? `trad:${trad.toLowerCase()}` : '';
    const batchKeySimp = simp ? `simp:${simp.toLowerCase()}` : '';
    const batchKeyEng = rawEng ? `eng:${rawEng.toLowerCase()}` : '';

    const isBatchDuplicate =
      (batchKeyTrad && batchKeys.has(batchKeyTrad)) ||
      (batchKeySimp && batchKeys.has(batchKeySimp)) ||
      (batchKeyEng && batchKeys.has(batchKeyEng));

    if (isBatchDuplicate) {
      errors.push({
        index,
        itemPreview: previewStr,
        wordName: displayName,
        reasonType: 'duplicate_batch',
        reasonMessage: `追加リスト内で同一単語が重複しています（最初の1件のみ登録）。`,
        rawItem: raw,
      });
      return;
    }

    // Add keys to batch set
    if (batchKeyTrad) batchKeys.add(batchKeyTrad);
    if (batchKeySimp) batchKeys.add(batchKeySimp);
    if (batchKeyEng) batchKeys.add(batchKeyEng);

    // 5. Valid item creation
    const newWord: DictionaryWord = {
      id: String(obj.id || `word-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`),
      traditional: trad,
      simplified: simp,
      pinyin: rawPinyin,
      english: rawEng,
      japanese: rawJap || undefined,
      category: rawCat || defaultCategory,
      notes: rawNotes || undefined,
      createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
    };

    addedWords.push(newWord);
  });

  return {
    totalSubmitted: rawItems.length,
    addedCount: addedWords.length,
    skippedCount: errors.length,
    addedWords,
    errors,
  };
}

