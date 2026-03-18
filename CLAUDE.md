# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuickTranslate is a Chrome Extension Manifest V3 that provides offline Chinese-English translation with text selection, popup interface, and TTS support. The extension uses an offline dictionary stored in Chrome Storage for translation.

## Loading and Debugging

**Load Extension:**
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this directory

**Debug Service Worker:** In extensions page, click "Service Worker" link to view logs and state

**Debug Popup:** Right-click on popup and select "Inspect"

**Debug Content Script:** Open DevTools (F12) on any webpage, logs appear in Console

## Architecture

The extension consists of four main modules communicating via `chrome.runtime.sendMessage`:

### Background Service Worker (`background/service-worker.js`)
- **TranslationService** - Main translation logic with offline dictionary support
- **TranslationCache** - 24-hour cached translations (1000 max entries)
- **OfflineDictionary** - Stores en-zh and zh-en dictionaries in Chrome Storage

### Content Script (`content/content.js`)
- Injected into all webpages via manifest
- Monitors text selection (mouseup event)
- Creates Shadow DOM bubbles for translation results
- Handles bubble positioning and auto-close timing

### Popup (`popup/popup.html/js/css`)
- Manual translation interface
- 500ms debounce on input
- Language swap and TTS features

### Options (`options/options.html/js/css`)
- Dictionary import/export (JSON format)
- Cache management
- Theme and appearance settings

## Storage Keys

All data stored in `chrome.storage.local`:
- `qt_config` - User settings (theme, default languages, etc.)
- `qt_translation_cache` - Translation results with timestamps
- `qt_dictionary_en_zh` - English-Chinese dictionary entries
- `qt_dictionary_zh_en` - Chinese-English dictionary entries
- `qt_history` - Translation history

## Message Actions

Sent to Service Worker via `sendMessage({ action: '...' })`:

| Action | Parameters | Returns |
|--------|------------|---------|
| `translate` | `{text, from, to}` | Translation result with cached flag |
| `getPhonetic` | `{word}` | `{uk, us, partOfSpeech, examples}` |
| `getConfig` | - | Current config object |
| `saveConfig` | `{config}` | Success status |
| `clearCache` | - | Success status |
| `importDictionary` | `{data, dictType}` | Success status |
| `addDictionaryEntry` | `{word, entry, dictType}` | Success status |
| `getDictionaryStats` | - | `{en_zh_count, zh_en_count}` |
| `reloadDictionary` | - | Success status |
| `speak` | `{text, lang, rate, pitch}` | Success status (uses chrome.tts) |
| `stopSpeaking` | - | Success status |

## Code Conventions

- **Functions:** JSDoc comments required for all functions with `@param` and `@returns`
- **Naming:** camelCase for variables/functions, UPPER_SNAKE_CASE for constants
- **DOM Elements:** Use `qt-` prefix (e.g., `qt-bubble-container`)
- **CSS:** BEM naming recommended for component styles
- **Shadow DOM:** Used in content script to isolate bubble styles from page styles

## Key Implementation Details

**Shadow DOM for Bubble (content.js:319-358):**
The translation bubble uses Shadow DOM to prevent style conflicts with webpage CSS. Bubble styles are injected directly into the shadow root.

**Translation Flow (service-worker.js:376-437):**
1. Validate input (max 5000 chars)
2. Check cache for existing result
3. Try exact word match in dictionary
4. Try phrase match in dictionary
5. For short text (≤10 words): return word-by-word translation
6. For long text: return error suggesting shorter selection

**Auto Language Detection (service-worker.js:367-371):**
Detects Chinese if >30% of characters are in the range \u4e00-\u9fa5.

**Bubble Positioning (content.js:281-311):**
Calculates safe position to keep bubble within viewport boundaries with padding.

## File Structure

```
chrome-translate-plugin/
├── manifest.json              # Extension manifest v3
├── background/
│   └── service-worker.js      # Translation service, cache, dictionary
├── content/
│   ├── content.js             # Selection handling, Shadow DOM bubble
│   └── content.css            # Additional page styles
├── popup/
│   ├── popup.html/js/css      # Manual translation UI
├── options/
│   ├── options.html/js/css    # Settings page with dictionary import
└── assets/icons/              # Extension icons
```

## Common Tasks

**Add new dictionary entry:**
```javascript
await sendMessage({
  action: 'addDictionaryEntry',
  word: 'example',
  entry: {
    definition: '释义',
    phonetic: { uk: 'UK-IPA', us: 'US-IPA' },
    partOfSpeech: 'n.',
    examples: []
  },
  dictType: 'en_zh'
});
```

**Clear all storage:**
```javascript
await chrome.storage.local.clear();
```

**Test translation in console:**
```javascript
chrome.runtime.sendMessage({ action: 'getConfig' });
chrome.runtime.sendMessage({
  action: 'translate',
  text: 'hello',
  from: 'auto',
  to: 'zh'
});
```

## Dictionary Entry Format

```javascript
{
  definition: '中文释义',
  translation: '中文翻译',
  phonetic: {
    uk: '英式音标',
    us: '美式音标'
  },
  partOfSpeech: '词性',
  examples: ['例句1', '例句2']
}
```

## Important Notes

- No build process required - changes take effect after reloading extension
- Service Worker must be restarted after code changes (click reload in extensions page)
- Content script requires page refresh
- Dictionary keys are case-insensitive (stored lowercase)
- Long text selections (>10 words) fail with error to protect performance
