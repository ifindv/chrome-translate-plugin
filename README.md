# QuickTranslate - Intelligent Translation Assistant

A concise and efficient Chrome browser translation extension that supports Chinese-English text selection translation, voice reading, and phonetic display.

## Features

### Core Translation Features

- **Text Selection Translation**: Select text on any webpage to automatically detect the language and translate
- **Automatic Language Detection**: Intelligently identifies Chinese and English, automatically selecting the translation direction
- **Bilingual Display**: Supports parallel display mode for original text and translation
- **Voice Reading**: Integrated with Chrome TTS, supports reading both original text and translation
- **Phonetic Display**: Shows British and American phonetics when querying English words
- **Bubble Display**: Translation results appear in a floating bubble, not affecting page layout

### Configuration Features

- **Shortcut Settings**: Customize text selection translation shortcut (default: Ctrl+Shift+T)
- **Theme Switching**: Supports both light and dark theme modes
- **Font Settings**: Adjustable font size and type for translation results
- **Translation Engine**: Supports ECDICT offline dictionary with IndexedDB
- **Cache Management**: Intelligent translation cache to accelerate repeated translations

## Quick Start

### Installation

1. Download the extension source code locally
2. Open Chrome browser and visit `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the `chrome-translate-plugin` folder
6. Installation complete!

### Usage

#### Method 1: Text Selection Translation

1. Select the text you want to translate on any webpage using your mouse
2. Release the mouse, and the translation result will automatically appear in a bubble

#### Method 2: Shortcut Translation

1. Select the text you want to translate on a webpage
2. Press the shortcut `Ctrl+Shift+T` (Mac: `Cmd+Shift+T`)
3. View the translation result

#### Method 3: Popup Translation

1. Click the extension icon in the browser toolbar
2. Enter or paste the text you want to translate in the popup window
3. Click the "Translate" button

## Project Structure

```
chrome-translate-plugin/
├── manifest.json              # Extension manifest file
├── background/                # Background service
│   └── service-worker.js      # Service Worker (API calls, state management)
├── content/                   # Content scripts
│   ├── content.js             # Page injection script
│   └── content.css            # Style file
├── popup/                     # Popup window
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/                   # Settings page
│   ├── options.html
│   ├── options.js
│   └── options.css
├── assets/                    # Asset files
│   └── icons/
│       ├── icon.png           # Icon source file
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
├── ecdict/                    # ECDICT dictionary data
│   └── ecdict.mini.csv        # Mini dictionary file
├── scripts/                   # Utility scripts
│   └── generate-enhanced-dict.js  # Dictionary enhancement script
└── README.md                  # Project documentation
```

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Extension Spec**: Chrome Extension Manifest V3
- **Translation Engine**: ECDICT offline dictionary + IndexedDB
- **Voice Synthesis**: Chrome TTS API
- **Local Storage**: Chrome Storage API + IndexedDB

## Configuration

### Translation Engine

QuickTranslate uses the ECDICT offline dictionary for English word translations and provides high-performance local lookup through IndexedDB.

### Shortcut Settings

The default shortcut is `Ctrl+Shift+T`, which can be modified in settings to:
- `Ctrl+Shift+X`
- `Alt+Shift+T`

### Additional Shortcuts

- `Ctrl+I` / `Cmd+I` (Mac): Enable/disable the translation plugin

## Development Guide

### Development Environment

- Chrome browser (latest version)
- Code editor (VS Code recommended)

### Build and Debug

1. Load extension: `chrome://extensions/` → "Load unpacked"
2. After modifying code, click the refresh button on the extension page
3. Service Worker logs: Click "Service Worker" to view
4. Popup and Content Script logs: Open Developer Tools to view

### Code Standards

- All functions include JSDoc comments explaining functionality, parameters, and return values
- Use ES6+ syntax
- Variables and functions use camelCase naming
- Constants use UPPER_SNAKE_CASE naming

## FAQ

### Q: Translation results are inaccurate?

A: The extension uses ECDICT offline dictionary for word translations. For better sentence translation quality, consider enhancing the dictionary data or integrating additional translation APIs.

### Q: Phonetics not displaying?

A: Ensure "Show Phonetics" is enabled in settings and you are querying English words (not long sentences).

### Q: Shortcuts not working?

A: Check if the shortcut conflicts with other software, you can change the shortcut in settings.

### Q: Bubble closes too quickly?

A: You can adjust the "Bubble Auto Close" delay time in settings.

## Changelog

### v1.0.0 (2024-03-17)

- Initial release
- Supports Chinese-English text selection translation
- Supports voice reading
- Supports phonetic display
- Supports theme switching
- Supports ECDICT offline dictionary with IndexedDB

## Contributing

Issues and Pull Requests are welcome!

## License

MIT License

## Contact

- Project Homepage: [GitHub](https://github.com/ifindv/chrome-translate-plugin)
- Issue Tracker: [Issues](https://github.com/ifindv/chrome-translate-plugin/issues)

---

**QuickTranslate Team** © 2024
