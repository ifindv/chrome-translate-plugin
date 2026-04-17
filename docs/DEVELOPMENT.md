# Development Guide

## Getting Started

### Prerequisites

- Node.js >= 14.0.0
- Chrome or Edge browser
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/chrome-translate-plugin.git
cd chrome-translate-plugin
```

2. Install dependencies:
```bash
npm install
```

3. Load the extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory

## Project Structure

```
chrome-translate-plugin/
├── .github/              # GitHub configurations
│   ├── workflows/        # CI/CD workflows
│   └── ISSUE_TEMPLATE/   # Issue templates
├── background/           # Background service worker
├── content/             # Content scripts
├── popup/               # Popup interface
├── options/             # Options page
├── assets/              # Static assets
├── scripts/             # Build and utility scripts
├── docs/                # Documentation
├── ecdict/              # Dictionary data
└── tests/               # Test files (if any)
```

## Development Workflow

### Making Changes

1. Create a new branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes

3. Test the changes:
   - Reload the extension in Chrome
   - Test all affected features
   - Run linter: `npm run lint`
   - Check formatting: `npm run format`

4. Commit your changes:
```bash
git add .
git commit -m "feat: add your feature description"
```

5. Push and create a Pull Request

### Code Style

We use ESLint and Prettier for code formatting and linting:
- Run `npm run lint` to check code style
- Run `npm run format` to format code automatically

### Testing

Manual testing steps:
1. Load the extension in Chrome
2. Test translation functionality
3. Test dictionary lookup
4. Test settings and options
5. Test different languages
6. Test edge cases

## Building

### Generate Enhanced Dictionary

```bash
npm run enhance-dict
```

This will process the dictionary data and create an optimized version.

## Debugging

### Background Script

1. Go to `chrome://extensions/`
2. Find QuickTranslate
3. Click "Service Worker" to open DevTools

### Content Script

1. Right-click on a web page
2. Select "Inspect"
3. Go to the Console tab
4. Select the extension's context from the dropdown

### Popup

1. Right-click on the extension icon
2. Select "Inspect popup"

## Common Tasks

### Adding a New Translation API

1. Create a new API client in `scripts/api-client.js`
2. Add API configuration in `background/service-worker.js`
3. Update the options page to include the new API
4. Test thoroughly

### Adding a New Language

1. Add language code to the supported languages list
2. Update UI labels in `_locales/` directory
3. Test translation and dictionary lookup

### Modifying the UI

1. Edit HTML in `popup/` or `options/` directories
2. Update CSS in the corresponding `.css` files
3. Add JavaScript logic in `.js` files
4. Test in both light and dark modes

## Performance Optimization

### Tips

1. Use event delegation for dynamic content
2. Debounce user input
3. Cache API responses
4. Lazy load dictionary data
5. Minimize DOM manipulations

### Monitoring

Use Chrome DevTools Performance tab to:
- Record performance profiles
- Identify bottlenecks
- Monitor memory usage

## Deployment

### Preparing for Release

1. Update version in `manifest.json`
2. Update version in `package.json`
3. Update `CHANGELOG.md`
4. Run all tests
5. Run linter and formatter

### Publishing

1. Create a release tag:
```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

2. Build the extension package:
```bash
# Create a zip file excluding development files
zip -r quicktranslate-v1.0.0.zip . -x "*.git*" "node_modules/*" ".github/*"
```

3. Upload to Chrome Web Store

## Troubleshooting

### Extension not loading

- Check `manifest.json` for syntax errors
- Verify all referenced files exist
- Check browser console for errors

### Translation not working

- Verify API keys are configured
- Check network requests in DevTools
- Verify API endpoints are accessible

### Dictionary lookup fails

- Ensure dictionary data is loaded
- Check IndexedDB for data
- Verify search logic

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
