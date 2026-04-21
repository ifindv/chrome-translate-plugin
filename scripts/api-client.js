/**
 * API客户端 - 从Free Dictionary API获取增强数据
 */
class APIClient {
  constructor(delay = 1000) {
    this.baseURL = 'https://api.dictionaryapi.dev/api/v2/entries/en';
    this.delay = delay; // 请求延迟（毫秒）
    this.lastRequestTime = 0;
    this.retryCount = 3;
    this.retryDelay = 2000;
  }

  /**
   * 获取单词的增强数据
   * @param {string} word - 单词
   * @returns {Promise<{phonetic_uk: string, phonetic_us: string, part_of_speech: string, examples: string[]}>}
   */
  async fetchWordData(word) {
    // 速率限制：确保两次请求间隔至少为delay毫秒
    await this.rateLimit();

    const enhancedData = {
      phonetic_uk: '',
      phonetic_us: '',
      part_of_speech: '',
      examples: []
    };

    try {
      const result = await this.fetchWithRetry(word);

      if (result && result.length > 0) {
        const entry = result[0];

        // 提取音标
        enhancedData.phonetic_uk = this.extractPhonetic(entry, 'uk');
        enhancedData.phonetic_us = this.extractPhonetic(entry, 'us');

        // 提取词性
        if (entry.meanings && entry.meanings.length > 0) {
          enhancedData.part_of_speech = entry.meanings[0].partOfSpeech || '';

          // 提取示例（最多3个）
          enhancedData.examples = this.extractExamples(entry.meanings);
        }
      }
    } catch (error) {
      // API错误时返回空数据，继续处理下一个单词
      console.warn(`✗ ${word}: ${error.message}`);
    }

    return enhancedData;
  }

  /**
   * 带重试的请求
   */
  async fetchWithRetry(word, attempt = 1) {
    try {
      const response = await fetch(`${this.baseURL}/${encodeURIComponent(word)}`);

      if (!response.ok) {
        if (response.status === 404) {
          // 单词不存在，返回null
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt < this.retryCount && this.shouldRetry(error)) {
        console.warn(`⏳ ${word}: retrying (${attempt}/${this.retryCount})...`);
        await this.sleep(this.retryDelay);
        return this.fetchWithRetry(word, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * 判断是否应该重试
   */
  shouldRetry(error) {
    // 网络错误、超时可以重试
    return error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT' ||
           error.code === 'ENOTFOUND' ||
           error.name === 'TypeError'; // fetch network error
  }

  /**
   * 提取指定区域的音标
   */
  extractPhonetic(entry, locale) {
    if (!entry.phonetics || entry.phonetics.length === 0) {
      return '';
    }

    // 优先从text字段查找
    for (const phonetic of entry.phonetics) {
      if (phonetic.text) {
        const lowerAudio = (phonetic.audio || phonetic.sourceUrl || '').toLowerCase();

        // 检查sourceUrl或audio中是否包含locale
        if (lowerAudio.includes(locale)) {
          return phonetic.text;
        }
      }
    }

    // 第二种方式：根据数组的顺序
    const hasUK = entry.phonetics.some(p => (p.audio || p.sourceUrl || '').toLowerCase().includes('uk'));
    const hasUS = entry.phonetics.some(p => (p.audio || p.sourceUrl || '').toLowerCase().includes('us'));

    if (locale === 'uk' && hasUK) {
      const ukEntry = entry.phonetics.find(p => (p.audio || p.sourceUrl || '').toLowerCase().includes('uk'));
      return ukEntry?.text || '';
    }

    if (locale === 'us' && hasUS) {
      const usEntry = entry.phonetics.find(p => (p.audio || p.sourceUrl || '').toLowerCase().includes('us'));
      return usEntry?.text || '';
    }

    // 如果只有一个音标且没有明确标注，UK和US都使用它
    for (const phonetic of entry.phonetics) {
      if (phonetic.text && phonetic.text.trim()) {
        return phonetic.text;
      }
    }

    return '';
  }

  /**
   * 提取示例句子
   */
  extractExamples(meanings) {
    const examples = [];

    for (const meaning of meanings) {
      if (!meaning.definitions) continue;

      for (const def of meaning.definitions) {
        if (def.example && examples.length < 3) {
          examples.push(def.example);
        }
        if (examples.length >= 3) break;
      }
      if (examples.length >= 3) break;
    }

    return examples;
  }

  /**
   * 速率限制
   */
  async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.delay) {
      const waitTime = this.delay - elapsed;
      await this.sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = APIClient;
