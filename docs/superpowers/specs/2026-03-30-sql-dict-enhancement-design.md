# SQL Dictionary Enhancement Design

**Date:** 2026-03-30
**Topic:** Extend original SQL dictionary with enhanced fields
**Status:** Approved

## Overview

Generate SQL dictionary files with enhanced fields (phonetic, part of speech, examples) for vocabulary levels 2-7 (high-school through SAT). Uses Free Dictionary API to fetch metadata while preserving original Chinese translations.

**Scope:** Process incremental by level, starting from high-school (level 2). Junior (level 1) already exists in `sql-new/`.

## Prerequisites

This script requires Node.js environment. If `package.json` doesn't exist:

```bash
npm init -y
npm install
```

Add this npm script to `package.json`:
```json
{
  "scripts": {
    "enhance-dict": "node scripts/generate-enhanced-dict.js"
  }
}
```

Alternatively, run directly with Node.js:
```bash
node scripts/generate-enhanced-dict.js --level high-school
```

## Architecture

A standalone Node.js script `scripts/generate-enhanced-dict.js` invoked via npm.

### Entry Point

```bash
npm run enhance-dict -- --level high-school
npm run enhance-dict -- --all
npm run enhance-dict -- --level cet4 --resume
```

### Flow

```
CLI Parse → Load SQL File → Extract Words → Fetch API Data → Enrich → Generate SQL → Save
```

### Modules

| Module | Responsibility |
|--------|----------------|
| `SQLParser` | Read existing SQL files, extract word/translate pairs |
| `APIClient` | Fetch from Free Dictionary API with rate limiting (1 req/sec) |
| `SQLGenerator` | Create new SQL INSERT statements with all fields |
| `Runner` | Orchestrate process with progress reporting |

## Data Mapping

### Input Fields (from existing SQL)

| Field | Source | Output |
|-------|--------|--------|
| word | First VALUES clause | Preserved as-is |
| translate | Second VALUES clause | Preserved as-is |

### Enhanced Fields (from Free Dictionary API)

| Field | API Source | Fallback |
|-------|------------|----------|
| phonetic_uk | `phonetics[].text` where `sourceUrl` contains "uk" OR `audio` contains "uk" | Empty string |
| phonetic_us | `phonetics[].text` where `sourceUrl` contains "us" OR `audio` contains "us" OR last entry with text | Empty string |
| part_of_speech | First `partOfSpeech` from meanings | Empty string |
| examples | Up to 3 `definitions[].example` as JSON array | `[]` |

### Fallback Logic

- API fails (4xx/5xx): empty phonetic fields, `[]` for examples, continue
- No phonetic available: empty string
- No examples found: `[]`
- Phonetics entry exists but lacks `sourceUrl`: check `audio` property for locale codes (e.g., "uk-uk", "uk-us")

## File Handling

### Input Files

Read from `sql/` directory. **Table names are preserved exactly from input files.**

| Level | File | Actual Table Name | Status |
|-------|------|-------------------|--------|
| 1 | `1 初中-乱序_sql.sql` | `junior` | **SKIP** (exists) |
| 2 | `2 高中-乱序_sql.sql` | `senior` | Process |
| 3 | `3 四级-乱序_sql.sql` | `CET4` | Process |
| 4 | `4 六级-乱序_sql.sql` | `CET6` | Process |
| 5 | `5 考研-乱序_sql.sql` | `graduate` | Process |
| 6 | `6 托福-乱序_sql.sql` | `TOEFL` | Process |
| 7 | `7 SAT-乱序_sql.sql` | `SAT` | Process |

### Output Files

Write to `sql-new/` directory with same naming convention. **Table names preserved from input.**

**Never overwrites existing files** - prompts for confirmation if output exists.

### SQL Format

```sql
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS <table_name>;
CREATE TABLE <table_name> (
  word varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  translate text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  phonetic_uk varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  phonetic_us varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  part_of_speech varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  examples json CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL
) ENGINE = InnoDB CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = DYNAMIC;
INSERT INTO <table_name> (word,translate,phonetic_uk,phonetic_us,part_of_speech,examples) VALUES ('word','translate','phonetic_uk','phonetic_us','part_of_speech','["ex1","ex2"]');
...
```

**Note:** Existing files include `AUTO_INCREMENT = <number>` in CREATE TABLE. This is not added to new output as word serves as the primary identifier, not auto-increment ID.

## String Escaping

**Use double single quotes (`''`) for SQL escaping, NOT backslash.**

```javascript
escapeString(str) {
  return str.replace(/'/g, "''");
}
```

**Examples:**
- Input: `"It's a test"` → Output: `"It''s a test"`
- Input: `["Bob's car"]` → Output: `["Bob''s car"]`

**Important:** For the `examples` JSON array field, escape single quotes BEFORE passing to `JSON.stringify()`:

```javascript
// Correct order:
const example = "It's a test";
const escaped = escapeString(example);  // "It''s a test"
const jsonValue = JSON.stringify([escaped]);  // "[\"It''s a test\"]"
```

Do NOT escape after JSON serialization or you'll have double-escaped quotes.

## Error Handling & Recovery

### API Errors

| Error | Handling |
|-------|----------|
| 4xx/5xx status | Log error, use fallback values (empty phonetics/examples), continue to next word |
| Network timeout | Retry up to 3 times with 2s delay between attempts |
| Rate limit exceeded | Exponential backoff: start at 1s, double each retry (1s → 2s → 4s → 8s), max 5 retries, cap at 60s delay |

### Parse Errors

| Error | Handling |
|-------|----------|
| Invalid SQL INSERT statement | Skip entry, log warning, continue |
| Empty word or translate fields | Skip entry, log warning |
| Malformed SQL syntax | Parse entire file, report all issues, ask for user confirmation |

### Resume Capability

- `--resume` flag enables continuation from interrupted run
- Parses existing output file to find last **successfully completed** INSERT statement
- **Note:** If process crashed mid-INSERT, output file will have incomplete SQL. Resume may fail with parse error; user should manually delete/clean the partial file before resuming
- Resume identifies last completed word and continues from next entry

## Progress Reporting

**Console Output:**
```
Processing: high-school (2 高中-乱序_sql.sql)
✓ hello (1/1000) | ✗ failed: timeout (3) | ⏳ 590ms avg
✓ world (2/1000) | ...
```

**Final Summary:**
```
Completed: high-school
- Total: 2500 words
- Success: 2497
- Failed: 3
- Time: 41m23s
- Output: sql-new/2 高中-乱序_sql.sql
```

## CLI Interface

### Options

| Option | Description |
|--------|-------------|
| `--level <name>` | Process specific level (senior, CET4, CET6, graduate, TOEFL, SAT) |
| `--all` | Process all remaining levels (2-7) |
| `--resume` | Skip already processed words |
| `--delay <ms>` | Override rate limit (default: 1000ms) |
| `--dry-run` | Parse and show stats without fetching API |

### Level Mapping

| Command | SQL File | Table Name |
|---------|----------|------------|
| `--level senior` | `2 高中-乱序_sql.sql` | `senior` |
| `--level CET4` | `3 四级-乱序_sql.sql` | `CET4` |
| `--level CET6` | `4 六级-乱序_sql.sql` | `CET6` |
| `--level graduate` | `5 考研-乱序_sql.sql` | `graduate` |
| `--level TOEFL` | `6 托福-乱序_sql.sql` | `TOEFL` |
| `--level SAT` | `7 SAT-乱序_sql.sql` | `SAT` |

**Note:** CLI level arguments use actual table names for consistency and direct mapping.

## Rate Limiting

- Default: 1 request per second (1000ms delay)
- Configurable via `--delay <ms>` option
- Simple sequential processing with setTimeout between requests
- No concurrent requests - controlled pacing

## Dependencies

- Node.js 18+ (for native fetch API)
- No external dependencies required for basic functionality

## Success Criteria

- All 6 levels (2-7) generated successfully in `sql-new/`
- UTF-8 encoding preserved correctly
- SQL syntax valid for database import
- Original Chinese translations unchanged
- Enhanced fields populated where API provides data
- Proper single-quote escaping (double single quotes)
