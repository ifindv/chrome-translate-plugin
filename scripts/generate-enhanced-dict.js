#!/usr/bin/env node

/**
 * SQL Dictionary Enhancement Script
 * 为SQL词库添加增强字段（音标、词性、例句）
 */

const Runner = require('./runner');

const LEVELS = ['senior', 'CET4', 'CET6', 'graduate', 'TOEFL', 'SAT'];

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
SQL Dictionary Enhancement Tool
================================

Usage:
  npm run enhance-dict -- [options]

Options:
  --level <name>    Process specific level (one of: ${LEVELS.join(', ')})
  --all            Process all remaining levels
  --resume         Resume from where you left off
  --delay <ms>     Override rate limit (default: 1000ms)
  --dry-run        Parse and show stats without fetching API
  --help           Show this help message

Examples:
  npm run enhance-dict -- --level CET4
  npm run enhance-dict -- --all
  npm run enhance-dict -- --level senior --resume
  npm run enhance-dict -- --level CET4 --dry-run

Level names correspond to table names in SQL files:
  senior   -> sql/2 高中-乱序_sql.sql
  CET4     -> sql/3 四级-乱序_sql.sql
  CET6     -> sql/4 六级-乱序_sql.sql
  graduate -> sql/5 考研-乱序_sql.sql
  TOEFL    -> sql/6 托福-乱序_sql.sql
  SAT      -> sql/7 SAT-乱序_sql.sql

Output files are saved to sql-new/ directory.
`);
}

/**
 * 解析命令行参数
 */
function parseArgs(args) {
  const options = {
    level: null,
    all: false,
    resume: false,
    delay: 1000,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
    case '--level':
      options.level = args[++i];
      break;
    case '--all':
      options.all = true;
      break;
    case '--resume':
      options.resume = true;
      break;
    case '--delay':
      options.delay = parseInt(args[++i], 10) || 1000;
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--help':
    case '-h':
      showHelp();
      process.exit(0);
      break;
    default:
      if (arg.startsWith('-')) {
        console.error(`Unknown option: ${arg}`);
        showHelp();
        process.exit(1);
      }
    }
  }

  return options;
}

/**
 * 验证选项
 */
function validateOptions(options) {
  if (!options.level && !options.all) {
    console.error('Error: --level or --all is required');
    showHelp();
    process.exit(1);
  }

  if (options.level && options.all) {
    console.error('Error: Cannot use --level and --all together');
    process.exit(1);
  }

  if (options.level && !LEVELS.includes(options.level)) {
    console.error(`Error: Invalid level '${options.level}'. Valid levels: ${LEVELS.join(', ')}`);
    process.exit(1);
  }

  if (options.delay < 100) {
    console.error('Error: Delay must be at least 100ms');
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  SQL Dictionary Enhancement Tool v1.0  ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    // 解析参数
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    // 验证选项
    validateOptions(options);

    // 创建运行器
    const runner = new Runner({
      delay: options.delay
    });

    // 显示配置
    console.log('\nConfiguration:');
    console.log(`- Rate limit: ${options.delay}ms per request`);
    console.log(`- Resume mode: ${options.resume ? 'ON' : 'OFF'}`);
    console.log(`- Dry run: ${options.dryRun ? 'YES' : 'NO'}`);

    // 处理
    if (options.all) {
      await runner.runAll(options);
    } else {
      await runner.runLevel(options.level, options);
    }

    console.log('\n✓ All done!');

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('\n✗ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
