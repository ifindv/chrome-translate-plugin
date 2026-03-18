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
  DICTIONARY_EN_ZH: 'qt_dictionary_en_zh',  // 英汉词典
  DICTIONARY_ZH_EN: 'qt_dictionary_zh_en'   // 汉英词典
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
const DICT_FILES = [
  'dict/CET4-1.json',
  'dict/CET4-2.json',
  'dict/CET4-3.json',
  'dict/CET4-4.json',
  'dict/CET4-5.json'
];

/**
 * 离线词典服务类
 */
class OfflineDictionary {
  constructor() {
    this.dictionary = {
      en_zh: {},
      zh_en: {}
    };
  }

  /**
   * 加载词典数据 (从本地文件加载)
   */
  async load() {
    // 先从 Chrome Storage 获取已有的词典数据
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.DICTIONARY_EN_ZH,
      STORAGE_KEYS.DICTIONARY_ZH_EN
    ]);

    this.dictionary.en_zh = data[STORAGE_KEYS.DICTIONARY_EN_ZH] || {};
    this.dictionary.zh_en = data[STORAGE_KEYS.DICTIONARY_ZH_EN] || {};

    // 如果 Chrome Storage 中的词典为空，则从本地文件加载
    if (Object.keys(this.dictionary.en_zh).length === 0) {
      console.log('正在从本地文件加载词典...');
      await this.loadFromLocalFiles();
    }

    console.log('离线词典已加载:',
      '英汉:', Object.keys(this.dictionary.en_zh).length, '词',
      '汉英:', Object.keys(this.dictionary.zh_en).length, '词');
  }

  /**
   * 从本地文件加载词典
   */
  async loadFromLocalFiles() {
    let dictData = {};

    try {
      // 并发加载所有词典文件
      const promises = DICT_FILES.map(file => this.fetchDictFile(file));
      const results = await Promise.all(promises);

      // 合并所有词典数据
      for (const result of results) {
        Object.assign(dictData, result);
      }

      this.dictionary.en_zh = dictData;

      // 保存到 Chrome Storage
      await chrome.storage.local.set({
        [STORAGE_KEYS.DICTIONARY_EN_ZH]: this.dictionary.en_zh,
        [STORAGE_KEYS.DICTIONARY_ZH_EN]: this.dictionary.zh_en
      });

      console.log('词典已加载并保存到存储:', Object.keys(this.dictionary.en_zh).length, '词');
    } catch (error) {
      console.error('加载词典文件失败:', error);
    }
  }

  /**
   * 获取单个词典文件
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 词典数据
   */
  async fetchDictFile(filePath) {
    try {
      const response = await fetch(chrome.runtime.getURL(filePath));
      if (!response.ok) {
        console.warn(`无法加载词典文件: ${filePath}`);
        return {};
      }
      return await response.json();
    } catch (error) {
      console.error(`加载词典文件 ${filePath} 失败:`, error);
      return {};
    }
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

    // 确定使用哪个词典
    let dict = null;
    if (from === 'en' && to === 'zh') {
      dict = this.dictionary.en_zh;
    } else if (from === 'zh' && to === 'en') {
      dict = this.dictionary.zh_en;
    }

    if (!dict) {
      return null;
    }

    const entry = dict[key];
    if (entry) {
      return {
        success: true,
        original: word,
        translated: entry.definition || entry.translation || '',
        uk: entry.phonetic?.uk || '',
        us: entry.phonetic?.us || '',
        partOfSpeech: entry.partOfSpeech || '',
        examples: entry.examples || [],
        source: 'offline'
      };
    }

    // 尝试精确匹配（不转小写）
    const exactEntry = dict[word];
    if (exactEntry) {
      return {
        success: true,
        original: word,
        translated: exactEntry.definition || exactEntry.translation || '',
        uk: exactEntry.phonetic?.uk || '',
        us: exactEntry.phonetic?.us || '',
        partOfSpeech: exactEntry.partOfSpeech || '',
        examples: exactEntry.examples || [],
        source: 'offline'
      };
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

    let dict = null;
    if (from === 'en' && to === 'zh') {
      dict = this.dictionary.en_zh;
    } else if (from === 'zh' && to === 'en') {
      dict = this.dictionary.zh_en;
    }

    if (!dict) {
      return null;
    }

    // 尝试直接匹配短语
    if (dict[key]) {
      const entry = dict[key];
      return {
        success: true,
        original: phrase,
        translated: entry.definition || entry.translation || entry.toString(),
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
    // 按单词分割（支持中英文混合）
    let words = [];
    if (from === 'en') {
      words = text.split(/\s+/).filter(w => w.length > 0);
    } else {
      // 中文按字符分割
      words = text.split('');
    }

    const translations = [];
    const notFoundWords = [];

    for (const word of words) {
      const result = this.lookup(word, from, to);
      if (result && result.success) {
        translations.push(result.translated);
      } else {
        translations.push(word); // 未知单词保留原文
        notFoundWords.push(word);
      }
    }

    return {
      success: true,
      original: text,
      translated: translations.join(from === 'en' ? ' ' : ''),
      source: 'offline',
      type: 'word-by-word',
      wordCount: words.length,
      foundCount: words.length - notFoundWords.length
    };
  }

  /**
   * 添加词典条目
   * @param {string} word - 单词
   * @param {Object} entry - 词典条目
   * @param {string} dictType - 词典类型 (en_zh 或 zh_en)
   */
  async addEntry(word, entry, dictType = 'en_zh') {
    const key = word.toLowerCase().trim();

    if (dictType === 'en_zh') {
      this.dictionary.en_zh[key] = entry;
      await chrome.storage.local.set({
        [STORAGE_KEYS.DICTIONARY_EN_ZH]: this.dictionary.en_zh
      });
    } else if (dictType === 'zh_en') {
      this.dictionary.zh_en[key] = entry;
      await chrome.storage.local.set({
        [STORAGE_KEYS.DICTIONARY_ZH_EN]: this.dictionary.zh_en
      });
    }
  }

  /**
   * 批量导入词典
   * @param {Object} data - 词典数据
   * @param {string} dictType - 词典类型
   */
  async importDictionary(data, dictType = 'en_zh') {
    if (dictType === 'en_zh') {
      Object.assign(this.dictionary.en_zh, data);
      await chrome.storage.local.set({
        [STORAGE_KEYS.DICTIONARY_EN_ZH]: this.dictionary.en_zh
      });
    } else if (dictType === 'zh_en') {
      Object.assign(this.dictionary.zh_en, data);
      await chrome.storage.local.set({
        [STORAGE_KEYS.DICTIONARY_ZH_EN]: this.dictionary.zh_en
      });
    }
  }

  /**
   * 获取词典统计
   */
  getStats() {
    return {
      en_zh_count: Object.keys(this.dictionary.en_zh).length,
      zh_en_count: Object.keys(this.dictionary.zh_en).length
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
    if (from === 'auto') {
      from = this.detectLanguage(text);
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
        fromCache: true
      };
    }

    // 尝试完整文本匹配
    const exactMatch = this.dictionary.lookup(text, from, to);
    if (exactMatch && exactMatch.success) {
      await this.cache.set(text, from, to, exactMatch);
      return exactMatch;
    }

    // 尝试短语匹配
    const phraseMatch = this.dictionary.translatePhrase(text, from, to);
    if (phraseMatch && phraseMatch.success) {
      await this.cache.set(text, from, to, phraseMatch);
      return phraseMatch;
    }

    // 逐词翻译
    const wordByWordResult = this.dictionary.translateWordByWord(text, from, to);

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
        wordByWord: wordByWordResult
      };
    }
  }

  /**
   * 获取音标
   */
  async getPhonetic(word) {
    // 从英汉词典获取音标
    const result = this.dictionary.lookup(word, 'en', 'zh');

    if (result && result.success) {
      return {
        success: true,
        word: word,
        uk: result.uk || '',
        us: result.us || '',
        partOfSpeech: result.partOfSpeech || '',
        examples: result.examples || []
      };
    }

    return {
      success: false,
      word: word,
      error: '未找到音标信息'
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
  async importDictionary(data, dictType = 'en_zh') {
    await this.dictionary.importDictionary(data, dictType);
  }

  /**
   * 添加词典条目
   */
  async addDictionaryEntry(word, entry, dictType = 'en_zh') {
    await this.dictionary.addEntry(word, entry, dictType);
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
      [STORAGE_KEYS.DICTIONARY_ZH_EN]: {},
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
