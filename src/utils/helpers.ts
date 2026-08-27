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
    "id": "tw-hist-1",
    "traditional": "二二八事件",
    "simplified": "二二八事件",
    "pinyin": "èr èr bā shì jiàn",
    "english": "February 28 Incident (1947)",
    "japanese": "2・28事件",
    "category": "台中現代史",
    "notes": "1947年台湾で発生した民衆蜂起とそれに続く国民政府による武力弾圧事件",
    "createdAt": 1787748253520
  },
  {
    "id": "tw-hist-2",
    "traditional": "戒嚴令",
    "simplified": "戒严令",
    "pinyin": "jiè yán lìng",
    "english": "Martial Law",
    "japanese": "戒厳令",
    "category": "台中現代史",
    "notes": "1949年から1987年まで台湾で38年間続いた長期戒厳体制",
    "createdAt": 1787748263520
  },
  {
    "id": "tw-hist-3",
    "traditional": "美麗島事件",
    "simplified": "美丽岛事件",
    "pinyin": "měi lì dǎo shì jiàn",
    "english": "Formosa Magazine Incident (1979)",
    "japanese": "美麗島事件",
    "category": "台中現代史",
    "notes": "1979年に高雄で起きた台湾民主化運動（党外運動）の転換点となった事件",
    "createdAt": 1787748273520
  },
  {
    "id": "tw-hist-4",
    "traditional": "動員戡亂",
    "simplified": "动员戡乱",
    "pinyin": "dòng yuán kān luàn",
    "english": "Mobilization for Suppression of Communist Rebellion",
    "japanese": "動員戡乱（戡乱時期）",
    "category": "台中現代史",
    "notes": "冷戦期の中華民国において敷かれた国家非常事態体制",
    "createdAt": 1787748283520
  },
  {
    "id": "tw-hist-5",
    "traditional": "白色恐怖",
    "simplified": "白色恐怖",
    "pinyin": "bái sè kǒng bù",
    "english": "White Terror",
    "japanese": "白色テロ",
    "category": "台中現代史",
    "notes": "戒厳令下の台湾において政治的反体制派や知識人が弾圧された時代",
    "createdAt": 1787748293520
  },
  {
    "id": "tw-pol-1",
    "traditional": "九二共識",
    "simplified": "九二共识",
    "pinyin": "jiǔ èr gòng shí",
    "english": "1992 Consensus",
    "japanese": "九二共識（1992年合意）",
    "category": "兩岸關係・臺灣政治",
    "notes": "1992年の香港会談における両岸関係の政治的合意",
    "createdAt": 1787748303520
  },
  {
    "id": "tw-pol-2",
    "traditional": "海峽兩岸",
    "simplified": "海峡两岸",
    "pinyin": "hǎi xiá liǎng àn",
    "english": "Cross-Strait (Taiwan & Mainland)",
    "japanese": "海峡両岸・中台",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾海峡を挟んだ台湾と中国本土の総称",
    "createdAt": 1787748313520
  },
  {
    "id": "tw-pol-3",
    "traditional": "陸委會",
    "simplified": "陆委会",
    "pinyin": "lù wěi huì",
    "english": "Mainland Affairs Council (MAC)",
    "japanese": "大陸委員会",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾行政院における対中国大陸政策の企画・推進官庁",
    "createdAt": 1787748323520
  },
  {
    "id": "tw-pol-4",
    "traditional": "一國兩制",
    "simplified": "一国两制",
    "pinyin": "yì guó liǎng zhì",
    "english": "One Country, Two Systems",
    "japanese": "一国二制度",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国が提唱する香港・マカオおよび台湾統一の統治方針",
    "createdAt": 1787748333520
  },
  {
    "id": "tw-pol-5",
    "traditional": "兩岸關係",
    "simplified": "两岸关系",
    "pinyin": "liǎng àn guān xì",
    "english": "Cross-Strait Relations",
    "japanese": "中台関係・両岸関係",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾と中国大陸の政治・外交・経済・安全保障上の関係",
    "createdAt": 1787748343520
  },
  {
    "id": "tw-pol-6",
    "traditional": "國安法",
    "simplified": "国安法",
    "pinyin": "guó ān fǎ",
    "english": "National Security Law",
    "japanese": "国家安全法",
    "category": "兩岸關係・臺灣政治",
    "notes": "国家の主権と安全を保障するための法制度",
    "createdAt": 1787748353520
  },
  {
    "id": "cn-hist-1",
    "traditional": "辛亥革命",
    "simplified": "辛亥革命",
    "pinyin": "xīn hài gé mìng",
    "english": "1911 Revolution (Xinhai Revolution)",
    "japanese": "辛亥革命",
    "category": "中國近現代史",
    "notes": "清朝を倒し中華民国を樹立した1911年の民主革命",
    "createdAt": 1787748363520
  },
  {
    "id": "cn-hist-2",
    "traditional": "五四運動",
    "simplified": "五四运动",
    "pinyin": "wǔ sì yùn dòng",
    "english": "May Fourth Movement (1919)",
    "japanese": "五四運動",
    "category": "中國近現代史",
    "notes": "1919年に北京で始まった反帝国主義・新文化運動",
    "createdAt": 1787748373520
  },
  {
    "id": "cn-hist-3",
    "traditional": "改革開放",
    "simplified": "改革开放",
    "pinyin": "gǎi gé kāi fàng",
    "english": "Reform and Opening-up",
    "japanese": "改革開放",
    "category": "中國近現代史",
    "notes": "1978年より鄧小平の指導下で開始された市場経済導入と対外開放政策",
    "createdAt": 1787748383520
  },
  {
    "id": "cn-hist-4",
    "traditional": "文化大革命",
    "simplified": "文化大革命",
    "pinyin": "wén huà dà gé mìng",
    "english": "Cultural Revolution (1966-1976)",
    "japanese": "文化大革命",
    "category": "中國近現代史",
    "notes": "毛沢東主導による10年間に及んだ政治的・社会的動乱",
    "createdAt": 1787748393520
  },
  {
    "id": "cn-hist-5",
    "traditional": "北伐",
    "simplified": "北伐",
    "pinyin": "běi fá",
    "english": "Northern Expedition (1926-1928)",
    "japanese": "北伐",
    "category": "中國近現代史",
    "notes": "国民革命軍が北方軍閥を討伐し中国再統一を図った軍事行動",
    "createdAt": 1787748403520
  },
  {
    "id": "anc-1",
    "traditional": "春秋戰國",
    "simplified": "春秋战国",
    "pinyin": "chūn qiū zhàn guó",
    "english": "Spring and Autumn and Warring States Periods",
    "japanese": "春秋戦国時代",
    "category": "古代史",
    "notes": "諸侯が争い思想と文化が大きく発展した先秦時代",
    "createdAt": 1787748413520
  },
  {
    "id": "anc-2",
    "traditional": "百家爭鳴",
    "simplified": "百家争鸣",
    "pinyin": "bǎi jiā zhēng míng",
    "english": "Contention of a Hundred Schools of Thought",
    "japanese": "百家争鳴",
    "category": "古代史",
    "notes": "儒家、道家、墨家、法家など多様な思想が栄えた時代",
    "createdAt": 1787748423520
  },
  {
    "id": "anc-3",
    "traditional": "貞觀之治",
    "simplified": "贞观之治",
    "pinyin": "zhēn guān zhī zhì",
    "english": "Reign of Zhenguan (Tang Dynasty)",
    "japanese": "貞観の治",
    "category": "古代史",
    "notes": "唐の太宗・李世民による善政と繁栄の時代",
    "createdAt": 1787748433520
  },
  {
    "id": "anc-4",
    "traditional": "絲綢之路",
    "simplified": "丝绸之路",
    "pinyin": "sī chóu zhī lù",
    "english": "Silk Road",
    "japanese": "シルクロード（絹の道）",
    "category": "古代史",
    "notes": "ユーラシア大陸を横断し東西交易と文化交流を支えた古道",
    "createdAt": 1787748443520
  },
  {
    "id": "anc-5",
    "traditional": "大一統",
    "simplified": "大一统",
    "pinyin": "dà yī tǒng",
    "english": "Grand Unification",
    "japanese": "大一統（天下統一）",
    "category": "古代史",
    "notes": "天下を一つに統一し中央集権秩序を重んじる政治思想",
    "createdAt": 1787748453520
  },
  {
    "id": "fig-1",
    "traditional": "孫中山",
    "simplified": "孙中山",
    "pinyin": "sūn zhōng shān",
    "english": "Sun Yat-sen",
    "japanese": "孫文（孫中山）",
    "category": "人物",
    "notes": "辛亥革命の指導者・中華民国の臨時大総統・国父",
    "createdAt": 1787748463520
  },
  {
    "id": "fig-2",
    "traditional": "蔣中正",
    "simplified": "蒋中正",
    "pinyin": "jiǎng zhōng zhèng",
    "english": "Chiang Kai-shek",
    "japanese": "蒋介石（蒋中正）",
    "category": "人物",
    "notes": "国民政府軍事委員会委員長・中華民国総統",
    "createdAt": 1787748473520
  },
  {
    "id": "fig-3",
    "traditional": "毛澤東",
    "simplified": "毛泽东",
    "pinyin": "máo zé dōng",
    "english": "Mao Zedong",
    "japanese": "毛沢東",
    "category": "人物",
    "notes": "中国共産党初代中央委員会主席・中華人民共和国建国指導者",
    "createdAt": 1787748483520
  },
  {
    "id": "fig-4",
    "traditional": "鄧小平",
    "simplified": "邓小平",
    "pinyin": "dèng xiǎo píng",
    "english": "Deng Xiaoping",
    "japanese": "鄧小平",
    "category": "人物",
    "notes": "改革開放政策を主導した中国第二世代最高指導者",
    "createdAt": 1787748493520
  },
  {
    "id": "fig-5",
    "traditional": "李登輝",
    "simplified": "李登辉",
    "pinyin": "lǐ dēng huī",
    "english": "Lee Teng-hui",
    "japanese": "李登輝",
    "category": "人物",
    "notes": "台湾初の直接選挙総統・台湾民主化の立役者",
    "createdAt": 1787748503520
  },
  {
    "id": "fig-6",
    "traditional": "蔣經國",
    "simplified": "蒋经国",
    "pinyin": "jiǎng jīng guó",
    "english": "Chiang Ching-kuo",
    "japanese": "蒋経国",
    "category": "人物",
    "notes": "十大建設による経済発展と戒厳令解除を断行した台湾総統",
    "createdAt": 1787748513520
  },
  {
    "id": "mil-1",
    "traditional": "八二三砲戰",
    "simplified": "八二三炮战",
    "pinyin": "bā èr sān pào zhàn",
    "english": "823 Artillery Bombardment (1958)",
    "japanese": "金門砲戦（823砲戦）",
    "category": "軍事・戰爭",
    "notes": "1958年金門島をめぐり国共両軍の間で繰り広げられた激しい砲撃戦",
    "createdAt": 1787748518520
  },
  {
    "id": "mil-2",
    "traditional": "國共內戰",
    "simplified": "国共内战",
    "pinyin": "guó gòng nèi zhàn",
    "english": "Chinese Civil War",
    "japanese": "国共内戦",
    "category": "軍事・戰爭",
    "notes": "中国国民党と中国共産党の間で戦われた内戦",
    "createdAt": 1787748523520
  },
  {
    "id": "mil-3",
    "traditional": "抗日戰爭",
    "simplified": "抗日战争",
    "pinyin": "kàng rì zhàn zhēng",
    "english": "Second Sino-Japanese War (1937-1945)",
    "japanese": "日中戦争・抗日戦争",
    "category": "軍事・戰爭",
    "notes": "1937年から1945年にかけて行われた全面対日戦争",
    "createdAt": 1787748528520
  },
  {
    "id": "mil-4",
    "traditional": "甲午戰爭",
    "simplified": "甲午战争",
    "pinyin": "jiǎ wǔ zhàn zhēng",
    "english": "First Sino-Japanese War (1894-1895)",
    "japanese": "日清戦争（甲午戦争）",
    "category": "軍事・戰爭",
    "notes": "1894年勃発、下関条約により台湾が日本に割譲された戦争",
    "createdAt": 1787748533520
  },
  {
    "id": "mil-5",
    "traditional": "古寧頭戰役",
    "simplified": "古宁头战役",
    "pinyin": "gǔ níng tóu zhàn yì",
    "english": "Battle of Guningtou (1949)",
    "japanese": "古寧頭の戦い",
    "category": "軍事・戰爭",
    "notes": "1949年金門島に上陸した共産党軍を国民党軍が撃退した戦い",
    "createdAt": 1787748538520
  },
  {
    "id": "idiom-1",
    "traditional": "臥薪嚐膽",
    "simplified": "卧薪尝胆",
    "pinyin": "wò xīn cháng dǎn",
    "english": "endure hardships and bide one's time for vengeance",
    "japanese": "臥薪嘗胆",
    "category": "成語・典故",
    "notes": "越王勾践と呉王夫差の故事。目的を遂げるため苦難に耐えること",
    "createdAt": 1787748541520
  },
  {
    "id": "idiom-2",
    "traditional": "破釜沉舟",
    "simplified": "破釜沉舟",
    "pinyin": "pò fǔ chén zhōu",
    "english": "burn one's bridges / point of no return",
    "japanese": "破釜沈舟（背水の陣・決死の覚悟）",
    "category": "成語・典故",
    "notes": "項羽が巨鹿の戦いで船を沈め鍋を壊して必死の覚悟を示した故事",
    "createdAt": 1787748544520
  },
  {
    "id": "idiom-3",
    "traditional": "四面楚歌",
    "simplified": "四面楚歌",
    "pinyin": "sì miàn chǔ gē",
    "english": "isolated and besieged by enemies on all sides",
    "japanese": "四面楚歌",
    "category": "成語・典故",
    "notes": "項羽が垓下の戦いで敵に包囲され楚の歌を聴いた故事。孤立無援",
    "createdAt": 1787748547520
  },
  {
    "id": "idiom-4",
    "traditional": "朝秦暮楚",
    "simplified": "朝秦暮楚",
    "pinyin": "zhāo qín mù chǔ",
    "english": "fickle / shifting allegiance constantly",
    "japanese": "朝秦暮楚（節操のない変節）",
    "category": "成語・典故",
    "notes": "戦国時代の小国が朝は秦、夕は楚に従った故事",
    "createdAt": 1787748550520
  },
  {
    "id": "idiom-5",
    "traditional": "風雲變色",
    "simplified": "风云变色",
    "pinyin": "fēng yún biàn sè",
    "english": "sudden dramatic turn of events",
    "japanese": "風雲急を告げる・情勢の激変",
    "category": "成語・典故",
    "notes": "政治情勢や局面が急激に変化すること",
    "createdAt": 1787748553520
  },
  {
    "id": "word-1787749424866-0-b36hq",
    "traditional": "撥亂反正",
    "simplified": "拨乱反正",
    "pinyin": "bō luàn fǎn zhèng",
    "english": "Bring order out of chaos",
    "japanese": "混乱を収め正常な状態に戻す",
    "category": "成語・典故",
    "notes": "政権交代時や、前政権の政策を正す際のスローガンとして政治において頻出する。",
    "createdAt": 1787749424866
  },
  {
    "id": "word-1787749424866-2-dch6u",
    "traditional": "兵家必爭",
    "simplified": "兵家必争",
    "pinyin": "bīng jiā bì zhēng",
    "english": "Strategically crucial (battleground)",
    "japanese": "戦略的要衝 / 激戦区",
    "category": "成語・典故",
    "notes": "「兵家必爭之地（激戦区）」として、選挙におけるスイング・ステートや激戦区（台中市や彰化県など）を指す際に多用される。",
    "createdAt": 1787749424866
  },
  {
    "id": "word-1787749424866-3-v0xs5",
    "traditional": "欲蓋彌彰",
    "simplified": "欲盖弥彰",
    "pinyin": "yù gài mí zhāng",
    "english": "To cover up only to make it worse",
    "japanese": "隠そうとしてかえって露見する",
    "category": "成語・典故",
    "notes": "政治家のスキャンダルや失言の隠蔽工作が発覚した際、野党やメディアが批判として用いる。",
    "createdAt": 1787749424866
  },
  {
    "id": "word-1787749424866-4-rh9oc",
    "traditional": "哀兵必勝",
    "simplified": "哀兵必胜",
    "pinyin": "āi bīng bì shèng",
    "english": "An oppressed army fighting out of righteous indignation is bound to win",
    "japanese": "悲憤を抱く軍隊は必ず勝つ",
    "category": "成語・典故",
    "notes": "選挙戦で不利な状況や同情票を集める戦略（悲情牌）を表現する際に用いられる。",
    "createdAt": 1787749424866
  },
  {
    "id": "word-1787749424866-5-h6ppv",
    "traditional": "眾望所歸",
    "simplified": "众望所归",
    "pinyin": "zhòng wàng suǒ guī",
    "english": "To enjoy popular confidence / Universally expected",
    "japanese": "人々の期待を集める",
    "category": "成語・典故",
    "notes": "有力な候補者が擁立されたり、当選を果たしたりした際の形容として頻繁に使われる。",
    "createdAt": 1787749424866
  },
  {
    "id": "word-1787749424866-6-86jfy",
    "traditional": "勢如破竹",
    "simplified": "势如破竹",
    "pinyin": "shì rú pò zhú",
    "english": "With irresistible force",
    "japanese": "破竹の勢い",
    "category": "成語・典故",
    "notes": "選挙戦での連勝や、支持率の急上昇など、勢いが止まらない状況を表す。",
    "createdAt": 1787749424866
  },
  {
    "id": "word-1787749424866-7-rzk47",
    "traditional": "長濱文化",
    "simplified": "长滨文化",
    "pinyin": "cháng bīn wén huà",
    "english": "Changbin Culture",
    "japanese": "長浜文化（チャンビン文化）",
    "category": "古代史",
    "notes": "台湾最古の旧石器時代文化。台東県の八仙洞遺跡が代表的。",
    "createdAt": 1787749424866
  },
  {
    "id": "word-1787749424867-8-m10ax",
    "traditional": "大坌坑文化",
    "simplified": "大坌坑文化",
    "pinyin": "dà bèn kēng wén huà",
    "english": "Dapenkeng Culture",
    "japanese": "大坌坑文化（ダーベンケン文化）",
    "category": "古代史",
    "notes": "台湾の新石器時代早期の文化。オーストロネシア語族の祖先と関連が深いとされる。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-9-w2h8b",
    "traditional": "卑南文化",
    "simplified": "卑南文化",
    "pinyin": "bēi nán wén huà",
    "english": "Peinan Culture",
    "japanese": "卑南文化（プユマ文化）",
    "category": "古代史",
    "notes": "台湾新石器時代後期の代表的文化。巨大な石柱や多数の石板棺が特徴。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-10-g6arl",
    "traditional": "十三行文化",
    "simplified": "十三行文化",
    "pinyin": "shí sān háng wén huà",
    "english": "Shihsanhang Culture",
    "japanese": "十三行文化",
    "category": "古代史",
    "notes": "台湾北部における鉄器時代の文化。製鉄技術と独自の土器を持つ。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-11-s25hx",
    "traditional": "大肚王國",
    "simplified": "大肚王国",
    "pinyin": "dà dù wáng guó",
    "english": "Kingdom of Middag",
    "japanese": "大肚王国",
    "category": "古代史",
    "notes": "17世紀以前から台湾中部に存在した、台湾原住民族パゼッヘ族などによる部族連盟・国家。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-12-6vlmi",
    "traditional": "三星堆遺址",
    "simplified": "三星堆遗址",
    "pinyin": "sān xīng duī yí zhǐ",
    "english": "Sanxingdui Ruins",
    "japanese": "三星堆遺跡",
    "category": "古代史",
    "notes": "中国四川省にある古代蜀の遺跡。独特の巨大青銅仮面で知られる。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-13-99ot2",
    "traditional": "兵馬俑",
    "simplified": "兵马俑",
    "pinyin": "bīng mǎ yǒng",
    "english": "Terracotta Army",
    "japanese": "兵馬俑",
    "category": "古代史",
    "notes": "中国・秦の始皇帝陵の周囲に埋葬された、等身大の兵士や馬の素焼きの像。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-15-3m6w1",
    "traditional": "蔡英文",
    "simplified": "蔡英文",
    "pinyin": "cài yīng wén",
    "english": "Tsai Ing-wen",
    "japanese": "蔡英文",
    "category": "人物",
    "notes": "中華民国第14・15代総統。台湾初の女性総統。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-16-chc3e",
    "traditional": "賴清德",
    "simplified": "赖清德",
    "pinyin": "lài qīng dé",
    "english": "Lai Ching-te / William Lai",
    "japanese": "頼清徳",
    "category": "人物",
    "notes": "中華民国第16代総統。医師出身であり、台南市長や行政院長を歴任。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-19-y2k3i",
    "traditional": "鄭成功",
    "simplified": "郑成功",
    "pinyin": "zhèng chéng gōng",
    "english": "Koxinga / Zheng Chenggong",
    "japanese": "鄭成功",
    "category": "人物",
    "notes": "明を復興するため清に抵抗し、台湾からオランダを駆逐して政権を樹立した軍人・政治家。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424867-21-jxaew",
    "traditional": "九合一選舉",
    "simplified": "九合一选举",
    "pinyin": "jiǔ hé yī xuǎn jǔ",
    "english": "Nine-in-One Local Elections",
    "japanese": "九統一地方選挙",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾で4年に一度行われる、直轄市長や県市長などを同時に選出する大規模な地方選挙。",
    "createdAt": 1787749424867
  },
  {
    "id": "word-1787749424868-22-owmja",
    "traditional": "藍綠對立",
    "simplified": "蓝绿对立",
    "pinyin": "lán lǜ duì lì",
    "english": "Blue-Green Divide",
    "japanese": "藍緑対立（国民党・民進党の対立）",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国国民党（泛藍）と民主進歩党（泛綠）の間の激しい政治的二極化。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-23-zmc39",
    "traditional": "維持現狀",
    "simplified": "维持现状",
    "pinyin": "wéi chí xiàn zhuàng",
    "english": "Status Quo",
    "japanese": "現状維持",
    "category": "兩岸關係・臺灣政治",
    "notes": "即時独立も即時統一もせず、現在の台湾海峡の平和と安定を保つという主流の世論・政策。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-24-0cpnt",
    "traditional": "轉型正義",
    "simplified": "转型正义",
    "pinyin": "zhuǎn xíng zhèng yì",
    "english": "Transitional Justice",
    "japanese": "移行期正義",
    "category": "兩岸關係・臺灣政治",
    "notes": "過去の権威主義体制下での人権侵害の真相究明、名誉回復、責任追及を行う政治プロセス。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-25-tu2dz",
    "traditional": "反滲透法",
    "simplified": "反渗透法",
    "pinyin": "fǎn shèn tòu fǎ",
    "english": "Anti-Infiltration Act",
    "japanese": "反浸透法",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国などの「境外敵対勢力」による台湾の選挙や民主的プロセスへの介入を防ぐための法律。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-27-1parr",
    "traditional": "海峽交流基金會",
    "simplified": "海峡交流基金会",
    "pinyin": "hǎi xiá jiāo liú jī jīn huì",
    "english": "Straits Exchange Foundation (SEF)",
    "japanese": "海峡交流基金会（海基会）",
    "category": "兩岸關係・臺灣政治",
    "notes": "略称は「海基會」。台湾側の中台交渉窓口となる半官半民の機関。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-28-8xhdk",
    "traditional": "國務院台灣事務辦公室",
    "simplified": "国务院台湾事务办公室",
    "pinyin": "guó wù yuàn tái wān shì wù bàn gōng shì",
    "english": "Taiwan Affairs Office (TAO)",
    "japanese": "国務院台湾事務弁公室（国台弁）",
    "category": "兩岸關係・臺灣政治",
    "notes": "略称は「國台辦」。中華人民共和国の国務院における台湾政策の管轄機関。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-29-vuc05",
    "traditional": "海峽兩岸關係協會",
    "simplified": "海峡两岸关系协会",
    "pinyin": "hǎi xiá liǎng àn guān xì xié huì",
    "english": "Association for Relations Across the Taiwan Straits (ARATS)",
    "japanese": "海峡両岸関係協会（海協会）",
    "category": "兩岸關係・臺灣政治",
    "notes": "略称は「海協會」。中国側の中台交渉窓口となる機関。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-30-d795h",
    "traditional": "太陽花學運",
    "simplified": "太阳花学运",
    "pinyin": "tài yáng huā xué yùn",
    "english": "Sunflower Student Movement",
    "japanese": "ひまわり学生運動",
    "category": "兩岸關係・臺灣政治",
    "notes": "2014年、両岸サービス貿易協定の強行採決に反対する学生らが立法院を占拠した運動。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-32-p84ot",
    "traditional": "總統直選",
    "simplified": "总统直选",
    "pinyin": "zǒng tǒng zhí xuǎn",
    "english": "Direct Presidential Election",
    "japanese": "総統直接選挙",
    "category": "兩岸關係・臺灣政治",
    "notes": "1996年に初めて実施された、国民の直接投票による総統選出制度。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-33-6d6br",
    "traditional": "公民投票法",
    "simplified": "公民投票法",
    "pinyin": "gōng mín tóu piào fǎ",
    "english": "Referendum Act",
    "japanese": "公民投票法（国民投票法）",
    "category": "兩岸關係・臺灣政治",
    "notes": "略称は「公投法」。直接民主制を実現するための法律で、敷居の高さが度々議論になる。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-34-ehdxo",
    "traditional": "不當黨產處理委員會",
    "simplified": "不当党产处理委员会",
    "pinyin": "bù dàng dǎng chǎn chǔ lǐ wěi yuán huì",
    "english": "Ill-gotten Party Assets Settlement Committee",
    "japanese": "不当党産処理委員会",
    "category": "兩岸關係・臺灣政治",
    "notes": "略称は「黨產會」。過去の政党（主に国民党）が不当に取得した資産の調査と返還を行う機関。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-35-4g2kx",
    "traditional": "凍省",
    "simplified": "冻省",
    "pinyin": "dòng shěng",
    "english": "Downsizing of the Provincial Government",
    "japanese": "凍省（台湾省の虚飾化）",
    "category": "兩岸關係・臺灣政治",
    "notes": "1997年の修憲により、中華民国「台湾省」の組織と機能を大幅に縮小した政治改革。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-36-nievi",
    "traditional": "兩國論",
    "simplified": "两国论",
    "pinyin": "liǎng guó lùn",
    "english": "Special State-to-State Relations",
    "japanese": "二国論（特殊な国と国との関係）",
    "category": "兩岸關係・臺灣政治",
    "notes": "1999年に李登輝総統が提起した、台湾と中国の関係を「特殊な国と国との関係」とする主張。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-37-atz2k",
    "traditional": "中華民國台灣",
    "simplified": "中华民国台湾",
    "pinyin": "zhōng huá mín guó tái wān",
    "english": "Republic of China (Taiwan)",
    "japanese": "中華民国台湾",
    "category": "兩岸關係・臺灣政治",
    "notes": "蔡英文政権以降に強調されるようになった、主権国家としての現状を総括する呼称。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-38-prypn",
    "traditional": "罷免案",
    "simplified": "罢免案",
    "pinyin": "bà miǎn àn",
    "english": "Recall Election",
    "japanese": "リコール（罷免）案",
    "category": "兩岸關係・臺灣政治",
    "notes": "有権者が署名を集め、選出された公職者を任期途中で解任するための投票。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-39-v66or",
    "traditional": "網軍",
    "simplified": "网军",
    "pinyin": "wǎng jūn",
    "english": "Cyber army / Internet trolls",
    "japanese": "ネットアーミー（網軍）",
    "category": "兩岸關係・臺灣政治",
    "notes": "政治的な目的でSNS等において世論操作や相手陣営の攻撃を行う組織的なネットユーザー群。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-40-3i6jt",
    "traditional": "認知作戰",
    "simplified": "认知作战",
    "pinyin": "rèn zhī zuò zhàn",
    "english": "Cognitive Warfare",
    "japanese": "認知戦",
    "category": "兩岸關係・臺灣政治",
    "notes": "フェイクニュースや情報操作を通じて、敵対国の世論や社会の信頼を破壊する戦術。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-41-6gphh",
    "traditional": "不分區立委",
    "simplified": "不分区立委",
    "pinyin": "bù fēn qū lì wěi",
    "english": "Legislator-at-large / Proportional Representation Legislator",
    "japanese": "比例代表立法委員",
    "category": "兩岸關係・臺灣政治",
    "notes": "政党票の得票率に応じて各政党に割り当てられる立法委員（国会議員）。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-42-rt4zp",
    "traditional": "黨外運動",
    "simplified": "党外运动",
    "pinyin": "dǎng wài yùn dòng",
    "english": "Tangwai Movement",
    "japanese": "党外運動",
    "category": "兩岸關係・臺灣政治",
    "notes": "戒厳令下の台湾において、国民党以外の無所属政治家（党外）による民主化要求運動。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-43-yx4am",
    "traditional": "解嚴",
    "simplified": "解严",
    "pinyin": "jiě yán",
    "english": "Lifting of Martial Law",
    "japanese": "戒厳令解除",
    "category": "兩岸關係・臺灣政治",
    "notes": "1987年に蔣経国によって宣告された、38年間に及ぶ台湾省戒厳令の解除。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424868-44-s00k4",
    "traditional": "新南向政策",
    "simplified": "新南向政策",
    "pinyin": "xīn nán xiàng zhèng cè",
    "english": "New Southbound Policy",
    "japanese": "新南向政策",
    "category": "兩岸關係・臺灣政治",
    "notes": "蔡英文政権が推進した、東南アジア、南アジア、オーストラレーシアとの関係強化政策。",
    "createdAt": 1787749424868
  },
  {
    "id": "word-1787749424869-47-13mtt",
    "traditional": "大躍進",
    "simplified": "大跃进",
    "pinyin": "dà yuè jìn",
    "english": "Great Leap Forward",
    "japanese": "大躍進政策",
    "category": "中國近現代史",
    "notes": "1958年から開始された急進的な経済成長政策だが、深刻な大飢饉を引き起こし失敗に終わった。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-49-yy9qo",
    "traditional": "天安門事件",
    "simplified": "天安门事件",
    "pinyin": "tiān ān mén shì jiàn",
    "english": "Tiananmen Square Protests",
    "japanese": "天安門事件（六四事件）",
    "category": "中國近現代史",
    "notes": "1989年6月4日、民主化を求める学生・市民を中国人民解放軍が武力鎮圧した事件。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-51-czflg",
    "traditional": "長征",
    "simplified": "长征",
    "pinyin": "cháng zhēng",
    "english": "The Long March",
    "japanese": "長征",
    "category": "中國近現代史",
    "notes": "1934年から1936年にかけ、中国工農紅軍（共産党軍）が国民党軍の包囲を突破して行った大移動。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-52-8zuyz",
    "traditional": "滿洲國",
    "simplified": "满洲国",
    "pinyin": "mǎn zhōu guó",
    "english": "Manchukuo",
    "japanese": "満州国",
    "category": "中國近現代史",
    "notes": "1932年から1945年まで、日本が中国東北部に建国した傀儡国家。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-53-vcb0l",
    "traditional": "洋務運動",
    "simplified": "洋务运动",
    "pinyin": "yáng wù yùn dòng",
    "english": "Self-Strengthening Movement",
    "japanese": "洋務運動",
    "category": "中國近現代史",
    "notes": "19世紀後半、清朝が西洋の近代兵器や技術を導入し「富国強兵」を目指した改革運動。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-54-eeatr",
    "traditional": "戊戌變法",
    "simplified": "戊戌变法",
    "pinyin": "wù xū biàn fǎ",
    "english": "Hundred Days' Reform",
    "japanese": "戊戌の変法（百日維新）",
    "category": "中國近現代史",
    "notes": "1898年、康有為らが光緒帝を擁して行った立憲君主制を目指す近代化改革。西太后の政変で挫折。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-55-wpieu",
    "traditional": "義和團運動",
    "simplified": "义和团运动",
    "pinyin": "yì hé tuán yùn dòng",
    "english": "Boxer Rebellion",
    "japanese": "義和団の乱",
    "category": "中國近現代史",
    "notes": "1900年、「扶清滅洋」を掲げた義和団による排外暴動と、それに対する8カ国連合軍の干渉。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-56-r3e02",
    "traditional": "人民公社",
    "simplified": "人民公社",
    "pinyin": "rén mín gōng shè",
    "english": "People's Commune",
    "japanese": "人民公社",
    "category": "中國近現代史",
    "notes": "大躍進期に設立された、農村における生産手段の公有化と生活の集団化を目的とした基礎組織。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-57-nvqnq",
    "traditional": "三反五反",
    "simplified": "三反五反",
    "pinyin": "sān fǎn wǔ fǎn",
    "english": "Three-anti and Five-anti Campaigns",
    "japanese": "三反五反運動",
    "category": "中國近現代史",
    "notes": "1951年から52年にかけて行われた、汚職・浪費・官僚主義への反対と資本家の不正摘発運動。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-58-it8qm",
    "traditional": "土地改革",
    "simplified": "土地改革",
    "pinyin": "tǔ dì gǎi gé",
    "english": "Land Reform",
    "japanese": "土地改革",
    "category": "中國近現代史",
    "notes": "建国初期の中国で行われた、地主の土地を没収し農民に分配した社会階層の再編運動。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-59-nwht3",
    "traditional": "中日戰爭",
    "simplified": "中日战争",
    "pinyin": "zhōng rì zhàn zhēng",
    "english": "Second Sino-Japanese War",
    "japanese": "日中戦争（八年抗戦）",
    "category": "中國近現代史",
    "notes": "1937年の盧溝橋事件から1945年の日本の敗戦まで続いた、中華民国と日本の全面戦争。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-60-klmd0",
    "traditional": "一帶一路",
    "simplified": "一带一路",
    "pinyin": "yī dài yī lù",
    "english": "Belt and Road Initiative (BRI)",
    "japanese": "一帯一路",
    "category": "中國近現代史",
    "notes": "2013年に習近平が提唱した、中国からユーラシア大陸を経由する広域経済圏構想。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-61-e1tqg",
    "traditional": "鎮壓反革命",
    "simplified": "镇压反革命",
    "pinyin": "zhèn yā fǎn gé mìng",
    "english": "Campaign to Suppress Counterrevolutionaries",
    "japanese": "鎮圧反革命運動（鎮反）",
    "category": "中國近現代史",
    "notes": "建国初期に国民党残党や旧勢力を徹底的に摘発・粛清した政治運動。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-62-3mhcl",
    "traditional": "百花齊放",
    "simplified": "百花齐放",
    "pinyin": "bǎi huā qí fàng",
    "english": "Hundred Flowers Campaign",
    "japanese": "百花斉放",
    "category": "中國近現代史",
    "notes": "1956年、共産党が知識人に自由な言論を奨励した運動。後に反右派闘争で弾圧される。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-63-0m5rh",
    "traditional": "破四舊",
    "simplified": "破四旧",
    "pinyin": "pò sì jiù",
    "english": "Destroy the Four Olds",
    "japanese": "四旧打破",
    "category": "中國近現代史",
    "notes": "文革期に紅衛兵が古い思想・文化・風俗・習慣を破壊したスローガン・行動。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-64-j9rup",
    "traditional": "社會主義市場經濟",
    "simplified": "社会主义市场经济",
    "pinyin": "shè huì zhǔ yì shì chǎng jīng jì",
    "english": "Socialist Market Economy",
    "japanese": "社会主義市場経済",
    "category": "中國近現代史",
    "notes": "1992年に中国共産党が公式に採用した、政治体制は共産党一党独裁を維持しつつ市場原理を導入する経済体制。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-65-0m54t",
    "traditional": "辜汪會談",
    "simplified": "辜汪会谈",
    "pinyin": "gū wāng huì tán",
    "english": "Koo-Wang Talks",
    "japanese": "辜汪会談",
    "category": "台中現代史",
    "notes": "1993年、台湾の海基会（辜振甫）と中国の海協会（汪道涵）による初の中台トップ会談。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-66-iby40",
    "traditional": "聯合國第2758號決議",
    "simplified": "联合国第2758号决议",
    "pinyin": "lián hé guó dì èr qī wǔ bā hào jué yì",
    "english": "UN General Assembly Resolution 2758",
    "japanese": "国連総会第2758号決議",
    "category": "台中現代史",
    "notes": "1971年、中華人民共和国を中国の唯一の合法代表とし、中華民国（蔣介石の代表）を国連から追放した決議。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-67-5qfqv",
    "traditional": "第三次台海危機",
    "simplified": "第三次台海危机",
    "pinyin": "dì sān cì tái hǎi wēi jī",
    "english": "Third Taiwan Strait Crisis",
    "japanese": "第三次台湾海峡危機",
    "category": "台中現代史",
    "notes": "1995〜96年、台湾初の総統直接選挙を牽制するため中国がミサイル演習を行い、米空母が展開した危機。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-68-caev2",
    "traditional": "千島湖事件",
    "simplified": "千岛湖事件",
    "pinyin": "qiān dǎo hú shì jiàn",
    "english": "Qiandao Lake Incident",
    "japanese": "千島湖事件",
    "category": "台中現代史",
    "notes": "1994年に中国浙江省で台湾人観光客24名が強盗殺害された事件。台湾人の中国への不信感を決定づけた。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-69-baaid",
    "traditional": "兩岸三通",
    "simplified": "两岸三通",
    "pinyin": "liǎng àn sān tōng",
    "english": "Three Links",
    "japanese": "三通（直接の通郵・通商・通航）",
    "category": "台中現代史",
    "notes": "2008年の馬英九政権下で完全に実現された、中台間の直接的な郵便、商業、航空・海運の往来。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-70-ur8fi",
    "traditional": "小三通",
    "simplified": "小三通",
    "pinyin": "xiǎo sān tōng",
    "english": "Mini Three Links",
    "japanese": "小三通",
    "category": "台中現代史",
    "notes": "2001年に先行して開始された、台湾の金門・馬祖と中国の福建省との局地的な三通。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-71-x8li5",
    "traditional": "海峽兩岸經濟合作架構協議",
    "simplified": "海峡两岸经济合作架构协议",
    "pinyin": "hǎi xiá liǎng àn jīng jì hé zuò jià gòu xié yì",
    "english": "Cross-Strait Economic Cooperation Framework Agreement (ECFA)",
    "japanese": "両岸経済協力枠組協議（ECFA）",
    "category": "台中現代史",
    "notes": "2010年に中台間で調印された、関税引き下げなどを盛り込んだ包括的経済協力協定。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-72-pirxn",
    "traditional": "戒急用忍",
    "simplified": "戒急用忍",
    "pinyin": "jiè jí yòng rěn",
    "english": "No Haste, Be Patient (Policy)",
    "japanese": "戒急用忍（対中投資抑制政策）",
    "category": "台中現代史",
    "notes": "李登輝政権時代（1996年）に打ち出された、過度な対中投資依存を警戒・制限する政策。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-73-22fqc",
    "traditional": "積極管理有效開放",
    "simplified": "积极管理有效开放",
    "pinyin": "jī jí guǎn lǐ yǒu xiào kāi fàng",
    "english": "Active Management, Effective Opening",
    "japanese": "積極管理、有効開放",
    "category": "台中現代史",
    "notes": "陳水扁政権期（2006年）における、対中経済政策のスローガン。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-74-9h11r",
    "traditional": "探親專案",
    "simplified": "探亲专案",
    "pinyin": "tàn qīn zhuān àn",
    "english": "Family Visitation Policy",
    "japanese": "大陸帰郷訪問解禁（探親）",
    "category": "台中現代史",
    "notes": "1987年に蔣経国が中国大陸出身の老兵らによる故郷訪問を解禁した措置。両岸交流の幕開け。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-75-nnb9z",
    "traditional": "台商",
    "simplified": "台商",
    "pinyin": "tái shāng",
    "english": "Taiwanese Businessmen (in China)",
    "japanese": "台商（中国大陸に進出する台湾企業・実業家）",
    "category": "台中現代史",
    "notes": "中国の経済成長を支え、同時に両岸の経済的依存関係を深める重要なアクター。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424869-76-qm2tu",
    "traditional": "陸資",
    "simplified": "陆资",
    "pinyin": "lù zī",
    "english": "Chinese Capital",
    "japanese": "陸資（中国資本）",
    "category": "台中現代史",
    "notes": "台湾への中国系資本の投資。安全保障上の懸念から厳格な審査が行われている。",
    "createdAt": 1787749424869
  },
  {
    "id": "word-1787749424870-77-2qsj1",
    "traditional": "自由行",
    "simplified": "自由行",
    "pinyin": "zì yóu xíng",
    "english": "Independent Travel (FIT)",
    "japanese": "個人旅行（自由行）",
    "category": "台中現代史",
    "notes": "2011年に解禁された中国人観光客の台湾個人旅行。両岸関係の悪化により2019年に中国側が停止。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-78-a74jt",
    "traditional": "兩岸服貿爭議",
    "simplified": "两岸服贸争议",
    "pinyin": "liǎng àn fú mào zhēng yì",
    "english": "CSSTA Controversy",
    "japanese": "両岸サービス貿易協定論争",
    "category": "台中現代史",
    "notes": "中国とのサービス業市場開放協定に対する台湾社会の反発。太陽花学運の直接的な原因となった。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-79-fyd2a",
    "traditional": "國共論壇",
    "simplified": "国共论坛",
    "pinyin": "guó gòng lùn tán",
    "english": "KMT-CCP Forum",
    "japanese": "国共フォーラム（両岸経済貿易文化フォーラム）",
    "category": "台中現代史",
    "notes": "中国国民党と中国共産党の間で定期的に行われていた、経済や文化に関する政党間交流。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-80-jw02u",
    "traditional": "港澳條例",
    "simplified": "港澳条例",
    "pinyin": "gǎng ào tiáo lì",
    "english": "Laws and Regulations Regarding Hong Kong & Macao Affairs",
    "japanese": "香港マカオ関係条例",
    "category": "台中現代史",
    "notes": "台湾が香港とマカオを中国大陸本体とは異なる特別な地域として扱い、交流を規定する法律。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-81-l973n",
    "traditional": "中美共同防禦條約",
    "simplified": "中美共同防御条约",
    "pinyin": "zhōng měi gòng tóng fáng yù tiáo yuē",
    "english": "Sino-American Mutual Defense Treaty",
    "japanese": "米華相互防衛条約",
    "category": "台中現代史",
    "notes": "1954年にアメリカと中華民国の間で結ばれた軍事同盟。1979年の米中国交正常化により失効。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-82-slstq",
    "traditional": "台灣關係法",
    "simplified": "台湾关系法",
    "pinyin": "tái wān guān xì fǎ",
    "english": "Taiwan Relations Act (TRA)",
    "japanese": "台湾関係法",
    "category": "台中現代史",
    "notes": "1979年の台湾断交後、アメリカが台湾への武器供与などの非公式関係を維持するために制定した国内法。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-83-xtccm",
    "traditional": "金門協議",
    "simplified": "金门协议",
    "pinyin": "jīn mén xié yì",
    "english": "Kinmen Agreement",
    "japanese": "金門協議",
    "category": "台中現代史",
    "notes": "1990年に中台の赤十字社が金門島で署名した、不法入国者などの送還に関する実務協定。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-84-x9cnv",
    "traditional": "海峽論壇",
    "simplified": "海峡论坛",
    "pinyin": "hǎi xiá lùn tán",
    "english": "Straits Forum",
    "japanese": "海峡フォーラム",
    "category": "台中現代史",
    "notes": "中国の福建省で毎年開催される、草の根の民間交流を掲げた大規模な対台湾統一工作行事。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-85-x2l7s",
    "traditional": "漢光演習",
    "simplified": "汉光演习",
    "pinyin": "hàn guāng yǎn xí",
    "english": "Han Kuang Exercise",
    "japanese": "漢光演習",
    "category": "軍事・戰爭",
    "notes": "台湾軍が毎年実施する、中国人民解放軍の侵攻を想定した最大規模の軍事演習。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-86-kqeh5",
    "traditional": "萬安演習",
    "simplified": "万安演习",
    "pinyin": "wàn ān yǎn xí",
    "english": "Wan An Exercise",
    "japanese": "万安演習（防空演習）",
    "category": "軍事・戰爭",
    "notes": "台湾全土で毎年行われる民間防空演習。実施中は人や車両の移動が厳しく制限される。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-87-uwome",
    "traditional": "國艦國造",
    "simplified": "国舰国造",
    "pinyin": "guó jiàn guó zào",
    "english": "Indigenous Defense Submarine / Domestic Shipbuilding",
    "japanese": "国艦国造（潜水艦・艦艇の自主建造）",
    "category": "軍事・戰爭",
    "notes": "台湾が自国防衛のために潜水艦や水上艦艇を海外に頼らず自主開発・建造する政策。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-88-d5w4t",
    "traditional": "不對稱作戰",
    "simplified": "不对称作战",
    "pinyin": "bù duì chēng zuò zhàn",
    "english": "Asymmetric Warfare",
    "japanese": "非対称戦",
    "category": "軍事・戰爭",
    "notes": "台湾が強大な中国軍に対抗するため、機動的で安価な兵器（ミサイル、無人機等）を活用する軍事ドクトリン。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-89-fjru3",
    "traditional": "第一島鏈",
    "simplified": "第一岛链",
    "pinyin": "dì yī dǎo liàn",
    "english": "First Island Chain",
    "japanese": "第一列島線",
    "category": "軍事・戰爭",
    "notes": "日本から台湾、フィリピンに至る島々の連なり。中国の海洋進出を防ぐ地政学的な防衛ライン。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-90-7vdd8",
    "traditional": "防空識別區",
    "simplified": "防空识别区",
    "pinyin": "fáng kōng shí bié qū",
    "english": "Air Defense Identification Zone (ADIZ)",
    "japanese": "防空識別圏",
    "category": "軍事・戰爭",
    "notes": "領空の外側に設定される空域。中国軍機による台湾のADIZ（特に南西部）への進入が常態化している。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-91-4092k",
    "traditional": "海峽中線",
    "simplified": "海峡中线",
    "pinyin": "hǎi xiá zhōng xiàn",
    "english": "Median Line of the Taiwan Strait",
    "japanese": "台湾海峡の中間線",
    "category": "軍事・戰爭",
    "notes": "台湾と中国大陸の間に引かれた暗黙の軍事境界線。近年、中国軍による越境が頻発している。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-92-0ujpu",
    "traditional": "航空母艦",
    "simplified": "航空母舰",
    "pinyin": "háng kōng mǔ jiàn",
    "english": "Aircraft Carrier",
    "japanese": "航空母艦（空母）",
    "category": "軍事・戰爭",
    "notes": "中国軍は「遼寧」「山東」などを台湾周辺へ展開させ、軍事的圧力を高めている。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-93-i7n7i",
    "traditional": "義務役",
    "simplified": "义务役",
    "pinyin": "yì wù yì",
    "english": "Mandatory Conscription / Compulsory Military Service",
    "japanese": "義務役（徴兵制）",
    "category": "軍事・戰爭",
    "notes": "台湾の成人男子に課される兵役。中国の脅威増大に伴い、2024年から期間が4ヶ月から1年に延長された。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-94-idu0n",
    "traditional": "無人機",
    "simplified": "无人机",
    "pinyin": "wú rén jī",
    "english": "Unmanned Aerial Vehicle (UAV) / Drone",
    "japanese": "無人機（ドローン）",
    "category": "軍事・戰爭",
    "notes": "偵察や攻撃用途で現代戦の要。中国製ドローンの台湾外島（金門など）への飛来が問題視されている。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-95-ebox5",
    "traditional": "兩棲登陸",
    "simplified": "两栖登陆",
    "pinyin": "liǎng qī dēng lù",
    "english": "Amphibious Landing",
    "japanese": "水陸両用上陸戦",
    "category": "軍事・戰爭",
    "notes": "中国人民解放軍が台湾本島へ武力侵攻する際に想定される、海と空からの上陸作戦。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-96-pee80",
    "traditional": "兵棋推演",
    "simplified": "兵棋推演",
    "pinyin": "bīng qí tuī yǎn",
    "english": "Wargaming / Tabletop Exercise",
    "japanese": "図上演習（兵棋演習）",
    "category": "軍事・戰爭",
    "notes": "台湾有事などを想定し、米台の軍事機関やシンクタンクが行うシミュレーション演習。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-97-zq9vk",
    "traditional": "灰色地帶衝突",
    "simplified": "灰色地带冲突",
    "pinyin": "huī sè dì dài chōng tū",
    "english": "Grey-zone Conflict",
    "japanese": "グレーゾーン事態",
    "category": "軍事・戰爭",
    "notes": "武力攻撃には至らないが、軍用機進入やサイバー攻撃、偽情報などで日常的に圧力をかける戦術。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-98-7dgvy",
    "traditional": "潛艦",
    "simplified": "潜舰",
    "pinyin": "qián jiàn",
    "english": "Submarine",
    "japanese": "潜水艦",
    "category": "軍事・戰爭",
    "notes": "台湾の非対称戦力の中核。中国海軍の封鎖を突破・阻止するための重要な兵器。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749424870-99-vbu91",
    "traditional": "彈道飛彈",
    "simplified": "弹道飞弹",
    "pinyin": "dàn dào fēi dàn",
    "english": "Ballistic Missile",
    "japanese": "弾道ミサイル",
    "category": "軍事・戰爭",
    "notes": "中国が台湾対岸に多数配備し、演習時には台湾周辺海域へ発射して威嚇を行う主要兵器。",
    "createdAt": 1787749424870
  },
  {
    "id": "word-1787749450145-0-9q706",
    "traditional": "指鹿為馬",
    "simplified": "指鹿为马",
    "pinyin": "zhǐ lù wéi mǎ",
    "english": "Calling a deer a horse / Deliberate misrepresentation",
    "japanese": "鹿を指して馬と為す",
    "category": "成語・典故",
    "notes": "事実を歪曲して嘘を押し通すこと。フェイクニュースや政治的な情報操作を批判する際に多用される。",
    "createdAt": 1787749450145
  },
  {
    "id": "word-1787749450145-1-gi14w",
    "traditional": "朝令夕改",
    "simplified": "朝令夕改",
    "pinyin": "zhāo lìng xì gǎi",
    "english": "Issue an order in the morning and rescind it in the evening",
    "japanese": "朝令暮改",
    "category": "成語・典故",
    "notes": "政策や決定が一貫せず、すぐに変わってしまう状況を野党が与党を批判する際のスローガン。",
    "createdAt": 1787749450145
  },
  {
    "id": "word-1787749450146-2-qlu80",
    "traditional": "黨同伐異",
    "simplified": "党同伐异",
    "pinyin": "dǎng tóng fá yì",
    "english": "Defend those who belong to one's own faction and attack those who don't",
    "japanese": "党同伐異（味方をかばい敵を攻撃する）",
    "category": "成語・典故",
    "notes": "藍緑（国民党と民進党）の激しい党派対立や、イデオロギーに基づく政治的攻撃を指す。",
    "createdAt": 1787749450146
  },
  {
    "id": "word-1787749450146-3-ahqhr",
    "traditional": "畫餅充飢",
    "simplified": "画饼充饥",
    "pinyin": "huà bǐng chōng jī",
    "english": "Draw a cake to satisfy hunger / Empty promises",
    "japanese": "絵に描いた餅",
    "category": "成語・典故",
    "notes": "選挙時の実現不可能な公約（空頭支票）や、実質的な効果のない政策を揶揄する表現。",
    "createdAt": 1787749450146
  },
  {
    "id": "word-1787749450146-4-0v8zb",
    "traditional": "欲加之罪",
    "simplified": "欲加之罪",
    "pinyin": "yù jiā zhī zuì",
    "english": "Trumped-up charge",
    "japanese": "言いがかり（罪を着せようとするなら口実はどうにでもなる）",
    "category": "成語・典故",
    "notes": "「欲加之罪，何患無辭」の略。政治的迫害や、対立陣営からの不当な告発に対する反論として使われる。",
    "createdAt": 1787749450146
  },
  {
    "id": "word-1787749450146-5-rolmi",
    "traditional": "臨陣磨槍",
    "simplified": "临阵磨枪",
    "pinyin": "lín zhèn mó qiāng",
    "english": "Sharpen one's spear only before going into battle",
    "japanese": "泥縄（事が起こってから慌てて準備する）",
    "category": "成語・典故",
    "notes": "選挙戦終盤の土壇場の対策や、危機発生時の政府の場当たり的な対応を批判する際に使われる。",
    "createdAt": 1787749450146
  },
  {
    "id": "word-1787749450146-6-yvvkm",
    "traditional": "卸磨殺驢",
    "simplified": "卸磨杀驴",
    "pinyin": "xiè mó shā lǘ",
    "english": "Kill the donkey when the grinding is done",
    "japanese": "用済みになれば切り捨てる（狡兎死して走狗烹らる）",
    "category": "成語・典故",
    "notes": "選挙で貢献した人物を当選後に冷遇したり、政治的な使い捨てを表現する際に用いられる。",
    "createdAt": 1787749450146
  },
  {
    "id": "word-1787749450146-7-evczg",
    "traditional": "牛罵頭文化",
    "simplified": "牛骂头文化",
    "pinyin": "niú mà tóu wén huà",
    "english": "Niumatou Culture",
    "japanese": "牛罵頭文化（ニウマートウ文化）",
    "category": "古代史",
    "notes": "台湾中部の新石器時代中期の文化。台中市の清水区（旧称：牛罵頭）に遺跡がある。",
    "createdAt": 1787749450146
  },
  {
    "id": "word-1787749450147-8-43jov",
    "traditional": "圓山文化",
    "simplified": "圆山文化",
    "pinyin": "yuán shān wén huà",
    "english": "Yuanshan Culture",
    "japanese": "円山文化",
    "category": "古代史",
    "notes": "台湾北部の新石器時代後期の代表的文化。台北盆地を中心に貝塚などの遺跡が残る。",
    "createdAt": 1787749450147
  },
  {
    "id": "word-1787749450147-9-45w5t",
    "traditional": "蔦松文化",
    "simplified": "茑松文化",
    "pinyin": "niǎo sōng wén huà",
    "english": "Niaosong Culture",
    "japanese": "蔦松文化（ニアオソン文化）",
    "category": "古代史",
    "notes": "台湾南部の鉄器時代の文化。シラヤ族など平埔族の祖先に関連するとされる。",
    "createdAt": 1787749450147
  },
  {
    "id": "word-1787749450147-10-x0pmf",
    "traditional": "良渚文化",
    "simplified": "良渚文化",
    "pinyin": "liáng zhǔ wén huà",
    "english": "Liangzhu Culture",
    "japanese": "良渚文化",
    "category": "古代史",
    "notes": "中国長江下流域の新石器時代後期の文化。精巧な玉器と大規模な水利システムで知られる。",
    "createdAt": 1787749450147
  },
  {
    "id": "word-1787749450147-11-7mdnh",
    "traditional": "仰韶文化",
    "simplified": "仰韶文化",
    "pinyin": "yǎng sháo wén huà",
    "english": "Yangshao Culture",
    "japanese": "仰韶文化",
    "category": "古代史",
    "notes": "中国黄河中流域の新石器時代文化。鮮やかな彩文土器（彩陶）が特徴。",
    "createdAt": 1787749450147
  },
  {
    "id": "word-1787749450147-12-b9dpl",
    "traditional": "盤庚遷殷",
    "simplified": "盘庚迁殷",
    "pinyin": "pán gēng qiān yīn",
    "english": "Pan Geng moving the capital to Yin",
    "japanese": "盤庚の殷遷都",
    "category": "古代史",
    "notes": "商（殷）の第19代王・盤庚が度重なる水害や内乱を避けるため、都を殷（現在の安陽）に遷した歴史的事件。",
    "createdAt": 1787749450147
  },
  {
    "id": "word-1787749450147-13-8bo2n",
    "traditional": "斯卡羅酋邦",
    "simplified": "斯卡罗酋邦",
    "pinyin": "sī kǎ luó qiú bāng",
    "english": "Seqalu Chiefdom",
    "japanese": "斯卡羅（スカル）酋邦",
    "category": "古代史",
    "notes": "19世紀以前から台湾南部（恒春半島）に存在した、パイワン族などによる部族連盟社会。",
    "createdAt": 1787749450147
  },
  {
    "id": "word-1787749450148-16-qdohl",
    "traditional": "周恩來",
    "simplified": "周恩来",
    "pinyin": "zhōu ēn lái",
    "english": "Zhou Enlai",
    "japanese": "周恩来",
    "category": "人物",
    "notes": "中華人民共和国の初代総理（首相）。外交と内政の実務を取り仕切り、米中関係正常化に尽力。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-17-fkajy",
    "traditional": "袁世凱",
    "simplified": "袁世凯",
    "pinyin": "yuán shì kǎi",
    "english": "Yuan Shikai",
    "japanese": "袁世凱",
    "category": "人物",
    "notes": "清末民初の軍人・政治家。中華民国初代大総統となるが、後に皇帝を自称し失脚した。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-18-o3a3m",
    "traditional": "陳水扁",
    "simplified": "陈水扁",
    "pinyin": "chén shuǐ biǎn",
    "english": "Chen Shui-bian",
    "japanese": "陳水扁",
    "category": "人物",
    "notes": "中華民国第10・11代総統。2000年に初の政権交代（民進党）を果たしたが、退任後に汚職事件で服役。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-19-e2ena",
    "traditional": "馬英九",
    "simplified": "马英九",
    "pinyin": "mǎ yīng jiǔ",
    "english": "Ma Ying-jeou",
    "japanese": "馬英九",
    "category": "人物",
    "notes": "中華民国第12・13代総統（国民党）。中台関係の劇的な改善を図り、2015年に習近平と歴史的会談を行った。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-20-9c26l",
    "traditional": "棄保效應",
    "simplified": "弃保效应",
    "pinyin": "qì bǎo xiào yìng",
    "english": "Strategic Voting / Dump-save effect",
    "japanese": "戦略的投票（棄保効果）",
    "category": "兩岸關係・臺灣政治",
    "notes": "選挙で死票を防ぐため、当選の見込みが薄い候補者を見捨て、勝てる見込みのある同陣営の別候補に票を集中させる現象。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-21-i6tr4",
    "traditional": "藍白合",
    "simplified": "蓝白合",
    "pinyin": "lán bái hé",
    "english": "Blue-White Coalition",
    "japanese": "藍白合作（国民党・民衆党の協力）",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国国民党（藍）と台湾民衆党（白）が民進党に対抗するため、選挙や立法院で提携する政治的動き。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-22-gq2ib",
    "traditional": "泛綠陣營",
    "simplified": "泛绿阵营",
    "pinyin": "fàn lǜ zhèn yíng",
    "english": "Pan-Green Coalition",
    "japanese": "泛緑陣営（汎みどり連盟）",
    "category": "兩岸關係・臺灣政治",
    "notes": "民主進歩党（民進党）を中心とする、台湾の主体性や独立志向の強い政党・団体の総称。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-23-bbev8",
    "traditional": "泛藍陣營",
    "simplified": "泛蓝阵营",
    "pinyin": "fàn lán zhèn yíng",
    "english": "Pan-Blue Coalition",
    "japanese": "泛藍陣営（汎あお連盟）",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国国民党を中心とする、現状維持や中国との対話・経済協力を重視する政党・団体の総称。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-24-3gp23",
    "traditional": "中華台北",
    "simplified": "中华台北",
    "pinyin": "zhōng huá tái běi",
    "english": "Chinese Taipei",
    "japanese": "チャイニーズタイペイ",
    "category": "兩岸關係・臺灣政治",
    "notes": "オリンピック等の国際スポーツ大会や国際機関において、台湾が使用を余儀なくされている名称。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450148-25-bbm9b",
    "traditional": "護國神山",
    "simplified": "护国神山",
    "pinyin": "hù guó shén shān",
    "english": "Sacred Mountain Protecting the Nation (Silicon Shield)",
    "japanese": "護国神山（台湾を守る盾としてのTSMC）",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾積体電路製造（TSMC）を指す言葉。世界の半導体供給を握ることで、他国が台湾防衛に関与せざるを得ない安全保障上の盾となっていることを意味する。",
    "createdAt": 1787749450148
  },
  {
    "id": "word-1787749450149-26-opohq",
    "traditional": "兩岸一家親",
    "simplified": "两岸一家亲",
    "pinyin": "liǎng àn yī jiā qīn",
    "english": "Both sides of the Taiwan Strait are one family",
    "japanese": "両岸は家族",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国側が台湾への融和策を示す際や、台湾の一部政治家が中台の交流促進を訴える際に用いるスローガン。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-27-szjx7",
    "traditional": "邦交國",
    "simplified": "邦交国",
    "pinyin": "bāng jiāo guó",
    "english": "Diplomatic Allies",
    "japanese": "国交樹立国",
    "category": "兩岸關係・臺灣政治",
    "notes": "中華民国（台湾）と正式な外交関係を持つ国家。中国の圧力により年々減少している。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-28-rdhmn",
    "traditional": "時代力量",
    "simplified": "时代力量",
    "pinyin": "shí dài lì liàng",
    "english": "New Power Party (NPP)",
    "japanese": "時代力量",
    "category": "兩岸關係・臺灣政治",
    "notes": "ひまわり学生運動を契機に2015年に結党された、若年層中心の第三極政党（泛緑）。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-29-y6wwl",
    "traditional": "台灣民眾黨",
    "simplified": "台湾民众党",
    "pinyin": "tái wān mín zhòng dǎng",
    "english": "Taiwan People's Party (TPP)",
    "japanese": "台湾民衆党",
    "category": "兩岸關係・臺灣政治",
    "notes": "2019年に柯文哲・元台北市長が結成した政党。藍緑二大政党に次ぐ「第三勢力（白）」として台頭。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-30-mh1eg",
    "traditional": "假訊息",
    "simplified": "假讯息",
    "pinyin": "jiǎ xùn xí",
    "english": "Disinformation / Fake news",
    "japanese": "偽情報（フェイクニュース）",
    "category": "兩岸關係・臺灣政治",
    "notes": "選挙や社会不安を煽るため、主に中国などの境外敵対勢力や国内の網軍によって意図的に拡散される虚偽の情報。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-31-b73sg",
    "traditional": "同婚合法化",
    "simplified": "同婚合法化",
    "pinyin": "tóng hūn hé fǎ huà",
    "english": "Legalization of Same-sex Marriage",
    "japanese": "同性婚合法化",
    "category": "兩岸關係・臺灣政治",
    "notes": "2019年、台湾がアジアで初めて同性結婚を合法化し、人権先進国として国際的な注目を集めた。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-32-tm8kt",
    "traditional": "年金改革",
    "simplified": "年金改革",
    "pinyin": "nián jīn gǎi gé",
    "english": "Pension Reform",
    "japanese": "年金改革",
    "category": "兩岸關係・臺灣政治",
    "notes": "蔡英文政権時代に断行された、軍人・公務員・教職員（軍公教）の優遇年金制度の是正。激しい抗議運動を引き起こした。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-33-sn93f",
    "traditional": "立法院",
    "simplified": "立法院",
    "pinyin": "lì fǎ yuàn",
    "english": "Legislative Yuan",
    "japanese": "立法院",
    "category": "兩岸關係・臺灣政治",
    "notes": "中華民国の最高立法機関（国会に相当）。定数113名で、任期は4年。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-34-j3p4p",
    "traditional": "行政院",
    "simplified": "行政院",
    "pinyin": "xíng zhèng yuàn",
    "english": "Executive Yuan",
    "japanese": "行政院",
    "category": "兩岸關係・臺灣政治",
    "notes": "中華民国の最高行政機関（内閣に相当）。トップは行政院長（首相）で総統が任命する。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450149-35-mdtxc",
    "traditional": "監察院",
    "simplified": "监察院",
    "pinyin": "jiān chá yuàn",
    "english": "Control Yuan",
    "japanese": "監察院",
    "category": "兩岸關係・臺灣政治",
    "notes": "公務員や国家機関の弾劾、糾挙、監査を行う中華民国独自の国家最高監察機関。",
    "createdAt": 1787749450149
  },
  {
    "id": "word-1787749450150-36-h24xz",
    "traditional": "促轉會",
    "simplified": "促转会",
    "pinyin": "cù zhuǎn huì",
    "english": "Transitional Justice Commission",
    "japanese": "移行期正義促進委員会",
    "category": "兩岸關係・臺灣政治",
    "notes": "「促進轉型正義委員會」の略。権威主義体制下の不正義の真相究明等を目的に設立された独立機関（2022年解散）。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450150-38-m2hje",
    "traditional": "野百合學運",
    "simplified": "野百合学运",
    "pinyin": "yě bǎi hé xué yùn",
    "english": "Wild Lily Student Movement",
    "japanese": "野百合学生運動",
    "category": "兩岸關係・臺灣政治",
    "notes": "1990年に発生した、国民大会の解散や総統直接選挙などを求めた大規模な学生主導の民主化運動。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450150-39-lrldm",
    "traditional": "統戰",
    "simplified": "统战",
    "pinyin": "tǒng zhàn",
    "english": "United Front Work",
    "japanese": "統一戦線工作",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国共産党が台湾の政党、メディア、民間団体、宗教界などに浸透し、台湾統一に向けた影響力を拡大する政治工作。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450150-40-vycor",
    "traditional": "惠台措施",
    "simplified": "惠台措施",
    "pinyin": "huì tái cuò shī",
    "english": "Incentive measures for Taiwan",
    "japanese": "台湾優遇措置",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国政府が台湾の企業や若者を中国大陸に誘致するために打ち出す、経済的・制度的な優遇政策。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450150-41-edfsz",
    "traditional": "台灣主體意識",
    "simplified": "台湾主体意识",
    "pinyin": "tái wān zhǔ tǐ yì shí",
    "english": "Taiwanese Subjectivity / Taiwanese Consciousness",
    "japanese": "台湾主体意識",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾を中国の一部ではなく、独自の歴史や文化を持つ独立した存在とみなすアイデンティティ。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450150-42-r7fks",
    "traditional": "八一七公報",
    "simplified": "八一七公报",
    "pinyin": "bā yī qī gōng bào",
    "english": "August 17 Communiqué",
    "japanese": "八一七公報（米中共同コミュニケ）",
    "category": "台中現代史",
    "notes": "1982年に米中が合意した文書。米国が台湾への武器供与を段階的に削減する意向を示した（後に六項保証で相殺）。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450150-43-q9mmo",
    "traditional": "上海公報",
    "simplified": "上海公报",
    "pinyin": "shàng hǎi gōng bào",
    "english": "Shanghai Communiqué",
    "japanese": "上海公報",
    "category": "台中現代史",
    "notes": "1972年のニクソン訪中時に発表。米国が「一つの中国」という中国の立場を「認識（acknowledge）」した重要な外交文書。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450150-44-jjc0k",
    "traditional": "建交公報",
    "simplified": "建交公报",
    "pinyin": "jiàn jiāo gōng bào",
    "english": "Joint Communiqué on the Establishment of Diplomatic Relations",
    "japanese": "米中建交公報",
    "category": "台中現代史",
    "notes": "1979年のアメリカと中華人民共和国の国交樹立を宣言したコミュニケ。台湾との公式な外交関係の断絶を意味した。",
    "createdAt": 1787749450150
  },
  {
    "id": "word-1787749450151-45-rjpdb",
    "traditional": "六項保證",
    "simplified": "六项保证",
    "pinyin": "liù xiàng bǎo zhèng",
    "english": "Six Assurances",
    "japanese": "六つの保証",
    "category": "台中現代史",
    "notes": "1982年に米国（レーガン政権）が台湾に対し、武器供与の終了期限を設けないなど秘密裏に約束した安全保障上の保証。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450151-46-vdty0",
    "traditional": "世界衛生大會",
    "simplified": "世界卫生大会",
    "pinyin": "shì jiè wèi shēng dà huì",
    "english": "World Health Assembly (WHA)",
    "japanese": "世界保健機関（WHO）年次総会",
    "category": "台中現代史",
    "notes": "台湾は馬政権期にオブザーバー参加していたが、中国の圧力により蔡政権以降は参加を阻害されている。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450151-47-se6we",
    "traditional": "國際民航組織",
    "simplified": "国际民航组织",
    "pinyin": "guó jì mín háng zǔ zhī",
    "english": "International Civil Aviation Organization (ICAO)",
    "japanese": "国際民間航空機関",
    "category": "台中現代史",
    "notes": "WHAと同様に、台湾の国際空間参加問題の象徴的な機関。中国の反対により台湾は参加を拒否されている。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450151-48-ft9b6",
    "traditional": "春節包機",
    "simplified": "春节包机",
    "pinyin": "chūn jié bāo jī",
    "english": "Spring Festival Charter Flights",
    "japanese": "春節チャーター便",
    "category": "台中現代史",
    "notes": "2003年以降、旧正月の帰省ラッシュに合わせて中台間で特別に運航された直行便。後の「三通」実現の布石となった。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450151-49-qwskf",
    "traditional": "斷交潮",
    "simplified": "断交潮",
    "pinyin": "duàn jiāo cháo",
    "english": "Wave of severing diplomatic ties",
    "japanese": "断交ドミノ",
    "category": "台中現代史",
    "notes": "中国の「金銭外交」や圧力により、台湾の国交樹立国が次々と中国へ寝返り、台湾と断交する現象。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450151-50-uj04g",
    "traditional": "台胞證",
    "simplified": "台胞证",
    "pinyin": "tái bāo zhèng",
    "english": "Taiwan Compatriot Permit",
    "japanese": "台湾居民来往大陸通行証（台胞証）",
    "category": "台中現代史",
    "notes": "台湾人が中国大陸に入境する際、中国側が発行する身分証明書。現在はICカード（卡式台胞證）が主流。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450151-51-thgu5",
    "traditional": "雙城論壇",
    "simplified": "双城论坛",
    "pinyin": "shuāng chéng lùn tán",
    "english": "Taipei-Shanghai Twin-City Forum",
    "japanese": "台北・上海 ツインシティ・フォーラム",
    "category": "台中現代史",
    "notes": "台北市と上海市の間で毎年開催される都市間交流会議。両岸関係が冷え込む中でも維持されている公式な対話チャンネル。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450151-52-yb5s0",
    "traditional": "亞洲基礎設施投資銀行",
    "simplified": "亚洲基础设施投资银行",
    "pinyin": "yà zhōu jī chǔ shè shī tóu zī yín háng",
    "english": "Asian Infrastructure Investment Bank (AIIB)",
    "japanese": "アジアインフラ投資銀行（AIIB）",
    "category": "台中現代史",
    "notes": "中国主導の国際金融機関。台湾は創設メンバーとしての参加を申請したが、名称や地位の問題で頓挫した。",
    "createdAt": 1787749450151
  },
  {
    "id": "word-1787749450152-53-lfqb3",
    "traditional": "跨太平洋夥伴全面進步協定",
    "simplified": "跨太平洋伙伴全面进步协定",
    "pinyin": "kuà tài píng yáng huǒ bàn quán miàn jìn bù xié yì",
    "english": "Comprehensive and Progressive Agreement for Trans-Pacific Partnership (CPTPP)",
    "japanese": "TPP11協定（CPTPP）",
    "category": "台中現代史",
    "notes": "台湾が国際経済の孤立を防ぐため加入を強く熱望しているメガFTA。中国も同時に加入申請しており牽制合戦となっている。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-54-3f5y5",
    "traditional": "區域全面經濟夥伴協定",
    "simplified": "区域全面经济伙伴协定",
    "pinyin": "qū yù quán miàn jīng jì huǒ bàn xié yì",
    "english": "Regional Comprehensive Economic Partnership (RCEP)",
    "japanese": "地域的な包括的経済連携（RCEP）協定",
    "category": "台中現代史",
    "notes": "中国が主導的役割を果たす東アジアの巨大経済圏構想。政治的理由から台湾は参加を排除されている。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-55-kitua",
    "traditional": "兩岸協議監督條例",
    "simplified": "两岸协议监督条例",
    "pinyin": "liǎng àn xié yì jiān dū tiáo lì",
    "english": "Cross-Strait Agreement Supervisory Act",
    "japanese": "両岸協議監督条例",
    "category": "台中現代史",
    "notes": "太陽花学運の要求により、中台間の協定締結時に国会と民意の監督プロセスを義務付けるために制定が求められた法案。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-56-uxoa2",
    "traditional": "美台經貿倡議",
    "simplified": "美台经贸倡议",
    "pinyin": "měi tái jīng mào chàng yì",
    "english": "U.S.-Taiwan Initiative on 21st-Century Trade",
    "japanese": "21世紀の貿易に関する米台イニシアチブ",
    "category": "台中現代史",
    "notes": "2022年に立ち上げられた、アメリカと台湾の間の新たな経済・貿易連携の枠組み。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-57-yciz1",
    "traditional": "國防授權法",
    "simplified": "国防授权法",
    "pinyin": "guó fáng shòu quán fǎ",
    "english": "National Defense Authorization Act (NDAA)",
    "japanese": "国防権限法",
    "category": "台中現代史",
    "notes": "米国の国防予算を定める法律。近年、台湾への軍事支援強化や米台軍事交流の拡大条項が頻繁に盛り込まれている。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-58-8yo3v",
    "traditional": "臺澎金馬個別關稅領域",
    "simplified": "台澎金马个别关税领域",
    "pinyin": "tái péng jīn mǎ gè bié guān shuì lǐng yù",
    "english": "Separate Customs Territory of Taiwan, Penghu, Kinmen and Matsu (TPKM)",
    "japanese": "台湾、澎湖、金門、馬祖の独立関税地域",
    "category": "台中現代史",
    "notes": "台湾が世界貿易機関（WTO）に加盟している際の公式名称。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-59-xqz1k",
    "traditional": "印太戰略",
    "simplified": "印太战略",
    "pinyin": "yìn tài zhàn lüè",
    "english": "Indo-Pacific Strategy",
    "japanese": "インド太平洋戦略",
    "category": "台中現代史",
    "notes": "自由で開かれたインド太平洋を維持するための米日などの外交・安保戦略。台湾はこの構想の重要なパートナーと位置づけられる。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-60-jzltk",
    "traditional": "馬關條約",
    "simplified": "马关条约",
    "pinyin": "mǎ guān tiáo yuē",
    "english": "Treaty of Shimonoseki",
    "japanese": "下関条約",
    "category": "中國近現代史",
    "notes": "1895年、日清戦争の講和条約。これにより清朝は台湾および澎湖諸島を日本に割譲した。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450152-61-oikt2",
    "traditional": "南京條約",
    "simplified": "南京条约",
    "pinyin": "nán jīng tiáo yuē",
    "english": "Treaty of Nanjing",
    "japanese": "南京条約",
    "category": "中國近現代史",
    "notes": "1842年、アヘン戦争の講和条約。香港島の割譲や５港の開港などを定めた中国初の不平等条約。",
    "createdAt": 1787749450152
  },
  {
    "id": "word-1787749450153-62-ldyrb",
    "traditional": "辛丑條約",
    "simplified": "辛丑条约",
    "pinyin": "xīn chǒu tiáo yuē",
    "english": "Boxer Protocol",
    "japanese": "北京議定書（辛丑条約）",
    "category": "中國近現代史",
    "notes": "1901年、義和団の乱の事後処理として清と列強11カ国が結んだ条約。莫大な賠償金で清朝の半植民地化が決定的となった。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-63-q6zxt",
    "traditional": "太平天國",
    "simplified": "太平天国",
    "pinyin": "tài píng tiān guó",
    "english": "Taiping Rebellion",
    "japanese": "太平天国の乱",
    "category": "中國近現代史",
    "notes": "1851年から1864年にかけて、洪秀全がキリスト教的理念を掲げて清朝に反旗を翻した大規模な農民反乱。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-64-ft7o0",
    "traditional": "國民革命軍",
    "simplified": "国民革命军",
    "pinyin": "guó mín gé mìng jūn",
    "english": "National Revolutionary Army",
    "japanese": "国民革命軍",
    "category": "中國近現代史",
    "notes": "1925年に広州で編成された中国国民党の軍隊。後に中華民国国軍の前身となる。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-66-qj23x",
    "traditional": "西安事變",
    "simplified": "西安事变",
    "pinyin": "xī ān shì jiàn",
    "english": "Xi'an Incident",
    "japanese": "西安事件",
    "category": "中國近現代史",
    "notes": "1936年、張学良らが蔣介石を監禁し、内戦停止と抗日統一戦線（第二次国共合作）の結成を迫った事件。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-67-y3sx6",
    "traditional": "盧溝橋事變",
    "simplified": "卢沟桥事变",
    "pinyin": "lú gōu qiáo shì jiàn",
    "english": "Marco Polo Bridge Incident",
    "japanese": "盧溝橋事件",
    "category": "中國近現代史",
    "notes": "1937年7月7日、北京郊外で起きた日本軍と中国軍の衝突事件。日中戦争の発端となった。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-68-ri1ub",
    "traditional": "南京大屠殺",
    "simplified": "南京大屠杀",
    "pinyin": "nán jīng dà tú shā",
    "english": "Nanjing Massacre",
    "japanese": "南京事件（南京大虐殺）",
    "category": "中國近現代史",
    "notes": "1937年12月、日本軍が中華民国の首都南京を占領した際に発生した、多数の捕虜や民間人の殺傷事件。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-69-4v8e2",
    "traditional": "九一八事變",
    "simplified": "九一八事变",
    "pinyin": "jiǔ yī bā shì jiàn",
    "english": "Mukden Incident",
    "japanese": "満州事変（柳条湖事件）",
    "category": "中國近現代史",
    "notes": "1931年9月18日、日本の関東軍が南満州鉄道を爆破し、それを機に満州全土を占領した事件。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-70-0xp4f",
    "traditional": "抗美援朝",
    "simplified": "抗美援朝",
    "pinyin": "kàng měi yuán cháo",
    "english": "War to Resist US Aggression and Aid Korea (Korean War)",
    "japanese": "抗美援朝（朝鮮戦争）",
    "category": "中國近現代史",
    "notes": "中国が朝鮮戦争に「人民志願軍」を派遣し、アメリカを中心とする国連軍と戦った歴史的呼称。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-71-futpw",
    "traditional": "反右運動",
    "simplified": "反右运动",
    "pinyin": "fǎn yòu yùn dòng",
    "english": "Anti-Rightist Campaign",
    "japanese": "反右派闘争",
    "category": "中國近現代史",
    "notes": "1957年、「百花斉放」で共産党を批判した知識人ら数十万人を「右派」として迫害・粛清した政治運動。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-72-g1ril",
    "traditional": "四人幫",
    "simplified": "四人帮",
    "pinyin": "sì rén bāng",
    "english": "Gang of Four",
    "japanese": "四人組",
    "category": "中國近現代史",
    "notes": "文化大革命を主導した江青（毛沢東の妻）ら4人の急進派指導者。毛の死後に逮捕・失脚した。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450153-73-arggd",
    "traditional": "批林批孔",
    "simplified": "批林批孔",
    "pinyin": "pī lín pī kǒng",
    "english": "Criticize Lin, Criticize Confucius Campaign",
    "japanese": "批林批孔運動",
    "category": "中國近現代史",
    "notes": "文革後期、失脚した林彪と孔子の儒教思想を結びつけて批判し、政敵（周恩来など）を攻撃した政治運動。",
    "createdAt": 1787749450153
  },
  {
    "id": "word-1787749450154-74-mtrox",
    "traditional": "紅衛兵",
    "simplified": "红卫兵",
    "pinyin": "hóng wèi bīng",
    "english": "Red Guards",
    "japanese": "紅衛兵",
    "category": "中國近現代史",
    "notes": "文化大革命期に毛沢東を盲信し、教師や文化人への暴力・吊し上げ、文化財の破壊（破四旧）を行った学生集団。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-75-ausfq",
    "traditional": "上山下鄉",
    "simplified": "上山下乡",
    "pinyin": "shàng shān xià xiāng",
    "english": "Up to the Mountains and Down to the Countryside Movement",
    "japanese": "上山下郷運動（下放）",
    "category": "中國近現代史",
    "notes": "文革期、都市部の青年（知識青年）を農村や辺境に送り込み、肉体労働を通じて思想改造を行わせた運動。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-76-0z0kv",
    "traditional": "深圳經濟特區",
    "simplified": "深圳经济特区",
    "pinyin": "shēn zhèn jīng jì tè qū",
    "english": "Shenzhen Special Economic Zone",
    "japanese": "深圳経済特区",
    "category": "中國近現代史",
    "notes": "1980年に指定された中国初の経済特区。改革開放の実験場として漁村から巨大ハイテク都市へと急成長した。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-77-bx0ze",
    "traditional": "中國夢",
    "simplified": "中国梦",
    "pinyin": "zhōng guó mèng",
    "english": "Chinese Dream",
    "japanese": "中国の夢",
    "category": "中國近現代史",
    "notes": "2012年に習近平が掲げた、「中華民族の偉大な復興」を目指す国家の政治スローガン。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-78-sr21f",
    "traditional": "兩個一百年",
    "simplified": "两个一百年",
    "pinyin": "liǎng gè yī bǎi nián",
    "english": "Two Centenaries",
    "japanese": "二つの百年",
    "category": "中國近現代史",
    "notes": "中国共産党結党100年（2021年）と建国100年（2049年）の節目に達成すべき国家目標。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-79-xo1lq",
    "traditional": "戰狼外交",
    "simplified": "战狼外交",
    "pinyin": "zhàn láng wài jiāo",
    "english": "Wolf Warrior Diplomacy",
    "japanese": "戦狼外交",
    "category": "中國近現代史",
    "notes": "習近平政権下で顕著になった、中国の外交官による攻撃的で強硬な対外姿勢や言動。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-80-zjpfv",
    "traditional": "社會信用體系",
    "simplified": "社会信用体系",
    "pinyin": "shè huì xìn yòng tǐ xì",
    "english": "Social Credit System",
    "japanese": "社会信用システム",
    "category": "中國近現代史",
    "notes": "個人の行動やネット履歴、財務状況を政府がスコア化し、賞罰（融資や交通機関利用の制限など）を与える監視システム。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-81-rwp5l",
    "traditional": "動態清零",
    "simplified": "动态清零",
    "pinyin": "dòng tài qīng líng",
    "english": "Dynamic Zero-COVID",
    "japanese": "ゼロコロナ政策",
    "category": "中國近現代史",
    "notes": "新型コロナウイルス感染症に対し、徹底した都市封鎖（ロックダウン）と隔離で感染者をゼロに抑え込もうとした中国の厳格な政策。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-82-avpx0",
    "traditional": "白紙運動",
    "simplified": "白纸运动",
    "pinyin": "bái zhǐ yùn dòng",
    "english": "White Paper Protests",
    "japanese": "白紙運動",
    "category": "中國近現代史",
    "notes": "2022年末、過酷なゼロコロナ政策と検閲に抗議するため、中国各地の市民や学生が白い紙を掲げてデモを行った運動。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-83-lfojh",
    "traditional": "國防自主",
    "simplified": "国防自主",
    "pinyin": "guó fáng zì zhǔ",
    "english": "National Defense Autonomy",
    "japanese": "国防自主",
    "category": "軍事・戰爭",
    "notes": "外国（主に米国）からの武器購入に依存せず、自国の防衛産業を育成して独自に兵器を開発・生産する方針。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450154-84-7prds",
    "traditional": "刺蝟戰略",
    "simplified": "刺猬战略",
    "pinyin": "cì wèi zhàn lüè",
    "english": "Porcupine Strategy",
    "japanese": "ハリネズミ戦略",
    "category": "軍事・戰爭",
    "notes": "強大な敵が飲み込むと致命傷を負うよう、大量のミサイルや機動的な兵器を配備して侵攻コストを極大化させる台湾の防衛戦略。",
    "createdAt": 1787749450154
  },
  {
    "id": "word-1787749450155-85-353i3",
    "traditional": "毒蛙戰略",
    "simplified": "毒蛙战略",
    "pinyin": "dú wā zhàn lüè",
    "english": "Poison Frog Strategy",
    "japanese": "毒ガエル戦略",
    "category": "軍事・戰爭",
    "notes": "離島（金門・馬祖など）や外郭の防衛において、敵が手を出すと甚大な被害を被るようにする抑止戦略。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-86-qwldt",
    "traditional": "源頭打擊",
    "simplified": "源头打击",
    "pinyin": "yuán tóu dǎ jī",
    "english": "Counter-strike at the Source",
    "japanese": "発射源攻撃（敵基地攻撃能力）",
    "category": "軍事・戰爭",
    "notes": "敵のミサイル基地や飛行場などを、攻撃される前に（または攻撃と同時に）ミサイル等で先制・反撃する戦術。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-87-8fk2a",
    "traditional": "兩棲突擊車",
    "simplified": "两栖突击车",
    "pinyin": "liǎng qī tū jī chē",
    "english": "Amphibious Assault Vehicle (AAV)",
    "japanese": "水陸両用強襲車",
    "category": "軍事・戰爭",
    "notes": "上陸作戦や逆上陸作戦に用いられる装甲車。台湾軍ではAAV7を配備し、防衛および災害救助に使用。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-88-jo5u1",
    "traditional": "巡弋飛彈",
    "simplified": "巡弋飞弹",
    "pinyin": "xún yì fēi dàn",
    "english": "Cruise Missile",
    "japanese": "巡航ミサイル",
    "category": "軍事・戰爭",
    "notes": "台湾が独自開発した「雄風二E型」など、中国内陸部の重要軍事拠点を精密打撃する能力を持つ兵器。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-89-8e9iu",
    "traditional": "防空飛彈",
    "simplified": "防空飞弹",
    "pinyin": "fáng kōng fēi dàn",
    "english": "Anti-aircraft Missile / Surface-to-Air Missile",
    "japanese": "防空ミサイル（地対空ミサイル）",
    "category": "軍事・戰爭",
    "notes": "台湾は世界で最も防空ミサイル（パトリオット、天弓など）の配備密度が高い地域の一つとされる。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-90-7as28",
    "traditional": "預警機",
    "simplified": "预警机",
    "pinyin": "yù jǐng jī",
    "english": "Airborne Early Warning (AEW) Aircraft",
    "japanese": "早期警戒機",
    "category": "軍事・戰爭",
    "notes": "空飛ぶレーダー基地として、敵の軍用機やミサイルの接近を早期に探知する防空の要。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-91-fiz8p",
    "traditional": "航行自由",
    "simplified": "航行自由",
    "pinyin": "háng xíng zì yóu",
    "english": "Freedom of Navigation",
    "japanese": "航行の自由",
    "category": "軍事・戰爭",
    "notes": "中国が内海化を企図する台湾海峡や南シナ海において、米国や同盟国が軍艦を通過させ国際水域であることを示す作戦。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-92-ssaw3",
    "traditional": "聯合軍演",
    "simplified": "联合军演",
    "pinyin": "lián hé jūn yǎn",
    "english": "Joint Military Exercise",
    "japanese": "合同軍事演習",
    "category": "軍事・戰爭",
    "notes": "中国軍が台湾周辺で実施する「連合利剣」などの大規模演習は、台湾を包囲・威嚇する意図が明白。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-93-qufkq",
    "traditional": "封鎖",
    "simplified": "封锁",
    "pinyin": "fēng suǒ",
    "english": "Blockade",
    "japanese": "海上封鎖・空域封鎖",
    "category": "軍事・戰爭",
    "notes": "中国が全面的な武力侵攻の前に、台湾の港湾・空港を封鎖し、エネルギーや物資の補給を断つシナリオ。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450155-94-hjdtr",
    "traditional": "斬首行動",
    "simplified": "斩首行动",
    "pinyin": "zhǎn shǒu xíng dòng",
    "english": "Decapitation Strike",
    "japanese": "斬首作戦（中枢部急襲）",
    "category": "軍事・戰爭",
    "notes": "敵の総統や軍高官など、指揮中枢をピンポイントで排除し、戦争を早期終結させる特殊作戦。",
    "createdAt": 1787749450155
  },
  {
    "id": "word-1787749450156-95-dh809",
    "traditional": "全民國防",
    "simplified": "全民国防",
    "pinyin": "quán mín guó fáng",
    "english": "All-out Defense",
    "japanese": "全民国防（総力戦防衛体制）",
    "category": "軍事・戰爭",
    "notes": "軍だけでなく、民間人や企業、地方自治体が一体となってインフラ防護や後方支援を担う防衛概念。",
    "createdAt": 1787749450156
  },
  {
    "id": "word-1787749450156-96-ntpjk",
    "traditional": "資訊戰",
    "simplified": "资讯战",
    "pinyin": "zī xùn zhàn",
    "english": "Information Warfare",
    "japanese": "情報戦",
    "category": "軍事・戰爭",
    "notes": "サイバー攻撃により敵のインフラや軍事ネットワークを麻痺させたり、世論を操作したりする現代戦の形態。",
    "createdAt": 1787749450156
  },
  {
    "id": "word-1787749450156-97-7tu34",
    "traditional": "電子戰",
    "simplified": "电子战",
    "pinyin": "diàn zǐ zhàn",
    "english": "Electronic Warfare",
    "japanese": "電子戦",
    "category": "軍事・戰爭",
    "notes": "敵のレーダーや通信を妨害（ジャミング）し、自軍の通信を確保する電磁波をめぐる攻防。",
    "createdAt": 1787749450156
  },
  {
    "id": "word-1787749450156-98-dy8jo",
    "traditional": "戰術數據鏈",
    "simplified": "战术数据链",
    "pinyin": "zhàn shù shù jù liàn",
    "english": "Tactical Data Link",
    "japanese": "戦術データ・リンク",
    "category": "軍事・戰爭",
    "notes": "陸海空の部隊間で敵の位置や戦況データをリアルタイムに共有し、統合運用を可能にするネットワーク技術。",
    "createdAt": 1787749450156
  },
  {
    "id": "word-1787749450156-99-gdt2g",
    "traditional": "反登陸作戰",
    "simplified": "反登陆作战",
    "pinyin": "fǎn dēng lù zuò zhàn",
    "english": "Anti-landing Operation",
    "japanese": "反上陸作戦（水際撃滅）",
    "category": "軍事・戰爭",
    "notes": "台湾本島への上陸を図る敵軍を、海上や水際、海岸地帯で迎撃して撃退する作戦。",
    "createdAt": 1787749450156
  },
  {
    "id": "word-1787749544679-0-cw8lx",
    "traditional": "亡羊補牢",
    "simplified": "亡羊补牢",
    "pinyin": "wáng yáng bǔ láo",
    "english": "Mend the fold after the sheep is lost",
    "japanese": "泥棒を見て縄を綯う / 失敗した後に慌てて対策を打つ",
    "category": "成語・典故",
    "notes": "政府の失策や危機管理の甘さが露呈した際、事後対策を野党やメディアが揶揄・批判する言葉として多用される。",
    "createdAt": 1787749544679
  },
  {
    "id": "word-1787749544680-1-c5jsk",
    "traditional": "順水推舟",
    "simplified": "顺水推舟",
    "pinyin": "shùn shuǐ tuī zhōu",
    "english": "Push the boat with the current",
    "japanese": "流れに乗って事を進める",
    "category": "成語・典故",
    "notes": "世論の波や有利な情勢に乗じて、政治家が自らの法案や政策をスムーズに可決させる戦略。",
    "createdAt": 1787749544680
  },
  {
    "id": "word-1787749544681-2-o8nwl",
    "traditional": "掩耳盜鈴",
    "simplified": "掩耳盗铃",
    "pinyin": "yǎn ěr dào líng",
    "english": "Deceive oneself / Bury one's head in the sand",
    "japanese": "耳を掩うて鈴を盗む（自己欺瞞）",
    "category": "成語・典故",
    "notes": "誰の目にも明らかな事実（スキャンダルや政策の失敗）を、政府や政治家が不自然な言い訳で隠蔽しようとする姿勢への批判。",
    "createdAt": 1787749544681
  },
  {
    "id": "word-1787749544681-3-a83zh",
    "traditional": "瓜田李下",
    "simplified": "瓜田李下",
    "pinyin": "guā tián lǐ xià",
    "english": "In a melon patch or under a plum tree (situations causing suspicion)",
    "japanese": "瓜田に履を納れず、李下に冠を正さず（李下瓜田）",
    "category": "成語・典故",
    "notes": "政治資金の問題や利益相反など、疑いを招きかねない行動を戒める際によく用いられる。",
    "createdAt": 1787749544681
  },
  {
    "id": "word-1787749544681-4-k84fh",
    "traditional": "隔岸觀火",
    "simplified": "隔岸观火",
    "pinyin": "gé àn guān huǒ",
    "english": "Watch a fire from across the river",
    "japanese": "対岸の火事として傍観する",
    "category": "成語・典故",
    "notes": "他国の紛争や対立陣営の内部抗争に対して、介入せずに静観して漁夫の利を狙う政治・外交姿勢。",
    "createdAt": 1787749544681
  },
  {
    "id": "word-1787749544681-5-8rz83",
    "traditional": "飲鴆止渴",
    "simplified": "饮鸩止渴",
    "pinyin": "yǐn zhèn zhǐ kě",
    "english": "Drink poison to quench thirst",
    "japanese": "渇きを癒すために毒を飲む",
    "category": "成語・典故",
    "notes": "一時凌ぎのバラマキ政策や、中国への過度な経済依存など、長期的には国家を破滅させる致命的な悪手への批判。",
    "createdAt": 1787749544681
  },
  {
    "id": "word-1787749544682-6-bgxy3",
    "traditional": "買櫝還珠",
    "simplified": "买椟还珠",
    "pinyin": "mǎi dú huán zhū",
    "english": "Keep the wooden box and return the pearl",
    "japanese": "箱を買って珠を還す（本末転倒）",
    "category": "成語・典故",
    "notes": "本質を見失い、表面的なアピールや無駄な公共事業に予算を費やす行政を批判する表現。",
    "createdAt": 1787749544682
  },
  {
    "id": "word-1787749544682-7-xnpp9",
    "traditional": "網形文化",
    "simplified": "网形文化",
    "pinyin": "wǎng xíng wén huà",
    "english": "Wangxing Culture",
    "japanese": "網形文化",
    "category": "古代史",
    "notes": "台湾北西部の旧石器時代後期に属するとされる文化。石器の発見により提唱された。",
    "createdAt": 1787749544682
  },
  {
    "id": "word-1787749544682-8-kxo36",
    "traditional": "芝山岩文化",
    "simplified": "芝山岩文化",
    "pinyin": "zhī shān yán wén huà",
    "english": "Zhishanyan Culture",
    "japanese": "芝山岩文化",
    "category": "古代史",
    "notes": "台湾北部・台北盆地の新石器時代後期の文化。木器や編み物など有機物の遺物が豊富に残る。",
    "createdAt": 1787749544682
  },
  {
    "id": "word-1787749544682-9-a48im",
    "traditional": "營埔文化",
    "simplified": "营埔文化",
    "pinyin": "yíng pǔ wén huà",
    "english": "Yingpu Culture",
    "japanese": "営埔文化",
    "category": "古代史",
    "notes": "台湾中部の新石器時代後期から金属器時代にかけての文化。黒色・灰黒色の土器が特徴。",
    "createdAt": 1787749544682
  },
  {
    "id": "word-1787749544682-10-h4rs9",
    "traditional": "靜浦文化",
    "simplified": "静浦文化",
    "pinyin": "jìng pǔ wén huà",
    "english": "Jingpu Culture",
    "japanese": "静浦文化",
    "category": "古代史",
    "notes": "台湾東部の鉄器時代文化。現在のアミ族の祖先と強い関連性があると考えられている。",
    "createdAt": 1787749544682
  },
  {
    "id": "word-1787749544683-11-8p70y",
    "traditional": "馬家窯文化",
    "simplified": "马家窑文化",
    "pinyin": "mǎ jiā yáo wén huà",
    "english": "Majiayao Culture",
    "japanese": "馬家窯文化",
    "category": "古代史",
    "notes": "中国西北部（黄河上流）の新石器時代後期の文化。見事な渦巻き模様の彩陶で有名。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544683-12-5d7hr",
    "traditional": "龍山文化",
    "simplified": "龙山文化",
    "pinyin": "lóng shān wén huà",
    "english": "Longshan Culture",
    "japanese": "龍山文化",
    "category": "古代史",
    "notes": "中国黄河中下流域の新石器時代後期の文化。「黒陶文化」とも呼ばれ、極薄の黒色土器を特徴とする。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544683-13-uhwz7",
    "traditional": "淇武蘭遺址",
    "simplified": "淇武兰遗址",
    "pinyin": "qí wǔ lán yí zhǐ",
    "english": "Qiwulan Site",
    "japanese": "淇武蘭（キウラン）遺跡",
    "category": "古代史",
    "notes": "台湾北東部（宜蘭）の鉄器時代遺跡。平埔族カバラン族の歴史を解明する上で極めて重要な発見。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544683-14-exgex",
    "traditional": "柯文哲",
    "simplified": "柯文哲",
    "pinyin": "kē wén zhé",
    "english": "Ko Wen-je",
    "japanese": "柯文哲",
    "category": "人物",
    "notes": "外科医出身の元台北市長。台湾民眾党の創設者・党首であり、第三極の象徴的リーダー。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544683-15-edm07",
    "traditional": "韓國瑜",
    "simplified": "韩国瑜",
    "pinyin": "hán guó yú",
    "english": "Han Kuo-yu",
    "japanese": "韓国瑜",
    "category": "人物",
    "notes": "中国国民党の政治家。高雄市長選での劇的勝利（韓流ブーム）と総統選敗北、その後の市長リコールで知られる。現在は立法院長。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544683-16-ps7qc",
    "traditional": "習近平",
    "simplified": "习近平",
    "pinyin": "xí jìn píng",
    "english": "Xi Jinping",
    "japanese": "習近平",
    "category": "人物",
    "notes": "中国共産党中央委員会総書記。権力集中を進め、台湾統一に向けた強硬な姿勢を崩さない。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544683-17-dori1",
    "traditional": "江澤民",
    "simplified": "江泽民",
    "pinyin": "jiāng zé mín",
    "english": "Jiang Zemin",
    "japanese": "江沢民",
    "category": "人物",
    "notes": "元中国最高指導者。「三つの代表」思想を提唱し、第三次台湾海峡危機時の中国トップ。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544683-18-kzr9c",
    "traditional": "胡錦濤",
    "simplified": "胡锦涛",
    "pinyin": "hú jǐn tāo",
    "english": "Hu Jintao",
    "japanese": "胡錦濤",
    "category": "人物",
    "notes": "元中国最高指導者。「科学的発展観」を掲げ、馬英九政権期に中台関係の劇的な雪解けを演出した。",
    "createdAt": 1787749544683
  },
  {
    "id": "word-1787749544684-19-nijtq",
    "traditional": "劉曉波",
    "simplified": "刘晓波",
    "pinyin": "liú xiǎo bō",
    "english": "Liu Xiaobo",
    "japanese": "劉暁波",
    "category": "人物",
    "notes": "中国の著述家、人権活動家。「零八憲章」を起草。ノーベル平和賞を受賞したが、獄中で死去。",
    "createdAt": 1787749544684
  },
  {
    "id": "word-1787749544684-20-r8fn8",
    "traditional": "中華民國憲法",
    "simplified": "中华民国宪法",
    "pinyin": "zhōng huá mín guó xiàn fǎ",
    "english": "Constitution of the Republic of China",
    "japanese": "中華民国憲法",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾の根本法。建前上は中国大陸を含めた全中国を領土とするため、台湾の現状との乖離が度々論争となる。",
    "createdAt": 1787749544684
  },
  {
    "id": "word-1787749544684-21-kkyfc",
    "traditional": "憲法法庭",
    "simplified": "宪法法庭",
    "pinyin": "xiàn fǎ fǎ tíng",
    "english": "Constitutional Court",
    "japanese": "憲法法廷",
    "category": "兩岸關係・臺灣政治",
    "notes": "司法院大法官によって構成され、法律や命令が憲法に違反していないかを審査（釋憲）する機関。",
    "createdAt": 1787749544684
  },
  {
    "id": "word-1787749544684-22-a8335",
    "traditional": "司法院",
    "simplified": "司法院",
    "pinyin": "sī fǎ yuàn",
    "english": "Judicial Yuan",
    "japanese": "司法院",
    "category": "兩岸關係・臺灣政治",
    "notes": "中華民国の最高司法機関。五権分立の一つ。",
    "createdAt": 1787749544684
  },
  {
    "id": "word-1787749544684-23-4fbta",
    "traditional": "考試院",
    "simplified": "考试院",
    "pinyin": "kǎo shì yuàn",
    "english": "Examination Yuan",
    "japanese": "考試院",
    "category": "兩岸關係・臺灣政治",
    "notes": "国家公務員の採用試験や人事管理を専門に行う中華民国独自の国家機関。五権分立の一つ。",
    "createdAt": 1787749544684
  },
  {
    "id": "word-1787749544684-24-acffn",
    "traditional": "地方派系",
    "simplified": "地方派系",
    "pinyin": "dì fāng pài xì",
    "english": "Local Factions",
    "japanese": "地方派閥",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾の地方選挙において強大な集票力と利権を持つ伝統的な血縁・地縁ネットワーク。",
    "createdAt": 1787749544684
  },
  {
    "id": "word-1787749544684-25-2284p",
    "traditional": "黑金政治",
    "simplified": "黑金政治",
    "pinyin": "hēi jīn zhèng zhì",
    "english": "Black Gold Politics",
    "japanese": "黒金政治",
    "category": "兩岸關係・臺灣政治",
    "notes": "黒（マフィア・暴力団）と金（賄賂・財閥）が政治と結びつく、台湾の腐敗した政治構造への批判用語。",
    "createdAt": 1787749544684
  },
  {
    "id": "word-1787749544685-26-mddan",
    "traditional": "買票",
    "simplified": "买票",
    "pinyin": "mǎi piào",
    "english": "Vote Buying",
    "japanese": "買収（票買い）",
    "category": "兩岸關係・臺灣政治",
    "notes": "選挙において有権者に金品を配って票を集める違法行為。地方選挙では未だに摘発が相次ぐ。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544685-27-khwyt",
    "traditional": "樁腳",
    "simplified": "桩脚",
    "pinyin": "zhuāng jiǎo",
    "english": "Ward heeler / Vote broker",
    "japanese": "集票ブローカー（樁腳）",
    "category": "兩岸關係・臺灣政治",
    "notes": "候補者のために地域で票をとりまとめる世話人。買収の末端を担うことも多い。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544685-28-saznc",
    "traditional": "掃街拜票",
    "simplified": "扫街拜票",
    "pinyin": "sǎo jiē bài piào",
    "english": "Street sweeping / Canvassing",
    "japanese": "街頭での票固め（どぶ板選挙）",
    "category": "兩岸關係・臺灣政治",
    "notes": "選挙期間中、候補者が市場や商店街を練り歩き、直接有権者と握手をして支持を訴える活動。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544685-29-ev46i",
    "traditional": "造勢晚會",
    "simplified": "造势晚会",
    "pinyin": "zào shì wǎn huì",
    "english": "Campaign Rally",
    "japanese": "決起集会",
    "category": "兩岸關係・臺灣政治",
    "notes": "選挙戦終盤に行われる大規模な集会。音楽や演説で熱狂を生み出し、支持者の士気を高める。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544685-30-w722l",
    "traditional": "基本盤",
    "simplified": "基本盘",
    "pinyin": "jī běn pán",
    "english": "Base supporters / Voting base",
    "japanese": "基礎票（固定支持層）",
    "category": "兩岸關係・臺灣政治",
    "notes": "政党や候補者がいかなる状況でも確実に獲得できる強固な支持基盤。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544685-31-50bnv",
    "traditional": "游離票",
    "simplified": "游离票",
    "pinyin": "yóu lí piào",
    "english": "Swing votes",
    "japanese": "浮動票",
    "category": "兩岸關係・臺灣政治",
    "notes": "特定の政党に属さず、その時々の争点や候補者の魅力で投票先を変える有権者の票。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544685-32-pcoa8",
    "traditional": "鐵票區",
    "simplified": "铁票区",
    "pinyin": "tiě piào qū",
    "english": "Safe constituency / Iron votes",
    "japanese": "鉄板選挙区（強固な地盤）",
    "category": "兩岸關係・臺灣政治",
    "notes": "特定の政党が圧倒的な優位を誇り、敗北することがほぼない選挙区（例：南部は緑の鉄票区）。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544685-33-1tkkj",
    "traditional": "中間選民",
    "simplified": "中间选民",
    "pinyin": "zhōng jiān xuǎn mín",
    "english": "Independent voters",
    "japanese": "無党派層（中間層）",
    "category": "兩岸關係・臺灣政治",
    "notes": "藍緑のイデオロギーに縛られず、政策や実務能力を重視する有権者。近年の選挙の勝敗を握る。",
    "createdAt": 1787749544685
  },
  {
    "id": "word-1787749544686-34-kecim",
    "traditional": "側翼",
    "simplified": "侧翼",
    "pinyin": "cè yì",
    "english": "Wingman / Surrogates",
    "japanese": "別働隊（ネット上の支持・攻撃集団）",
    "category": "兩岸關係・臺灣政治",
    "notes": "政党の非公式なファン組織やインフルエンサー。SNS上で対立陣営を攻撃したり、世論を誘導したりする役割を担う。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544686-35-z8dwj",
    "traditional": "帶風向",
    "simplified": "带风向",
    "pinyin": "dài fēng xiàng",
    "english": "Set the agenda / Astroturfing",
    "japanese": "世論誘導（風向きを操る）",
    "category": "兩岸關係・臺灣政治",
    "notes": "ネット掲示板やSNSで大量のアカウントを動員し、特定の議題に対して意図的な世論を作り出す行為。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544686-36-falqg",
    "traditional": "懶人包",
    "simplified": "懒人包",
    "pinyin": "lǎn rén bāo",
    "english": "Info packet / Lazy bag",
    "japanese": "解説まとめ（怠け者向けパッケージ）",
    "category": "兩岸關係・臺灣政治",
    "notes": "複雑な政治問題や政策を、図解などで誰でも短時間で理解できるようにまとめたネット上の資料。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544686-37-xff75",
    "traditional": "網紅政治",
    "simplified": "网红政治",
    "pinyin": "wǎng hóng zhèng zhì",
    "english": "Influencer politics",
    "japanese": "インフルエンサー政治",
    "category": "兩岸關係・臺灣政治",
    "notes": "政治家がYouTuberなどのネット有名人（網紅）とコラボして若者の支持を集めようとする現代的な選挙手法。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544686-38-k66ev",
    "traditional": "居住正義",
    "simplified": "居住正义",
    "pinyin": "jū zhù zhèng yì",
    "english": "Housing justice",
    "japanese": "居住の正義（住宅問題の是正）",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾の深刻な不動産価格高騰に対し、若者でも家が買える・借りられる社会を求める切実な政治的スローガン。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544686-39-7slni",
    "traditional": "少子化",
    "simplified": "少子化",
    "pinyin": "shǎo zǐ huà",
    "english": "Declining birthrate",
    "japanese": "少子化",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾は世界最低水準の出生率を記録しており、国家の安全保障をも脅かす「国安危機」と位置付けられている。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544686-40-pyqps",
    "traditional": "國家統一綱領",
    "simplified": "国家统一纲领",
    "pinyin": "guó jiā tǒng yī gāng lǐng",
    "english": "National Unification Guidelines",
    "japanese": "国家統一綱領",
    "category": "兩岸關係・臺灣政治",
    "notes": "1991年に李登輝政権が策定した、将来的な中国統一への段階的アプローチを示す文書（2006年に凍結）。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544686-41-aptzz",
    "traditional": "戒嚴時期",
    "simplified": "戒严时期",
    "pinyin": "jiè yán shí qī",
    "english": "Martial Law Period",
    "japanese": "戒厳令時代",
    "category": "兩岸關係・臺灣政治",
    "notes": "1949年から1987年まで台湾で敷かれた、世界最長クラスの戒厳令下における権威主義的統治期間。",
    "createdAt": 1787749544686
  },
  {
    "id": "word-1787749544687-43-sh4cp",
    "traditional": "國家人權博物館",
    "simplified": "国家人权博物馆",
    "pinyin": "guó jiā rén quán bó wù guǎn",
    "english": "National Human Rights Museum",
    "japanese": "国家人権博物館",
    "category": "兩岸關係・臺灣政治",
    "notes": "白色テロの犠牲者を追悼し、移行期正義を啓発するために、かつての政治犯収容所跡地（景美・緑島）に設立された博物館。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544687-44-i1o66",
    "traditional": "兩岸經濟論壇",
    "simplified": "两岸经济论坛",
    "pinyin": "liǎng àn jīng jì lùn tán",
    "english": "Cross-Strait Economic Forum",
    "japanese": "両岸経済フォーラム",
    "category": "兩岸關係・臺灣政治",
    "notes": "中台間の経済協力や民間交流を促進するために開催される大規模な会議。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544687-45-crdo7",
    "traditional": "貨貿協議",
    "simplified": "货贸协议",
    "pinyin": "huò mào xié yì",
    "english": "Cross-Strait Trade in Goods Agreement",
    "japanese": "両岸商品貿易協定",
    "category": "兩岸關係・臺灣政治",
    "notes": "ECFAの枠組み下で交渉が進められていたが、服貿協定の頓挫（太陽花学運）により交渉が事実上停止した協定。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544687-46-lv94r",
    "traditional": "陸生",
    "simplified": "陆生",
    "pinyin": "lù shēng",
    "english": "Mainland Chinese students in Taiwan",
    "japanese": "陸生（中国大陸からの留学生）",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾の大学で学ぶ中国人学生。中台関係のバロメーターであり、近年は中国側の制限で激減している。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544687-47-ubcxc",
    "traditional": "陸配",
    "simplified": "陆配",
    "pinyin": "lù pèi",
    "english": "Mainland Chinese spouses in Taiwan",
    "japanese": "陸配（中国人配偶者）",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾人と結婚して移住した中国大陸出身者。市民権取得までの年数や待遇に関する政治的議論の対象となる。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544687-48-7jub7",
    "traditional": "民調",
    "simplified": "民调",
    "pinyin": "mín tiáo",
    "english": "Opinion Poll",
    "japanese": "世論調査",
    "category": "兩岸關係・臺灣政治",
    "notes": "選挙情勢を左右する重要な指標。選挙前一定期間は民調結果の公表が法律で禁じられる（封關）。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544687-49-xwkfw",
    "traditional": "釋憲",
    "simplified": "释宪",
    "pinyin": "shì xiàn",
    "english": "Constitutional Interpretation",
    "japanese": "違憲審査（憲法解釈）",
    "category": "兩岸關係・臺灣政治",
    "notes": "大法官会議が法令の合憲性を判断すること。同性婚の合法化など、社会の転換点となる決定を下してきた。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544687-50-gkzkn",
    "traditional": "兩岸互不隸屬",
    "simplified": "两岸互不隶属",
    "pinyin": "liǎng àn hù bù lì shǔ",
    "english": "The two sides of the strait are not subordinate to each other",
    "japanese": "両岸互不隷属",
    "category": "台中現代史",
    "notes": "台湾と中国大陸は互いに従属していないという、台湾政府の公式な立場を示す表現。",
    "createdAt": 1787749544687
  },
  {
    "id": "word-1787749544688-51-mr5mt",
    "traditional": "中華民國與中華人民共和國互不隸屬",
    "simplified": "中华民国与中华人民共和国互不隶属",
    "pinyin": "zhōng huá mín guó yǔ zhōng huá rén mín gòng hé guó hù bù lì shǔ",
    "english": "The ROC and PRC are not subordinate to each other",
    "japanese": "中華民国と中華人民共和国は互いに隷属しない",
    "category": "台中現代史",
    "notes": "蔡英文総統が2021年の国慶節演説で打ち出した、台湾の主権独立の現状をより明確に定義した新論述。",
    "createdAt": 1787749544688
  },
  {
    "id": "word-1787749544688-52-3dkt6",
    "traditional": "台灣地位未定論",
    "simplified": "台湾地位未定论",
    "pinyin": "tái wān dì wèi wèi dìng lùn",
    "english": "Theory of Undetermined Status of Taiwan",
    "japanese": "台湾地位未定論",
    "category": "台中現代史",
    "notes": "サンフランシスコ平和条約において日本が台湾の領有権を放棄した際、その帰属先が明記されなかったことを根拠とする国際法上の主張。",
    "createdAt": 1787749544688
  },
  {
    "id": "word-1787749544688-53-ju13q",
    "traditional": "舊金山和約",
    "simplified": "旧金山和约",
    "pinyin": "jiù jīn shān hé yuē",
    "english": "Treaty of San Francisco",
    "japanese": "サンフランシスコ平和条約",
    "category": "台中現代史",
    "notes": "1951年に締結された日本の第二次世界大戦の講和条約。中華民国と中華人民共和国は招かれなかった。",
    "createdAt": 1787749544688
  },
  {
    "id": "word-1787749544688-54-tv02s",
    "traditional": "台北和約",
    "simplified": "台北和约",
    "pinyin": "tái běi hé yuē",
    "english": "Treaty of Taipei",
    "japanese": "日華平和条約",
    "category": "台中現代史",
    "notes": "1952年に日本と中華民国の間で結ばれた条約。1972年の日中国交正常化に伴い、日本側は失効を宣言。",
    "createdAt": 1787749544688
  },
  {
    "id": "word-1787749544688-55-tvjo6",
    "traditional": "中美建交",
    "simplified": "中美建交",
    "pinyin": "zhōng měi jiàn jiāo",
    "english": "Establishment of diplomatic relations between China and the U.S.",
    "japanese": "米中国交樹立",
    "category": "台中現代史",
    "notes": "1979年1月1日、アメリカが中華人民共和国を承認し、同時に中華民国（台湾）と断交した歴史的転換点。",
    "createdAt": 1787749544688
  },
  {
    "id": "word-1787749544688-56-oz11a",
    "traditional": "美國在台協會",
    "simplified": "美国在台协会",
    "pinyin": "měi guó zài tái xié huì",
    "english": "American Institute in Taiwan (AIT)",
    "japanese": "米国在台協会（AIT）",
    "category": "台中現代史",
    "notes": "断交後、アメリカが台湾との非公式な実務関係を維持するために設立した、事実上の米国大使館に相当する機関。",
    "createdAt": 1787749544688
  },
  {
    "id": "word-1787749544688-57-2fqt7",
    "traditional": "台灣保證法",
    "simplified": "台湾保证法",
    "pinyin": "tái wān bǎo zhèng fǎ",
    "english": "Taiwan Assurance Act",
    "japanese": "台湾保証法",
    "category": "台中現代史",
    "notes": "2020年に米国で成立。台湾への武器売却の常態化や、台湾の国際機関参加への支持を明記した法律。",
    "createdAt": 1787749544688
  },
  {
    "id": "word-1787749544689-58-6r47y",
    "traditional": "台灣旅行法",
    "simplified": "台湾旅行法",
    "pinyin": "tái wān lǚ xíng fǎ",
    "english": "Taiwan Travel Act",
    "japanese": "台湾旅行法",
    "category": "台中現代史",
    "notes": "2018年に米国で成立。米国と台湾のあらゆるレベルの高官による相互訪問を促進することを定めた法律。",
    "createdAt": 1787749544689
  },
  {
    "id": "word-1787749544689-59-7mua2",
    "traditional": "戰略清晰",
    "simplified": "战略清晰",
    "pinyin": "zhàn lüè qīng xī",
    "english": "Strategic Clarity",
    "japanese": "戦略的明確さ",
    "category": "台中現代史",
    "notes": "台湾有事の際、米国が軍事介入することをあらかじめ明確に宣言し、中国の侵攻を強く抑止する政策アプローチ。",
    "createdAt": 1787749544689
  },
  {
    "id": "word-1787749544689-60-5aupl",
    "traditional": "戰略模糊",
    "simplified": "战略模糊",
    "pinyin": "zhàn lüè mó hú",
    "english": "Strategic Ambiguity",
    "japanese": "戦略的曖昧さ",
    "category": "台中現代史",
    "notes": "台湾有事への米国の介入方針をわざと曖昧にし、中国の軽挙と台湾の独立宣言の双方を牽制する伝統的な米国外交手法。",
    "createdAt": 1787749544689
  },
  {
    "id": "word-1787749544689-61-zxpvi",
    "traditional": "中華民族偉大復興",
    "simplified": "中华民族伟大复兴",
    "pinyin": "zhōng huá mín zú wěi dà fù xīng",
    "english": "Great Rejuvenation of the Chinese Nation",
    "japanese": "中華民族の偉大な復興",
    "category": "台中現代史",
    "notes": "習近平政権の核心的スローガン。中国はこの目標を達成する上で、台湾の統一は不可欠な絶対条件と位置づけている。",
    "createdAt": 1787749544689
  },
  {
    "id": "word-1787749544690-62-smc3i",
    "traditional": "和平統一",
    "simplified": "和平统一",
    "pinyin": "hé píng tǒng yī",
    "english": "Peaceful Reunification",
    "japanese": "平和統一",
    "category": "台中現代史",
    "notes": "武力を用いず、対話や経済的一体化を通じて台湾を中国に吸収する方針。中国の対台工作の第一選択。",
    "createdAt": 1787749544690
  },
  {
    "id": "word-1787749544690-63-ye65c",
    "traditional": "武力犯台",
    "simplified": "武力犯台",
    "pinyin": "wǔ lì fàn tái",
    "english": "Armed invasion of Taiwan",
    "japanese": "武力による台湾侵攻",
    "category": "台中現代史",
    "notes": "中国人民解放軍が軍事力を用いて台湾を制圧するシナリオ。台湾および西側諸国にとって最大の地政学リスク。",
    "createdAt": 1787749544690
  },
  {
    "id": "word-1787749544690-64-ytjjt",
    "traditional": "反分裂國家法",
    "simplified": "反分裂国家法",
    "pinyin": "fǎn fēn liè guó jiā fǎ",
    "english": "Anti-Secession Law",
    "japanese": "反分裂国家法",
    "category": "台中現代史",
    "notes": "2005年に中国が制定。台湾が独立を宣言した場合などには「非平和的手段（武力）」を行使する法的根拠を定めた。",
    "createdAt": 1787749544690
  },
  {
    "id": "word-1787749544690-65-miznn",
    "traditional": "中法戰爭",
    "simplified": "中法战争",
    "pinyin": "zhōng fǎ zhàn zhēng",
    "english": "Sino-French War",
    "japanese": "清仏戦争",
    "category": "中國近現代史",
    "notes": "1884〜1885年、ベトナムの宗主権を巡る清とフランスの戦争。台湾（基隆・淡水・澎湖）も激しい戦場となった。",
    "createdAt": 1787749544690
  },
  {
    "id": "word-1787749544691-66-zqc1o",
    "traditional": "台灣民主國",
    "simplified": "台湾民主国",
    "pinyin": "tái wān mín zhǔ guó",
    "english": "Republic of Formosa",
    "japanese": "台湾民主国",
    "category": "中國近現代史",
    "notes": "1895年の下関条約による割譲に反発し、台湾の清朝官僚と土豪が独立を宣言して樹立した短命政権。",
    "createdAt": 1787749544691
  },
  {
    "id": "word-1787749544691-67-9og52",
    "traditional": "皇民化運動",
    "simplified": "皇民化运动",
    "pinyin": "huáng mín huà yùn dòng",
    "english": "Kōminka movement / Japanization",
    "japanese": "皇民化運動",
    "category": "中國近現代史",
    "notes": "日本統治時代後期に、台湾人を天皇の赤子（日本人）と同化させるため、日本語の使用や改姓名などを強要した運動。",
    "createdAt": 1787749544691
  },
  {
    "id": "word-1787749544691-68-ct3as",
    "traditional": "霧社事件",
    "simplified": "雾社事件",
    "pinyin": "wù shè shì jiàn",
    "english": "Musha Incident",
    "japanese": "霧社事件",
    "category": "中國近現代史",
    "notes": "1930年、台湾中部の山地でセデック族の頭目モーナ・ルダオらが起こした、日本統治時代最大規模の抗日蜂起。",
    "createdAt": 1787749544691
  },
  {
    "id": "word-1787749544691-69-olqoh",
    "traditional": "牡丹社事件",
    "simplified": "牡丹社事件",
    "pinyin": "mǔ dān shè shì jiàn",
    "english": "Mudan Incident / Taiwan Expedition of 1874",
    "japanese": "牡丹社事件（台湾出兵）",
    "category": "中國近現代史",
    "notes": "1874年、漂着した琉球島民が原住民（パイワン族）に殺害された事件を口実に、日本が台湾に出兵した事件。",
    "createdAt": 1787749544691
  },
  {
    "id": "word-1787749544691-70-aujmu",
    "traditional": "焦土抗戰",
    "simplified": "焦土抗战",
    "pinyin": "jiāo tǔ kàng zhàn",
    "english": "Scorched-earth resistance",
    "japanese": "焦土作戦（焦土抗戦）",
    "category": "中國近現代史",
    "notes": "日中戦争時、国民党軍が退却する際に施設や農作物を徹底的に破壊し、日本軍の利用を防いだ極端な軍事戦術。",
    "createdAt": 1787749544691
  },
  {
    "id": "word-1787749544692-71-elyjt",
    "traditional": "重慶大轟炸",
    "simplified": "重庆大轰炸",
    "pinyin": "chóng qìng dà hōng zhà",
    "english": "Bombing of Chongqing",
    "japanese": "重慶爆撃",
    "category": "中國近現代史",
    "notes": "日中戦争期、日本軍が国民政府の臨時首都・重慶に対して長期間にわたり行った無差別爆撃。",
    "createdAt": 1787749544692
  },
  {
    "id": "word-1787749544695-72-k8iai",
    "traditional": "延安整風",
    "simplified": "延安整风",
    "pinyin": "yán ān zhěng fēng",
    "english": "Yan'an Rectification Movement",
    "japanese": "延安整風運動",
    "category": "中國近現代史",
    "notes": "1940年代前半、延安の共産党根拠地で毛沢東が主導した思想統制運動。毛沢東の絶対的指導権が確立した。",
    "createdAt": 1787749544695
  },
  {
    "id": "word-1787749544695-73-4xtar",
    "traditional": "雙十協定",
    "simplified": "双十协定",
    "pinyin": "shuāng shí xié dìng",
    "english": "Double Tenth Agreement",
    "japanese": "双十協定",
    "category": "中國近現代史",
    "notes": "1945年10月10日、抗日戦争勝利後に国共両党が平和建国に向けて結んだ協定。しかし直後に内戦へ突入した。",
    "createdAt": 1787749544695
  },
  {
    "id": "word-1787749544695-74-dhcjm",
    "traditional": "三面紅旗",
    "simplified": "三面红旗",
    "pinyin": "sān miàn hóng qí",
    "english": "Three Red Banners",
    "japanese": "三面紅旗",
    "category": "中國近現代史",
    "notes": "1958年に毛沢東が提唱した「社会主義建設の総路線」「大躍進」「人民公社」を総称する政治スローガン。",
    "createdAt": 1787749544695
  },
  {
    "id": "word-1787749544695-75-iwd7z",
    "traditional": "大饑荒",
    "simplified": "大饥荒",
    "pinyin": "dà jī huāng",
    "english": "Great Chinese Famine",
    "japanese": "大飢饉（三年困難時期）",
    "category": "中國近現代史",
    "notes": "大躍進政策の失敗等により、1959年から1961年にかけて中国全土で数千万人が餓死したとされる惨劇。",
    "createdAt": 1787749544695
  },
  {
    "id": "word-1787749544695-76-6kwzo",
    "traditional": "廬山會議",
    "simplified": "庐山会议",
    "pinyin": "lú shān huì yì",
    "english": "Lushan Conference",
    "japanese": "廬山会議",
    "category": "中國近現代史",
    "notes": "1959年の共産党会議。大躍進を批判した彭徳懐が失脚し、毛沢東の極左路線がさらに強化される契機となった。",
    "createdAt": 1787749544695
  },
  {
    "id": "word-1787749544695-77-e395s",
    "traditional": "林彪事件",
    "simplified": "林彪事件",
    "pinyin": "lín biāo shì jiàn",
    "english": "Lin Biao incident",
    "japanese": "林彪事件",
    "category": "中國近現代史",
    "notes": "1971年、毛沢東の後継者とされた林彪がクーデターに失敗し、ソ連へ逃亡中にモンゴルで墜落死した事件。",
    "createdAt": 1787749544695
  },
  {
    "id": "word-1787749544696-78-3r1yn",
    "traditional": "中蘇交惡",
    "simplified": "中苏交恶",
    "pinyin": "zhōng sū jiāo è",
    "english": "Sino-Soviet split",
    "japanese": "中ソ対立",
    "category": "中國近現代史",
    "notes": "1950年代後半から表面化した、社会主義陣営の両巨頭（中国とソ連）によるイデオロギーと国境を巡る激しい対立。",
    "createdAt": 1787749544696
  },
  {
    "id": "word-1787749544696-79-wb7ui",
    "traditional": "黑貓中隊",
    "simplified": "黑猫中队",
    "pinyin": "hēi māo zhōng duì",
    "english": "Black Cat Squadron",
    "japanese": "黒猫中隊",
    "category": "中國近現代史",
    "notes": "冷戦期、アメリカの支援でU-2偵察機を操縦し、中国大陸の核施設等の極秘偵察任務に就いた台湾空軍の特殊部隊。",
    "createdAt": 1787749544696
  },
  {
    "id": "word-1787749544696-80-mm02u",
    "traditional": "四個現代化",
    "simplified": "四个现代化",
    "pinyin": "sì gè xiàn dài huà",
    "english": "Four Modernizations",
    "japanese": "四つの近代化",
    "category": "中國近現代史",
    "notes": "農業、工業、国防、科学技術の近代化を目指す、改革開放期の中国の重要目標。",
    "createdAt": 1787749544696
  },
  {
    "id": "word-1787749544696-81-qrzx9",
    "traditional": "計劃生育",
    "simplified": "计划生育",
    "pinyin": "jì huà shēng yù",
    "english": "Family Planning / One-child policy",
    "japanese": "計画出産（一人っ子政策）",
    "category": "中國近現代史",
    "notes": "人口爆発を抑制するため、中国で1979年から2015年まで厳格に施行された産児制限政策。",
    "createdAt": 1787749544696
  },
  {
    "id": "word-1787749544696-82-24yaj",
    "traditional": "加入世貿組織",
    "simplified": "加入世贸组织",
    "pinyin": "jiā rù shì mào zǔ zhī",
    "english": "WTO Accession",
    "japanese": "世界貿易機関（WTO）加盟",
    "category": "中國近現代史",
    "notes": "2001年、中国のWTO加盟。これを機に中国は「世界の工場」として爆発的な経済成長を遂げた。",
    "createdAt": 1787749544696
  },
  {
    "id": "word-1787749544696-83-7ju15",
    "traditional": "香港回歸",
    "simplified": "香港回归",
    "pinyin": "xiāng gǎng huí guī",
    "english": "Handover of Hong Kong",
    "japanese": "香港返還",
    "category": "中國近現代史",
    "notes": "1997年7月1日、イギリスから中華人民共和国へ香港の主権が返還され、一国二制度が開始された。",
    "createdAt": 1787749544696
  },
  {
    "id": "word-1787749544696-84-eflll",
    "traditional": "澳門回歸",
    "simplified": "澳门回归",
    "pinyin": "ào mén huí guī",
    "english": "Handover of Macau",
    "japanese": "マカオ返還",
    "category": "中國近現代史",
    "notes": "1999年12月20日、ポルトガルから中華人民共和国へマカオの主権が返還された。",
    "createdAt": 1787749544696
  },
  {
    "id": "word-1787749544697-85-6wpfh",
    "traditional": "國防部",
    "simplified": "国防部",
    "pinyin": "guó fáng bù",
    "english": "Ministry of National Defense",
    "japanese": "国防部",
    "category": "軍事・戰爭",
    "notes": "台湾の軍事・国防行政を統括する最高機関。",
    "createdAt": 1787749544697
  },
  {
    "id": "word-1787749544697-86-a2d63",
    "traditional": "參謀本部",
    "simplified": "参谋本部",
    "pinyin": "cān móu běn bù",
    "english": "General Staff Headquarters",
    "japanese": "参謀本部",
    "category": "軍事・戰爭",
    "notes": "国防部の下で、台湾国軍（陸海空軍）の作戦指揮・軍事戦略立案を直接担う中枢機関。",
    "createdAt": 1787749544697
  },
  {
    "id": "word-1787749544697-87-stv4s",
    "traditional": "後備軍人",
    "simplified": "后备军人",
    "pinyin": "hòu bèi jūn rén",
    "english": "Reservist",
    "japanese": "予備役",
    "category": "軍事・戰爭",
    "notes": "兵役義務を終えた後、有事の際に動員されて戦力となる民間人。台湾防衛の重要な層。",
    "createdAt": 1787749544697
  },
  {
    "id": "word-1787749544697-88-gewb8",
    "traditional": "教召",
    "simplified": "教召",
    "pinyin": "jiào zhào",
    "english": "Educational Recall / Reservist training",
    "japanese": "教育召集（予備役訓練）",
    "category": "軍事・戰爭",
    "notes": "予備役の戦闘技能を維持するため、定期的に軍営に招集して行われる再訓練。",
    "createdAt": 1787749544697
  },
  {
    "id": "word-1787749544697-89-9lp7o",
    "traditional": "刺針飛彈",
    "simplified": "刺针飞弹",
    "pinyin": "cì zhēn fēi dàn",
    "english": "Stinger missile",
    "japanese": "スティンガーミサイル",
    "category": "軍事・戰爭",
    "notes": "歩兵が携行して低空の敵機やヘリコプターを撃墜する携帯型地対空ミサイル。非対称戦の要。",
    "createdAt": 1787749544697
  },
  {
    "id": "word-1787749544698-90-c7nbs",
    "traditional": "標槍飛彈",
    "simplified": "标枪飞弹",
    "pinyin": "biāo qiāng fēi dàn",
    "english": "Javelin missile",
    "japanese": "ジャベリンミサイル",
    "category": "軍事・戰爭",
    "notes": "装甲の薄い上部から戦車を破壊する「トップアタック」能力を持つ携帯型対戦車ミサイル。",
    "createdAt": 1787749544698
  },
  {
    "id": "word-1787749544698-91-vp56g",
    "traditional": "海馬斯多管火箭系統",
    "simplified": "海马斯多管火箭系统",
    "pinyin": "hǎi mǎ sī duō guǎn huǒ jiàn xì tǒng",
    "english": "High Mobility Artillery Rocket System (HIMARS)",
    "japanese": "高機動ロケット砲システム（HIMARS）",
    "category": "軍事・戰爭",
    "notes": "高い機動力と精密な長距離打撃能力を持ち、対岸の中国軍集結地や上陸艦艇を攻撃するための重要兵器。",
    "createdAt": 1787749544698
  },
  {
    "id": "word-1787749544698-92-aw7jq",
    "traditional": "魚叉飛彈",
    "simplified": "鱼叉飞弹",
    "pinyin": "yú chā fēi dàn",
    "english": "Harpoon missile",
    "japanese": "ハープーンミサイル",
    "category": "軍事・戰爭",
    "notes": "米国製の対艦ミサイル。台湾は中国艦隊の接近を防ぐため、陸上配備型（沿岸防衛用）を大量調達している。",
    "createdAt": 1787749544698
  },
  {
    "id": "word-1787749544698-93-r87cr",
    "traditional": "雄風飛彈",
    "simplified": "雄风飞弹",
    "pinyin": "xióng fēng fēi dàn",
    "english": "Hsiung Feng missile",
    "japanese": "雄風ミサイル",
    "category": "軍事・戰爭",
    "notes": "台湾の中山科学研究院が自主開発した対艦ミサイルシリーズ。特に「空母キラー」と呼ばれる超音速の雄風三型が有名。",
    "createdAt": 1787749544698
  },
  {
    "id": "word-1787749544699-94-thsa9",
    "traditional": "沱江級巡邏艦",
    "simplified": "沱江级巡逻舰",
    "pinyin": "tuó jiāng jí xún luó jiàn",
    "english": "Tuo Chiang-class corvette",
    "japanese": "沱江（ダコウ）級コルベット",
    "category": "軍事・戰爭",
    "notes": "台湾が国艦国造で建造したステルスミサイル哨戒艦。小型・高速で大量のミサイルを積み、「空母キラー」として機能する。",
    "createdAt": 1787749544699
  },
  {
    "id": "word-1787749544699-95-vep5b",
    "traditional": "騰雲無人機",
    "simplified": "腾云无人机",
    "pinyin": "téng yún wú rén jī",
    "english": "Teng Yun UAV",
    "japanese": "騰雲（テンユン）無人機",
    "category": "軍事・戰爭",
    "notes": "台湾が自主開発している大型の長距離無人航空機。偵察任務のほか、将来的な武装化も視野に入れられている。",
    "createdAt": 1787749544699
  },
  {
    "id": "word-1787749544699-96-572rv",
    "traditional": "劍龍級潛艦",
    "simplified": "剑龙级潜舰",
    "pinyin": "jiàn lóng jí qián jiàn",
    "english": "Chien Lung-class submarine",
    "japanese": "剣龍級潜水艦",
    "category": "軍事・戰爭",
    "notes": "1980年代にオランダから購入した台湾海軍の主力潜水艦。老朽化が進んでおり、国産潜水艦（海鯤級）の配備が急がれている。",
    "createdAt": 1787749544699
  },
  {
    "id": "word-1787749544699-97-ujtuk",
    "traditional": "灘岸殲敵",
    "simplified": "滩岸歼敌",
    "pinyin": "tān àn jiān dí",
    "english": "Annihilating the enemy on the beaches",
    "japanese": "水際撃滅",
    "category": "軍事・戰爭",
    "notes": "台湾防衛構想において、洋上で撃破しきれなかった敵上陸部隊を、海岸の波打ち際で完全に殲滅する最終防衛ドクトリン。",
    "createdAt": 1787749544699
  },
  {
    "id": "word-1787749544700-98-tfm6h",
    "traditional": "拒止戰略",
    "simplified": "拒止战略",
    "pinyin": "jù zhǐ zhàn lüè",
    "english": "Denial strategy",
    "japanese": "拒否戦略（ディナイアル戦略）",
    "category": "軍事・戰爭",
    "notes": "敵の侵攻を完璧に防ぎ切るのではなく、侵攻作戦の成功を不可能にすることで、最初から戦争を諦めさせる防衛戦略。",
    "createdAt": 1787749544700
  },
  {
    "id": "word-1787749544700-99-olzg9",
    "traditional": "區域拒止",
    "simplified": "区域拒止",
    "pinyin": "qū yù jù zhǐ",
    "english": "Anti-Access/Area Denial (A2/AD)",
    "japanese": "接近阻止・領域拒否",
    "category": "軍事・戰爭",
    "notes": "台湾有事の際、中国がアメリカなどの外部部隊の介入を妨害し、台湾周辺の海空域の自由な作戦行動を封じる軍事戦略。",
    "createdAt": 1787749544700
  },
  {
    "id": "word-1787749787084-0-8xbs2",
    "traditional": "虛張聲勢",
    "simplified": "虚张声势",
    "pinyin": "xū zhāng shēng shì",
    "english": "Bluffing / Make a false show of strength",
    "japanese": "虚勢を張る",
    "category": "成語・典故",
    "notes": "軍事演習や選挙戦において、実際の実力以上に勢いがあるように見せかける戦略を指す。",
    "createdAt": 1787749787084
  },
  {
    "id": "word-1787749787084-1-mfdfb",
    "traditional": "欲擒故縱",
    "simplified": "欲擒故纵",
    "pinyin": "yù qín gù zòng",
    "english": "Let the enemy off in order to catch them later",
    "japanese": "相手を捕らえるためにわざと一度逃がす",
    "category": "成語・典故",
    "notes": "政治交渉や外交において、譲歩したように見せかけて最終的な利益を得る高度な駆け引き。",
    "createdAt": 1787749787084
  },
  {
    "id": "word-1787749787085-2-747gn",
    "traditional": "釜底抽薪",
    "simplified": "釜底抽薪",
    "pinyin": "fǔ dǐ chōu xīn",
    "english": "Take away the firewood from under the cauldron",
    "japanese": "根本的な原因を取り除く（釜底の薪を抽く）",
    "category": "成語・典故",
    "notes": "対立陣営の資金源を絶つなど、問題の根源を断ち切る強力な政治的・法的措置を意味する。",
    "createdAt": 1787749787085
  },
  {
    "id": "word-1787749787085-3-dgqo6",
    "traditional": "拋磚引玉",
    "simplified": "抛砖引玉",
    "pinyin": "pāo zhuān yǐn yù",
    "english": "Cast a brick to attract jade",
    "japanese": "レンガを投げて玉を引く（自分の拙い意見で他人の優れた意見を引き出す）",
    "category": "成語・典故",
    "notes": "議会や討論会で、政治家が自らの提案を謙遜しつつ議論を活性化させるための定型句。",
    "createdAt": 1787749787085
  },
  {
    "id": "word-1787749787086-4-fdfgw",
    "traditional": "請君入甕",
    "simplified": "请君入瓮",
    "pinyin": "qǐng jūn rù wèng",
    "english": "Invite the sir into the urn / Give somebody a taste of their own medicine",
    "japanese": "自業自得の罠にはめる",
    "category": "成語・典故",
    "notes": "相手が仕掛けてきた不当なルールや論理を、そっくりそのまま相手に適用してやり込めること。",
    "createdAt": 1787749787086
  },
  {
    "id": "word-1787749787086-5-n610o",
    "traditional": "臨淵羨魚",
    "simplified": "临渊羡鱼",
    "pinyin": "lín yuān xiàn yú",
    "english": "Admire the fish at the edge of a pool (wishing without acting)",
    "japanese": "淵に臨んで魚を羨む",
    "category": "成語・典故",
    "notes": "政策の理想を語るだけで具体的な実行力が伴わない政府や政治家を批判する表現。",
    "createdAt": 1787749787086
  },
  {
    "id": "word-1787749787086-6-w6a4x",
    "traditional": "投鼠忌器",
    "simplified": "投鼠忌器",
    "pinyin": "tóu shǔ jì qì",
    "english": "Hesitate to pelt a rat for fear of smashing the vase beside it",
    "japanese": "ネズミを打とうとして器を壊すのを恐れる",
    "category": "成語・典故",
    "notes": "汚職を摘発したいが、味方の有力者にも波及することを恐れて思い切った手が出せない状況などを指す。",
    "createdAt": 1787749787086
  },
  {
    "id": "word-1787749787087-7-kcxpr",
    "traditional": "左鎮人",
    "simplified": "左镇人",
    "pinyin": "zuǒ zhèn rén",
    "english": "Zuozhen Man",
    "japanese": "左鎮人",
    "category": "古代史",
    "notes": "台湾の台南市で頭頂骨の化石が発見された、旧石器時代の人類。長らく台湾最古の人類とされてきた。",
    "createdAt": 1787749787087
  },
  {
    "id": "word-1787749787087-8-jp0zd",
    "traditional": "亮島人",
    "simplified": "亮岛人",
    "pinyin": "liàng dǎo rén",
    "english": "Liangdao Man",
    "japanese": "亮島人",
    "category": "古代史",
    "notes": "馬祖列島の亮島で発掘された約8000年前の人骨。オーストロネシア語族の拡散ルートを解明する上で重要。",
    "createdAt": 1787749787087
  },
  {
    "id": "word-1787749787087-9-u1l61",
    "traditional": "漢本遺址",
    "simplified": "汉本遗址",
    "pinyin": "hàn běn yí zhǐ",
    "english": "Hanben Site",
    "japanese": "漢本遺跡",
    "category": "古代史",
    "notes": "台湾東部（宜蘭）の鉄器時代遺跡。精巧な金属器やガラス装飾品が出土し、高度な海洋交易を示唆する。",
    "createdAt": 1787749787087
  },
  {
    "id": "word-1787749787087-10-p74gx",
    "traditional": "殷墟",
    "simplified": "殷墟",
    "pinyin": "yīn xū",
    "english": "Yinxu / Ruins of Yin",
    "japanese": "殷墟",
    "category": "古代史",
    "notes": "中国河南省にある商（殷）時代後期の首都遺跡。大量の甲骨文字や青銅器が発掘された。",
    "createdAt": 1787749787087
  },
  {
    "id": "word-1787749787088-11-4hslu",
    "traditional": "河姆渡文化",
    "simplified": "河姆渡文化",
    "pinyin": "hé mǔ dù wén huà",
    "english": "Hemudu Culture",
    "japanese": "河姆渡文化",
    "category": "古代史",
    "notes": "中国長江下流域の新石器時代文化。世界最古級の稲作や高床式住居の跡が発見された。",
    "createdAt": 1787749787088
  },
  {
    "id": "word-1787749787088-12-muhgc",
    "traditional": "二里頭文化",
    "simplified": "二里头文化",
    "pinyin": "èr lǐ tóu wén huà",
    "english": "Erlitou Culture",
    "japanese": "二里頭文化",
    "category": "古代史",
    "notes": "中国黄河中流域の青銅器時代初期の文化。伝説上の「夏朝」の遺跡である可能性が高いとされる。",
    "createdAt": 1787749787088
  },
  {
    "id": "word-1787749787088-13-s037i",
    "traditional": "丁村人",
    "simplified": "丁村人",
    "pinyin": "dīng cūn rén",
    "english": "Dingcun Man",
    "japanese": "丁村人",
    "category": "古代史",
    "notes": "中国山西省で発見された旧石器時代中期の人類（旧人）。",
    "createdAt": 1787749787088
  },
  {
    "id": "word-1787749787089-14-1y4bz",
    "traditional": "劉銘傳",
    "simplified": "刘铭传",
    "pinyin": "liú míng chuán",
    "english": "Liu Mingchuan",
    "japanese": "劉銘伝",
    "category": "人物",
    "notes": "清朝末期の台湾初代巡撫（知事）。鉄道敷設など台湾の近代化の基礎を築いた。",
    "createdAt": 1787749787089
  },
  {
    "id": "word-1787749787089-15-evr7x",
    "traditional": "鄭南榕",
    "simplified": "郑南榕",
    "pinyin": "zhèng nán róng",
    "english": "Cheng Nan-jung",
    "japanese": "鄭南榕",
    "category": "人物",
    "notes": "台湾の出版人、民主化運動家。100%の言論の自由を求め、警察の逮捕に抗議して焼身自殺を遂げた。",
    "createdAt": 1787749787089
  },
  {
    "id": "word-1787749787089-16-qqltx",
    "traditional": "彭明敏",
    "simplified": "彭明敏",
    "pinyin": "péng míng mǐn",
    "english": "Peng Ming-min",
    "japanese": "彭明敏",
    "category": "人物",
    "notes": "「台湾自救運動宣言」を起草した台湾独立運動の精神的指導者。海外亡命を経て、台湾初の総統直接選挙に出馬。",
    "createdAt": 1787749787089
  },
  {
    "id": "word-1787749787089-17-rwap9",
    "traditional": "趙紫陽",
    "simplified": "赵紫阳",
    "pinyin": "zhào zǐ yáng",
    "english": "Zhao Ziyang",
    "japanese": "趙紫陽",
    "category": "人物",
    "notes": "元中国共産党総書記。改革派として知られたが、天安門事件で学生に同情的な態度をとって失脚し、軟禁された。",
    "createdAt": 1787749787089
  },
  {
    "id": "word-1787749787090-18-nmm25",
    "traditional": "李克強",
    "simplified": "李克强",
    "pinyin": "lǐ kè qiáng",
    "english": "Li Keqiang",
    "japanese": "李克強",
    "category": "人物",
    "notes": "習近平政権下で国務院総理（首相）を務めた人物。経済実務に精通していたが、2023年に急死。",
    "createdAt": 1787749787090
  },
  {
    "id": "word-1787749787090-19-nj4q4",
    "traditional": "達賴喇嘛",
    "simplified": "达赖喇嘛",
    "pinyin": "dá lài lǎ ma",
    "english": "Dalai Lama",
    "japanese": "ダライ・ラマ",
    "category": "人物",
    "notes": "チベット仏教の最高指導者。中国政府からは分離独立派として敵視されているが、台湾を訪問したこともある。",
    "createdAt": 1787749787090
  },
  {
    "id": "word-1787749787090-20-ec2so",
    "traditional": "一中各表",
    "simplified": "一中各表",
    "pinyin": "yī zhōng gè biǎo",
    "english": "One China, Different Interpretations",
    "japanese": "一中各表",
    "category": "兩岸關係・臺灣政治",
    "notes": "「九二共識（92年コンセンサス）」に対する国民党の解釈。両岸は一つの中国に属するが、その意味合い（中華民国か中華人民共和国か）は各自で表明するという立場。",
    "createdAt": 1787749787090
  },
  {
    "id": "word-1787749787091-21-0o8lr",
    "traditional": "黨國體制",
    "simplified": "党国体制",
    "pinyin": "dǎng guó tǐ zhì",
    "english": "Party-state system",
    "japanese": "党国体制",
    "category": "兩岸關係・臺灣政治",
    "notes": "特定の政党（かつての国民党や現在の中国共産党）と国家機構が一体化し、党が国家を絶対的に指導する政治体制。",
    "createdAt": 1787749787091
  },
  {
    "id": "word-1787749787091-22-2a4ia",
    "traditional": "動員戡亂時期臨時條款",
    "simplified": "动员戡乱时期临时条款",
    "pinyin": "dòng yuán kān luàn shí qī lín shí tiáo kuǎn",
    "english": "Temporary Provisions Against the Communist Rebellion",
    "japanese": "動員戡乱時期臨時条款",
    "category": "兩岸關係・臺灣政治",
    "notes": "共産党反乱の鎮圧を理由に、憲法の規定を停止し総統の権限を大幅に強化した台湾の超法規的条項（1991年廃止）。",
    "createdAt": 1787749787091
  },
  {
    "id": "word-1787749787091-23-fe9u1",
    "traditional": "萬年國會",
    "simplified": "万年国会",
    "pinyin": "wàn nián guó huì",
    "english": "Ten-thousand-year parliament",
    "japanese": "万年国会",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国大陸で選出された国民大会代表や立法委員が、台湾移転後も改選されずに40年以上特権的地位に留まった状態。",
    "createdAt": 1787749787091
  },
  {
    "id": "word-1787749787092-24-mp698",
    "traditional": "憲政危機",
    "simplified": "宪政危机",
    "pinyin": "xiàn zhèng wēi jī",
    "english": "Constitutional crisis",
    "japanese": "憲政危機",
    "category": "兩岸關係・臺灣政治",
    "notes": "政府機関同士（例えば立法院と行政院）の権限争いや、法律の解釈を巡って国家運営が麻痺する政治的危機。",
    "createdAt": 1787749787092
  },
  {
    "id": "word-1787749787092-25-ai7h9",
    "traditional": "罷免投票",
    "simplified": "罢免投票",
    "pinyin": "bà miǎn tóu piào",
    "english": "Recall voting",
    "japanese": "リコール投票（罷免投票）",
    "category": "兩岸關係・臺灣政治",
    "notes": "公職者を辞めさせるための有権者による投票。台湾では近年、市長や立法委員に対する報復的な罷免投票が頻発している。",
    "createdAt": 1787749787092
  },
  {
    "id": "word-1787749787092-26-h90ad",
    "traditional": "假民調",
    "simplified": "假民调",
    "pinyin": "jiǎ mín tiáo",
    "english": "Fake polls",
    "japanese": "偽の世論調査",
    "category": "兩岸關係・臺灣政治",
    "notes": "有権者を特定の候補者に誘導するため、意図的にデータを操作・捏造して発表される世論調査。",
    "createdAt": 1787749787092
  },
  {
    "id": "word-1787749787092-27-1uysp",
    "traditional": "網紅化",
    "simplified": "网红化",
    "pinyin": "wǎng hóng huà",
    "english": "Becoming Internet celebrities",
    "japanese": "インフルエンサー化",
    "category": "兩岸關係・臺灣政治",
    "notes": "政治家が政策の議論よりも、SNSでの目立ちやすさやエンターテインメント性を重視するようになる傾向。",
    "createdAt": 1787749787092
  },
  {
    "id": "word-1787749787093-28-89fmj",
    "traditional": "大外宣",
    "simplified": "大外宣",
    "pinyin": "dà wài xuān",
    "english": "Great External Propaganda",
    "japanese": "大外宣（対外プロパガンダ）",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国政府が巨額の資金を投じ、海外のメディアやSNSを通じて自国に有利な世論を形成しようとする工作。",
    "createdAt": 1787749787093
  },
  {
    "id": "word-1787749787093-29-12g9a",
    "traditional": "小粉紅",
    "simplified": "小粉红",
    "pinyin": "xiǎo fěn hóng",
    "english": "Little Pinks",
    "japanese": "小粉紅（愛国主義的な中国のネットユーザー）",
    "category": "兩岸關係・臺灣政治",
    "notes": "SNS上で中国政府の立場を熱狂的に擁護し、台湾独立派や外国の批判者に対して集団で攻撃を行う若者たち。",
    "createdAt": 1787749787093
  },
  {
    "id": "word-1787749787093-30-qyu1p",
    "traditional": "互不否認治權",
    "simplified": "互不否认治权",
    "pinyin": "hù bù fǒu rèn zhì quán",
    "english": "Mutual non-denial of jurisdiction",
    "japanese": "互いに統治権を否定しない",
    "category": "兩岸關係・臺灣政治",
    "notes": "馬英九政権が提唱した、中台が主権については争いつつも、現状の統治権の存在は事実として認め合うという概念。",
    "createdAt": 1787749787093
  },
  {
    "id": "word-1787749787093-31-ub5ws",
    "traditional": "中華民國在台灣",
    "simplified": "中华民国在台湾",
    "pinyin": "zhōng huá mín guó zài tái wān",
    "english": "Republic of China in Taiwan",
    "japanese": "中華民国在台湾",
    "category": "兩岸關係・臺灣政治",
    "notes": "李登輝政権時代に形成された、中華民国の領土が事実上「台湾・澎湖・金門・馬祖」に限定されていることを示す政治的論述。",
    "createdAt": 1787749787093
  },
  {
    "id": "word-1787749787094-32-2zf2p",
    "traditional": "台灣正名運動",
    "simplified": "台湾正名运动",
    "pinyin": "tái wān zhèng míng yùn dòng",
    "english": "Taiwan Name Rectification Movement",
    "japanese": "台湾正名運動",
    "category": "兩岸關係・臺灣政治",
    "notes": "国名や公的機関、国営企業の名称を「中華民国」「中国」から「台湾」に変更し、国際社会での混同を防ごうとする運動。",
    "createdAt": 1787749787094
  },
  {
    "id": "word-1787749787094-33-bjzra",
    "traditional": "去中國化",
    "simplified": "去中国化",
    "pinyin": "qù zhōng guó huà",
    "english": "De-Sinicization",
    "japanese": "脱中国化",
    "category": "兩岸關係・臺灣政治",
    "notes": "教育や文化、政治の領域において、中国大陸の要素を減らし、台湾独自のアイデンティティを確立しようとする動き。",
    "createdAt": 1787749787094
  },
  {
    "id": "word-1787749787094-34-q4xvh",
    "traditional": "課綱微調",
    "simplified": "课纲微调",
    "pinyin": "kè gāng wēi tiáo",
    "english": "Curriculum guidelines fine-tuning",
    "japanese": "学習指導要領の微調整問題",
    "category": "兩岸關係・臺灣政治",
    "notes": "馬英九政権時代、歴史教科書の記述を中国中心の史観（大中国史観）に書き換えようとして高校生らの激しい抗議を引き起こした事件。",
    "createdAt": 1787749787094
  },
  {
    "id": "word-1787749787094-35-t2was",
    "traditional": "國家認同",
    "simplified": "国家认同",
    "pinyin": "guó jiā rèn tóng",
    "english": "National identity",
    "japanese": "国家アイデンティティ",
    "category": "兩岸關係・臺灣政治",
    "notes": "自らを「台湾人」とみなすか、「中国人」とみなすかという、台湾社会を二分する根源的な意識の問題。",
    "createdAt": 1787749787094
  },
  {
    "id": "word-1787749787095-36-fel80",
    "traditional": "踏實外交",
    "simplified": "踏实外交",
    "pinyin": "tà shí wài jiāo",
    "english": "Steadfast Diplomacy",
    "japanese": "着実な外交",
    "category": "兩岸關係・臺灣政治",
    "notes": "蔡英文政権が掲げた、金銭外交を排し、民主主義や人権といった価値観を共有する国々との実質的な連携を深める外交方針。",
    "createdAt": 1787749787095
  },
  {
    "id": "word-1787749787095-37-4muw1",
    "traditional": "金援外交",
    "simplified": "金援外交",
    "pinyin": "jīn yuán wài jiāo",
    "english": "Dollar diplomacy / Checkbook diplomacy",
    "japanese": "金銭外交",
    "category": "兩岸關係・臺灣政治",
    "notes": "発展途上国に対して巨額の経済援助を行い、国交の樹立や維持を図る外交手法。かつて中台間で激しく行われた。",
    "createdAt": 1787749787095
  },
  {
    "id": "word-1787749787095-38-d7bof",
    "traditional": "過境外交",
    "simplified": "过境外交",
    "pinyin": "guò jìng wài jiāo",
    "english": "Transit diplomacy",
    "japanese": "トランジット外交",
    "category": "兩岸關係・臺灣政治",
    "notes": "台湾の総統が中南美の国交樹立国を訪問する際、経由地であるアメリカに立ち寄り、米高官との会談などを行う外交戦術。",
    "createdAt": 1787749787095
  },
  {
    "id": "word-1787749787095-39-9gdor",
    "traditional": "一邊一國",
    "simplified": "一边一国",
    "pinyin": "yī biān yī guó",
    "english": "One Country on Each Side",
    "japanese": "一辺一国",
    "category": "兩岸關係・臺灣政治",
    "notes": "2002年に陳水扁総統が提唱した、台湾海峡を挟んで台湾と中国はそれぞれ別の国であるという主張。",
    "createdAt": 1787749787095
  },
  {
    "id": "word-1787749787096-40-j5cik",
    "traditional": "兩岸互設辦事處",
    "simplified": "两岸互设办事处",
    "pinyin": "liǎng àn hù shè bàn shì chù",
    "english": "Reciprocal establishment of representative offices",
    "japanese": "両岸の出先機関相互設置",
    "category": "兩岸關係・臺灣政治",
    "notes": "中台間の実務を処理するため、海基会と海協会が互いの領域内に連絡事務所を設置する構想。政治的対立により未実現。",
    "createdAt": 1787749787096
  },
  {
    "id": "word-1787749787096-41-btvok",
    "traditional": "台青",
    "simplified": "台青",
    "pinyin": "tái qīng",
    "english": "Taiwanese youth in China",
    "japanese": "台青（中国にいる台湾の若者）",
    "category": "兩岸關係・臺灣政治",
    "notes": "就学や就職、起業のために中国大陸へ渡った台湾の青年層。中国政府の優遇策（統戦工作）の主要ターゲット。",
    "createdAt": 1787749787096
  },
  {
    "id": "word-1787749787096-42-zeq2f",
    "traditional": "融台政策",
    "simplified": "融台政策",
    "pinyin": "róng tái zhèng cè",
    "english": "Integration policy towards Taiwan",
    "japanese": "融台政策（台湾との融合発展政策）",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国が台湾の企業や個人に対して内国民待遇を与え、経済的・社会的に中国に取り込もうとする政策。",
    "createdAt": 1787749787096
  },
  {
    "id": "word-1787749787096-43-71ky2",
    "traditional": "資訊操弄",
    "simplified": "资讯操弄",
    "pinyin": "zī xùn cāo nòng",
    "english": "Information manipulation",
    "japanese": "情報操作",
    "category": "兩岸關係・臺灣政治",
    "notes": "SNSやメディアを通じて、特定の政治的目的のために事実を歪曲したり、悪意のある情報を拡散したりする行為。",
    "createdAt": 1787749787096
  },
  {
    "id": "word-1787749787096-44-mupj2",
    "traditional": "疑美論",
    "simplified": "疑美论",
    "pinyin": "yí měi lùn",
    "english": "US Skepticism",
    "japanese": "米国疑理論",
    "category": "兩岸關係・臺灣政治",
    "notes": "「アメリカは自国の利益のために台湾を利用しているだけで、有事には見捨てる」という、台湾社会に意図的に広められる言説。",
    "createdAt": 1787749787096
  },
  {
    "id": "word-1787749787097-45-dvefs",
    "traditional": "芒果乾",
    "simplified": "芒果干",
    "pinyin": "máng guǒ gān",
    "english": "Dried mango / Sense of national doom",
    "japanese": "亡国感（発音が「芒果乾」に似ているためのネットスラング）",
    "category": "兩岸關係・臺灣政治",
    "notes": "中国の脅威が増す中、台湾が国家として滅びてしまうのではないかという若者の強い危機感（亡國感）。",
    "createdAt": 1787749787097
  },
  {
    "id": "word-1787749787097-46-1o8zv",
    "traditional": "馬習會",
    "simplified": "马习会",
    "pinyin": "mǎ xí huì",
    "english": "Ma-Xi Meeting",
    "japanese": "馬習会（馬英九・習近平会談）",
    "category": "台中現代史",
    "notes": "2015年11月7日、シンガポールで行われた分断後初の中台トップ会談。互いに「先生」と呼び合った。",
    "createdAt": 1787749787097
  },
  {
    "id": "word-1787749787097-47-q57pw",
    "traditional": "江陳會",
    "simplified": "江陈会",
    "pinyin": "jiāng chén huì",
    "english": "Chiang-Chen Talks",
    "japanese": "江陳会談",
    "category": "台中現代史",
    "notes": "馬英九政権下で頻繁に行われた、台湾の海基会（江丙坤）と中国の海協会（陳雲林）による実務協議トップ会談。",
    "createdAt": 1787749787097
  },
  {
    "id": "word-1787749787097-48-lijbq",
    "traditional": "兩岸投保協議",
    "simplified": "两岸投保协议",
    "pinyin": "liǎng àn tóu bǎo xié yì",
    "english": "Cross-Strait Investment Protection Agreement",
    "japanese": "両岸投資保護協定",
    "category": "台中現代史",
    "notes": "2012年に調印された、中国大陸に進出する台湾企業の資産や人身の安全を保護するための取り決め。",
    "createdAt": 1787749787097
  },
  {
    "id": "word-1787749787098-49-cpbr8",
    "traditional": "卡式台胞證",
    "simplified": "卡式台胞证",
    "pinyin": "kǎ shì tái bāo zhèng",
    "english": "Card-type Taiwan Compatriot Permit",
    "japanese": "カード式台胞証",
    "category": "台中現代史",
    "notes": "中国が台湾人向けに発行するICカード化された通行証。便利だが、中国国民と同等の身分証扱いとなるため台湾側から反発もあった。",
    "createdAt": 1787749787098
  },
  {
    "id": "word-1787749787098-50-osjhm",
    "traditional": "兩岸直航",
    "simplified": "两岸直航",
    "pinyin": "liǎng àn zhí háng",
    "english": "Cross-strait direct flights",
    "japanese": "両岸直行便",
    "category": "台中現代史",
    "notes": "香港などを経由せず、台湾と中国大陸の都市を直接結ぶ定期航空便。2008年に全面的に解禁された。",
    "createdAt": 1787749787098
  },
  {
    "id": "word-1787749787099-51-l91f5",
    "traditional": "陸生納保",
    "simplified": "陆生纳保",
    "pinyin": "lù shēng nà bǎo",
    "english": "National Health Insurance for Mainland Students",
    "japanese": "陸生納保（中国人留学生の健康保険適用）",
    "category": "台中現代史",
    "notes": "台湾で学ぶ中国人留学生を台湾の全民健康保険に加入させるかどうかの政治的議論。2024年に適用が実現。",
    "createdAt": 1787749787099
  },
  {
    "id": "word-1787749787099-52-0fblw",
    "traditional": "李明哲事件",
    "simplified": "李明哲事件",
    "pinyin": "lǐ míng zhé shì jiàn",
    "english": "Lee Ming-che Incident",
    "japanese": "李明哲事件",
    "category": "台中現代史",
    "notes": "2017年、台湾の人権活動家が中国に入国した直後に「国家政権転覆容疑」で拘束・実刑判決を受けた事件。",
    "createdAt": 1787749787099
  },
  {
    "id": "word-1787749787099-53-zzzje",
    "traditional": "洪仲丘事件",
    "simplified": "洪仲丘事件",
    "pinyin": "hóng zhòng qiū shì jiàn",
    "english": "Hung Chung-chiu Incident",
    "japanese": "洪仲丘事件",
    "category": "台中現代史",
    "notes": "2013年、兵役中の青年が不当なしごきで死亡した事件。25万人が白い服を着て抗議（白衫軍運動）し、軍事裁判法の改正に繋がった。",
    "createdAt": 1787749787099
  },
  {
    "id": "word-1787749787100-54-i8lx5",
    "traditional": "反媒體壟斷運動",
    "simplified": "反媒体垄断运动",
    "pinyin": "fǎn méi tǐ lǒng duàn yùn dòng",
    "english": "Anti-Media Monopoly Movement",
    "japanese": "反メディア独占運動",
    "category": "台中現代史",
    "notes": "2012年、親中派の巨大企業が台湾の主要メディアを買収しようとしたことに対し、言論の自由を守るために起きた学生運動。",
    "createdAt": 1787749787100
  },
  {
    "id": "word-1787749787100-55-dqskt",
    "traditional": "大膽西進",
    "simplified": "大胆西进",
    "pinyin": "dà dǎn xī jìn",
    "english": "Bold Westward March",
    "japanese": "大胆西進",
    "category": "台中現代史",
    "notes": "1990年代、許信良ら民進党の一部が主張した、中国市場へ積極的に進出して経済的利益を追求すべきという政策路線。",
    "createdAt": 1787749787100
  },
  {
    "id": "word-1787749787101-56-ta24b",
    "traditional": "南向政策",
    "simplified": "南向政策",
    "pinyin": "nán xiàng zhèng cè",
    "english": "Southbound Policy",
    "japanese": "南向政策（李登輝政権期）",
    "category": "台中現代史",
    "notes": "1990年代に李登輝政権が推進した、台湾企業の投資先を中国から東南アジアへ分散させるための政策。",
    "createdAt": 1787749787101
  },
  {
    "id": "word-1787749787101-57-koenl",
    "traditional": "亞太營運中心",
    "simplified": "亚太营运中心",
    "pinyin": "yà tài yíng yùn zhōng xīn",
    "english": "Asia-Pacific Regional Operations Center",
    "japanese": "アジア太平洋地域運営センター",
    "category": "台中現代史",
    "notes": "1990年代の台湾政府の経済構想。台湾を多国籍企業のアジア太平洋の拠点（製造・金融・通信など）にしようとした。",
    "createdAt": 1787749787101
  },
  {
    "id": "word-1787749787101-58-yet3z",
    "traditional": "美麗島大審",
    "simplified": "美丽岛大审",
    "pinyin": "měi lì dǎo dà shěn",
    "english": "Formosa Incident Trial",
    "japanese": "美麗島大審",
    "category": "台中現代史",
    "notes": "美麗島事件の逮捕者を裁いた1980年の軍事裁判。被告と弁護団（陳水扁ら）の法廷闘争は台湾民主化の起爆剤となった。",
    "createdAt": 1787749787101
  },
  {
    "id": "word-1787749787102-59-qygur",
    "traditional": "江南案",
    "simplified": "江南案",
    "pinyin": "jiāng nán àn",
    "english": "Henry Liu assassination",
    "japanese": "江南事件",
    "category": "台中現代史",
    "notes": "1984年、蔣経国を批判した作家・江南（劉宜良）が、台湾情報機関の指示を受けたマフィアに米国で暗殺された事件。",
    "createdAt": 1787749787102
  },
  {
    "id": "word-1787749787102-60-u4uu8",
    "traditional": "林宅血案",
    "simplified": "林宅血案",
    "pinyin": "lín zhái xuě àn",
    "english": "Lin family massacre",
    "japanese": "林家血案",
    "category": "台中現代史",
    "notes": "1980年2月28日、拘束中の反体制派政治家・林義雄の自宅で、母親と双子の娘が何者かに惨殺された未解決事件。",
    "createdAt": 1787749787102
  },
  {
    "id": "word-1787749787102-61-34h2m",
    "traditional": "護國運動",
    "simplified": "护国运动",
    "pinyin": "hù guó yùn dòng",
    "english": "National Protection War",
    "japanese": "護国運動",
    "category": "中國近現代史",
    "notes": "1915〜16年、皇帝に即位しようとした袁世凱に対して、雲南省などが独立を宣言して反旗を翻した内戦。",
    "createdAt": 1787749787102
  },
  {
    "id": "word-1787749787102-62-knfyi",
    "traditional": "軍閥割據",
    "simplified": "军阀割据",
    "pinyin": "jūn fá gē jù",
    "english": "Warlord Era",
    "japanese": "軍閥割拠",
    "category": "中國近現代史",
    "notes": "袁世凱の死後から北伐完了まで、中国各地を軍事力を持つ地方有力者（軍閥）が支配し内戦を繰り返した時代。",
    "createdAt": 1787749787102
  },
  {
    "id": "word-1787749787102-63-kz6ua",
    "traditional": "中原大戰",
    "simplified": "中原大战",
    "pinyin": "zhōng yuán dà zhàn",
    "english": "Central Plains War",
    "japanese": "中原大戦",
    "category": "中國近現代史",
    "notes": "1930年、蔣介石の中央軍と反蔣介石の地方軍閥連合との間で戦われた近代中国最大規模の内戦。",
    "createdAt": 1787749787102
  },
  {
    "id": "word-1787749787102-64-2gdr3",
    "traditional": "國民政府",
    "simplified": "国民政府",
    "pinyin": "guó mín zhèng fǔ",
    "english": "Nationalist Government",
    "japanese": "国民政府",
    "category": "中國近現代史",
    "notes": "1925年から1948年（中華民国憲法行憲まで）の、中国国民党の一党独裁による中華民国政府の呼称。",
    "createdAt": 1787749787102
  },
  {
    "id": "word-1787749787103-65-h03qn",
    "traditional": "聯俄容共",
    "simplified": "联俄容共",
    "pinyin": "lián é róng gòng",
    "english": "First United Front / Alliance with Russia and Tolerance of Communists",
    "japanese": "聯ソ容共（第一次国共合作）",
    "category": "中國近現代史",
    "notes": "1920年代、孫文がソ連の支援を受け、国民党内に共産党員が個人の資格で加入することを認めた政策。",
    "createdAt": 1787749787103
  },
  {
    "id": "word-1787749787103-66-vs7kx",
    "traditional": "寧漢分裂",
    "simplified": "宁汉分裂",
    "pinyin": "níng hàn fēn liè",
    "english": "Nanjing-Wuhan Split",
    "japanese": "寧漢分裂",
    "category": "中國近現代史",
    "notes": "1927年、北伐の途中で共産党排除を掲げる蔣介石（南京）と、容共派の汪兆銘（武漢）に国民政府が分裂した事件。",
    "createdAt": 1787749787103
  },
  {
    "id": "word-1787749787103-67-yaw9b",
    "traditional": "剿共",
    "simplified": "剿共",
    "pinyin": "jiǎo gòng",
    "english": "Encirclement Campaigns",
    "japanese": "共産党討伐（囲剿）",
    "category": "中國近現代史",
    "notes": "1930年代前半、蔣介石率いる国民革命軍が中国共産党の根拠地（瑞金など）に対して行った大規模な軍事包囲作戦。",
    "createdAt": 1787749787103
  },
  {
    "id": "word-1787749787103-68-yjbmu",
    "traditional": "遵義會議",
    "simplified": "遵义会议",
    "pinyin": "zūn yì huì yì",
    "english": "Zunyi Conference",
    "japanese": "遵義会議",
    "category": "中國近現代史",
    "notes": "1935年の長征の途中で開かれた共産党の会議。ここで毛沢東が軍事の実権を掌握し、党内での優位を確立した。",
    "createdAt": 1787749787103
  },
  {
    "id": "word-1787749787103-69-quxve",
    "traditional": "肅反運動",
    "simplified": "肃反运动",
    "pinyin": "sù fǎn yùn dòng",
    "english": "Sufan Movement",
    "japanese": "粛反運動",
    "category": "中國近現代史",
    "notes": "1955年に中国共産党内や政府機関の内部に潜む「反革命分子」を摘発・粛清した政治運動。",
    "createdAt": 1787749787103
  },
  {
    "id": "word-1787749787103-70-zlt1c",
    "traditional": "大煉鋼鐵",
    "simplified": "大炼钢铁",
    "pinyin": "dà liàn gāng tiě",
    "english": "Backyard furnaces campaign",
    "japanese": "大製鉄・製鋼運動",
    "category": "中國近現代史",
    "notes": "大躍進期、イギリスを追い越すため全国の農民に庭先の手作り炉で鉄を作らせたが、クズ鉄しかできず農業を破綻させた。",
    "createdAt": 1787749787103
  },
  {
    "id": "word-1787749787104-71-8kfo0",
    "traditional": "除四害",
    "simplified": "除四害",
    "pinyin": "chú sì hài",
    "english": "Four Pests Campaign",
    "japanese": "四害駆除運動（打麻雀運動）",
    "category": "中國近現代史",
    "notes": "大躍進期にネズミ、ハエ、蚊、スズメを徹底的に駆除した運動。スズメの激減で害虫が大繁殖し、大飢饉の一因となった。",
    "createdAt": 1787749787104
  },
  {
    "id": "word-1787749787104-72-bmjze",
    "traditional": "批鬥",
    "simplified": "批斗",
    "pinyin": "pī dòu",
    "english": "Struggle session",
    "japanese": "吊し上げ（批闘）",
    "category": "中國近現代史",
    "notes": "文化大革命などで、標的とされた人物（知識人や地主など）を大衆の前で引きずり出し、精神的・肉体的な暴力を加えて自己批判を強要する行為。",
    "createdAt": 1787749787104
  },
  {
    "id": "word-1787749787104-73-acs6f",
    "traditional": "知識青年",
    "simplified": "知识青年",
    "pinyin": "zhī shí qīng nián",
    "english": "Sent-down youth / Zhiqing",
    "japanese": "知識青年（知青）",
    "category": "中國近現代史",
    "notes": "文革期の上山下郷運動で、農村に下放されて肉体労働に従事させられた都市部の中学・高校卒業生。",
    "createdAt": 1787749787104
  },
  {
    "id": "word-1787749787104-74-yyagt",
    "traditional": "浦東開發",
    "simplified": "浦东开发",
    "pinyin": "pǔ dōng kāi fā",
    "english": "Pudong Development",
    "japanese": "浦東開発",
    "category": "中國近現代史",
    "notes": "1990年に決定された上海市浦東地区の大規模開発。中国の金融・経済の世界的ハブへと急速に発展した。",
    "createdAt": 1787749787104
  },
  {
    "id": "word-1787749787104-75-552qd",
    "traditional": "社會主義初級階段",
    "simplified": "社会主义初级阶段",
    "pinyin": "shè huì zhǔ yì chū jí jiē duàn",
    "english": "Primary stage of socialism",
    "japanese": "社会主義初級段階",
    "category": "中國近現代史",
    "notes": "共産党が市場経済の導入（資本主義的要素）を正当化するために用いた理論。「完全な社会主義に至る途上の未熟な段階」とする。",
    "createdAt": 1787749787104
  },
  {
    "id": "word-1787749787104-76-7yqmd",
    "traditional": "港人治港",
    "simplified": "港人治港",
    "pinyin": "gǎng rén zhì gǎng",
    "english": "Hong Kong people ruling Hong Kong",
    "japanese": "港人治港",
    "category": "中國近現代史",
    "notes": "一国二制度の枠組み下で、香港の行政は中央から派遣された官僚ではなく、香港人自身が担うという原則。",
    "createdAt": 1787749787104
  },
  {
    "id": "word-1787749787104-77-axwks",
    "traditional": "中英聯合聲明",
    "simplified": "中英联合声明",
    "pinyin": "zhōng yīng lián hé shēng míng",
    "english": "Sino-British Joint Declaration",
    "japanese": "中英共同声明",
    "category": "中國近現代史",
    "notes": "1984年に署名された香港返還に関する協定。返還後50年間は香港の資本主義制度や自由を維持することを約束した。",
    "createdAt": 1787749787104
  },
  {
    "id": "word-1787749787105-78-thg9g",
    "traditional": "共同富裕",
    "simplified": "共同富裕",
    "pinyin": "gòng tóng fù yù",
    "english": "Common Prosperity",
    "japanese": "共同富裕",
    "category": "中國近現代史",
    "notes": "習近平政権が掲げる、極端な貧富の格差を是正し、社会全体で豊かさを分かち合うことを目指す経済スローガン。",
    "createdAt": 1787749787105
  },
  {
    "id": "word-1787749787105-79-392k7",
    "traditional": "封城",
    "simplified": "封城",
    "pinyin": "fēng chéng",
    "english": "Lockdown",
    "japanese": "都市封鎖（ロックダウン）",
    "category": "中國近現代史",
    "notes": "ゼロコロナ政策下で、武漢や上海などの大都市の住民を長期間自宅に軟禁状態にし、経済活動を停止させた措置。",
    "createdAt": 1787749787105
  },
  {
    "id": "word-1787749787105-80-rgg0g",
    "traditional": "躺平",
    "simplified": "躺平",
    "pinyin": "tǎng píng",
    "english": "Lying flat",
    "japanese": "寝そべり主義（躺平）",
    "category": "中國近現代史",
    "notes": "過酷な競争社会や将来への希望の欠如に疲弊した中国の若者が、出世や消費を諦めて最低限の生活を送る社会現象。",
    "createdAt": 1787749787105
  },
  {
    "id": "word-1787749787105-81-rg6ao",
    "traditional": "國防工業",
    "simplified": "国防工业",
    "pinyin": "guó fáng gōng yè",
    "english": "Defense Industry",
    "japanese": "国防産業",
    "category": "軍事・戰爭",
    "notes": "兵器の自国生産能力。台湾では「國防自主」政策により、航空機や潜水艦の開発など国内産業の育成が急務となっている。",
    "createdAt": 1787749787105
  },
  {
    "id": "word-1787749787105-82-0p44i",
    "traditional": "替代役",
    "simplified": "替代役",
    "pinyin": "tì dài yì",
    "english": "Alternative Civilian Service",
    "japanese": "代替役",
    "category": "軍事・戰爭",
    "notes": "宗教上の理由や身体的条件などで兵役（軍事訓練）に就かない者が、警察や消防、社会福祉などの業務に従事する制度。",
    "createdAt": 1787749787105
  },
  {
    "id": "word-1787749787105-83-4c0b7",
    "traditional": "志願役",
    "simplified": "志愿役",
    "pinyin": "zhì yuàn yì",
    "english": "Voluntary military service",
    "japanese": "志願役（職業軍人）",
    "category": "軍事・戰爭",
    "notes": "自ら志願して軍に入隊する者。台湾軍の専門的な戦力の中核を担うが、少子化により人材確保が課題となっている。",
    "createdAt": 1787749787105
  },
  {
    "id": "word-1787749787106-84-2unst",
    "traditional": "黑熊學院",
    "simplified": "黑熊学院",
    "pinyin": "hēi xióng xué yuàn",
    "english": "Kuma Academy",
    "japanese": "黒熊（クマ）学院",
    "category": "軍事・戰爭",
    "notes": "有事の際の民間防衛（応急処置や避難行動、偽情報への対処など）を一般市民に教育する台湾の民間団体。",
    "createdAt": 1787749787106
  },
  {
    "id": "word-1787749787106-85-ee8vr",
    "traditional": "假旗行動",
    "simplified": "假旗行动",
    "pinyin": "jiǎ qí xíng dòng",
    "english": "False flag operation",
    "japanese": "偽旗作戦",
    "category": "軍事・戰爭",
    "notes": "敵がやったかのように偽装して自陣営を攻撃し、それを口実に戦争を開始する謀略。中国の台湾侵攻シナリオで警戒される。",
    "createdAt": 1787749787106
  },
  {
    "id": "word-1787749787106-86-1wdp8",
    "traditional": "第一擊",
    "simplified": "第一击",
    "pinyin": "dì yī jī",
    "english": "First strike",
    "japanese": "第一撃（先制攻撃）",
    "category": "軍事・戰爭",
    "notes": "戦争の端緒となる最初の攻撃。台湾軍は従来「第一撃は打たない」としていたが、近年はドローン侵入等に対する自衛の解釈を変更している。",
    "createdAt": 1787749787106
  },
  {
    "id": "word-1787749787106-87-opja7",
    "traditional": "制空權",
    "simplified": "制空权",
    "pinyin": "zhì kōng quán",
    "english": "Air supremacy / Air superiority",
    "japanese": "制空権",
    "category": "軍事・戰爭",
    "notes": "台湾海峡上空の航空優勢を確保すること。台湾防衛において最も重要であり、喪失すれば本島への上陸を許すことになる。",
    "createdAt": 1787749787106
  },
  {
    "id": "word-1787749787106-88-zpuht",
    "traditional": "制海權",
    "simplified": "制海权",
    "pinyin": "zhì hǎi quán",
    "english": "Command of the sea",
    "japanese": "制海権",
    "category": "軍事・戰爭",
    "notes": "海域を支配し、自軍の自由な航行を確保しつつ敵の海上行動を阻止する能力。海上封鎖を突破するために不可欠。",
    "createdAt": 1787749787106
  },
  {
    "id": "word-1787749787106-89-jfv37",
    "traditional": "聯合兵種營",
    "simplified": "联合兵种营",
    "pinyin": "lián hé bīng zhǒng yíng",
    "english": "Combined Arms Battalion",
    "japanese": "連合兵種大隊",
    "category": "軍事・戰爭",
    "notes": "台湾陸軍の編制。歩兵、戦車、砲兵などの異なる兵科を一つの大隊に統合し、独立した戦闘能力と機動性を高めた部隊。",
    "createdAt": 1787749787106
  },
  {
    "id": "word-1787749787106-90-bkj1z",
    "traditional": "實彈射擊",
    "simplified": "实弹射击",
    "pinyin": "shí dàn shè jī",
    "english": "Live-fire drill",
    "japanese": "実弾射撃演習",
    "category": "軍事・戰爭",
    "notes": "兵器の実際の威力や部隊の錬度を確認する演習。中国が台湾を威嚇するため、台湾周辺海域に向けて弾道ミサイルを実弾射撃した例がある。",
    "createdAt": 1787749787106
  },
  {
    "id": "word-1787749787107-91-sz4nt",
    "traditional": "登陸艇",
    "simplified": "登陆艇",
    "pinyin": "dēng lù tǐng",
    "english": "Landing craft",
    "japanese": "上陸用舟艇",
    "category": "軍事・戰爭",
    "notes": "海から海岸へ兵員や車両を送り込むための小型艦艇。中国軍が台湾本島へ侵攻する際、最終段階で多数投入される。",
    "createdAt": 1787749787107
  },
  {
    "id": "word-1787749787107-92-9hqj9",
    "traditional": "空降作戰",
    "simplified": "空降作战",
    "pinyin": "kōng jiàng zuò zhàn",
    "english": "Airborne operation",
    "japanese": "空挺作戦（落下傘降下など）",
    "category": "軍事・戰爭",
    "notes": "輸送機からパラシュートなどで敵陣営（空港や重要施設）の背後に部隊を降下させ、制圧する奇襲作戦。",
    "createdAt": 1787749787107
  },
  {
    "id": "word-1787749787107-93-savcn",
    "traditional": "飛彈防禦系統",
    "simplified": "飞弹防御系统",
    "pinyin": "fēi dàn fáng yù xì tǒng",
    "english": "Missile defense system",
    "japanese": "ミサイル防衛システム",
    "category": "軍事・戰爭",
    "notes": "飛来する敵の弾道ミサイルをレーダーで探知し、迎撃ミサイル（パトリオットなど）で撃ち落とすための統合システム。",
    "createdAt": 1787749787107
  },
  {
    "id": "word-1787749787107-94-6zril",
    "traditional": "鋪路爪雷達",
    "simplified": "铺路爪雷达",
    "pinyin": "pù lù zhǎo léi dá",
    "english": "PAVE PAWS radar",
    "japanese": "ペーブ・ポウズ（早期警戒レーダー）",
    "category": "軍事・戰爭",
    "notes": "台湾の新竹県に設置されている超大型のフェーズドアレイレーダー。中国内陸部からのミサイル発射を数千キロ先から探知する。",
    "createdAt": 1787749787107
  },
  {
    "id": "word-1787749787107-95-9nduv",
    "traditional": "自製防禦潛艦",
    "simplified": "自制防御潜舰",
    "pinyin": "zì zhì fáng yù qián jiàn",
    "english": "Indigenous Defense Submarine (IDS)",
    "japanese": "国産防衛潜水艦",
    "category": "軍事・戰爭",
    "notes": "台湾が外国からの技術支援を受けつつ、独自に建造を進めている潜水艦プロジェクト。第1号艦は「海鯤（ハイクン）」。",
    "createdAt": 1787749787107
  },
  {
    "id": "word-1787749787107-96-6tbvr",
    "traditional": "機動雷達",
    "simplified": "机动雷达",
    "pinyin": "jī dòng léi dá",
    "english": "Mobile radar",
    "japanese": "移動式レーダー",
    "category": "軍事・戰爭",
    "notes": "車両に搭載され移動可能なレーダー。固定式のレーダー基地が開戦直後に破壊されても、防空網を維持するための非対称戦力。",
    "createdAt": 1787749787107
  },
  {
    "id": "word-1787749787108-97-fv18u",
    "traditional": "戰備整備",
    "simplified": "战备整备",
    "pinyin": "zhàn bèi zhěng bèi",
    "english": "Combat readiness",
    "japanese": "戦闘準備体制",
    "category": "軍事・戰爭",
    "notes": "軍隊がいつでも作戦に出動できるよう、人員、兵器、物資、訓練の状態を整え、警戒レベルを引き上げること。",
    "createdAt": 1787749787108
  },
  {
    "id": "word-1787749787108-98-0ompt",
    "traditional": "無人艇",
    "simplified": "无人艇",
    "pinyin": "wú rén tǐng",
    "english": "Unmanned surface vehicle (USV) / Drone boat",
    "japanese": "無人水上艇",
    "category": "軍事・戰爭",
    "notes": "遠隔操作や自律航行で動くボート。自爆攻撃などで敵の大型艦艇に損害を与える安価な非対称兵器として注目されている。",
    "createdAt": 1787749787108
  },
  {
    "id": "word-1787749787108-99-tucm3",
    "traditional": "登陸艦",
    "simplified": "登陆舰",
    "pinyin": "dēng lù jiàn",
    "english": "Amphibious transport dock / Landing ship",
    "japanese": "揚陸艦",
    "category": "軍事・戰爭",
    "notes": "中国軍が台湾侵攻の際に主力とする、大量の部隊や車両、ヘリコプターを輸送・展開するための大型軍艦。",
    "createdAt": 1787749787108
  },
  {
    "id": "word-1787750135719-0-ydcvb",
    "traditional": "台灣總督府",
    "simplified": "台湾总督府",
    "pinyin": "tái wān zǒng dū fǔ",
    "english": "Office of the Governor-General of Taiwan",
    "japanese": "台湾総督府",
    "category": "台灣近現代史・文化",
    "notes": "日本統治時代の最高行政機関。その建物は現在も中華民国の「總統府」として使用されている。",
    "createdAt": 1787750135719
  },
  {
    "id": "word-1787750135719-1-l2lqp",
    "traditional": "烏山頭水庫",
    "simplified": "乌山头水库",
    "pinyin": "wū shān tóu shuǐ kù",
    "english": "Wushantou Reservoir",
    "japanese": "烏山頭ダム",
    "category": "台灣近現代史・文化",
    "notes": "八田與一の設計により建設された巨大なダム。嘉南平野の農業を飛躍的に発展させた。",
    "createdAt": 1787750135719
  },
  {
    "id": "word-1787750135719-2-afz72",
    "traditional": "嘉南大圳",
    "simplified": "嘉南大圳",
    "pinyin": "jiā nán dà zùn",
    "english": "Chianan Irrigation",
    "japanese": "嘉南大圳",
    "category": "台灣近現代史・文化",
    "notes": "烏山頭水庫と連動する大規模な灌漑水路網。当時のアジア最大級の水利工事。",
    "createdAt": 1787750135719
  },
  {
    "id": "word-1787750135720-3-vyhub",
    "traditional": "縱貫線",
    "simplified": "纵贯线",
    "pinyin": "zòng guàn xiàn",
    "english": "Longitudinal Line (Railway)",
    "japanese": "縦貫線（鉄道）",
    "category": "台灣近現代史・文化",
    "notes": "日本統治時代に全通した、台湾の南北を結ぶ大動脈となる鉄道路線。",
    "createdAt": 1787750135720
  },
  {
    "id": "word-1787750135720-4-42vxr",
    "traditional": "阿里山森林鐵路",
    "simplified": "阿里山森林铁路",
    "pinyin": "ā lǐ shān sēn lín tiě lù",
    "english": "Alishan Forest Railway",
    "japanese": "阿里山森林鉄道",
    "category": "台灣近現代史・文化",
    "notes": "日本統治時代に木材（主にタイワンヒノキ）を運搬するために敷設された登山鉄道。",
    "createdAt": 1787750135720
  },
  {
    "id": "word-1787750135720-5-6rgmd",
    "traditional": "太平山林場",
    "simplified": "太平山林场",
    "pinyin": "tài píng shān lín chǎng",
    "english": "Taipingshan Forestry Center",
    "japanese": "太平山林場",
    "category": "台灣近現代史・文化",
    "notes": "台湾三大林場の一つ。日本時代に開発され、現在は国家森林遊楽区となっている。",
    "createdAt": 1787750135720
  },
  {
    "id": "word-1787750135721-6-7m1oq",
    "traditional": "台北帝國大學",
    "simplified": "台北帝国大学",
    "pinyin": "tái běi dì guó dà xué",
    "english": "Taihoku Imperial University",
    "japanese": "台北帝国大学",
    "category": "台灣近現代史・文化",
    "notes": "1928年に設立された日本で9番目の帝国大学。現在の国立台湾大学の前身。",
    "createdAt": 1787750135721
  },
  {
    "id": "word-1787750135721-7-i8qu7",
    "traditional": "台大醫院",
    "simplified": "台大医院",
    "pinyin": "tái dà yī yuàn",
    "english": "National Taiwan University Hospital",
    "japanese": "台湾大学医学部付属病院",
    "category": "台灣近現代史・文化",
    "notes": "旧台北帝国大学医学部付属病院。赤レンガ造りの旧館はルネサンス様式で歴史的建造物。",
    "createdAt": 1787750135721
  },
  {
    "id": "word-1787750135721-8-k91wz",
    "traditional": "建國中學",
    "simplified": "建国中学",
    "pinyin": "jiàn guó zhōng xué",
    "english": "Taipei Municipal Jianguo High School",
    "japanese": "建国中学（旧台北第一中学校）",
    "category": "台灣近現代史・文化",
    "notes": "台湾屈指の男子エリート校。旧制台北一中の赤レンガ建築が現在も使われている。",
    "createdAt": 1787750135721
  },
  {
    "id": "word-1787750135721-9-2cozd",
    "traditional": "台北賓館",
    "simplified": "台北宾馆",
    "pinyin": "tái běi bīn guǎn",
    "english": "Taipei Guest House",
    "japanese": "台北賓館（旧台湾総督官邸）",
    "category": "台灣近現代史・文化",
    "notes": "迎賓館として使用される華麗な洋館。かつては総督の官邸であった。",
    "createdAt": 1787750135721
  },
  {
    "id": "word-1787750135722-10-yb1x3",
    "traditional": "西門紅樓",
    "simplified": "西门红楼",
    "pinyin": "xī mén hóng lóu",
    "english": "Ximen Red House",
    "japanese": "西門紅楼",
    "category": "台灣近現代史・文化",
    "notes": "1908年に建設された台湾初の公営市場。八角形の赤レンガ建築が特徴的。",
    "createdAt": 1787750135722
  },
  {
    "id": "word-1787750135722-11-yj6if",
    "traditional": "林百貨",
    "simplified": "林百货",
    "pinyin": "lín bǎi huò",
    "english": "Hayashi Department Store",
    "japanese": "林百貨店",
    "category": "台灣近現代史・文化",
    "notes": "1932年に台南に開業した百貨店。修復され、現在もレトロな商業施設として人気を集める。",
    "createdAt": 1787750135722
  },
  {
    "id": "word-1787750135722-12-1k0pq",
    "traditional": "台中州廳",
    "simplified": "台中州厅",
    "pinyin": "tái zhōng zhōu tīng",
    "english": "Taichung Prefecture Hall",
    "japanese": "台中州庁",
    "category": "台灣近現代史・文化",
    "notes": "森山松之助の設計によるフランス風の建築。長らく台中市政府の庁舎として使われた。",
    "createdAt": 1787750135722
  },
  {
    "id": "word-1787750135722-13-oipt2",
    "traditional": "州轄市",
    "simplified": "州辖市",
    "pinyin": "zhōu xiá shì",
    "english": "Prefectural city",
    "japanese": "州轄市",
    "category": "台灣近現代史・文化",
    "notes": "日本統治時代の行政区分。この制度が現在の「市」の概念の基礎となっている。",
    "createdAt": 1787750135722
  },
  {
    "id": "word-1787750135723-14-veda0",
    "traditional": "戶口名簿",
    "simplified": "户口名簿",
    "pinyin": "hù kǒu míng bù",
    "english": "Household Registration Certificate",
    "japanese": "戸口名簿（戸籍）",
    "category": "台灣近現代史・文化",
    "notes": "日本が導入した厳格な戸籍制度の名残であり、現在も台湾の身分証明システムの基盤。",
    "createdAt": 1787750135723
  },
  {
    "id": "word-1787750135723-15-l96v8",
    "traditional": "派出所",
    "simplified": "派出所",
    "pinyin": "pài chū suǒ",
    "english": "Police Box / Police Station",
    "japanese": "派出所",
    "category": "台灣近現代史・文化",
    "notes": "警察の末端組織。日本統治時代に治安維持の要として整備され、現在も同じ名称で定着。",
    "createdAt": 1787750135723
  },
  {
    "id": "word-1787750135723-16-1ylzz",
    "traditional": "農會",
    "simplified": "农会",
    "pinyin": "nóng huì",
    "english": "Farmers' Association",
    "japanese": "農会（農業協同組合）",
    "category": "台灣近現代史・文化",
    "notes": "日本の農協制度をモデルに発展し、現在も台湾の農業と地方金融に強い影響力を持つ。",
    "createdAt": 1787750135723
  },
  {
    "id": "word-1787750135723-17-tgy9b",
    "traditional": "信用合作社",
    "simplified": "信用合作社",
    "pinyin": "xìn yòng hé zuò shè",
    "english": "Credit Cooperative",
    "japanese": "信用合作社（信用組合）",
    "category": "台灣近現代史・文化",
    "notes": "日本統治時代の産業組合法を起源とする、地域密着型の金融機関。",
    "createdAt": 1787750135723
  },
  {
    "id": "word-1787750135723-18-6kfx5",
    "traditional": "專賣局",
    "simplified": "专卖局",
    "pinyin": "zhuān mài jú",
    "english": "Monopoly Bureau",
    "japanese": "専売局",
    "category": "台灣近現代史・文化",
    "notes": "アヘン、塩、タバコ、酒などを専売した機関。総督府の重要な財源だった。",
    "createdAt": 1787750135723
  },
  {
    "id": "word-1787750135724-19-hoh4f",
    "traditional": "松山菸廠",
    "simplified": "松山烟厂",
    "pinyin": "sōng shān yān chǎng",
    "english": "Songshan Tobacco Factory",
    "japanese": "松山煙草工場",
    "category": "台灣近現代史・文化",
    "notes": "日本時代に建てられた近代的なタバコ工場。現在は「松山文創園区」としてリノベーションされている。",
    "createdAt": 1787750135724
  },
  {
    "id": "word-1787750135724-20-jz8kp",
    "traditional": "橋頭糖廠",
    "simplified": "桥头糖厂",
    "pinyin": "qiáo tóu táng chǎng",
    "english": "Qiaotou Sugar Factory",
    "japanese": "橋頭糖廠",
    "category": "台灣近現代史・文化",
    "notes": "台湾初の近代的な機械化製糖工場。台湾の製糖業の中心地だった。",
    "createdAt": 1787750135724
  },
  {
    "id": "word-1787750135724-21-ib9jn",
    "traditional": "舊山線",
    "simplified": "旧山线",
    "pinyin": "jiù shān xiàn",
    "english": "Old Mountain Line",
    "japanese": "旧山線",
    "category": "台灣近現代史・文化",
    "notes": "縦貫線の旧ルート。勝興駅や龍騰断橋など、日本時代の鉄道遺構が多く残る観光地。",
    "createdAt": 1787750135724
  },
  {
    "id": "word-1787750135724-22-zx64q",
    "traditional": "新北投車站",
    "simplified": "新北投车站",
    "pinyin": "xīn běi tóu chē zhàn",
    "english": "Xinbeitou Station",
    "japanese": "新北投駅",
    "category": "台灣近現代史・文化",
    "notes": "温泉地開発のために敷設された支線の駅。特徴的な木造駅舎が復元されている。",
    "createdAt": 1787750135724
  },
  {
    "id": "word-1787750135725-23-lym29",
    "traditional": "鐵路便當",
    "simplified": "铁路便当",
    "pinyin": "tiě lù biàn dāng",
    "english": "Railway bento",
    "japanese": "鉄道弁当（駅弁）",
    "category": "台灣近現代史・文化",
    "notes": "日本の駅弁文化が定着したもの。特に台鉄の「排骨便當（パイコー弁当）」が有名。",
    "createdAt": 1787750135725
  },
  {
    "id": "word-1787750135725-24-b21fj",
    "traditional": "榻榻米",
    "simplified": "榻榻米",
    "pinyin": "tà tà mǐ",
    "english": "Tatami",
    "japanese": "畳（たたみ）",
    "category": "台灣近現代史・文化",
    "notes": "日本統治時代に持ち込まれ、現在でも台湾の住宅や旅館で使用されることがある。",
    "createdAt": 1787750135725
  },
  {
    "id": "word-1787750135725-25-rfnbs",
    "traditional": "坪",
    "simplified": "坪",
    "pinyin": "píng",
    "english": "Ping (unit of area)",
    "japanese": "坪（面積の単位）",
    "category": "台灣近現代史・文化",
    "notes": "日本の尺貫法に由来する面積単位。台湾では現在でも不動産取引の基本単位として使われる。",
    "createdAt": 1787750135725
  },
  {
    "id": "word-1787750135725-26-uku3j",
    "traditional": "祭祀公業",
    "simplified": "祭祀公业",
    "pinyin": "jì sì gōng yè",
    "english": "Worship groups / Ancestral land trust",
    "japanese": "祭祀公業",
    "category": "台灣近現代史・文化",
    "notes": "祖先祭祀のために一族で共有する財産・土地。日本時代に法的に整理されたが、現在も複雑な土地所有問題の種となる。",
    "createdAt": 1787750135725
  },
  {
    "id": "word-1787750135726-27-mmspi",
    "traditional": "理蕃政策",
    "simplified": "理蕃政策",
    "pinyin": "lǐ fān zhèng cè",
    "english": "Aboriginal management policy",
    "japanese": "理蕃政策",
    "category": "台灣近現代史・文化",
    "notes": "日本総督府による台湾原住民族に対する統治・同化政策。武力弾圧から後に教育や農業指導へ移行した。",
    "createdAt": 1787750135726
  },
  {
    "id": "word-1787750135727-28-w5bs8",
    "traditional": "台灣博覽會",
    "simplified": "台湾博览会",
    "pinyin": "tái wān bó lǎn huì",
    "english": "The Taiwan Exposition",
    "japanese": "台湾博覧会",
    "category": "台灣近現代史・文化",
    "notes": "1935年、日本統治40周年を記念して開催され、台湾の近代化と経済発展をアピールした巨大イベント。",
    "createdAt": 1787750135727
  },
  {
    "id": "word-1787750135727-29-kzo06",
    "traditional": "蓬萊米",
    "simplified": "蓬莱米",
    "pinyin": "péng lái mǐ",
    "english": "Ponlai Rice / Japonica rice",
    "japanese": "蓬莱米（ジャポニカ米）",
    "category": "台灣近現代史・文化",
    "notes": "日本人の味覚に合うよう台湾で品種改良された米。現在の台湾で食べられている米の主流。",
    "createdAt": 1787750135727
  },
  {
    "id": "word-1787750135727-30-hofig",
    "traditional": "便當",
    "simplified": "便当",
    "pinyin": "biàn dāng",
    "english": "Bento / Lunchbox",
    "japanese": "弁当（便當）",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「弁当」がそのまま定着した語彙。日常的に使われている。",
    "createdAt": 1787750135727
  },
  {
    "id": "word-1787750135728-31-plger",
    "traditional": "看板",
    "simplified": "看板",
    "pinyin": "kàn bǎn",
    "english": "Signboard / Billboard",
    "japanese": "看板（かんばん）",
    "category": "台灣近現代史・文化",
    "notes": "店舗のサインや広告板を指す言葉として、中国語（招牌）と共に広く使われている。",
    "createdAt": 1787750135728
  },
  {
    "id": "word-1787750135728-32-76xlj",
    "traditional": "達人",
    "simplified": "达人",
    "pinyin": "dá rén",
    "english": "Expert / Master",
    "japanese": "達人",
    "category": "台灣近現代史・文化",
    "notes": "特定の分野に秀でた専門家を指す言葉。メディアや広告で頻繁に用いられる。",
    "createdAt": 1787750135728
  },
  {
    "id": "word-1787750135728-33-odybv",
    "traditional": "運將",
    "simplified": "运将",
    "pinyin": "yùn jiàng",
    "english": "Driver (Taxi/Truck)",
    "japanese": "運転手（運ちゃん）",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「運ちゃん」に由来する台湾語彙。主にタクシーやトラックの運転手を親しみを込めて呼ぶ。",
    "createdAt": 1787750135728
  },
  {
    "id": "word-1787750135729-34-k8m6q",
    "traditional": "歐吉桑",
    "simplified": "欧吉桑",
    "pinyin": "ōu jí sāng",
    "english": "Middle-aged / Old man",
    "japanese": "おじさん",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「おじさん」に漢字を当てたもの。中高年の男性を指す。",
    "createdAt": 1787750135729
  },
  {
    "id": "word-1787750135729-35-kq0ms",
    "traditional": "歐巴桑",
    "simplified": "欧巴桑",
    "pinyin": "ōu bā sāng",
    "english": "Middle-aged / Old woman",
    "japanese": "おばさん",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「おばさん」に由来。しばしば「おせっかいな中高年女性」というニュアンスも含む。",
    "createdAt": 1787750135729
  },
  {
    "id": "word-1787750135729-36-kf4re",
    "traditional": "甜不辣",
    "simplified": "甜不辣",
    "pinyin": "tián bù là",
    "english": "Tempura (Taiwanese style)",
    "japanese": "さつま揚げ（天ぷら由来）",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「天ぷら」が語源だが、日本の天ぷらではなく魚の練り物（さつま揚げ）の煮込み料理を指す。",
    "createdAt": 1787750135729
  },
  {
    "id": "word-1787750135730-37-ldlta",
    "traditional": "黑輪",
    "simplified": "黑轮",
    "pinyin": "hēi lún",
    "english": "Oden (Taiwanese style)",
    "japanese": "おでん（台湾風）",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「おでん」の台湾語発音（O-lián）に漢字を当てたもの。コンビニでもよく売られている。",
    "createdAt": 1787750135730
  },
  {
    "id": "word-1787750135730-38-78rbi",
    "traditional": "阿給",
    "simplified": "阿给",
    "pinyin": "ā gěi",
    "english": "A-gei (Stuffed fried tofu)",
    "japanese": "阿給（油揚げ由来）",
    "category": "台灣近現代史・文化",
    "notes": "油揚げ（あぶらあげ）の「あげ」に由来する淡水の名物料理。油揚げの中に春雨を詰めたもの。",
    "createdAt": 1787750135730
  },
  {
    "id": "word-1787750135731-39-bbrip",
    "traditional": "瓦斯",
    "simplified": "瓦斯",
    "pinyin": "wǎ sī",
    "english": "Gas",
    "japanese": "ガス",
    "category": "台灣近現代史・文化",
    "notes": "ガス（瓦斯）。日本時代に持ち込まれた漢字表記がそのまま定着し、プロパンガスや天然ガスを指す。",
    "createdAt": 1787750135731
  },
  {
    "id": "word-1787750135731-40-x3d4x",
    "traditional": "秀逗",
    "simplified": "秀逗",
    "pinyin": "xiù dòu",
    "english": "Short circuit / Crazy",
    "japanese": "ショート（頭がおかしくなる）",
    "category": "台灣近現代史・文化",
    "notes": "電気の「ショート」が語源。機械が故障した時や、人の頭が少しおかしい・混乱している状態を指すスラング。",
    "createdAt": 1787750135731
  },
  {
    "id": "word-1787750135732-41-duh3b",
    "traditional": "奇檬子",
    "simplified": "奇檬子",
    "pinyin": "qí méng zi",
    "english": "Mood / Feeling",
    "japanese": "気持ち（きもち）",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「気持ち」の音訳。気分が良い（奇檬子爽）や悪い（奇檬子壞）といった表現で使われる。",
    "createdAt": 1787750135732
  },
  {
    "id": "word-1787750135732-42-b5d8h",
    "traditional": "歐都拜",
    "simplified": "欧都拜",
    "pinyin": "ōu dū bài",
    "english": "Motorcycle / Scooter",
    "japanese": "オートバイ",
    "category": "台灣近現代史・文化",
    "notes": "「オートバイ」の音訳。機車（スクーター）を指す台湾語彙として高齢層を中心に日常的に使われる。",
    "createdAt": 1787750135732
  },
  {
    "id": "word-1787750135733-43-0958m",
    "traditional": "賴打",
    "simplified": "赖打",
    "pinyin": "lài dǎ",
    "english": "Lighter",
    "japanese": "ライター",
    "category": "台灣近現代史・文化",
    "notes": "火をつける「ライター」の音訳。日常的な口語として頻繁に登場する。",
    "createdAt": 1787750135733
  },
  {
    "id": "word-1787750135733-44-v40fe",
    "traditional": "羅賴把",
    "simplified": "罗赖把",
    "pinyin": "luó lài bǎ",
    "english": "Screwdriver",
    "japanese": "ドライバー（ねじ回し）",
    "category": "台灣近現代史・文化",
    "notes": "日本語の「ドライバー」が訛った台湾語の音訳。工具箱の必需品。",
    "createdAt": 1787750135733
  },
  {
    "id": "word-1787750135733-45-qve9u",
    "traditional": "控固力",
    "simplified": "控固力",
    "pinyin": "kòng gù lì",
    "english": "Concrete",
    "japanese": "コンクリート",
    "category": "台灣近現代史・文化",
    "notes": "「コンクリート」の音訳。建築や工事の現場、または人の頭が固いことを揶揄する際に使われる。",
    "createdAt": 1787750135733
  },
  {
    "id": "word-1787750135734-46-60ltn",
    "traditional": "脫線",
    "simplified": "脱线",
    "pinyin": "tuō xiàn",
    "english": "Clueless / Scatterbrained",
    "japanese": "脱線（間抜け、ボケている）",
    "category": "台灣近現代史・文化",
    "notes": "本来は列車の脱線を意味するが、転じて人が注意散漫であったり、的外れな行動をとったりすることを指す。",
    "createdAt": 1787750135734
  },
  {
    "id": "word-1787750135734-47-ak9qd",
    "traditional": "放送局",
    "simplified": "放送局",
    "pinyin": "fàng sòng jú",
    "english": "Broadcasting station",
    "japanese": "放送局",
    "category": "台灣近現代史・文化",
    "notes": "ラジオやテレビの放送を行う機関。歴史的建造物（台中放送局など）の名前としても残っている。",
    "createdAt": 1787750135734
  },
  {
    "id": "word-1787750135735-48-chs8i",
    "traditional": "案內所",
    "simplified": "案内所",
    "pinyin": "àn nèi suǒ",
    "english": "Information center",
    "japanese": "案内所",
    "category": "台灣近現代史・文化",
    "notes": "観光地などのインフォメーションセンター。日本文化の影響でそのまま看板に使われることが多い。",
    "createdAt": 1787750135735
  },
  {
    "id": "word-1787750135735-49-ctpj0",
    "traditional": "料金",
    "simplified": "料金",
    "pinyin": "liào jīn",
    "english": "Fee / Charge",
    "japanese": "料金",
    "category": "台灣近現代史・文化",
    "notes": "駐車場やサービス業などで、日本語のニュアンスを出して「料金」とそのまま表記されることがある。",
    "createdAt": 1787750135735
  },
  {
    "id": "word-1787750135736-50-px3sf",
    "traditional": "八田與一",
    "simplified": "八田与一",
    "pinyin": "bā tián yǔ yī",
    "english": "Hatta Yoichi",
    "japanese": "八田與一",
    "category": "人物",
    "notes": "台湾南部の農業を救った烏山頭ダム・嘉南大圳の設計・建設を指揮した日本人技師。台湾で最も尊敬される日本人の一人。",
    "createdAt": 1787750135736
  },
  {
    "id": "word-1787750135736-51-r6gv2",
    "traditional": "後藤新平",
    "simplified": "后藤新平",
    "pinyin": "hòu téng xīn píng",
    "english": "Goto Shinpei",
    "japanese": "後藤新平",
    "category": "人物",
    "notes": "台湾総督府の民政長官。生物学の原則に基づく「台湾の旧慣調査」を行い、インフラ整備や衛生改善など近代化の礎を築いた。",
    "createdAt": 1787750135736
  },
  {
    "id": "word-1787750135736-52-4mpd6",
    "traditional": "兒玉源太郎",
    "simplified": "儿玉源太郎",
    "pinyin": "ér yù yuán tài láng",
    "english": "Kodama Gentaro",
    "japanese": "児玉源太郎",
    "category": "人物",
    "notes": "第4代台湾総督。後藤新平を重用し、軍事と行政の両面で台湾統治を安定化させた。",
    "createdAt": 1787750135736
  },
  {
    "id": "word-1787750135737-53-i4168",
    "traditional": "乃木希典",
    "simplified": "乃木希典",
    "pinyin": "nǎi mù xī diǎn",
    "english": "Nogi Maresuke",
    "japanese": "乃木希典",
    "category": "人物",
    "notes": "第3代台湾総督。抗日ゲリラの鎮圧に苦戦し、一時台湾売却論にも傾いた軍人。",
    "createdAt": 1787750135737
  },
  {
    "id": "word-1787750135737-54-tee1e",
    "traditional": "樺山資紀",
    "simplified": "桦山资纪",
    "pinyin": "huà shān zī jì",
    "english": "Kabayama Sukenori",
    "japanese": "樺山資紀",
    "category": "人物",
    "notes": "初代台湾総督。日清戦争後に台湾接収を指揮したが、台湾民主国の抵抗に遭い武力弾圧を行った。",
    "createdAt": 1787750135737
  },
  {
    "id": "word-1787750135738-55-o8wh9",
    "traditional": "伊澤修二",
    "simplified": "伊泽修二",
    "pinyin": "yī zé xiū èr",
    "english": "Izawa Shuji",
    "japanese": "伊澤修二",
    "category": "人物",
    "notes": "台湾総督府の初代学務部長。芝山巌学堂を設立し、台湾における日本語教育の基礎を作った。",
    "createdAt": 1787750135738
  },
  {
    "id": "word-1787750135738-56-f3l88",
    "traditional": "磯永吉",
    "simplified": "矶永吉",
    "pinyin": "jī yǒng jí",
    "english": "Iso Eikichi",
    "japanese": "磯永吉",
    "category": "人物",
    "notes": "農業学者。「蓬莱米の父」と呼ばれ、台湾の気候に適した美味しい米の品種改良に成功した。",
    "createdAt": 1787750135738
  },
  {
    "id": "word-1787750135739-57-vexcp",
    "traditional": "鳥居龍藏",
    "simplified": "鸟居龙藏",
    "pinyin": "niǎo jū lóng cáng",
    "english": "Torii Ryuzo",
    "japanese": "鳥居龍蔵",
    "category": "人物",
    "notes": "人類学者。台湾の原住民族を広範にフィールドワークし、その生活や文化を写真と記録に残した。",
    "createdAt": 1787750135739
  },
  {
    "id": "word-1787750135739-58-uph52",
    "traditional": "森山松之助",
    "simplified": "森山松之助",
    "pinyin": "sēn shān sōng zhī zhù",
    "english": "Moriyama Matsunosuke",
    "japanese": "森山松之助",
    "category": "人物",
    "notes": "総督府の営繕組織で活躍した建築家。総督府（現・總統府）や台中州庁など多くの官庁建築を手掛けた。",
    "createdAt": 1787750135739
  },
  {
    "id": "word-1787750135740-59-zd1d6",
    "traditional": "辰野金吾",
    "simplified": "辰野金吾",
    "pinyin": "chén yě jīn wú",
    "english": "Tatsuno Kingo",
    "japanese": "辰野金吾",
    "category": "人物",
    "notes": "日本の近代建築の父。彼の設計スタイル（辰野式：赤レンガと白い石の帯）は台湾の多くの公共建築に強い影響を与えた。",
    "createdAt": 1787750135740
  },
  {
    "id": "word-1787750135741-60-emxps",
    "traditional": "蔣渭水",
    "simplified": "蒋渭水",
    "pinyin": "jiǎng wèi shuǐ",
    "english": "Chiang Wei-shui",
    "japanese": "蔣渭水",
    "category": "人物",
    "notes": "医師であり非暴力の社会運動家。「台湾文化協会」を設立し、日本統治下の台湾人の啓蒙と民族運動を指導した。「台湾の孫文」とも呼ばれる。",
    "createdAt": 1787750135741
  },
  {
    "id": "word-1787750135741-61-6im5p",
    "traditional": "林獻堂",
    "simplified": "林献堂",
    "pinyin": "lín xiàn táng",
    "english": "Lin Hsien-tang",
    "japanese": "林献堂",
    "category": "人物",
    "notes": "台中霧峰の富豪で、台湾議会設置請願運動などを主導した穏健派の政治運動家。",
    "createdAt": 1787750135741
  },
  {
    "id": "word-1787750135741-62-411qk",
    "traditional": "莫那·魯道",
    "simplified": "莫那·鲁道",
    "pinyin": "mò nà lǔ dào",
    "english": "Mona Rudao",
    "japanese": "モーナ・ルダオ",
    "category": "人物",
    "notes": "セデック族マヘボ社の頭目。日本警察の圧政に耐えかね、1930年に霧社事件（大規模な抗日蜂起）を起こした。",
    "createdAt": 1787750135741
  },
  {
    "id": "word-1787750135741-63-cji2p",
    "traditional": "賴和",
    "simplified": "赖和",
    "pinyin": "lài hé",
    "english": "Lai He",
    "japanese": "頼和",
    "category": "人物",
    "notes": "医師であり作家。「台湾新文学の父」と称され、植民地体制下の民衆の苦難を描き、社会運動にも参加した。",
    "createdAt": 1787750135741
  },
  {
    "id": "word-1787750135742-64-z1o8j",
    "traditional": "鄧雨賢",
    "simplified": "邓雨贤",
    "pinyin": "dèng yǔ xián",
    "english": "Teng Yu-hsien",
    "japanese": "鄧雨賢",
    "category": "人物",
    "notes": "台湾の著名な作曲家。「雨夜花」「望春風」など、台湾人の心を打つ数多くの名曲（台湾語歌謡）を残した。",
    "createdAt": 1787750135742
  },
  {
    "id": "word-1787750135742-65-y4ufi",
    "traditional": "杜聰明",
    "simplified": "杜聪明",
    "pinyin": "dù cōng míng",
    "english": "Tu Tsung-ming",
    "japanese": "杜聡明",
    "category": "人物",
    "notes": "台湾人初の医学博士。アヘン中毒の治療やヘビ毒の研究で多大な功績を残し、戦後は高雄医学院を創設した。",
    "createdAt": 1787750135742
  },
  {
    "id": "word-1787750135742-66-iavjp",
    "traditional": "李梅樹",
    "simplified": "李梅树",
    "pinyin": "lǐ méi shù",
    "english": "Li Mei-shu",
    "japanese": "李梅樹",
    "category": "人物",
    "notes": "台湾を代表する画家。三峡祖師廟の再建に半生を捧げ、「東洋の芸術の殿堂」と呼ばれるまで精緻な彫刻を施した。",
    "createdAt": 1787750135742
  },
  {
    "id": "word-1787750135742-67-4cdsq",
    "traditional": "陳澄波",
    "simplified": "陈澄波",
    "pinyin": "chén chéng bō",
    "english": "Chen Cheng-po",
    "japanese": "陳澄波",
    "category": "人物",
    "notes": "台湾人画家として初めて帝展に入選した油彩画家。二二八事件の際、軍との交渉に赴いて銃殺された悲劇の人物。",
    "createdAt": 1787750135742
  },
  {
    "id": "word-1787750135742-68-r54jm",
    "traditional": "連橫",
    "simplified": "连横",
    "pinyin": "lián héng",
    "english": "Lien Heng",
    "japanese": "連横",
    "category": "人物",
    "notes": "歴史家であり詩人。台湾の歴史を体系的にまとめた大著『台湾通史』を編纂した。連戦（元副総統）の祖父。",
    "createdAt": 1787750135742
  },
  {
    "id": "word-1787750135743-69-gicku",
    "traditional": "辜顯榮",
    "simplified": "辜显荣",
    "pinyin": "gū xiǎn róng",
    "english": "Koo Hsien-jung",
    "japanese": "辜顕栄",
    "category": "人物",
    "notes": "日本軍の台北入城を無血で手引きし、総督府とのパイプを築いて塩やアヘンの専売権を得て巨大な富を築いた実業家。",
    "createdAt": 1787750135743
  },
  {
    "id": "word-1787750135743-70-c17r0",
    "traditional": "張忠謀",
    "simplified": "张忠谋",
    "pinyin": "zhāng zhōng móu",
    "english": "Morris Chang",
    "japanese": "モリス・チャン",
    "category": "人物",
    "notes": "台湾積体電路製造（TSMC）の創業者。台湾を世界の半導体産業の中心へと押し上げた「半導体の父」。",
    "createdAt": 1787750135743
  },
  {
    "id": "word-1787750135743-71-6v5yb",
    "traditional": "郭台銘",
    "simplified": "郭台铭",
    "pinyin": "guō tái míng",
    "english": "Terry Gou",
    "japanese": "郭台銘（テリー・ゴウ）",
    "category": "人物",
    "notes": "鴻海（フォックスコン）の創業者。一代で世界最大のEMS（電子機器受託生産）企業を築き上げ、総統選にも度々意欲を見せた。",
    "createdAt": 1787750135743
  },
  {
    "id": "word-1787750135743-72-tcex9",
    "traditional": "黃仁勳",
    "simplified": "黄仁勋",
    "pinyin": "huáng rén xūn",
    "english": "Jensen Huang",
    "japanese": "ジェンスン・フアン",
    "category": "人物",
    "notes": "NVIDIA（エヌビディア）の共同創業者兼CEO。台湾・台南生まれで、AIブームを牽引する世界的ITリーダー。",
    "createdAt": 1787750135743
  },
  {
    "id": "word-1787750135744-73-knudy",
    "traditional": "蘇姿丰",
    "simplified": "苏姿丰",
    "pinyin": "sū zī fēng",
    "english": "Lisa Su",
    "japanese": "リサ・スー",
    "category": "人物",
    "notes": "AMDのCEO。台湾・台南生まれ。倒産の危機にあったAMDをV字回復させ、半導体業界のトップに返り咲かせた。",
    "createdAt": 1787750135744
  },
  {
    "id": "word-1787750135744-74-dqd17",
    "traditional": "魏哲家",
    "simplified": "魏哲家",
    "pinyin": "wèi zhé jiā",
    "english": "C.C. Wei",
    "japanese": "魏哲家",
    "category": "人物",
    "notes": "TSMCの現董事長兼CEO。地政学的リスクが高まる中、TSMCのグローバル展開（日本や米国への工場建設）を指揮する。",
    "createdAt": 1787750135744
  },
  {
    "id": "word-1787750135744-75-oscbw",
    "traditional": "劉德音",
    "simplified": "刘德音",
    "pinyin": "liú dé yīn",
    "english": "Mark Liu",
    "japanese": "劉徳音",
    "category": "人物",
    "notes": "TSMCの前董事長。張忠謀の引退後、魏哲家と共にTSMCの黄金期を支え、2024年に退任した。",
    "createdAt": 1787750135744
  },
  {
    "id": "word-1787750135744-76-zaxxl",
    "traditional": "蔡明介",
    "simplified": "蔡明介",
    "pinyin": "cài míng jiè",
    "english": "Ming-Kai Tsai",
    "japanese": "蔡明介",
    "category": "人物",
    "notes": "聯發科技（メディアテック）の董事長。台湾におけるファブレス半導体設計の第一人者。",
    "createdAt": 1787750135744
  },
  {
    "id": "word-1787750135745-77-lv26k",
    "traditional": "童子賢",
    "simplified": "童子贤",
    "pinyin": "tóng zǐ xián",
    "english": "Tung Tzu-hsien",
    "japanese": "童子賢",
    "category": "人物",
    "notes": "和碩（ペガトロン）の董事長。IT産業のトップでありながら、エネルギー政策（原発容認論など）で発言力を増している。",
    "createdAt": 1787750135745
  },
  {
    "id": "word-1787750135745-78-nzg2r",
    "traditional": "蕭美琴",
    "simplified": "萧美琴",
    "pinyin": "xiāo měi qín",
    "english": "Hsiao Bi-khim",
    "japanese": "蕭美琴",
    "category": "人物",
    "notes": "中華民国の現副総統（頼清徳政権）。長らく駐米代表を務め、アメリカとの強固な信頼関係を築き上げた外交のエキスパート。",
    "createdAt": 1787750135745
  },
  {
    "id": "word-1787750135745-79-75gyf",
    "traditional": "蔣萬安",
    "simplified": "蒋万安",
    "pinyin": "jiǎng wàn ān",
    "english": "Chiang Wan-an",
    "japanese": "蔣万安",
    "category": "人物",
    "notes": "現台北市長（国民党）。蔣介石の曾孫とされる。若手エリートとして将来の総統候補と目されている。",
    "createdAt": 1787750135745
  },
  {
    "id": "word-1787750135746-80-chozy",
    "traditional": "盧秀燕",
    "simplified": "卢秀燕",
    "pinyin": "lú xiù yàn",
    "english": "Lu Shiow-yen",
    "japanese": "盧秀燕",
    "category": "人物",
    "notes": "現台中市長（国民党）。高い支持率を誇り「媽媽市長（お母さん市長）」の愛称で親しまれ、国民党内の最有力人物の一人。",
    "createdAt": 1787750135746
  },
  {
    "id": "word-1787750135747-81-z3wv3",
    "traditional": "陳其邁",
    "simplified": "陈其迈",
    "pinyin": "chén qí mài",
    "english": "Chen Chi-mai",
    "japanese": "陳其邁",
    "category": "人物",
    "notes": "現高雄市長（民進党）。医師出身。TSMCの高雄誘致など、ハイテク産業への転換を強力に推進している。",
    "createdAt": 1787750135747
  },
  {
    "id": "word-1787750135747-82-jpmns",
    "traditional": "黃國昌",
    "simplified": "黄国昌",
    "pinyin": "huáng guó chāng",
    "english": "Huang Kuo-chang",
    "japanese": "黄国昌",
    "category": "人物",
    "notes": "台湾民眾党の立法委員。かつてひまわり学生運動のリーダー格であり、鋭い国会質疑とポピュリズム的手法で賛否両論を集める。",
    "createdAt": 1787750135747
  },
  {
    "id": "word-1787750135747-83-higwn",
    "traditional": "卓榮泰",
    "simplified": "卓荣泰",
    "pinyin": "zhuó róng tài",
    "english": "Cho Jung-tai",
    "japanese": "卓栄泰",
    "category": "人物",
    "notes": "頼清徳政権の初代行政院長（首相）。調整型の政治家として、少数与党の国会運営の舵取りを担う。",
    "createdAt": 1787750135747
  },
  {
    "id": "word-1787750135748-84-bnhlp",
    "traditional": "鄭文燦",
    "simplified": "郑文灿",
    "pinyin": "zhèng wén càn",
    "english": "Cheng Wen-tsan",
    "japanese": "鄭文燦",
    "category": "人物",
    "notes": "元桃園市長、元行政院副院長。民進党のホープだったが、2024年に市長時代の土地開発を巡る収賄容疑で逮捕され失脚した。",
    "createdAt": 1787750135748
  },
  {
    "id": "word-1787750135748-85-86m9k",
    "traditional": "高虹安",
    "simplified": "高虹安",
    "pinyin": "gāo hóng ān",
    "english": "Kao Hung-an",
    "japanese": "高虹安",
    "category": "人物",
    "notes": "前新竹市長。民眾党のスターとして当選したが、立法委員時代の議員助成金不正流用容疑で有罪判決を受け、職務停止となった。",
    "createdAt": 1787750135748
  },
  {
    "id": "word-1787750135748-86-pc6gq",
    "traditional": "林飛帆",
    "simplified": "林飞帆",
    "pinyin": "lín fēi fán",
    "english": "Lin Fei-fan",
    "japanese": "林飛帆",
    "category": "人物",
    "notes": "ひまわり学生運動の中心的リーダーの一人。後に民進党の副秘書長を務め、現在は国家安全会議（国安会）の要職に就く若手政治家。",
    "createdAt": 1787750135748
  },
  {
    "id": "word-1787750135749-87-byzxv",
    "traditional": "唐鳳",
    "simplified": "唐凤",
    "pinyin": "táng fèng",
    "english": "Audrey Tang",
    "japanese": "オードリー・タン（唐鳳）",
    "category": "人物",
    "notes": "元デジタル発展部長（IT担当相）。シビックハッカーとしてコロナ禍のマスクマップ開発などで活躍したが、詐欺対策の遅れ等で批判も受け退任。",
    "createdAt": 1787750135749
  },
  {
    "id": "word-1787750135749-88-gyx8e",
    "traditional": "吳崢",
    "simplified": "吴峥",
    "pinyin": "wú zhēng",
    "english": "Wu Cheng",
    "japanese": "呉崢",
    "category": "人物",
    "notes": "民進党のスポークスマン。ひまわり学生運動出身で、ネット番組やSNSでの広報活動を通じて若年層へのアピールを担う。",
    "createdAt": 1787750135749
  },
  {
    "id": "word-1787750135749-89-qzw11",
    "traditional": "徐巧芯",
    "simplified": "徐巧芯",
    "pinyin": "xú qiǎo xīn",
    "english": "Hsu Chiao-hsin",
    "japanese": "徐巧芯",
    "category": "人物",
    "notes": "国民党の若手立法委員。「戦狼」とも呼ばれる攻撃的なネット戦術と内部告発で注目を集めるが、親族の詐欺事件などで物議を醸す。",
    "createdAt": 1787750135749
  },
  {
    "id": "word-1787750135750-90-b5ylm",
    "traditional": "都市更新",
    "simplified": "都市更新",
    "pinyin": "dū shì gēng xīn",
    "english": "Urban Renewal",
    "japanese": "都市更新（都更 / 再開発）",
    "category": "政治・社會問題",
    "notes": "老朽化した建物の建て替え事業。地震の多い台湾では急務だが、権利関係が複雑で遅々として進まない。",
    "createdAt": 1787750135750
  },
  {
    "id": "word-1787750135750-91-jyn9v",
    "traditional": "區段徵收",
    "simplified": "区段征收",
    "pinyin": "qū duàn zhēng shōu",
    "english": "Zone Expropriation",
    "japanese": "区画収用",
    "category": "政治・社會問題",
    "notes": "新都市開発の際、政府が一定エリアの土地を強制的に買い上げ、区画整理後に一部を地主に返す制度。度々「土地の略奪」として抗議運動が起きる。",
    "createdAt": 1787750135750
  },
  {
    "id": "word-1787750135751-92-11zr0",
    "traditional": "容積率",
    "simplified": "容积率",
    "pinyin": "róng jī lǜ",
    "english": "Floor Area Ratio (FAR)",
    "japanese": "容積率",
    "category": "政治・社會問題",
    "notes": "敷地面積に対する延床面積の割合。柯文哲・前台北市長らが絡む「京華城案」など、容積率の特例緩和が巨大な利権や汚職の温床となっている。",
    "createdAt": 1787750135751
  },
  {
    "id": "word-1787750135751-93-gswkk",
    "traditional": "釘子戶",
    "simplified": "钉子户",
    "pinyin": "dīng zǐ hù",
    "english": "Nail House / Holdout",
    "japanese": "立ち退き拒否住戸",
    "category": "政治・社會問題",
    "notes": "都市更新や公共工事の際、立ち退きに応じず最後まで居座る住居。社会問題化することが多い。",
    "createdAt": 1787750135751
  },
  {
    "id": "word-1787750135752-94-3n0qg",
    "traditional": "囤房稅",
    "simplified": "囤房税",
    "pinyin": "tún fáng shuì",
    "english": "Hoarding Tax / Empty Home Tax",
    "japanese": "空き家税（複数不動産所有税）",
    "category": "政治・社會問題",
    "notes": "投資目的で複数の住宅を空き家のまま放置する所有者に対し、税率を高くして住宅市場への供給を促す税制。",
    "createdAt": 1787750135752
  },
  {
    "id": "word-1787750135752-95-wbv8d",
    "traditional": "社會住宅",
    "simplified": "社会住宅",
    "pinyin": "shè huì zhù xié",
    "english": "Social Housing",
    "japanese": "社会住宅（公営住宅）",
    "category": "政治・社會問題",
    "notes": "政府が建設・管理し、若者や低所得者に市場より安く貸し出す住宅。供給不足の解消が歴代政権の大きな公約となっている。",
    "createdAt": 1787750135752
  },
  {
    "id": "word-1787750135752-96-hw2q3",
    "traditional": "炒房",
    "simplified": "炒房",
    "pinyin": "chǎo fáng",
    "english": "Real estate speculation",
    "japanese": "不動産投機（マンション転売）",
    "category": "政治・社會問題",
    "notes": "短期間で不動産を転売して利益を得る行為。これが住宅価格高騰の元凶とされ、政府は厳しい規制を敷いている。",
    "createdAt": 1787750135752
  },
  {
    "id": "word-1787750135753-97-0jvez",
    "traditional": "農地工廠",
    "simplified": "农地工厂",
    "pinyin": "nóng dì gōng chǎng",
    "english": "Illegal factories on agricultural land",
    "japanese": "農地工場（違法工場）",
    "category": "政治・社會問題",
    "notes": "農業用地に違法に建てられた工場。台湾の中小企業を支える反面、環境汚染や安全上の深刻な問題となっている。",
    "createdAt": 1787750135753
  },
  {
    "id": "word-1787750135753-98-8fapk",
    "traditional": "公設保留地",
    "simplified": "公设保留地",
    "pinyin": "gōng shè bǎo liú dì",
    "english": "Public facility reserved land",
    "japanese": "公共施設保留地",
    "category": "政治・社會問題",
    "notes": "将来の道路や学校のために都市計画で指定されたが、政府の資金不足で長年買い取られず、所有者が開発できないまま放置されている土地。",
    "createdAt": 1787750135753
  },
  {
    "id": "word-1787750135754-99-zczdy",
    "traditional": "違章建築",
    "simplified": "违章建筑",
    "pinyin": "wéi zhāng jiàn zhù",
    "english": "Illegal construction",
    "japanese": "違法建築（違建）",
    "category": "政治・社會問題",
    "notes": "建蔽率・容積率を無視した屋上の増築（頂樓加蓋）やベランダの張り出しなど。台湾の街並みの特徴でもあるが、火災時の危険性が高い。",
    "createdAt": 1787750135754
  },
  {
    "id": "word-1787750135754-100-j3t02",
    "traditional": "房價所得比",
    "simplified": "房价所得比",
    "pinyin": "fáng jià suǒ dé bǐ",
    "english": "Housing price to income ratio",
    "japanese": "住宅価格所得比",
    "category": "政治・社會問題",
    "notes": "平均年収に対して家を買うのに何年かかるかを示す指標。台北市などは世界トップクラスの高さで、若者の絶望感に繋がっている。",
    "createdAt": 1787750135754
  },
  {
    "id": "word-1787750135754-101-d7s2y",
    "traditional": "爛尾樓",
    "simplified": "烂尾楼",
    "pinyin": "làn wěi lóu",
    "english": "Unfinished building project",
    "japanese": "未完成放置建築",
    "category": "政治・社會問題",
    "notes": "建設会社が資金繰りに行き詰まり、工事が途中で放棄された廃墟状態のマンション。購入者が泣き寝入りするケースが相次ぐ。",
    "createdAt": 1787750135754
  },
  {
    "id": "word-1787750135755-102-d1bx6",
    "traditional": "實價登錄",
    "simplified": "实价登录",
    "pinyin": "shí jià dēng lù",
    "english": "Actual price registration",
    "japanese": "実勢価格登録制度",
    "category": "政治・社會問題",
    "notes": "不動産取引の不透明さを解消するため、実際の売買価格の政府への登録・公開を義務付けた制度。",
    "createdAt": 1787750135755
  },
  {
    "id": "word-1787750135755-103-5f7co",
    "traditional": "房地合一稅",
    "simplified": "房地合一税",
    "pinyin": "fáng dì hé yī shuì",
    "english": "Integrated housing and land tax",
    "japanese": "不動産合一税",
    "category": "政治・社會問題",
    "notes": "不動産投機を抑制するため、土地と建物の売却益を合算して課税し、短期転売には重税を課す制度。",
    "createdAt": 1787750135755
  },
  {
    "id": "word-1787750135756-104-j4hx3",
    "traditional": "豪宅稅",
    "simplified": "豪宅税",
    "pinyin": "háo zhái shuì",
    "english": "Luxury property tax",
    "japanese": "豪邸税",
    "category": "政治・社會問題",
    "notes": "一定の条件（高価格・大面積など）を満たす高級住宅に対して課される高い家屋税。",
    "createdAt": 1787750135756
  },
  {
    "id": "word-1787750135756-105-ppksb",
    "traditional": "土地重劃",
    "simplified": "土地重划",
    "pinyin": "tǔ dì chóng huà",
    "english": "Land consolidation",
    "japanese": "土地区画整理",
    "category": "政治・社會問題",
    "notes": "不規則な土地を整理し、道路や公園を整備して地権者に分配する事業。巨額の利益が絡むため汚職事件が絶えない。",
    "createdAt": 1787750135756
  },
  {
    "id": "word-1787750135756-106-nryf5",
    "traditional": "行人地獄",
    "simplified": "行人地狱",
    "pinyin": "xíng rén dì yù",
    "english": "Pedestrian hell",
    "japanese": "歩行者地獄",
    "category": "政治・社會問題",
    "notes": "台湾の交通マナーの悪さや、歩道がバイクや看板に占拠されて歩行者が危険に晒されている状況を外国メディアが揶揄した言葉。",
    "createdAt": 1787750135756
  },
  {
    "id": "word-1787750135756-107-bibox",
    "traditional": "區間測速",
    "simplified": "区间测速",
    "pinyin": "qū jiān cè sù",
    "english": "Average speed camera",
    "japanese": "区間速度測定",
    "category": "政治・社會問題",
    "notes": "一定区間の通過時間から平均速度を算出し、スピード違反を取り締まるシステム。安全対策だが「政府の集金マシン」との批判も強い。",
    "createdAt": 1787750135756
  },
  {
    "id": "word-1787750135757-108-jhpuc",
    "traditional": "捷運延伸線",
    "simplified": "捷运延伸线",
    "pinyin": "jié yùn yán shēn xiàn",
    "english": "MRT extension line",
    "japanese": "MRT（地下鉄）延伸線",
    "category": "政治・社會問題",
    "notes": "地方選挙の際、各候補者がこぞって公約に掲げる交通インフラ。採算度外視で政治的に決定されることが多い。",
    "createdAt": 1787750135757
  },
  {
    "id": "word-1787750135757-109-t5h1a",
    "traditional": "高鐵南延",
    "simplified": "高铁南延",
    "pinyin": "gāo tiě nán yán",
    "english": "HSR southern extension",
    "japanese": "台湾新幹線南部延伸問題",
    "category": "政治・社會問題",
    "notes": "現在の終点である左営（高雄）から屏東方面へ新幹線を延伸する計画。ルート設定や費用対効果を巡り激しい論争がある。",
    "createdAt": 1787750135757
  },
  {
    "id": "word-1787750135757-110-h5n0u",
    "traditional": "軌道建設",
    "simplified": "轨道建设",
    "pinyin": "guǐ dào jiàn shè",
    "english": "Railway infrastructure",
    "japanese": "軌道インフラ建設",
    "category": "政治・社會問題",
    "notes": "「前瞻基礎建設計画（将来を見据えたインフラ計画）」の目玉。地方にライトレール等を乱造し、将来の財政負担になるという批判がある。",
    "createdAt": 1787750135757
  },
  {
    "id": "word-1787750135757-111-6iyq3",
    "traditional": "蚊子館",
    "simplified": "蚊子馆",
    "pinyin": "wén zi guǎn",
    "english": "Mosquito hall / White elephant",
    "japanese": "蚊の館（箱物行政の成れの果て）",
    "category": "政治・社會問題",
    "notes": "多額の税金で建設されたものの、利用者がおらず廃墟同然となり、蚊が湧く状態になっている公共施設。",
    "createdAt": 1787750135757
  },
  {
    "id": "word-1787750135757-112-300ji",
    "traditional": "國土計畫法",
    "simplified": "国土计划法",
    "pinyin": "guó tǔ jì huà fǎ",
    "english": "National Spatial Planning Act",
    "japanese": "国土計画法",
    "category": "政治・社會問題",
    "notes": "無秩序な開発を防ぐため、土地の用途（農業・都市・保全など）を厳格に指定する法律。農地の開発制限を恐れる地方からの反発が強い。",
    "createdAt": 1787750135757
  },
  {
    "id": "word-1787750135758-113-jmwsq",
    "traditional": "水資源分配",
    "simplified": "水资源分配",
    "pinyin": "shuǐ zī yuán fēn pèi",
    "english": "Water resource allocation",
    "japanese": "水資源の配分",
    "category": "政治・社會問題",
    "notes": "渇水時、莫大な水を使う半導体工場（工業用水）を優先し、農業用水を停止する政策が、農民の不満を引き起こしている。",
    "createdAt": 1787750135758
  },
  {
    "id": "word-1787750135758-114-b2y0b",
    "traditional": "海水淡化廠",
    "simplified": "海水淡化厂",
    "pinyin": "hǎi shuǐ dàn huà chǎng",
    "english": "Desalination plant",
    "japanese": "海水淡水化プラント",
    "category": "政治・社會問題",
    "notes": "慢性的な水不足（特にハイテク産業の集中する新竹や中南部）を解消するためのインフラとして建設が進められている。",
    "createdAt": 1787750135758
  },
  {
    "id": "word-1787750135758-115-u66ow",
    "traditional": "土地正義",
    "simplified": "土地正义",
    "pinyin": "tǔ dì zhèng yì",
    "english": "Land justice",
    "japanese": "土地の正義",
    "category": "政治・社會問題",
    "notes": "政府や大企業による不当な土地収用から、農民や地域住民の居住権・財産権を守ろうとする社会運動のスローガン。",
    "createdAt": 1787750135758
  },
  {
    "id": "word-1787750135758-116-8t58c",
    "traditional": "迫遷",
    "simplified": "迫迁",
    "pinyin": "pò qiān",
    "english": "Forced eviction",
    "japanese": "強制立ち退き",
    "category": "政治・社會問題",
    "notes": "公共事業や再開発を理由に、住民が望まない形で家や土地から追い出されること。「大埔事件」などが有名。",
    "createdAt": 1787750135758
  },
  {
    "id": "word-1787750135758-117-et45m",
    "traditional": "環境影響評估",
    "simplified": "环境影响评估",
    "pinyin": "huán jìng yǐng xiǎng píng gū",
    "english": "Environmental Impact Assessment (EIA)",
    "japanese": "環境アセスメント",
    "category": "政治・社會問題",
    "notes": "略称は「環評」。工場や開発事業が環境に与える影響を審査する。ここで承認が下りず、投資計画が頓挫することもある。",
    "createdAt": 1787750135758
  },
  {
    "id": "word-1787750135759-118-1mmm0",
    "traditional": "藻礁保育",
    "simplified": "藻礁保育",
    "pinyin": "zǎo jiāo bǎo yù",
    "english": "Algal reef conservation",
    "japanese": "藻礁（石灰藻のサンゴ礁）の保護",
    "category": "政治・社會問題",
    "notes": "桃園の貴重な藻礁海岸に天然ガス（LNG）受け入れ基地を建設する計画に対し、環境保護団体が激しい反対運動を展開した問題。",
    "createdAt": 1787750135759
  },
  {
    "id": "word-1787750135759-119-h1a78",
    "traditional": "國家公園",
    "simplified": "国家公园",
    "pinyin": "guó jiā gōng yuán",
    "english": "National Park",
    "japanese": "国家公園",
    "category": "政治・社會問題",
    "notes": "豊かな自然や歴史を保護するための区域。台湾には玉山や太魯閣など9つの国家公園があるが、内部の先住民族の権利等で摩擦も起きる。",
    "createdAt": 1787750135759
  },
  {
    "id": "word-1787750135759-120-r585m",
    "traditional": "半導體供應鏈",
    "simplified": "半导体供应链",
    "pinyin": "bàn dǎo tǐ gōng yìng liàn",
    "english": "Semiconductor supply chain",
    "japanese": "半導体サプライチェーン",
    "category": "產業・經濟",
    "notes": "設計から製造、封止・検査に至るまで、台湾に極度に集積し、世界経済の生命線を握っている産業網。",
    "createdAt": 1787750135759
  },
  {
    "id": "word-1787750135759-121-vz605",
    "traditional": "晶圓代工",
    "simplified": "晶圆代工",
    "pinyin": "jīng yuán dài gōng",
    "english": "Foundry",
    "japanese": "ファウンドリ（半導体受託製造）",
    "category": "產業・經濟",
    "notes": "自社で設計を行わず、他社から設計図を受け取って半導体チップの製造のみに特化するビジネスモデル。TSMCが世界を牽引する。",
    "createdAt": 1787750135759
  },
  {
    "id": "word-1787750135759-122-ipa6n",
    "traditional": "封裝測試",
    "simplified": "封装测试",
    "pinyin": "fēng zhuāng cè shì",
    "english": "Packaging and testing",
    "japanese": "パッケージング・テスト（後工程）",
    "category": "產業・經濟",
    "notes": "略称は「封測」。製造されたチップを保護し、動作確認を行う工程。台湾の日月光（ASE）が世界最大のシェアを持つ。",
    "createdAt": 1787750135759
  },
  {
    "id": "word-1787750135760-123-dpeic",
    "traditional": "矽盾",
    "simplified": "硅盾",
    "pinyin": "xì dùn",
    "english": "Silicon Shield",
    "japanese": "シリコンの盾",
    "category": "產業・經濟",
    "notes": "台湾が最先端半導体を独占的に製造している事実が、中国の武力侵攻を躊躇させ、アメリカの防衛介入を引き出す「安全保障上の盾」となっているという概念。",
    "createdAt": 1787750135760
  },
  {
    "id": "word-1787750135760-124-e9j7z",
    "traditional": "綠色能源",
    "simplified": "绿色能源",
    "pinyin": "lǜ sè néng yuán",
    "english": "Green energy",
    "japanese": "グリーンエネルギー",
    "category": "產業・經濟",
    "notes": "略称は「綠能」。脱原発とカーボンニュートラルを目指す台湾政府にとって最重要課題だが、利権絡みの汚職（綠能弊案）が続発している。",
    "createdAt": 1787750135760
  },
  {
    "id": "word-1787750135760-125-ln9zk",
    "traditional": "離岸風電",
    "simplified": "离岸风电",
    "pinyin": "lí àn fēng diàn",
    "english": "Offshore wind power",
    "japanese": "洋上風力発電",
    "category": "產業・經濟",
    "notes": "台湾海峡の強い風を利用する発電。政府が強力に推進しているが、開発コストの高騰や外資の撤退懸念が課題。",
    "createdAt": 1787750135760
  },
  {
    "id": "word-1787750135760-126-tv25w",
    "traditional": "太陽能光電板",
    "simplified": "太阳能光电板",
    "pinyin": "tài yáng néng guāng diàn bǎn",
    "english": "Solar photovoltaic panels",
    "japanese": "太陽光パネル",
    "category": "產業・經濟",
    "notes": "中南部の農地や養殖池に大量の太陽光パネルが敷き詰められ、「農業と発電の共生」の理想に反して生態系や景観を破壊しているとの批判がある。",
    "createdAt": 1787750135760
  },
  {
    "id": "word-1787750135760-127-npkft",
    "traditional": "供電吃緊",
    "simplified": "供电吃紧",
    "pinyin": "gōng diàn chī jǐn",
    "english": "Tight power supply",
    "japanese": "電力供給の逼迫",
    "category": "產業・經濟",
    "notes": "半導体・AI産業の爆発的な電力需要に対し、発電所の新設や送電網の強化が追いつかず、台湾が常に抱えるリスク。",
    "createdAt": 1787750135760
  },
  {
    "id": "word-1787750135760-128-i3j8h",
    "traditional": "跳電",
    "simplified": "跳电",
    "pinyin": "tiào diàn",
    "english": "Power outage / Trip",
    "japanese": "停電（ブレーカーが落ちるなどによる局地的な停電）",
    "category": "產業・經濟",
    "notes": "送電設備の老朽化や小動物の侵入による突発的な停電。大停電（停電）と区別して使われるが、頻発が政府の電力政策への不信を招いている。",
    "createdAt": 1787750135760
  },
  {
    "id": "word-1787750135761-129-7ccr0",
    "traditional": "廢核",
    "simplified": "废核",
    "pinyin": "fèi hé",
    "english": "Nuclear phase-out",
    "japanese": "脱原発",
    "category": "產業・經濟",
    "notes": "民進党政権の「非核家園（原発ゼロのふるさと）」政策。しかし、AIブームによる電力不足懸念から、原発の運転延長を求める声が産業界で高まっている。",
    "createdAt": 1787750135761
  },
  {
    "id": "word-1787750135761-130-mzryh",
    "traditional": "淨零碳排",
    "simplified": "净零碳排",
    "pinyin": "jìng líng tàn pái",
    "english": "Net-zero carbon emissions",
    "japanese": "ネットゼロ（温室効果ガス排出実質ゼロ）",
    "category": "產業・經濟",
    "notes": "2050年までに炭素排出を実質ゼロにする世界的目標。輸出主導型の台湾企業にとって死活問題。",
    "createdAt": 1787750135761
  },
  {
    "id": "word-1787750135761-131-eydxi",
    "traditional": "碳費",
    "simplified": "碳费",
    "pinyin": "tàn fèi",
    "english": "Carbon fee",
    "japanese": "炭素費（カーボン・プライシング）",
    "category": "產業・經濟",
    "notes": "企業が排出する二酸化炭素に対して課される料金。台湾でも導入が進められており、鉄鋼や石化産業のコスト増が懸念される。",
    "createdAt": 1787750135761
  },
  {
    "id": "word-1787750135761-132-9nqpz",
    "traditional": "產業轉型",
    "simplified": "产业转型",
    "pinyin": "chǎn yè zhuǎn xíng",
    "english": "Industrial transformation",
    "japanese": "産業構造の転換",
    "category": "產業・經濟",
    "notes": "労働集約型の製造業から、AIや高付加価値のハイテク産業へのシフト。この過程で取り残される伝統産業の救済が課題。",
    "createdAt": 1787750135761
  },
  {
    "id": "word-1787750135761-133-lw6vo",
    "traditional": "人工智慧供應鏈",
    "simplified": "人工智能供应链",
    "pinyin": "rén gōng zhì néng gōng yìng liàn",
    "english": "AI supply chain",
    "japanese": "AIサプライチェーン",
    "category": "產業・經濟",
    "notes": "NVIDIAのAIチップ製造（TSMC）から、サーバー組み立て（鴻海、廣達など）まで、世界のAIインフラの大部分を台湾企業が担っている。",
    "createdAt": 1787750135761
  },
  {
    "id": "word-1787750135762-134-qmkg2",
    "traditional": "缺工",
    "simplified": "缺工",
    "pinyin": "quē gōng",
    "english": "Labor shortage",
    "japanese": "人手不足",
    "category": "產業・經濟",
    "notes": "少子高齢化により、建設業や飲食・宿泊サービス業を中心に深刻な人手不足が発生している状態。",
    "createdAt": 1787750135762
  },
  {
    "id": "word-1787750135762-135-uq3fd",
    "traditional": "移工",
    "simplified": "移工",
    "pinyin": "yí gōng",
    "english": "Migrant workers",
    "japanese": "外国人労働者（移住労働者）",
    "category": "產業・經濟",
    "notes": "主に東南アジアから台湾に来て働く人々。「外勞（外国人労働者）」という差別的な呼称の代わりに使用される。製造業や介護の不可欠な労働力。",
    "createdAt": 1787750135762
  },
  {
    "id": "word-1787750135762-136-krjj2",
    "traditional": "最低工資",
    "simplified": "最低工资",
    "pinyin": "zuì dī gōng zī",
    "english": "Minimum wage",
    "japanese": "最低賃金",
    "category": "產業・經濟",
    "notes": "インフレに対応するため近年連続で引き上げられているが、物価高に追いついておらず、実質賃金の低下が社会の不満を生んでいる。",
    "createdAt": 1787750135762
  },
  {
    "id": "word-1787750135763-137-53rsh",
    "traditional": "勞保破產",
    "simplified": "劳保破产",
    "pinyin": "láo bǎo pò chǎn",
    "english": "Labor insurance bankruptcy",
    "japanese": "労働保険の破綻",
    "category": "產業・經濟",
    "notes": "少子高齢化で受給者が急増し、台湾のサラリーマンの年金である労働保険基金が近い将来枯渇するという時限爆弾。",
    "createdAt": 1787750135763
  },
  {
    "id": "word-1787750135763-138-s4b15",
    "traditional": "健保點值",
    "simplified": "健保点值",
    "pinyin": "jiàn bǎo diǎn zhí",
    "english": "Health insurance point value",
    "japanese": "健康保険の点数単価",
    "category": "產業・經濟",
    "notes": "台湾の医療機関が政府に請求する診療報酬の単価。総額予算制の枠組みで単価が下落し続け、医療現場の崩壊（スタッフの離職等）を招いている問題。",
    "createdAt": 1787750135763
  },
  {
    "id": "word-1787750135763-139-vylqb",
    "traditional": "長期照顧",
    "simplified": "长期照顾",
    "pinyin": "cháng qī zhào gù",
    "english": "Long-term care",
    "japanese": "長期介護（長照）",
    "category": "產業・經濟",
    "notes": "略称は「長照」。高齢者の介護システム。政府が「長照2.0」などでサービス拡充を図るが、財源確保と介護人材の不足が壁となっている。",
    "createdAt": 1787750135763
  },
  {
    "id": "word-1787750135763-140-8a67i",
    "traditional": "超高齡社會",
    "simplified": "超高龄社会",
    "pinyin": "chāo gāo líng shè huì",
    "english": "Super-aged society",
    "japanese": "超高齢社会",
    "category": "產業・經濟",
    "notes": "65歳以上の人口が20%を超える社会。台湾は世界最速レベルで2025年にこの突入すると予測され、労働力や財政への影響が懸念される。",
    "createdAt": 1787750135763
  },
  {
    "id": "word-1787750135763-141-jcdmq",
    "traditional": "詐騙園區",
    "simplified": "诈骗园区",
    "pinyin": "zhà piàn yuán qū",
    "english": "Scam parks / Fraud compounds",
    "japanese": "詐欺団の拠点（詐欺パーク）",
    "category": "產業・經濟",
    "notes": "高給を餌にカンボジア等へ若者をおびき寄せ、監禁して特殊詐欺を強要する国際的な犯罪組織の拠点問題。",
    "createdAt": 1787750135763
  },
  {
    "id": "word-1787750135763-142-o1e1e",
    "traditional": "洗錢防制",
    "simplified": "洗钱防制",
    "pinyin": "xǐ qián fáng zhì",
    "english": "Anti-money laundering (AML)",
    "japanese": "マネーロンダリング対策",
    "category": "產業・經濟",
    "notes": "詐欺や地下経済の資金洗浄を防ぐための規制。銀行口座の開設や海外送金が非常に厳格化され、一般市民の経済活動にも影響が出ている。",
    "createdAt": 1787750135763
  },
  {
    "id": "word-1787750135764-143-hv64t",
    "traditional": "數位轉型",
    "simplified": "数字化转型",
    "pinyin": "shù wèi zhuǎn xíng",
    "english": "Digital transformation (DX)",
    "japanese": "デジタルトランスフォーメーション",
    "category": "產業・經濟",
    "notes": "台湾のITインフラは進んでいるが、中小企業や伝統産業の内部ではIT化が遅れており、政府主導で支援が行われている。",
    "createdAt": 1787750135764
  },
  {
    "id": "word-1787750135764-144-njlo1",
    "traditional": "傳統產業",
    "simplified": "传统产业",
    "pinyin": "chuán tǒng chǎn yè",
    "english": "Traditional industries",
    "japanese": "伝統産業（伝産）",
    "category": "產業・經濟",
    "notes": "略称は「傳產」。半導体・IT以外の製造業（機械、繊維、プラスチックなど）。ハイテク産業との間で給与や業績の格差が広がっている。",
    "createdAt": 1787750135764
  },
  {
    "id": "word-1787750135764-145-hixpy",
    "traditional": "無薪假",
    "simplified": "无薪假",
    "pinyin": "wú xīn jià",
    "english": "Unpaid leave / Furlough",
    "japanese": "無給休暇",
    "category": "產業・經濟",
    "notes": "景気後退時に企業が従業員を解雇する代わりに強制的に取らせる無給の休み。台湾の雇用不安を示す重要なバロメーター。",
    "createdAt": 1787750135764
  },
  {
    "id": "word-1787750135764-146-i3njm",
    "traditional": "科技冷戰",
    "simplified": "科技冷战",
    "pinyin": "kē jì lěng zhàn",
    "english": "Tech Cold War",
    "japanese": "ハイテク冷戦",
    "category": "產業・經濟",
    "notes": "米中間の技術覇権争い。台湾企業はアメリカの輸出規制に従いつつ、中国市場への対応も迫られ、難しい舵取りを要求されている。",
    "createdAt": 1787750135764
  },
  {
    "id": "word-1787750135765-147-g58dc",
    "traditional": "台商回流",
    "simplified": "台商回流",
    "pinyin": "tái shāng huí liú",
    "english": "Return of Taiwanese businessmen/investment",
    "japanese": "台商（台湾企業）のUターン投資",
    "category": "產業・經濟",
    "notes": "米中貿易摩擦のリスクを避けるため、中国大陸に進出していた台湾企業が工場や資金を台湾国内へ戻す動き。",
    "createdAt": 1787750135765
  },
  {
    "id": "word-1787750135765-148-mhmv7",
    "traditional": "供應鏈重組",
    "simplified": "供应链重组",
    "pinyin": "gōng yìng liàn chóng zǔ",
    "english": "Supply chain restructuring",
    "japanese": "サプライチェーンの再構築",
    "category": "產業・經濟",
    "notes": "地政学リスク（China+1）を背景に、台湾企業が生産拠点を東南アジアやインド、欧米へ分散・移転させる不可逆的なトレンド。",
    "createdAt": 1787750135765
  },
  {
    "id": "word-1787750135765-149-yzg3m",
    "traditional": "新創生態圈",
    "simplified": "新创生态圈",
    "pinyin": "xīn chuàng shēng tài quān",
    "english": "Startup ecosystem",
    "japanese": "スタートアップ・エコシステム",
    "category": "產業・經濟",
    "notes": "ベンチャー企業、投資家、政府支援機構が相互に連携する環境。台湾ではハードウェアに偏重せず、AIやソフトウェアでの起業育成が急務となっている。",
    "createdAt": 1787750135765
  }
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

