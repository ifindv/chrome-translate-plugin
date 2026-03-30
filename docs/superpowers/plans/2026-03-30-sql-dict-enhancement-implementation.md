# Implementation Plan: SQL Dictionary Enhancement

**Design Spec:** `docs/superpowers/specs/2026-03-30-sql-dict-enhancement-design.md`
**Date:** 2026-03-30

## Overview

Create a Node.js script to generate enhanced SQL dictionary files with phonetic, part of speech, and example data fetched from Free Dictionary API.

## Implementation Steps

### Step 1: Setup Project Structure

**Actions:**
- [ ] Create `scripts/` directory if not exists
- [ ] Create `scripts/generate-enhanced-dict.js`
- [ ] Initialize `package.json` if not exists
- [ ] Add npm script: `"enhance-dict": "node scripts/generate-enhanced-dict.js"`

**Verification:** Running `npm run enhance-dict -- --help` shows usage instructions

### Step 2: Implement SQLParser Module

**Actions:**
- [ ] Create `SQLParser` class
- [ ] Implement `parseFile(filePath)` to read SQL file
- [ ] Implement regex to extract table name from `CREATE TABLE`
- [ ] Implement regex to extract INSERT statements
- [ ] Parse word/translate pairs from VALUES clauses
- [ ] Handle Unicode (BOM) if present
- [ ] Return structured data: `{ tableName, entries: [{word, translate}, ...] }`

**Regex Pattern:**
```javascript
/INSERT INTO (\w+)\s+\([^)]+\)\s+VALUES\s+\('([^']+)'\s*,\s*'([^']+)'\);/g
```

### Step 3: Implement APIClient Module

**Actions:**
- [ ] Create `APIClient` class
- [ ] Implement `fetchWordData(word)` method
- [ ] Call https://api.dictionaryapi.dev/api/v2/entries/en/{word}
- [ ] Extract phonetic_uk, phonetic_us, part_of_speech, examples
- [ ] Handle 404 (word not found) - return empty data
- [ ] Handle API errors with fallback data
- [ ] Implement retry logic (up to 3 retries, 2s delay)
- [ ] Implement rate limiting queue

**Rate Limiting:**
- Use simple sequential processing with `await sleep(delay)`
- Default: 1000ms between requests

### Step 4: Implement SQLGenerator Module

**Actions:**
- [ ] Create `SQLGenerator` class
- [ ] Implement `escapeString(str)` using double single quotes
- [ ] Implement `generateHeader(tableName)` for CREATE TABLE
- [ ] Implement `generateInsert(entry)` for INSERT statement
- [ ] Format examples as JSON array
- [ ] Apply escaping to all string fields (word, translate, phonetics, examples)

**Extraction Logic:**
- phonetic_uk: Find phonetic with "uk" in sourceUrl or audio URL
- phonetic_us: Find phonetic with "us" in sourceUrl or audio URL, or last entry
- part_of_speech: First meaning's partOfSpeech
- examples: Up to 3 definitions with example field

### Step 5: Implement Runner Module

**Actions:**
- [ ] Create `Runner` class
- [ ] Implement main orchestration loop
- [ ] Load SQL file via SQLParser
- [ ] For each word: fetch API data, generate INSERT
- [ ] Stream output to file (not hold in memory)
- [ ] Track progress metrics (total, success, failed, errors)
- [ ] Implement progress console reporting

### Step 6: Implement CLI Argument Parsing

**Actions:**
- [ ] Parse command-line arguments
- [ ] Implement `--level <name>` option
- [ ] Implement `--all` option
- [ ] Implement `--resume` option
- [ ] Implement `--delay <ms>` option
- [ ] Implement `--dry-run` option
- [ ] Map level names to file paths

**Level Mapping:**
```javascript
{
  'senior': 'sql/2 高中-乱序_sql.sql',
  'CET4': 'sql/3 四级-乱序_sql.sql',
  'CET6': 'sql/4 六级-乱序_sql.sql',
  'graduate': 'sql/5 考研-乱序_sql.sql',
  'TOEFL': 'sql/6 托福-乱序_sql.sql',
  'SAT': 'sql/7 SAT-乱序_sql.sql'
}
```

Output paths: `sql-new/<filename>`

### Step 7: Implement Resume Capability

**Actions:**
- [ ] Parse existing output file if `--resume` flag set
- [ ] Find last successfully completed INSERT
- [ ] Extract processed word list
- [ ] Skip words already in output
- [ ] Handle malformed output gracefully (warn user)

### Step 8: Implement Error Handling & Logging

**Actions:**
- [ ] Log API failures with word and error code
- [ ] Log parse errors with line number
- [ ] Track failure counts by type
- [ ] Implement exponential backoff for rate limits
- [ ] Graceful degradation (continue on individual word failures)

### Step 9: Implement Progress Reporting

**Actions:**
- [ ] Real-time console updates with current word and count
- [ ] Show running average time per word
- [ ] Show failure count
- [ ] Final summary with all metrics

**Output Format:**
```
Processing: senior (2 高中-乱序_sql.sql)
✓ hello (1/1000) | ✗ failed: 3 | ⏳ 590ms avg
```

### Step 10: Implement --dry-run Mode

**Actions:**
- [ ] Parse file and show stats only
- [ ] Display word count and file info
- [ ] Don't fetch API or generate output
- [ ] Show estimated time based on word count

## File Structure

```
scripts/
  └── generate-enhanced-dict.js
package.json
sql/               (input files, existing)
sql-new/           (output files, created by script)
```

## Testing Strategy

### Manual Testing

1. **Test with single word:**
   - Run: `node scripts/generate-enhanced-dict.js --level senior --dry-run`
   - Verify: Stats display correctly

2. **Test with small sample:**
   - Create test SQL with 5 words
   - Run script
   - Verify: Output format matches spec

3. **Test resume:**
   - Run script, interrupt mid-process (Ctrl+C)
   - Run again with `--resume`
   - Verify: Continues from where interrupted

4. **Test API failure handling:**
   - Temporarily fail network or use invalid word
   - Verify: Error logged, fallback data used, continues

5. **Test with all levels:**
   - Run `--all` flag
   - Verify: All 6 files generated

### Validation Checklist

- [ ] Output SQL is valid and can be imported
- [ ] UTF-8 encoding preserved
- [ ] Single quotes properly escaped ('' not \')
- [ ] Examples array is valid JSON
- [ ] Table names match input (senior, CET4, CET6, etc.)
- [ ] Rate limiting works (no bursts)
- [ ] Resume feature works after interruption
- [ ] Progress displays correctly

## Dependencies

- Node.js 18+ (native `fetch`)
- No external npm packages required

## Estimated Time

| Step | Time |
|------|------|
| Setup | 5 min |
| SQLParser | 20 min |
| APIClient | 30 min |
| SQLGenerator | 25 min |
| Runner | 20 min |
| CLI | 15 min |
| Resume | 15 min |
| Error Handling | 20 min |
| Progress | 10 min |
| Dry-run | 10 min |
| Testing | 60 min |
| **Total** | ~3 hours |

## Success Criteria

- [ ] Script runs without external dependencies
- [ ] All 6 levels processed successfully
- [ ] Output valid SQL matching spec format
- [ ] Original translations unchanged
- [ ] Enhanced fields populated where API provides data
- [ ] Proper error handling and logging
- [ ] Resume capability functional
