/**
 * QuickTranslate - Background Service Worker
 *
 * 功能说明：
 * - 处理离线词典翻译
 * - 管理翻译缓存
 * - 处理消息通信
 * - 音标查询
 *
 * @module service-worker
 * @version 2.0.0
 */

// ==================== 常量定义 ====================

/**
 * 存储键名
 */
const STORAGE_KEYS = {
  TRANSLATION_CACHE: 'qt_translation_cache',
  CONFIG: 'qt_config',
  TRANSLATION_HISTORY: 'qt_history',
  DICTIONARY_EN_ZH: 'qt_dictionary_en_zh'  // 英汉词典
};

/**
 * 语言代码映射
 */
const LANG_CODES = {
  'auto': 'auto',
  'zh': 'zh',
  'en': 'en',
  'zh-CN': 'zh',
  'zh-TW': 'zh'
};

// ==================== 翻译缓存管理 ====================

/**
 * 翻译缓存类
 */
class TranslationCache {
  /**
   * 初始化缓存
   */
  async init() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.TRANSLATION_CACHE);
    this.cache = data[STORAGE_KEYS.TRANSLATION_CACHE] || {};
    this.maxCacheSize = 1000;
    this.cacheExpiry = 24 * 60 * 60 * 1000;
  }

  /**
   * 生成缓存键
   */
  getCacheKey(text, from, to) {
    return `${from}-${to}-${text}`;
  }

  /**
   * 获取缓存结果
   */
  get(text, from, to) {
    const key = this.getCacheKey(text, from, to);
    const item = this.cache[key];

    if (!item) return null;

    if (Date.now() - item.timestamp > this.cacheExpiry) {
      delete this.cache[key];
      return null;
    }

    return item.result;
  }

  /**
   * 设置缓存
   */
  async set(text, from, to, result) {
    const key = this.getCacheKey(text, from, to);
    this.cache[key] = {
      result: result,
      timestamp: Date.now()
    };

    this.cleanup();

    await chrome.storage.local.set({
      [STORAGE_KEYS.TRANSLATION_CACHE]: this.cache
    });
  }

  /**
   * 清理缓存
   */
  cleanup() {
    const now = Date.now();
    const entries = Object.entries(this.cache);

    for (const [key, item] of entries) {
      if (now - item.timestamp > this.cacheExpiry) {
        delete this.cache[key];
      }
    }

    const currentSize = Object.keys(this.cache).length;
    if (currentSize > this.maxCacheSize) {
      const sorted = entries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, currentSize - this.maxCacheSize);

      for (const [key] of sorted) {
        delete this.cache[key];
      }
    }
  }

  /**
   * 清空缓存
   */
  async clear() {
    this.cache = {};
    await chrome.storage.local.set({
      [STORAGE_KEYS.TRANSLATION_CACHE]: {}
    });
  }
}

// ==================== 离线词典服务 ====================

/**
 * 词典文件列表
 */
const SQL_DICT_FILES = [
  { path: 'sql/1 初中-乱序_sql.sql', level: 'junior', priority: 1 },
  { path: 'sql/2 高中-乱序_sql.sql', level: 'high-school', priority: 2 },
  { path: 'sql/3 四级-乱序_sql.sql', level: 'cet4', priority: 3 },
  { path: 'sql/4 六级-乱序_sql.sql', level: 'cet6', priority: 4 },
  { path: 'sql/5 考研-乱序_sql.sql', level: 'graduate', priority: 5 },
  { path: 'sql/6 托福-乱序_sql.sql', level: 'toefl', priority: 6 },
  { path: 'sql/7 SAT-乱序_sql.sql', level: 'sat', priority: 7 }
];

/**
 * 词典标签显示名称
 */
const DICT_LABELS = {
  'junior': '初中',
  'high-school': '高中',
  'cet4': 'CET4',
  'cet6': 'CET6',
  'graduate': '考研',
  'toefl': '托福',
  'sat': 'SAT'
};

/**
 * 英语变形规则（按优先级排序，优先匹配长后缀）
 */
const INFLECTION_RULES = [
  // 不规则动词过去式（先检查这些长度变化）
  { suffix: 'ied', remove: 'ied', add: 'y' },
  { suffix: 'ied', remove: 'ied', add: 'ie' },
  // 过去式/过去分词
  { suffix: 'ied', remove: 'ied', add: 'y' },
  { suffix: 'ied', remove: 'ied', add: 'ie' },
  // 复数和不规则变化
  { suffix: 'ives', remove: 'ives', add: 'ife' },
  { suffix: 'ves', remove: 'ves', add: 'f' },
  { suffix: 'ves', remove: 'ves', add: 'fe' },
  { suffix: 'ies', remove: 'ies', add: 'y' },
  { suffix: 'es', remove: 'es', add: '' },
  { suffix: 'es', remove: 'es', add: 'e' },
  // 过去式
  { suffix: 'ied', remove: 'ied', add: 'y' },
  // 进行时
  { suffix: 'ying', remove: 'ying', add: 'ie' },
  { suffix: 'ing', remove: 'ing', add: 'e' },
  { suffix: 'ing', remove: 'ping', add: 'pe' },
  // 比较级/最高级
  { suffix: 'iest', remove: 'iest', add: 'y' },
  { suffix: 'est', remove: 'est', add: '' },
  { suffix: 'est', remove: 'est', add: 'e' },
  // 第三人称单数
  { suffix: 'ies', remove: 'ies', add: 'y' },
  { suffix: 'es', remove: 'es', add: '' },
  { suffix: 's', remove: 's', add: '' },
  { suffix: 's', remove: 's', add: 'e' }
];

/**
 * 常见不规则变形映射表
 */
const IRREGULAR_INFLECTIONS = {
  // 不规则动词过去式
  'went': 'go', 'gone': 'go',
  'was': 'be', 'were': 'be',
  'did': 'do', 'done': 'do',
  'had': 'have', 'has': 'have',
  'said': 'say', 'says': 'say',
  'made': 'make', 'makes': 'make',
  'found': 'find', 'finds': 'find',
  'took': 'take', 'taken': 'take',
  'came': 'come', 'comes': 'come',
  'saw': 'see', 'seen': 'see',
  'knew': 'know', 'known': 'know',
  'thought': 'think', 'thinks': 'think',
  'bought': 'buy', 'buys': 'buy',
  'gave': 'give', 'gives': 'give',
  'got': 'get', 'gotten': 'get', 'gets': 'get',
  'wrote': 'write', 'written': 'write', 'writes': 'write',
  'told': 'tell', 'tells': 'tell',
  'spoke': 'speak', 'spoken': 'speak', 'speaks': 'speak',
  'read': 'read', 'reads': 'read',
  'became': 'become', 'becomes': 'become',
  'began': 'begin', 'begun': 'begin', 'begins': 'begin',
  'broke': 'break', 'broken': 'break', 'breaks': 'break',
  'brought': 'bring', 'brings': 'bring',
  'chose': 'choose', 'chosen': 'choose', 'chooses': 'choose',
  'ate': 'eat', 'eaten': 'eat', 'eats': 'eat',
  'forgot': 'forget', 'forgotten': 'forget', 'forgets': 'forget',
  'kept': 'keep', 'keeps': 'keep',
  'knew': 'know', 'known': 'know', 'knows': 'know',
  'left': 'leave', 'leaves': 'leave',
  'met': 'meet', 'meets': 'meet',
  'paid': 'pay', 'pays': 'pay',
  'put': 'put', 'puts': 'put',
  'ran': 'run', 'runs': 'run',
  'sat': 'sit', 'sits': 'sit',
  'sold': 'sell', 'sells': 'sell',
  'sent': 'send', 'sends': 'send',
  'slept': 'sleep', 'sleeps': 'sleep',
  'spent': 'spend', 'spends': 'spend',
  'stood': 'stand', 'stands': 'stand',
  'taught': 'teach', 'teaches': 'teach',
  'told': 'tell', 'tells': 'tell',
  'understood': 'understand', 'understands': 'understand',
  'wore': 'wear', 'worn': 'wear', 'wears': 'wear',
  'won': 'win', 'wins': 'win',
  'caught': 'catch', 'catches': 'catch',
  'cut': 'cut', 'cuts': 'cut',
  'hit': 'hit', 'hits': 'hit',
  'let': 'let', 'lets': 'let',
  'put': 'put', 'puts': 'put',
  'set': 'set', 'sets': 'set',
  'beat': 'beat', 'beaten': 'beat', 'beats': 'beat',
  'became': 'become', 'becomes': 'become',
  'blew': 'blow', 'blown': 'blow', 'blows': 'blow',
  'built': 'build', 'builds': 'build',
  'burned': 'burn', 'burnt': 'burn', 'burns': 'burn',
  'cost': 'cost', 'costs': 'cost',
  'crept': 'creep', 'creeps': 'creep',
  'dealt': 'deal', 'deals': 'deal',
  'drew': 'draw', 'drawn': 'draw', 'draws': 'draw',
  'drank': 'drink', 'drunk': 'drink', 'drinks': 'drink',
  'drove': 'drive', 'driven': 'drive', 'drives': 'drive',
  'fell': 'fall', 'fallen': 'fall', 'falls': 'fall',
  'fed': 'feed', 'feeds': 'feed',
  'felt': 'feel', 'feels': 'feel',
  'flew': 'fly', 'flown': 'fly', 'flies': 'fly',
  'froze': 'freeze', 'frozen': 'freeze', 'freezes': 'freeze',
  'grew': 'grow', 'grown': 'grow', 'grows': 'grow',
  'hung': 'hang', 'hangs': 'hang',
  'hid': 'hide', 'hidden': 'hide', 'hides': 'hide',
  'held': 'hold', 'holds': 'hold',
  'laid': 'lay', 'lays': 'lay',
  'led': 'lead', 'leads': 'lead',
  'lent': 'lend', 'lends': 'lend',
  'lay': 'lie', 'lain': 'lie', 'lies': 'lie',
  'lit': 'light', 'lights': 'light',
  'lost': 'lose', 'loses': 'lose',
  'meant': 'mean', 'means': 'mean',
  'mistook': 'mistake', 'mistaken': 'mistake', 'mistakes': 'mistake',
  'paid': 'pay', 'pays': 'pay',
  'quit': 'quit', 'quits': 'quit',
  'rode': 'ride', 'ridden': 'ride', 'rides': 'ride',
  'rang': 'ring', 'rung': 'ring', 'rings': 'ring',
  'rose': 'rise', 'risen': 'rise', 'rises': 'rise',
  'sank': 'sink', 'sunk': 'sink', 'sinks': 'sink',
  'sang': 'sing', 'sung': 'sing', 'sings': 'sing',
  'sat': 'sit', 'sits': 'sit',
  'slid': 'slide', 'slides': 'slide',
  'smelt': 'smell', 'smelled': 'smell', 'smells': 'smell',
  'spelt': 'spell', 'spelled': 'spell', 'spells': 'spell',
  'spent': 'spend', 'spends': 'spend',
  'spoke': 'speak', 'spoken': 'speak', 'speaks': 'speak',
  'stole': 'steal', 'stolen': 'steal', 'steals': 'steal',
  'swam': 'swim', 'swum': 'swim', 'swims': 'swim',
  'took': 'take', 'taken': 'take', 'takes': 'take',
  'taught': 'teach', 'teaches': 'teach',
  'tore': 'tear', 'torn': 'tear', 'tears': 'tear',
  'threw': 'throw', 'thrown': 'throw', 'throws': 'throw',
  'told': 'tell', 'tells': 'tell',
  'woke': 'wake', 'waken': 'wake', 'wakes': 'wake',
  'wore': 'wear', 'worn': 'wear', 'wears': 'wear',
  'wound': 'wind', 'winds': 'wind',
  'won': 'win', 'wins': 'win',
  'wrote': 'write', 'written': 'write', 'writes': 'write',
  // 不规则形容词比较级
  'better': 'good', 'best': 'good',
  'worse': 'bad', 'worst': 'bad',
  'more': 'much', 'most': 'much',
  'more': 'many', 'most': 'many',
  'less': 'little', 'least': 'little',
  'further': 'far', 'farther': 'far', 'furthest': 'far', 'farthest': 'far',
  // 其他不规则变化
  'teeth': 'tooth',
  'feet': 'foot',
  'geese': 'goose',
  'mice': 'mouse',
  'men': 'man',
  'women': 'woman',
  'children': 'child',
  'people': 'person',
  'oxen': 'ox',
  'sheep': 'sheep',
  'deer': 'deer',
  'fish': 'fish',
  'series': 'series',
  'species': 'species',
  'analysis': 'analysis',
  'crisis': 'crisis',
  'thesis': 'thesis',
  'bases': 'basis',
  'axes': 'axis',
  'phenomena': 'phenomenon',
  'criteria': 'criterion',
  'data': 'datum',
  'media': 'medium',
  'formulas': 'formula',
  'alumni': 'alumnus'
};

/**
 * 离线词典服务类
 */
class OfflineDictionary {
  constructor() {
    this.dictionary = {
      en_zh: {}  // 格式：{ word: { translate: string, level: string, priority: number } }
    };
    this.inflectionMap = {}; // 变形映射表
  }

  /**
   * 加载词典数据 (从 SQL 文件加载)
   */
  async load() {
    // 先从 Chrome Storage 获取已有的词典数据
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.DICTIONARY_EN_ZH
    ]);

    this.dictionary.en_zh = data[STORAGE_KEYS.DICTIONARY_EN_ZH] || {};

    // 如果 Chrome Storage 中的词典为空，则从本地 SQL 文件加载
    if (Object.keys(this.dictionary.en_zh).length === 0) {
      console.log('正在从本地 SQL 文件加载词典...');
      await this.loadFromSQLFiles();
    }

    // 构建变形映射表
    this.buildInflectionMap();

    console.log('离线词典已加载:',
      '英汉:', Object.keys(this.dictionary.en_zh).length, '词');
  }

  /**
   * 从本地 SQL 文件加载词典
   */
  async loadFromSQLFiles() {
    const dictData = {};

    // 按优先级顺序加载（从小到大），这样后加载的优先级高的会覆盖前面的
    // 但我们只记录最早出现的优先级
    const sortedFiles = [...SQL_DICT_FILES].sort((a, b) => a.priority - b.priority);

    for (const fileInfo of sortedFiles) {
      try {
        await this.loadSQLFile(fileInfo, dictData);
      } catch (error) {
        console.error(`加载词典文件 ${fileInfo.path} 失败:`, error);
      }
    }

    this.dictionary.en_zh = dictData;

    // 保存到 Chrome Storage
    await chrome.storage.local.set({
      [STORAGE_KEYS.DICTIONARY_EN_ZH]: this.dictionary.en_zh
    });

    console.log('词典已加载并保存到存储:', Object.keys(this.dictionary.en_zh).length, '词');
  }

  /**
   * 加载单个 SQL 文件
   * @param {Object} fileInfo - 文件信息 { path, level, priority }
   * @param {Object} dictData - 词典数据对象
   */
  async loadSQLFile(fileInfo, dictData) {
    try {
      const response = await fetch(chrome.runtime.getURL(fileInfo.path));
      if (!response.ok) {
        console.warn(`无法加载词典文件: ${fileInfo.path}`);
        return;
      }

      const sqlText = await response.text();
      const entries = this.parseSQLInsert(sqlText, fileInfo.level, fileInfo.priority);

      // 合并词库数据（只保留最早出现的优先级）
      for (const [word, data] of Object.entries(entries)) {
        const key = word.toLowerCase();
        // 如果单词已存在，保留优先级更低的（更早出现的）
        if (!dictData[key] || data.priority < dictData[key].priority) {
          dictData[key] = data;
        }
      }

      console.log(`已加载 ${fileInfo.path}:`, Object.keys(entries).length, '词');
    } catch (error) {
      console.error(`加载词典文件 ${fileInfo.path} 失败:`, error);
    }
  }

  /**
   * 解析 SQL INSERT 语句
   * @param {string} sqlText - SQL 文本内容
   * @param {string} level - 词库等级
   * @param {number} priority - 优先级
   * @returns {Object} 解析后的词典数据
   */
  parseSQLInsert(sqlText, level, priority) {
    const result = {};
    const insertRegex = /INSERT INTO \w+ \([^)]+\) VALUES \('([^']+)',\s*'([^']+)'\);/g;

    let match;
    while ((match = insertRegex.exec(sqlText)) !== null) {
      const [, word, translate] = match;
      const key = word.toLowerCase();
      result[key] = {
        translate: translate,
        level: level,
        priority: priority
      };
    }

    return result;
  }

  /**
   * 构建变形映射表
   */
  buildInflectionMap() {
    for (const word of Object.keys(this.dictionary.en_zh)) {
      // 为每个词生成可能的变形形式
      const forms = this.generateInflectedForms(word);
      for (const form of forms) {
        // 保存到词根的映射
        if (!this.inflectionMap[form]) {
          this.inflectionMap[form] = word;
        }
      }
    }
    console.log('变形映射表已构建:', Object.keys(this.inflectionMap).length, '条');
  }

  /**
   * 生成单词的各种变形形式
   * @param {string} word - 原始单词
   * @returns {Array} 变形形式数组
   */
  generateInflectedForms(word) {
    const forms = new Set();

    // 最后一个字母是 'y' 的情况
    if (word.endsWith('y')) {
      const base = word.slice(0, -1);
      forms.add(base + 'ies'); // 复数
      forms.add(base + 'ied'); // 过去式
    }

    // 最后一个字母是 'f' 或 'fe' 的情况
    if (word.endsWith('f')) {
      forms.add(word.slice(0, -1) + 'ves');
    }
    if (word.endsWith('fe')) {
      forms.add(word.slice(0, -2) + 'ves');
    }

    // 最后一个字母是 's', 'x', 'z', 'ch', 'sh' 的情况
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') ||
        word.endsWith('ch') || word.endsWith('sh')) {
      forms.add(word + 'es');
      forms.add(word + 'ed');
      forms.add(word + 'ing');
    }

    // 最后一个字母是 'e' 的情况
    if (word.endsWith('e')) {
      forms.add(word + 's'); // 复数/第三人称
      forms.add(word + 'd'); // 过去式
      forms.add(word.slice(0, -1) + 'ing'); // 进行时
      forms.add(word + 'r'); // 比较级
      forms.add(word + 'st'); // 最高级
    } else {
      forms.add(word + 's'); // 复数
      forms.add(word + 'ed'); // 过去式
      forms.add(word + 'ing'); // 进行时

      // 双写最后一个辅音字母的情况
      if (this.shouldDoubleLastLetter(word)) {
        const doubled = word + word.slice(-1);
        forms.add(doubled + 'ed');
        forms.add(doubled + 'ing');
      }

      // 比较级/最高级
      forms.add(word + 'er');
      forms.add(word + 'est');
    }

    // 单词以 'y' 结尾的比较级/最高级
    if (word.endsWith('y')) {
      forms.add(word.slice(0, -1) + 'ier');
      forms.add(word.slice(0, -1) + 'iest');
    }

    return Array.from(forms);
  }

  /**
   * 判断是否需要双写最后一个字母
   * @param {string} word - 单词
   * @returns {boolean}
   */
  shouldDoubleLastLetter(word) {
    if (word.length < 2) return false;
    const last = word.slice(-1).toLowerCase();
    const secondLast = word.slice(-2, -1).toLowerCase();

    // 最后一个字母是辅音
    const isConsonant = !'aeiou'.includes(last);

    // 倒数第二个字母是元音
    const isVowelBefore = 'aeiou'.includes(secondLast);

    return isConsonant && isVowelBefore;
  }

  /**
   * 查找词根形式（处理变形）
   * @param {string} word - 查询词
   * @returns {string|null} 词根
   */
  findStemWord(word) {
    const key = word.toLowerCase().trim();

    // 1. 先查不规则变形表
    if (IRREGULAR_INFLECTIONS[key]) {
      return IRREGULAR_INFLECTIONS[key];
    }

    // 2. 查预构建的变形映射表
    if (this.inflectionMap[key]) {
      return this.inflectionMap[key];
    }

    // 3. 用规则尝试还原
    for (const rule of INFLECTION_RULES) {
      if (key.endsWith(rule.suffix)) {
        // 只处理足够长的单词（避免过度还原短词）
        if (key.length > rule.suffix.length + 1) {
          let base = key.slice(0, -rule.suffix.length) + rule.add;

          // 确保基础词存在
          if (this.dictionary.en_zh[base]) {
            return base;
          }
        }
      }
    }

    return null;
  }

  /**
   * 查询单词
   * @param {string} word - 查询词
   * @param {string} from - 源语言
   * @param {string} to - 目标语言
   * @returns {Object|null} 查询结果
   */
  lookup(word, from, to) {
    const key = word.toLowerCase().trim();

    // 暂时只支持英汉翻译
    if (from !== 'en' || to !== 'zh') {
      return null;
    }

    const entry = this.dictionary.en_zh[key];
    if (entry) {
      return {
        success: true,
        original: word,
        translated: entry.translate,
        tags: [DICT_LABELS[entry.level] || entry.level],
        source: 'offline'
      };
    }

    // 尝试精确匹配（不转小写）
    const exactEntry = this.dictionary.en_zh[word];
    if (exactEntry) {
      return {
        success: true,
        original: word,
        translated: exactEntry.translate,
        tags: [DICT_LABELS[exactEntry.level] || exactEntry.level],
        source: 'offline'
      };
    }

    // 对于英汉翻译，尝试查找词根（处理复数、时态等变形）
    if (from === 'en' && to === 'zh') {
      const stemWord = this.findStemWord(word);
      if (stemWord && stemWord !== key) {
        const stemEntry = this.dictionary.en_zh[stemWord] || this.dictionary.en_zh[stemWord.toLowerCase()];
        if (stemEntry) {
          return {
            success: true,
            original: word,
            translated: stemEntry.translate,
            tags: [DICT_LABELS[stemEntry.level] || stemEntry.level],
            stemWord: stemWord,
            source: 'offline'
          };
        }
      }
    }

    return null;
  }

  /**
   * 翻译短语（支持空格分隔的短语）
   * @param {string} phrase - 短语
   * @param {string} from - 源语言
   * @param {string} to - 目标语言
   * @returns {Object|null} 翻译结果
   */
  translatePhrase(phrase, from, to) {
    const key = phrase.toLowerCase().trim();

    // 暂时只支持英汉翻译
    if (from !== 'en' || to !== 'zh') {
      return null;
    }

    // 尝试直接匹配短语
    const entry = this.dictionary.en_zh[key];
    if (entry) {
      return {
        success: true,
        original: phrase,
        translated: entry.translate,
        tags: [DICT_LABELS[entry.level] || entry.level],
        source: 'offline',
        type: 'phrase'
      };
    }

    return null;
  }

  /**
   * 逐词翻译
   * @param {string} text - 文本
   * @param {string} from - 源语言
   * @param {string} to - 目标语言
   * @returns {Object} 翻译结果
   */
  translateWordByWord(text, from, to) {
    // 暂时只支持英汉翻译
    if (from !== 'en' || to !== 'zh') {
      return {
        success: false,
        original: text,
        error: '暂不支持中文到英文的逐词翻译'
      };
    }

    // 按单词分割，保留标点符号
    const words = text.trim().split(/(\s+)/).filter(w => w.length > 0);

    const wordResults = [];
    let foundCount = 0;

    for (const word of words) {
      // 跳过纯空格的词
      if (/^\s+$/.test(word)) {
        continue;
      }

      const result = this.lookup(word.trim(), from, to);
      wordResults.push({
        original: word,
        translated: (result && result.success) ? result.translated : word, // 未知单词保留原文
        found: result && result.success,
        tags: (result && result.success) ? result.tags : [],
        stemWord: result?.stemWord || null
      });

      if (result && result.success) {
        foundCount++;
      }
    }

    return {
      success: true,
      original: text,
      translated: wordResults.map(w => w.translated).join(' '), // 保留原格式用于其他场景
      source: 'offline',
      type: 'word-by-word',
      wordCount: wordResults.length,
      foundCount: foundCount,
      wordResults: wordResults // 新增：每个单词的独立翻译结果
    };
  }

  /**
   * 添加词典条目
   * @param {string} word - 单词
   * @param {Object} entry - 词典条目
   */
  async addEntry(word, entry) {
    const key = word.toLowerCase().trim();
    this.dictionary.en_zh[key] = entry;
    await chrome.storage.local.set({
      [STORAGE_KEYS.DICTIONARY_EN_ZH]: this.dictionary.en_zh
    });
  }

  /**
   * 批量导入词典
   * @param {Object} data - 词典数据
   */
  async importDictionary(data) {
    Object.assign(this.dictionary.en_zh, data);
    await chrome.storage.local.set({
      [STORAGE_KEYS.DICTIONARY_EN_ZH]: this.dictionary.en_zh
    });
  }

  /**
   * 获取词典统计
   */
  getStats() {
    return {
      en_zh_count: Object.keys(this.dictionary.en_zh).length
    };
  }
}

// ==================== 翻译服务类 ====================

/**
 * 翻译服务类
 */
class TranslationService {
  constructor() {
    this.cache = new TranslationCache();
    this.dictionary = new OfflineDictionary();
  }

  /**
   * 初始化服务
   */
  async init() {
    await this.cache.init();
    await this.dictionary.load();
    return this;
  }

  /**
   * 检测文本语言
   */
  detectLanguage(text) {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalChars = text.length;
    return chineseChars / totalChars > 0.3 ? 'zh' : 'en';
  }

  /**
   * 翻译文本
   */
  async translate(text, from = 'auto', to = 'en') {
    // 验证输入
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: '文本内容为空',
        original: text
      };
    }

    // 自动检测语言
    let detectedLang = from;
    if (from === 'auto') {
      from = this.detectLanguage(text);
      detectedLang = from;
      // 如果检测到是中文且目标是中文，则目标改为英文
      if (from === 'zh' && to === 'zh') {
        to = 'en';
      } else if (from === 'en' && to === 'en') {
        to = 'zh';
      }
    }

    // 检查缓存
    const cached = this.cache.get(text, from, to);
    if (cached) {
      return {
        ...cached,
        fromCache: true,
        detectedLang: cached.detectedLang || detectedLang
      };
    }

    // 尝试完整文本匹配
    const exactMatch = this.dictionary.lookup(text, from, to);
    if (exactMatch && exactMatch.success) {
      exactMatch.detectedLang = detectedLang;
      await this.cache.set(text, from, to, exactMatch);
      return exactMatch;
    }

    // 尝试短语匹配
    const phraseMatch = this.dictionary.translatePhrase(text, from, to);
    if (phraseMatch && phraseMatch.success) {
      phraseMatch.detectedLang = detectedLang;
      await this.cache.set(text, from, to, phraseMatch);
      return phraseMatch;
    }

    // 逐词翻译
    const wordByWordResult = this.dictionary.translateWordByWord(text, from, to);
    wordByWordResult.detectedLang = detectedLang;

    if (text.trim().split(/\s+/).length <= 10) {
      // 短文本，直接返回逐词翻译结果
      await this.cache.set(text, from, to, wordByWordResult);
      return wordByWordResult;
    } else {
      // 长文本，返回提示
      return {
        success: false,
        error: '文本过长，请尝试选择单词或短语',
        original: text,
        suggestion: '离线词典支持单词和短语翻译',
        wordByWord: wordByWordResult,
        detectedLang: detectedLang
      };
    }
  }

  /**
   * 获取音标
   */
  async getPhonetic(word) {
    // 当前 SQL 词库没有音标数据，返回空结果
    return {
      success: false,
      word: word,
      error: '当前词库版本暂不支持音标查询'
    };
  }

  /**
   * 获取配置
   */
  async getConfig() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    return data[STORAGE_KEYS.CONFIG] || {
      theme: 'light',
      fontSize: 'medium',
      showPhonetic: true,
      showPinyin: false,
      autoDetect: true
    };
  }

  /**
   * 保存配置
   */
  async saveConfig(config) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: config
    });
  }

  /**
   * 导入词典
   */
  async importDictionary(data) {
    await this.dictionary.importDictionary(data);
  }

  /**
   * 添加词典条目
   */
  async addDictionaryEntry(word, entry) {
    await this.dictionary.addEntry(word, entry);
  }

  /**
   * 获取词典统计
   */
  getDictionaryStats() {
    return this.dictionary.getStats();
  }

  /**
   * 清空缓存
   */
  async clearCache() {
    await this.cache.clear();
  }
}

// ==================== 消息处理 ====================

let translationService = null;

/**
 * 监听插件安装事件
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('QuickTranslate已安装');

    // 设置默认配置
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: {
        theme: 'light',
        fontSize: 'medium',
        showPhonetic: true,
        showPinyin: false,
        autoDetect: true,
        autoTranslate: true,
        bubbleCloseDelay: 2000,
        shortcut: 'Ctrl+Shift+T'
      },
      [STORAGE_KEYS.TRANSLATION_CACHE]: {},
      [STORAGE_KEYS.DICTIONARY_EN_ZH]: {},
      [STORAGE_KEYS.TRANSLATION_HISTORY]: []
    });

  } else if (details.reason === 'update') {
    console.log('QuickTranslate已更新到', chrome.runtime.getManifest().version);
  }

  // 初始化翻译服务
  translationService = new TranslationService();
  await translationService.init();
});

/**
 * 监听启动事件
 */
chrome.runtime.onStartup.addListener(async () => {
  translationService = new TranslationService();
  await translationService.init();
});

/**
 * 处理消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      // 确保 translationService 已初始化
      if (!translationService) {
        translationService = new TranslationService();
        await translationService.init();
      }

      switch (message.action) {
        case 'translate':
          const translationResult = await translationService.translate(
            message.text,
            message.from || 'auto',
            message.to
          );
          sendResponse(translationResult);
          break;

        case 'getPhonetic':
          const phoneticResult = await translationService.getPhonetic(message.word);
          sendResponse(phoneticResult);
          break;

        case 'getConfig':
          const config = await translationService.getConfig();
          sendResponse({ success: true, config: config });
          break;

        case 'saveConfig':
          await translationService.saveConfig(message.config);
          sendResponse({ success: true });
          break;

        case 'clearCache':
          await translationService.clearCache();
          sendResponse({ success: true });
          break;

        case 'importDictionary':
          await translationService.importDictionary(
            message.data,
            message.dictType || 'en_zh'
          );
          sendResponse({ success: true });
          break;

        case 'addDictionaryEntry':
          await translationService.addDictionaryEntry(
            message.word,
            message.entry,
            message.dictType || 'en_zh'
          );
          sendResponse({ success: true });
          break;

        case 'getDictionaryStats':
          const stats = translationService.getDictionaryStats();
          sendResponse({ success: true, stats: stats });
          break;

        case 'reloadDictionary':
          await translationService.dictionary.load();
          sendResponse({ success: true });
          break;

        case 'speak':
          if (message.text) {
            chrome.tts.speak(message.text, {
              lang: message.lang || 'zh-CN',
              rate: message.rate || 1.0,
              pitch: message.pitch || 1.0
            });
          }
          sendResponse({ success: true });
          break;

        case 'stopSpeaking':
          chrome.tts.stop();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: '未知操作' });
      }
    } catch (error) {
      console.error('消息处理错误:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true;
});

/**
 * 监听快捷键命令
 */
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === 'translate-selection') {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selection = window.getSelection();
        return selection.toString().trim();
      }
    }, async (results) => {
      if (results && results[0] && results[0].result) {
        const text = results[0].result;
        const result = await translationService.translate(text, 'auto', 'zh');
        chrome.tabs.sendMessage(tab.id, {
          action: 'showTranslation',
          result: result
        });
      }
    });
  }
});
