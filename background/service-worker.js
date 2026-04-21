/**
 * QuickTranslate - Background Service Worker (使用ECDICT词库 + IndexedDB)
 *
 * 功能说明：
 * - 处理ECDICT离线词典翻译
 * - 使用IndexedDB存储大容量词典
 * - 管理翻译缓存
 * - 处理消息通信
 * - 音标查询
 *
 * @module service-worker
 * @version 3.1.0
 */

// ==================== 常量定义 ====================

/**
 * 存储键名
 */
const STORAGE_KEYS = {
  TRANSLATION_CACHE: 'qt_translation_cache',
  CONFIG: 'qt_config',
  TRANSLATION_HISTORY: 'qt_history',
  DICTIONARY_LOADED: 'qt_dictionary_loaded'  // 词典是否已加载
};

/**
 * IndexedDB配置
 */
const DB_CONFIG = {
  name: 'QuickTranslateDB',
  version: 1,
  stores: {
    dictionary: 'dictionary',
    inflection: 'inflection'
  }
};

/**
 * 语言代码映射
 */
// eslint-disable-next-line no-unused-vars
const LANG_CODES = {
  'auto': 'auto',
  'zh': 'zh',
  'en': 'en',
  'zh-CN': 'zh',
  'zh-TW': 'zh'
};

// ==================== IndexedDB 管理类 ====================

/**
 * IndexedDB 管理类
 */
class DatabaseManager {
  constructor() {
    this.db = null;
  }

  /**
   * 打开数据库
   */
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 创建词典存储
        if (!db.objectStoreNames.contains(DB_CONFIG.stores.dictionary)) {
          const dictStore = db.createObjectStore(DB_CONFIG.stores.dictionary, { keyPath: 'word' });
          dictStore.createIndex('lowerWord', 'lowerWord', { unique: true });
        }

        // 创建变形映射存储
        if (!db.objectStoreNames.contains(DB_CONFIG.stores.inflection)) {
          // eslint-disable-next-line no-unused-vars
          const inflectionStore = db.createObjectStore(DB_CONFIG.stores.inflection, { keyPath: 'form' });
        }
      };
    });
  }

  /**
   * 添加词典条目（批量）
   */
  async addDictionaryEntries(entries) {
    const transaction = this.db.transaction([DB_CONFIG.stores.dictionary, DB_CONFIG.stores.inflection], 'readwrite');
    const dictStore = transaction.objectStore(DB_CONFIG.stores.dictionary);
    const inflectionStore = transaction.objectStore(DB_CONFIG.stores.inflection);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      // 使用批量添加（在事务中）
      entries.forEach(entry => {
        try {
          // 添加到词典
          if (entry.word) {
            const dbEntry = {
              word: entry.word,
              lowerWord: entry.word.toLowerCase(),
              phonetic: entry.phonetic || null,
              translation: entry.translation || '',
              definition: entry.definition || null,
              pos: entry.pos || null,
              collins: entry.collins ? parseInt(entry.collins, 10) : null,
              oxford: entry.oxford ? parseInt(entry.oxford, 10) : null,
              tag: entry.tag || null,
              bnc: entry.bnc ? parseInt(entry.bnc, 10) : null,
              frq: entry.frq ? parseInt(entry.frq, 10) : null,
              exchange: entry.exchange || null,
              detail: entry.detail || null,
              audio: entry.audio || null
            };
            dictStore.put(dbEntry);

            // 添加变形映射
            if (entry.exchange) {
              const changes = this.parseExchange(entry.exchange);
              for (const type of ['p', 'd', 'i', '3', 's', 'r', 't']) {
                if (changes[type]) {
                  const form = changes[type].toLowerCase();
                  inflectionStore.put({ form, lemma: entry.word.toLowerCase() });
                }
              }
            }

            // 为原始单词添加映射
            inflectionStore.put({ form: entry.word.toLowerCase(), lemma: entry.word.toLowerCase() });
          }
        } catch (e) {
          console.warn('添加条目失败:', entry.word, e);
        }
      });
    });
  }

  /**
   * 查询单词（通过小写键）
   */
  async getWord(lowerWord) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DB_CONFIG.stores.dictionary], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.stores.dictionary);
      const index = store.index('lowerWord');
      const request = index.get(lowerWord);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 解析exchange字段
   */
  parseExchange(exchange) {
    const result = {};
    if (!exchange) return result;

    const parts = exchange.split('/');
    for (const part of parts) {
      const pos = part.indexOf(':');
      if (pos > 0) {
        const type = part.slice(0, pos).trim();
        const form = part.slice(pos + 1).trim();
        result[type] = form;
      }
    }
    return result;
  }

  /**
   * 获取词典统计
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DB_CONFIG.stores.dictionary], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.stores.dictionary);
      const request = store.count();

      request.onsuccess = () => resolve({ en_zh_count: request.result });
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清空数据库
   */
  async clear() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([DB_CONFIG.stores.dictionary, DB_CONFIG.stores.inflection], 'readwrite');

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      transaction.objectStore(DB_CONFIG.stores.dictionary).clear();
      transaction.objectStore(DB_CONFIG.stores.inflection).clear();
    });
  }
}

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

// ==================== ECDICT词典服务 ====================

/**
 * ECDICT词典服务类
 * 使用IndexedDB存储大容量词典
 */
class OfflineDictionary {
  constructor() {
    this.dbManager = new DatabaseManager();
    this.isLoading = false;
  }

  /**
   * 加载词典数据
   */
  async load() {
    // 打开IndexedDB
    await this.dbManager.open();

    // 检查词典是否已加载
    const stats = await this.dbManager.getStats();
    const dictLoaded = await this.getDictionaryLoadedFlag();

    if (stats.en_zh_count > 0 && dictLoaded) {
      console.log('ECDICT词典已从IndexedDB加载:', stats.en_zh_count, '词');
      return;
    }

    // 从CSV文件加载
    if (!this.isLoading) {
      this.isLoading = true;
      await this.loadFromCSV();
      this.isLoading = false;
    }
  }

  /**
   * 获取词典加载标志
   */
  async getDictionaryLoadedFlag() {
    const data = await chrome.storage.local.get(STORAGE_KEYS.DICTIONARY_LOADED);
    return data[STORAGE_KEYS.DICTIONARY_LOADED] || false;
  }

  /**
   * 设置词典加载标志
   */
  async setDictionaryLoadedFlag(value) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.DICTIONARY_LOADED]: value
    });
  }

  /**
   * 从本地CSV文件加载词典
   */
  async loadFromCSV() {
    try {
      console.log('正在从ECDICT CSV文件加载词典...');

      const response = await fetch(chrome.runtime.getURL('ecdict/ecdict.mini.csv'));
      if (!response.ok) {
        console.warn('无法加载ECDICT词库文件');
        throw new Error('无法加载词库文件');
      }

      const csvText = await response.text();
      const lines = csvText.split('\n');
      const headers = this.parseCSVLine(lines[0]);

      const BATCH_SIZE = 5000; // 每批5000条
      const entries = [];
      let totalLoaded = 0;

      // 分批处理和存储
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = this.parseCSVLine(line);
        if (values.length < 2) continue;

        const entry = {
          word: values[0]?.trim() || '',
          phonetic: values[1]?.trim() || '',
          definition: values[2]?.trim() || '',
          translation: values[3]?.trim() || ''
        };

        // 解析额外字段
        if (headers.length > 4) {
          for (let j = 4; j < Math.min(headers.length, values.length); j++) {
            const field = headers[j];
            entry[field] = values[j]?.trim() || '';
          }
        }

        if (entry.word && entry.translation) {
          entries.push(entry);

          // 当达到批量大小时，保存到数据库
          if (entries.length >= BATCH_SIZE) {
            await this.dbManager.addDictionaryEntries([...entries]);
            entries.length = 0;
            totalLoaded += BATCH_SIZE;
            console.log('已加载:', totalLoaded, '词...');
          }
        }
      }

      // 保存剩余的条目
      if (entries.length > 0) {
        await this.dbManager.addDictionaryEntries(entries);
        totalLoaded += entries.length;
      }

      // 设置加载完成标志
      await this.setDictionaryLoadedFlag(true);

      const finalStats = await this.dbManager.getStats();
      console.log('ECDICT词典已加载并保存到IndexedDB:', finalStats.en_zh_count, '词');
    } catch (error) {
      console.error('加载ECDICT词典文件失败:', error);
      throw error;
    }
  }

  /**
   * 解析CSV行
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  /**
   * 查询单词（带变形支持）
   */
  async lookup(word, from, to) {
    const lowerWord = word.toLowerCase().trim();

    // 暂时只支持英汉翻译
    if (from !== 'en' || to !== 'zh') {
      return null;
    }

    // 先尝试精确匹配
    let entry = await this.dbManager.getWord(lowerWord);
    if (entry) {
      return this.formatResult(word, entry);
    }

    // 尝试原文大小写匹配
    entry = await this.dbManager.getWord(word);
    if (entry) {
      return this.formatResult(word, entry);
    }

    // 尝试查找变形词的词根
    const stemEntry = await this.findStemWord(word);
    if (stemEntry && stemEntry !== lowerWord) {
      entry = await this.dbManager.getWord(stemEntry);
      if (entry) {
        return this.formatResult(word, entry, stemEntry);
      }
    }

    return null;
  }

  /**
   * 查找词根形式
   */
  async findStemWord(word) {
    const lowerWord = word.toLowerCase().trim();

    // 首先检查该词是否本身存在于词典
    const exists = await this.dbManager.getWord(lowerWord);
    if (exists) {
      return lowerWord;
    }

    // 从变形映射中查找
    return new Promise((resolve) => {
      const transaction = this.dbManager.db.transaction([DB_CONFIG.stores.inflection], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.stores.inflection);
      const request = store.get(lowerWord);

      request.onsuccess = () => {
        resolve(request.result ? request.result.lemma : null);
      };
      request.onerror = () => resolve(null);
    });
  }

  /**
   * 格式化查询结果
   */
  formatResult(original, entry, stemWord = null) {
    const result = {
      success: true,
      original: original,
      translated: entry.translation.replace(/\\n/g, '\n'),
      tags: this.generateTags(entry),
      source: 'offline'
    };

    // 音标
    if (entry.phonetic) {
      result.phonetic = entry.phonetic;
    }

    // 词性
    if (entry.pos) {
      result.part_of_speech = this.formatPOS(entry.pos);
    }

    // 英文定义
    if (entry.definition) {
      result.definition = entry.definition;
    }

    // 词形变化
    if (entry.exchange) {
      result.exchange = this.formatExchange(entry.exchange);
    }

    // 词根信息
    if (stemWord && stemWord !== original.toLowerCase()) {
      result.stemWord = stemWord;
    }

    return result;
  }

  /**
   * 生成标签
   */
  generateTags(entry) {
    const tags = [];

    if (entry.tag) {
      const tagMap = {
        'zk': '中考',
        'gk': '高考',
        'cet4': 'CET4',
        'cet6': 'CET6',
        'ky': '考研',
        'toefl': '托福',
        'ielts': '雅思',
        'gre': 'GRE'
      };

      const tagParts = entry.tag.split(' ');
      for (const part of tagParts) {
        const cleanPart = part.trim();
        if (tagMap[cleanPart]) {
          tags.push(tagMap[cleanPart]);
        }
      }
    }

    // 柯林斯星级
    if (entry.collins && entry.collins > 0) {
      tags.push('★★★★★'.slice(5 - entry.collins));
    }

    // 牛津3000
    if (entry.oxford) {
      tags.push('牛津3000');
    }

    return tags.length > 0 ? tags : ['ECDICT'];
  }

  /**
   * 格式化词性
   */
  formatPOS(pos) {
    if (!pos) return '';

    const posMap = {
      'n': '名词',
      'v': '动词',
      'a': '形容词',
      'r': '副词',
      'c': '连词',
      'u': '感叹词',
      'i': '介词',
      't': '不定式标记',
      'j': '形容词',
      'm': '数词',
      'x': '否定标记'
    };

    if (pos.includes(':')) {
      const parts = pos.split('/');
      const mainPart = parts.reduce((max, p) => {
        const ratio = parseInt(p.split(':')[1] || '0', 10);
        const maxRatio = parseInt(max.split(':')[1] || '0', 10);
        return ratio > maxRatio ? p : max;
      }, parts[0]);
      const type = mainPart.split(':')[0];
      return posMap[type] || type;
    }

    if (pos.includes('/')) {
      return pos.split('/').map(p => posMap[p.trim()] || p.trim()).join('/');
    }

    return posMap[pos] || pos;
  }

  /**
   * 格式化词形变化
   */
  formatExchange(exchange) {
    if (!exchange) return '';

    const changes = this.dbManager.parseExchange(exchange);
    const parts = [];

    const typeMap = {
      'p': '过去式',
      'd': '过去分词',
      'i': '现在分词',
      '3': '第三人称',
      's': '复数',
      'r': '比较级',
      't': '最高级'
    };

    for (const [type, form] of Object.entries(changes)) {
      if (typeMap[type]) {
        parts.push(`${typeMap[type]}: ${form}`);
      }
    }

    return parts.join(', ');
  }

  /**
   * 翻译短语
   */
  async translatePhrase(phrase, from, to) {
    const result = await this.lookup(phrase, from, to);
    if (result && result.success) {
      result.type = 'phrase';
      return result;
    }
    return null;
  }

  /**
   * 清理单词
   */
  cleanWord(word) {
    return word.replace(/^[.,;:!?'"()<>[\]{}\\|*@#$%^&~`]+|[.,;:!?'"()<>[\]{}\\|*@#$%^&~`]+$/g, '').trim();
  }

  /**
   * 逐词翻译
   */
  async translateWordByWord(text, from, to) {
    if (from !== 'en' || to !== 'zh') {
      return {
        success: false,
        original: text,
        error: '暂不支持中文到英文的逐词翻译'
      };
    }

    const words = text.trim().split(/(\s+)/).filter(w => w && !/^\s+$/.test(w));
    const wordResults = [];
    let foundCount = 0;

    for (const word of words) {
      const cleaned = this.cleanWord(word);
      if (!cleaned) continue;

      const result = await this.lookup(cleaned, from, to);
      wordResults.push({
        original: cleaned,
        translated: (result && result.success) ? result.translated : cleaned,
        found: result && result.success,
        tags: (result && result.success) ? result.tags : [],
        phonetic: result?.phonetic || null,
        part_of_speech: result?.part_of_speech || null
      });

      if (result && result.success) {
        foundCount++;
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
   * 获取词典统计
   */
  async getStats() {
    return this.dbManager.getStats();
  }

  /**
   * 查找词根（用于音标查询）
   */
  async findStemWordForPhonetic(word) {
    const lowerWord = word.toLowerCase().trim();

    const entry = await this.dbManager.getWord(lowerWord);
    if (entry) {
      return lowerWord;
    }

    return new Promise((resolve) => {
      const transaction = this.dbManager.db.transaction([DB_CONFIG.stores.inflection], 'readonly');
      const store = transaction.objectStore(DB_CONFIG.stores.inflection);
      const request = store.get(lowerWord);

      request.onsuccess = () => {
        resolve(request.result ? request.result.lemma : null);
      };
      request.onerror = () => resolve(null);
    });
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
  async translate(text, from = 'auto', to = 'zh') {
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: '文本内容为空',
        original: text
      };
    }

    let detectedLang = from;
    if (from === 'auto') {
      from = this.detectLanguage(text);
      detectedLang = from;
      if (from === 'zh' && to === 'zh') {
        to = 'en';
      } else if (from === 'en' && to === 'en') {
        to = 'zh';
      }
    }

    const cached = this.cache.get(text, from, to);
    if (cached) {
      return {
        ...cached,
        fromCache: true,
        detectedLang: cached.detectedLang || detectedLang
      };
    }

    const exactMatch = await this.dictionary.lookup(text, from, to);
    if (exactMatch && exactMatch.success) {
      exactMatch.detectedLang = detectedLang;
      await this.cache.set(text, from, to, exactMatch);
      return exactMatch;
    }

    const phraseMatch = await this.dictionary.translatePhrase(text, from, to);
    if (phraseMatch && phraseMatch.success) {
      phraseMatch.detectedLang = detectedLang;
      await this.cache.set(text, from, to, phraseMatch);
      return phraseMatch;
    }

    const wordByWordResult = await this.dictionary.translateWordByWord(text, from, to);
    wordByWordResult.detectedLang = detectedLang;

    if (text.trim().split(/\s+/).length <= 50) {
      await this.cache.set(text, from, to, wordByWordResult);
      return wordByWordResult;
    } else {
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
    const lowerWord = word.toLowerCase().trim();
    const entry = await this.dictionary.dbManager.getWord(lowerWord);

    if (entry) {
      return {
        success: true,
        word: word,
        phonetic: entry.phonetic || null
      };
    }

    const stemWord = await this.dictionary.findStemWordForPhonetic(word);
    if (stemWord && stemWord !== lowerWord) {
      const stemEntry = await this.dictionary.dbManager.getWord(stemWord);
      if (stemEntry) {
        return {
          success: true,
          word: word,
          originalWord: stemWord,
          phonetic: stemEntry.phonetic || null
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
   * 获取词典统计
   */
  async getDictionaryStats() {
    return this.dictionary.getStats();
  }

  /**
   * 重新加载词典
   */
  async reloadDictionary() {
    await chrome.storage.local.set({ [STORAGE_KEYS.DICTIONARY_LOADED]: false });
    await this.dictionary.dbManager.clear();
    await this.dictionary.load();
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

    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: {
        theme: 'light',
        fontSize: 'medium',
        showPhonetic: true,
        showPinyin: false,
        autoDetect: true,
        autoTranslate: true,
        bubbleCloseDelay: 10000,
        shortcut: 'Ctrl+Shift+T'
      },
      [STORAGE_KEYS.TRANSLATION_CACHE]: {},
      [STORAGE_KEYS.DICTIONARY_LOADED]: false,
      [STORAGE_KEYS.TRANSLATION_HISTORY]: []
    });

  } else if (details.reason === 'update') {
    console.log('QuickTranslate已更新到', chrome.runtime.getManifest().version);
  }

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!translationService) {
        translationService = new TranslationService();
        await translationService.init();
      }

      switch (message.action) {
      case 'translate': {
        const translationResult = await translationService.translate(
          message.text,
          message.from || 'auto',
          message.to
        );
        sendResponse(translationResult);
        break;
      }

      case 'getPhonetic': {
        const phoneticResult = await translationService.getPhonetic(message.word);
        sendResponse(phoneticResult);
        break;
      }

      case 'getConfig': {
        const config = await translationService.getConfig();
        sendResponse({ success: true, config: config });
        break;
      }

      case 'saveConfig':
        await translationService.saveConfig(message.config);
        sendResponse({ success: true });
        break;

      case 'clearCache':
        await translationService.clearCache();
        sendResponse({ success: true });
        break;

      case 'getDictionaryStats': {
        const stats = await translationService.getDictionaryStats();
        sendResponse({ success: true, stats: stats });
        break;
      }

      case 'reloadDictionary':
        await translationService.reloadDictionary();
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
  } else if (command === 'toggle-plugin') {
    // 切换插件启用/禁用状态
    chrome.tabs.sendMessage(tab.id, {
      action: 'togglePlugin'
    });
  }
});
