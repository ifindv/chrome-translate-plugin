/**
 * SQL生成器 - 生成增强格式的SQL语句
 */
class SQLGenerator {
  /**
   * 生成文件头部（CREATE TABLE语句）
   * @param {string} tableName - 表名
   * @returns {string} SQL头部内容
   */
  generateHeader(tableName) {
    return `SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS ${tableName};
CREATE TABLE ${tableName} (
  word varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  translate text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  phonetic_uk varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  phonetic_us varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  part_of_speech varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  examples json CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE utf8mb4_general_ci ROW_FORMAT = DYNAMIC;
`;
  }

  /**
   * 生成INSERT语句
   * @param {Object} entry - 词库条目
   * @param {Object} enhancedData - 增强数据
   * @returns {string} INSERT语句
   */
  generateInsert(entry, enhancedData) {
    const escapedWord = this.escapeString(entry.word);
    const escapedTranslate = this.escapeString(entry.translate);
    const escapedPhoneticUk = this.escapeString(enhancedData.phonetic_uk);
    const escapedPhoneticUs = this.escapeString(enhancedData.phonetic_us);
    const escapedPartOfSpeech = this.escapeString(enhancedData.part_of_speech);

    // 处理examples数组 - 先转义每个例子，再JSON化
    const escapedExamples = enhancedData.examples.map(ex => this.escapeString(ex));
    const examplesJson = JSON.stringify(escapedExamples);

    return `INSERT INTO ${this.currentTableName} (word,translate,phonetic_uk,phonetic_us,part_of_speech,examples) VALUES ('${escapedWord}','${escapedTranslate}','${escapedPhoneticUk}','${escapedPhoneticUs}','${escapedPartOfSpeech}',${examplesJson});`;
  }

  /**
   * SQL字符串转义 - 将单引号转换为双单引号
   * @param {string} str - 原始字符串
   * @returns {string} 转义后的字符串
   */
  escapeString(str) {
    if (str === null || str === undefined) {
      return '';
    }
    // 将单引号替换为双单引号
    return String(str).replace(/'/g, "''");
  }

  /**
   * 设置当前表名（用于生成INSERT语句）
   * @param {string} tableName - 表名
   */
  setTableName(tableName) {
    this.currentTableName = tableName;
  }
}

module.exports = SQLGenerator;
