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
 * 基础版词典文件列表 (sql/)
 */
const SQL_DICT_FILES_BASIC = [
  { path: 'sql/1 初中-乱序_sql.sql', level: 'junior', priority: 1 },
  { path: 'sql/2 高中-乱序_sql.sql', level: 'high-school', priority: 2 },
  { path: 'sql/3 四级-乱序_sql.sql', level: 'cet4', priority: 3 },
  { path: 'sql/4 六级-乱序_sql.sql', level: 'cet6', priority: 4 },
  { path: 'sql/5 考研-乱序_sql.sql', level: 'graduate', priority: 5 },
  { path: 'sql/6 托福-乱序_sql.sql', level: 'toefl', priority: 6 },
  { path: 'sql/7 SAT-乱序_sql.sql', level: 'sat', priority: 7 }
];

/**
 * 完整版词典文件列表 (sql-new/)
 */
const SQL_DICT_FILES_FULL = [
  { path: 'sql-new/1 初中-乱序_sql.sql', level: 'junior', priority: 1 },
  { path: 'sql-new/2 高中-乱序_sql.sql', level: 'high-school', priority: 2 },
  { path: 'sql-new/3 四级-乱序_sql.sql', level: 'cet4', priority: 3 },
  { path: 'sql-new/4 六级-乱序_sql.sql', level: 'cet6', priority: 4 },
  { path: 'sql-new/5 考研-乱序_sql.sql', level: 'graduate', priority: 5 },
  { path: 'sql-new/6 托福-乱序_sql.sql', level: 'toefl', priority: 6 },
  { path: 'sql-new/7 SAT-乱序_sql.sql', level: 'sat', priority: 7 }
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
      en_zh: {}  // 格式：根据版本不同而不同
      // 基础版：{ word: { translate: string, level: string, priority: number } }
      // 完整版：{ word: { translate: string, phonetic_uk: string, phonetic_us: string, part_of_speech: string, examples: array, level: string, priority: number } }
    };
    this.inflectionMap = {}; // 变形映射表
    this.config = null;      // 用户配置
  }

  /**
   * 加载词典数据 (从 SQL 文件加载)
   */
  async load() {
    // 获取用户配置，确定使用哪个版本的词库
    const configData = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    this.config = configData[STORAGE_KEYS.CONFIG] || { dictVersion: 'basic' };

    // 先从 Chrome Storage 获取已有的词典数据
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.DICTIONARY_EN_ZH
    ]);

    this.dictionary.en_zh = data[STORAGE_KEYS.DICTIONARY_EN_ZH] || {};

    // 如果 Chrome Storage 中的词典为空，则从本地 SQL 文件加载
    if (Object.keys(this.dictionary.en_zh).length === 0) {
      console.log('正在从本地 SQL 文件加载词典...');
      await this.loadFromSQLFiles();
    } else {
      // 检查版本是否变化，如果变化则重新加载
      const storedVersion = this.dictionary.en_zh._dictVersion || 'basic';
      if (storedVersion !== this.config.dictVersion) {
        console.log(`词库版本已从 ${storedVersion} 变更为 ${this.config.dictVersion}，重新加载...`);
        this.dictionary.en_zh = {};
        await this.loadFromSQLFiles();
      }
    }

    // 构建变形映射表
    this.buildInflectionMap();

    console.log('离线词典已加载:',
      '英汉:', Object.keys(this.dictionary.en_zh).length - 1, '词', // -1 排除 _dictVersion 字段
      '版本:', this.config.dictVersion);
  }

  /**
   * 从本地 SQL 文件加载词典
   */
  async loadFromSQLFiles() {
    const dictData = {};

    // 根据配置选择词库文件
    const dictFiles = this.config.dictVersion === 'full' ? SQL_DICT_FILES_FULL : SQL_DICT_FILES_BASIC;

    // 按优先级顺序加载（从小到大），这样后加载的优先级高的会覆盖前面的
    // 但我们只记录最早出现的优先级
    const sortedFiles = [...dictFiles].sort((a, b) => a.priority - b.priority);

    for (const fileInfo of sortedFiles) {
      try {
        await this.loadSQLFile(fileInfo, dictData);
      } catch (error) {
        console.error(`加载词典文件 ${fileInfo.path} 失败:`, error);
      }
    }

    this.dictionary.en_zh = dictData;

    // 保存版本信息到字典中
    this.dictionary.en_zh._dictVersion = this.config.dictVersion;

    // 保存到 Chrome Storage
    await chrome.storage.local.set({
      [STORAGE_KEYS.DICTIONARY_EN_ZH]: this.dictionary.en_zh
    });

    console.log('词典已加载并保存到存储:', Object.keys(dictData).length, '词');
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
      const entries = this.parseSQLInsert(sqlText, fileInfo.level, fileInfo.priority, this.config.dictVersion);

      // 合并词库数据，收集所有词库等级
      for (const [word, data] of Object.entries(entries)) {
        const key = word.toLowerCase();
        if (!dictData[key]) {
          // 单词不存在，直接添加
          dictData[key] = data;
        } else {
          // 单词已存在，收集额外的词库等级
          const existingLevels = dictData[key].levels || dictData[key].level ? [dictData[key].level] : [];
          if (!existingLevels.includes(data.level)) {
            existingLevels.push(data.level);
            // 按优先级排序
            existingLevels.sort((a, b) => {
              const aPriority = (this.config.dictVersion === 'full' ? SQL_DICT_FILES_FULL : SQL_DICT_FILES_BASIC).find(f => f.level === a)?.priority || 999;
              const bPriority = (this.config.dictVersion === 'full' ? SQL_DICT_FILES_FULL : SQL_DICT_FILES_BASIC).find(f => f.level === b)?.priority || 999;
              return aPriority - bPriority;
            });
            dictData[key].levels = existingLevels;
          }
          // 使用最优先的翻译（优先级最低的）
          if (data.priority < (dictData[key].priority || 999)) {
            dictData[key].translate = data.translate;
            dictData[key].priority = data.priority;
          }
        }
      }

      console.log(`已加载 ${fileInfo.path}:`, Object.keys(entries).length, '词');
    } catch (error) {
      console.error(`加载词典文件 ${fileInfo.path} 失败:`, error);
    }
  }

  /**
   * 解析 SQL INSERT 语句（严格解析，不使用正则）
   * @param {string} sqlText - SQL 文本内容
   * @param {string} level - 词库等级
   * @param {number} priority - 优先级
   * @param {string} dictVersion - 词库版本 (basic/full)
   * @returns {Object} 解析后的词典数据
   */
  parseSQLInsert(sqlText, level, priority, dictVersion) {
    const result = {};
    const lines = sqlText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过非 INSERT 语句
      if (!line.startsWith('INSERT INTO ') || !line.includes(' VALUES ')) {
        continue;
      }

      // 提取 VALUES 部分
      const valuesStart = line.indexOf('VALUES ') + 'VALUES '.length;

      // 跳过末尾的分号
      let valuesPart = line;
      if (valuesPart.endsWith(';')) {
        valuesPart = valuesPart.slice(0, -1);
      }
      valuesPart = valuesPart.slice(valuesStart).trim();

      // 去掉括号
      if (valuesPart.startsWith('(') && valuesPart.endsWith(')')) {
        valuesPart = valuesPart.slice(1, -1);
      }

      // 解析值（不使用正则，手动分割）
      const values = this.parseSQLValues(valuesPart);

      // 根据版本决定需要哪些字段
      if (dictVersion === 'full' && values.length >= 6) {
        // 完整版：word, translate, phonetic_uk, phonetic_us, part_of_speech, examples
        const word = values[0];
        // 处理examples数组：如果包含 '[' 则需要进行JSON解析
        let examples = [];
        if (values[5] && (values[5].includes('[') || values[5] === '[]')) {
          try {
            // 移除可能的前后空格和引号
            let examplesStr = values[5].trim();
            if (examplesStr.startsWith("'") && examplesStr.endsWith("'")) {
              examplesStr = examplesStr.slice(1, -1);
            }
            if (examplesStr !== '[]') {
              examples = JSON.parse(examplesStr);
            }
          } catch (e) {
            examples = [];
          }
        }

        const key = word.toLowerCase();
        result[key] = {
          translate: values[1],
          phonetic_uk: values[2],
          phonetic_us: values[3],
          part_of_speech: values[4],
          examples: examples,
          level: level,
          priority: priority
        };
      } else if (dictVersion === 'basic' && values.length >= 2) {
        // 基础版：word, translate
        const word = values[0];
        const key = word.toLowerCase();
        result[key] = {
          translate: values[1],
          level: level,
          priority: priority
        };
      }
    }

    return result;
  }

  /**
   * 解析 SQL VALUES 字符串（手动分割，不使用正则）
   * @param {string} valuesStr - VALUES 字符串
   * @returns {Array} 值数组
   */
  parseSQLValues(valuesStr) {
    const values = [];
    let current = '';
    let inSingleQuotes = false;
    let inDoubleQuotes = false;
    let escapeNext = false;

    for (let i = 0; i < valuesStr.length; i++) {
      const char = valuesStr[i];

      // 处理转义字符
      if (escapeNext) {
        current += char;
        escapeNext = false;
        continue;
      }

      // 处理反斜杠转义
      if (char === '\\') {
        escapeNext = true;
        current += char;
        continue;
      }

      // 进入/退出引号
      if (char === "'" && !inDoubleQuotes) {
        if (inSingleQuotes && !escapeNext) {
          // 检查是否是连续的两个单引号（SQL的转义方式）
          if (i + 1 < valuesStr.length && valuesStr[i + 1] === "'") {
            current += "'";
            i++; // 跳过下一个单引号
            continue;
          }
          inSingleQuotes = false;
        } else {
          inSingleQuotes = true;
        }
        continue;
      }

      if (char === '"' && !inSingleQuotes) {
        inDoubleQuotes = !inDoubleQuotes;
        continue;
      }

      // 分隔符（只有不在引号内时才分隔）
      if (char === ',' && !inSingleQuotes && !inDoubleQuotes) {
        values.push(current.trim());
        current = '';
        continue;
      }

      current += char;
    }

    // 添加最后一个值
    values.push(current.trim());

    return values;
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
   * 生成词库标签数组
   * @param {Object|string} entry - 词典条目或level字符串
   * @returns {Array} 标签数组
   */
  generateTags(entry) {
    if (typeof entry === 'string') {
      return [DICT_LABELS[entry] || entry];
    }

    // 如果有levels数组，生成所有标签
    if (entry.levels && Array.isArray(entry.levels)) {
      return entry.levels.map(level => DICT_LABELS[level] || level);
    }

    // 否则返回单个标签
    return [DICT_LABELS[entry.level] || entry.level];
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
      const result = {
        success: true,
        original: word,
        translated: entry.translate,
        tags: this.generateTags(entry),
        source: 'offline'
      };

      // 如果是完整版词库，添加音标、词性、例句信息
      if (this.config.dictVersion === 'full') {
        if (entry.phonetic_uk) result.phonetic_uk = entry.phonetic_uk;
        if (entry.phonetic_us) result.phonetic_us = entry.phonetic_us;
        if (entry.part_of_speech) result.part_of_speech = entry.part_of_speech;
        if (entry.examples && entry.examples.length > 0) result.examples = entry.examples;
      }

      return result;
    }

    // 尝试精确匹配（不转小写）
    const exactEntry = this.dictionary.en_zh[word];
    if (exactEntry) {
      const result = {
        success: true,
        original: word,
        translated: exactEntry.translate,
        tags: this.generateTags(exactEntry),
        source: 'offline'
      };

      // 如果是完整版词库，添加音标、词性、例句信息
      if (this.config.dictVersion === 'full') {
        if (exactEntry.phonetic_uk) result.phonetic_uk = exactEntry.phonetic_uk;
        if (exactEntry.phonetic_us) result.phonetic_us = exactEntry.phonetic_us;
        if (exactEntry.part_of_speech) result.part_of_speech = exactEntry.part_of_speech;
        if (exactEntry.examples && exactEntry.examples.length > 0) result.examples = exactEntry.examples;
      }

      return result;
    }

    // 对于英汉翻译，尝试查找词根（处理复数、时态等变形）
    if (from === 'en' && to === 'zh') {
      const stemWord = this.findStemWord(word);
      if (stemWord && stemWord !== key) {
        const stemEntry = this.dictionary.en_zh[stemWord] || this.dictionary.en_zh[stemWord.toLowerCase()];
        if (stemEntry) {
          const result = {
            success: true,
            original: word,
            translated: stemEntry.translate,
            tags: this.generateTags(stemEntry),
            stemWord: stemWord,
            source: 'offline'
          };

          // 如果是完整版词库，添加音标、词性、例句信息
          if (this.config.dictVersion === 'full') {
            if (stemEntry.phonetic_uk) result.phonetic_uk = stemEntry.phonetic_uk;
            if (stemEntry.phonetic_us) result.phonetic_us = stemEntry.phonetic_us;
            if (stemEntry.part_of_speech) result.part_of_speech = stemEntry.part_of_speech;
            if (stemEntry.examples && stemEntry.examples.length > 0) result.examples = stemEntry.examples;
          }

          return result;
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
        tags: this.generateTags(entry),
        source: 'offline',
        type: 'phrase'
      };
    }

    return null;
  }

  /**
   * 清理单词：移除标点符号
   * @param {string} word - 单词
   * @returns {string} 清理后的单词
   */
  cleanWord(word) {
    // 移除常见的英文标点符号
    return word.replace(/^[.,;:!?'"()<>[\]{}\/\\|*@#$%^&~`]+|[.,;:!?'"()<>[\]{}\/\\|*@#$%^&~`]+$/g, '').trim();
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

    // 按空格分割
    const words = text.trim().split(/(\s+)/).filter(w => w && !/^\s+$/.test(w));

    const wordResults = [];
    let foundCount = 0;

    for (const word of words) {
      // 清理标点符号
      const cleaned = this.cleanWord(word);

      if (!cleaned) {
        // 如果清理后为空（全是标点），跳过
        continue;
      }

      // 检查是否包含连字符
      if (cleaned.includes('-')) {
        // 拆分连字符连接的单词
        const hyphenatedParts = cleaned.split('-');
        const subResults = [];

        for (const part of hyphenatedParts) {
          if (part) {
            const partCleaned = this.cleanWord(part);
            if (partCleaned) {
              const result = this.lookup(partCleaned, from, to);
              subResults.push({
                original: part,
                translated: (result && result.success) ? result.translated : part,
                found: result && result.success,
                tags: (result && result.success) ? result.tags : [],
                stemWord: result?.stemWord || null,
                phonetic_uk: result?.phonetic_uk || null,
                phonetic_us: result?.phonetic_us || null,
                part_of_speech: result?.part_of_speech || null,
                examples: result?.examples || null
              });

              if (result && result.success) {
                foundCount++;
              }
            }
          }
        }

        // 将连字符单词的所有部分合并为一个结果
        if (subResults.length > 0) {
          const anyFound = subResults.some(r => r.found);
          wordResults.push({
            original: cleaned,
            translated: subResults.map(r => r.translated).join('-'),
            found: anyFound,
            tags: anyFound ? [...new Set(subResults.flatMap(r => r.tags))] : [],
            stemWord: anyFound ? subResults.find(r => r.stemWord)?.stemWord : null,
            isHyphenated: true,
            subResults: subResults
          });
        }
      } else {
        // 普通单词
        const result = this.lookup(cleaned, from, to);
        wordResults.push({
          original: cleaned,
          translated: (result && result.success) ? result.translated : cleaned,
          found: result && result.success,
          tags: (result && result.success) ? result.tags : [],
          stemWord: result?.stemWord || null,
          phonetic_uk: result?.phonetic_uk || null,
          phonetic_us: result?.phonetic_us || null,
          part_of_speech: result?.part_of_speech || null,
          examples: result?.examples || null
        });

        if (result && result.success) {
          foundCount++;
        }
      }
    }

    return {
      success: true,
      original: text,
      translated: wordResults.map(w => w.translated).join(' '),
      source: 'offline',
      type: 'word-by-word',
      wordCount: wordResults.length,
      foundCount: foundCount,
      wordResults: wordResults
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

    if (text.trim().split(/\s+/).length <= 50) {
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
    // 检查词库版本是否支持音标
    const configData = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
    const config = configData[STORAGE_KEYS.CONFIG] || {};

    if (config.dictVersion !== 'full') {
      return {
        success: false,
        word: word,
        error: '基础版词库暂不支持音标查询，请切换到完整版'
      };
    }

    // 尝试从词典获取音标
    const key = word.toLowerCase().trim();
    const entry = this.dictionary.en_zh[key] || this.dictionary.en_zh[word];

    if (entry && entry.success) {
      return {
        success: true,
        word: word,
        phonetic_uk: entry.phonetic_uk || null,
        phonetic_us: entry.phonetic_us || null
      };
    }

    // 尝试查找词根的音标（处理变形词）
    const stemWord = this.dictionary.findStemWord(word);
    if (stemWord && stemWord !== key) {
      const stemEntry = this.dictionary.en_zh[stemWord] || this.dictionary.en_zh[stemWord.toLowerCase()];
      if (stemEntry) {
        return {
          success: true,
          word: word,
          originalWord: stemWord,
          phonetic_uk: stemEntry.phonetic_uk || null,
          phonetic_us: stemEntry.phonetic_us || null
        };
      }
    }

    return {
      success: false,
      word: word,
      error: '未找到该单词'
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
      autoDetect: true,
      dictVersion: 'basic'
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
        bubbleCloseDelay: 10000,
        shortcut: 'Ctrl+Shift+T',
        dictVersion: 'basic'
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

// 监听配置变化
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.qt_config) {
    const newConfig = changes.qt_config.newValue;
    const oldConfig = changes.qt_config.oldValue || {};

    // 检查词库版本是否变化
    if (newConfig && oldConfig && newConfig.dictVersion !== oldConfig.dictVersion) {
      console.log(`词库版本已从 ${oldConfig.dictVersion} 切换到 ${newConfig.dictVersion}，重新加载词典...`);
      if (translationService && translationService.dictionary) {
        await translationService.dictionary.load();
      }
    }
  }
});
