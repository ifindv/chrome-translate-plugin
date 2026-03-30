# SQL Dictionary Enhancement Design

**Date:** 2026-03-30
**Topic:** Extend original SQL dictionary with enhanced fields
**Status:** Approved

## Overview

Generate SQL dictionary files with enhanced fields (phonetic, part of speech, examples) for vocabulary levels 2-7 (high-school through SAT). Uses Free Dictionary API to fetch metadata while preserving original Chinese translations.

**Scope:** Process incremental by level, starting from high-school (level 2). Junior (level 1) already exists in `sql-new/`.

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
| word | `[^\']+` in VALUES clause | Preserved as-is |
| translate | Second VALUES clause | Preserved as-is |

### Enhanced Fields (from Free Dictionary API)

| Field | API Source | Fallback |
|-------|------------|----------|
| phonetic_uk | `phonetics[].text` where sourceUrl contains "uk" | Empty string |
| phonetic_us | `phonetics[].text` where sourceUrl contains "us" or last entry | Empty string |
| part_of_speech | First `partOfSpeech` from meanings | Empty string |
| examples | Up to 3 `definitions[].example` as JSON array | `[]` |

### Fallback Logic

- API fails → empty phonetic fields, `[]` for examples
- No phonetic available → empty string
- No examples found → `[]`

## File Handling

### Input Files

Read from `sql/` directory:

| Level | File | Table Name | Status |
|-------|------|------------|--------|
| 1 | `1 初中-乱序_sql.sql` | `junior` | **SKIP** (exists) |
| 2 | `2 高中-乱序_sql.sql` | `high_school` | Process |
| 3 | `3 四级-乱序_sql.sql` | `cet4` | Process |
| 4 | `4 六级-乱序_sql.sql` | `cet6` | Process |
| 5 | `5 考研-乱序_sql.sql` | `graduate` | Process |
| 6 | `6 托福-乱序_sql.sql` | `toefl` | Process |
| 7 | `7 SAT-乱序_sql.sql` | `sat` | Process |

### Output Files

Write to `sql-new/` directory with same naming convention.

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

## Error Handling

### API Errors

| Error Type | Action |
|------------|--------|
| 4xx/5xx status | Log, use fallback values, continue |
| Network timeout | Retry up to 3 times, 2s delay |
| Rate limit exceeded | Exponential backoff |

### Parse Errors

- Invalid SQL INSERT → Skip, log warning, continue
- Empty word/translate → Skip entry

### Resume Capability

- `--resume` flag skips words already in output file
- Parses existing output, finds last processed word, continues

## Error Handling & Recovery

### API Errors

| Error | Handling |
|-------|----------|
| 4xx/5xx | Log error, use fallback values (empty phonetics/examples), continue |
| Network timeout | Retry up to 3 times with 2s delay |
| Rate limit | Exponential backoff |

### Parse Errors

- Invalid SQL INSERT → Skip, log warning
- Empty word/translate → Skip entry

### Resume Capability

- `--resume` flag parses existing output and continues from last word

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
```

## CLI Interface

### Options

| Option | Description |
|--------|-------------|
| `--level <name>` | Process specific level (high-school, cet4, cet6, graduate, toefl, sat) |
| `--all` | Process all remaining levels |
| `--resume` | Skip already processed words |
| `--delay <ms>` | Override rate limit (default: 1000ms) |
| `--dry-run` | Parse and show stats without fetching API |

### Level Mapping

| Command | SQL File |
|---------|----------|
| `--level high-school` | `2 高中-乱序_sql.sql` |
| `--level cet4` | `3 四级-乱序_sql.sql` |
| `--level cet6` | `4 六级-乱序_sql.sql` |
| `--level graduate` | `5 考研-乱序_sql.sql` |
| `--level toefl` | `6 托福-乱序_sql.sql` |
| `--level sat` | `7 SAT-乱序_sql.sql` |

## Rate Limiting

- Default: 1 request per second
- Configurable via `--delay` option
- Simple setTimeout queue implementation

## Dependencies

- Node.js (native fetch or axios)
- No external database required

## Success Criteria

- All 6 levels (2-7) generated successfully in `sql-new/`
- UTF-8 preserved correctly
- SQL syntax valid for import
- Original translations unchanged
- Enhanced fields populated where API provides data
