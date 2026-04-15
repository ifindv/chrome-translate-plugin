# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuickTranslate is a Chrome extension (Manifest V3) that provides intelligent translation between Chinese and English. It features offline dictionary-based translation, word inflection recognition, text-to-speech, and a word-by-word translation fallback for longer text.

## Architecture

The extension follows the standard Chrome Extension architecture with three main components:

```
Content Script (injected into pages)
    ↕ chrome.runtime.sendMessage
Background Service Worker (translation logic, cache, dictionary)
    ↕ chrome.storage.local
Popup/Options UI
```

**Key Classes** (background/service-worker.js):

- `TranslationService` - Main orchestration for translation requests
- `OfflineDictionary` - CET4-based offline dictionary with inflection support
- `TranslationCache` - Local caching with 24h expiry and 1000 entry limit

**Translation Flow**:

1. `translate(text, from, to)` validates input
2. Checks cache → return if hit
3. Tries exact match in offline dictionary
4. Tries phrase match
5. Falls back to word-by-word translation (max 10 words recommended)
6. Caches result

## Development Commands

**Loading the extension:**

```bash
# Open Chrome and navigate to chrome://extensions/
# Enable "Developer mode"
# Click "Load unpacked" and select this directory
# Click refresh button after code changes
```

**Debugging locations:**

- Service Worker: `chrome://extensions/` → "Service Worker" link
- Content Script: DevTools (F12) on any webpage
- Popup: Right-click popup → "Inspect"
- Options: DevTools on options page

**No build process** - this is pure JavaScript/HTML/CSS, no compilation needed.

## Key Implementation Details

### Dictionary Format

The project uses ECDICT CSV dictionary format:

- **Current (Active)**: `ecdict/ecdict.mini.csv` - ECDICT format dictionary containing:
  - Word, phonetic, translation, part of speech (pos)
  - Collins star rating, Oxford 3000 keyword indicator
  - Exam tags (zk/gk/cet4/cet6/ky/toefl/ielts/gre)
  - BNC corpus frequency, modern corpus frequency
  - Word inflection forms (exchange field for past/present/etc.)

**ECDICT Field Format**:
| Field        | Description                           |
|--------------|----------------------------------------|
| word         | Word name                            |
| phonetic     | Phonetic notation (UK/US)            |
| translation  | Chinese translation                   |
| pos          | Part of speech with frequency ratio   |
| collins      | Collins star rating (1-5)             |
| oxford       | Oxford 3000 keyword indicator         |
| tag          | Exam tags (space-separated)           |
| bnc          | BNC corpus frequency ranking         |
| frq          | Modern corpus frequency ranking       |
| exchange     | Word inflection forms                 |

The dictionary is loaded and cached in Chrome Storage, with exchange field parsed for word inflection recognition.

### Word Inflection Recognition

The `OfflineDictionary.findStemWord()` method handles word forms with:

1. Irregular inflection lookup (IRREGULAR_INFLECTIONS map - 340+ entries)
2. Pre-built inflection map from dictionary entries
3. Rule-based fallback using INFLECTION_RULES (sorted by priority, longest suffix first)

This enables matching "ran" → "run", "went" → "go", "better" → "good", etc.

### Storage Keys

- `qt_translation_cache` - Translation results cache
- `qt_config` - User configuration (theme, fontSize, showPhonetic, etc.)
- `qt_history` - Translation history
- `qt_dictionary_en_zh` - English-Chinese dictionary
- `qt_dictionary_zh_en` - Chinese-English dictionary

### Message Interface

Send to background via `chrome.runtime.sendMessage({ action, ... })`:

| Action             | Parameters              | Returns            |
| ------------------ | ----------------------- | ------------------ |
| translate          | text, from, to          | Translation result |
| getPhonetic        | word                    | Phonetic info      |
| getConfig          | -                       | Configuration      |
| saveConfig         | config                  | Success            |
| clearCache         | -                       | Success            |
| speak              | text, lang, rate, pitch | Success            |
| stopSpeaking       | -                       | Success            |
| getDictionaryStats | -                       | Stats object       |

### Shadow DOM for Bubble UI

The translation bubble uses Shadow DOM to avoid style conflicts with host pages:

```javascript
const container = document.createElement('div');
const shadow = container.attachShadow({ mode: 'open' });
```

## Code Conventions

- **Naming**: camelCase for variables/functions, PascalCase for classes, UPPER_SNAKE_CASE for constants
- **CSS**: BEM naming with `qt-` prefix (e.g., `.qt-bubble__element`)
- **Comments**: JSDoc for all functions
- **Language**: Chinese comments throughout Chinese-language project

## File Structure Notes

- `manifest.json` - Defines extension configuration and permissions
- `background/` - Service worker containing all translation logic
- `content/` - Scripts/styles injected into web pages
- `popup/` - Extension popup UI
- `options/` - Settings page
- `ecdict/ecdict.mini.csv` - ECDICT CSV format dictionary (main dictionary source)

## Dictionary Implementation

The `OfflineDictionary` class loads ECDICT CSV files on first use and caches them in Chrome Storage. Key features:

1. **CSV Parser with Quote Support** - Handles CSV fields with embedded commas and quotes
2. **Exchange Field Parsing** - Parses ECDICT exchange format (`p:past/d:done`) for word inflections
3. **Inflection Map Building** - Creates bidirectional mapping between word forms and lemmas
4. **Tag Extraction** - Converts ECDICT tags (cet4, cet6, etc.) to readable labels

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (90-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk vitest run          # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->