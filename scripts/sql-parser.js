const fs = require('fs').promises;
const path = require('path');

/**
 * SQL解析器 - 解析现有SQL文件提取字典数据
 */
class SQLParser {
  /**
   * 解析SQL文件
   * @param {string} filePath - SQL文件路径
   * @returns {Promise<{tableName: string, entries: Array<{word: string, translate: string}>}>}
   */
  async parseFile(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');

    // 提取表名
    const tableName = this.extractTableName(content);
    if (!tableName) {
      throw new Error(`Could not extract table name from ${filePath}`);
    }

    // 提取VALUES条目
    const entries = this.extractEntries(content);

    console.log(`✓ Parsed ${filePath}: found ${entries.length} entries, table: ${tableName}`);

    return {
      tableName,
      entries
    };
  }

  /**
   * 从CREATE TABLE语句中提取表名
   * @param {string} content - SQL内容
   * @returns {string|null} 表名
   */
  extractTableName(content) {
    // 匹配: CREATE TABLE table_name 或 DROP TABLE IF EXISTS table_name
    const match = content.match(/(?:CREATE|DROP)\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
    return match ? match[1] : null;
  }

  /**
   * 从INSERT语句中提取单词和翻译
   * @param {string} content - SQL内容
   * @returns {Array<{word: string, translate: string}>} 条目数组
   */
  extractEntries(content) {
    const entries = [];

    // 匹配 INSERT 语句: INSERT INTO table (...) VALUES ('word','translate');
    // 注意：SQL中使用双单引号转义
    const insertRegex = /INSERT\s+INTO\s+\w+\s+\([^)]+\)\s+VALUES\s+\('([^']*)(?:''|[^'])*',\s*'([^']*(?:''|[^'])*)'\);/g;

    let match;
    while ((match = insertRegex.exec(content)) !== null) {
      const [, rawWord, rawTranslate] = match;

      // 修复双单引号: 将 '' 转换回 '
      const word = rawReplaceAll(rawWord, "''", "'");
      const translate = rawReplaceAll(rawTranslate, "''", "'");

      entries.push({ word, translate });
    }

    return entries;
  }
}

// 简单的replaceAll实现（Node.js <15 不支持原生replaceAll）
function rawReplaceAll(str, search, replacement) {
  return str.split(search).join(replacement);
}

module.exports = SQLParser;
