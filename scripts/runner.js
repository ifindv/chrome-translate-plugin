const fs = require('fs').promises;
const path = require('path');

const SQLParser = require('./sql-parser');
const APIClient = require('./api-client');
const SQLGenerator = require('./sql-generator');

/**
 * 运行器 - 协调整个处理流程
 */
class Runner {
  constructor(options = {}) {
    this.apiClient = new APIClient(options.delay || 1000);
    this.sqlParser = new SQLParser();
    this.sqlGenerator = new SQLGenerator();

    // 统计信息
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      startTime: Date.now()
    };

    this.currentLevel = null;
    this.currentCount = 0;
  }

  /**
   * 运行单个级别的处理
   * @param {string} level - 级别名称
   * @param {Object} options - 选项
   * @param {boolean} options.dryRun - 是否只做测试
   * @param {boolean} options.resume - 是否恢复
   */
  async runLevel(level, options = {}) {
    this.currentLevel = level;
    const inputFile = this.getLevelPath(level);
    const outputFile = `sql-new/${path.basename(inputFile)}`;

    console.log(`\nProcessing: ${level} (${inputFile})`);

    // 解析输入文件
    const parseResult = await this.sqlParser.parseFile(inputFile);
    this.sqlGenerator.setTableName(parseResult.tableName);

    this.stats.total = parseResult.entries.length;
    console.log(`Total entries: ${this.stats.total}`);

    // 如果是dryRun模式，只显示统计信息
    if (options.dryRun) {
      console.log('\nDry run mode - no output will be generated');
      console.log(`Estimated time: ${this.estimateTime(this.stats.total)}`);
      return;
    }

    // 检查输出文件
    const shouldResume = options.resume && await this.fileExists(outputFile);
    const processedWords = shouldResume ? await this.getProcessedWords(outputFile) : [];

    if (shouldResume) {
      console.log(`Resume mode: found ${processedWords.length} previously processed words`);
      this.stats.success = processedWords.length;
      this.currentCount = processedWords.length;
    }

    // 打开输出文件
    const writeStream = await fs.open(outputFile, 'w');

    try {
      // 写入文件头
      await writeStream.write(this.sqlGenerator.generateHeader(parseResult.tableName));

      // 处理每个条目
      for (let i = 0; i < parseResult.entries.length; i++) {
        const entry = parseResult.entries[i];

        // 如果在resume模式下已处理过，跳过
        if (shouldResume && processedWords.includes(entry.word.toLowerCase())) {
          this.currentCount++;
          continue;
        }

        // 获取增强数据
        const enhancedData = await this.apiClient.fetchWordData(entry.word);

        // 生成并写入INSERT语句
        const insert = this.sqlGenerator.generateInsert(entry, enhancedData);
        await writeStream.write(insert + '\n');

        // 更新统计
        this.currentCount++;
        if (enhancedData.phonetic_uk || enhancedData.phonetic_us || enhancedData.examples.length > 0) {
          this.stats.success++;
        } else {
          this.stats.failed++;
        }

        // 显示进度
        if (this.currentCount % 10 === 0 || this.currentCount === this.stats.total) {
          this.showProgress(entry.word);
        }
      }

      console.log(`\n✓ Completed: ${level}`);
      this.showStats(outputFile);

    } finally {
      await writeStream.close();
    }
  }

  /**
   * 运行所有级别
   */
  async runAll(options = {}) {
    const levels = ['senior', 'CET4', 'CET6', 'graduate', 'TOEFL', 'SAT'];

    console.log('Processing all levels:');
    console.log(levels.join(', '));

    for (const level of levels) {
      await this.runLevel(level, options);
    }
  }

  /**
   * 获取级别的文件路径
   */
  getLevelPath(level) {
    const paths = {
      'senior': 'sql/2 高中-乱序_sql.sql',
      'CET4': 'sql/3 四级-乱序_sql.sql',
      'CET6': 'sql/4 六级-乱序_sql.sql',
      'graduate': 'sql/5 考研-乱序_sql.sql',
      'TOEFL': 'sql/6 托福-乱序_sql.sql',
      'SAT': 'sql/7 SAT-乱序_sql.sql'
    };

    const filePath = paths[level];
    if (!filePath) {
      throw new Error(`Unknown level: ${level}`);
    }
    return filePath;
  }

  /**
   * 获取已处理的单词列表
   */
  async getProcessedWords(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const words = [];

      // 匹配已完成的INSERT语句中的word值
      const regex = /INSERT INTO \w+ \([^)]+\) VALUES \('([^']+)',/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        words.push(match[1].toLowerCase());
      }

      return words;
    } catch (error) {
      console.warn(`Failed to read output file: ${error.message}`);
      return [];
    }
  }

  /**
   * 显示进度
   */
  showProgress(word) {
    const elapsed = Date.now() - this.stats.startTime;
    const avgTime = elapsed / this.currentCount;

    process.stdout.write(`\r✓ ${word} (${this.currentCount}/${this.stats.total}) | ✗ failed: ${this.stats.failed} | ⏳ ${avgTime.toFixed(0)}ms avg`);
  }

  /**
   * 显示最终统计
   */
  showStats(outputFile) {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = (elapsed % 60).toFixed(1);

    console.log(`- Total: ${this.stats.total}`);
    console.log(`- Success: ${this.stats.success}`);
    console.log(`- Failed: ${this.stats.failed}`);
    console.log(`- Time: ${minutes}m${seconds}s`);
    console.log(`- Output: ${outputFile}`);
  }

  /**
   * 估算时间
   */
  estimateTime(count) {
    const totalSeconds = (count / 1000) + (count * 0.5); // 假设平均每词耗时500ms
    const minutes = Math.ceil(totalSeconds / 60);
    return `~${minutes} minutes`;
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Runner;
