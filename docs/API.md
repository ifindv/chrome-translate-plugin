# API Documentation

## Overview

QuickTranslate extension provides both internal and external APIs for translation and dictionary operations.

## Internal APIs

### Message Passing

#### Translation Request

**From**: Popup/Content Script
**To**: Background Service Worker

```javascript
chrome.runtime.sendMessage({
  type: 'TRANSLATE',
  payload: {
    text: 'Hello world',
    sourceLang: 'en',
    targetLang: 'zh-CN'
  }
}, response => {
  console.log(response.translation);
});
```

**Response**:
```javascript
{
  success: true,
  translation: '你好世界',
  sourceLang: 'en',
  targetLang: 'zh-CN'
}
```

#### Dictionary Lookup

**From**: Popup/Content Script
**To**: Background Service Worker

```javascript
chrome.runtime.sendMessage({
  type: 'LOOKUP',
  payload: {
    word: 'hello'
  }
}, response => {
  console.log(response.definition);
});
```

**Response**:
```javascript
{
  success: true,
  word: 'hello',
  phonetic: '/həˈləʊ/',
  definition: 'used as a greeting or to begin a phone conversation',
  examples: ['hello there, Katie!']
}
```

### Storage API

#### Get Settings

```javascript
chrome.storage.local.get(['settings'], (result) => {
  const settings = result.settings;
});
```

#### Save Settings

```javascript
const settings = {
  autoTranslate: true,
  defaultSourceLang: 'en',
  defaultTargetLang: 'zh-CN'
};

chrome.storage.local.set({ settings }, () => {
  console.log('Settings saved');
});
```

## External APIs

### Translation API

**Endpoint**: `https://api.example.com/translate`

**Method**: POST

**Headers**:
```
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

**Request Body**:
```json
{
  "text": "Hello world",
  "source": "en",
  "target": "zh-CN"
}
```

**Response**:
```json
{
  "success": true,
  "translation": "你好世界",
  "source": "en",
  "target": "zh-CN"
}
```

### Dictionary API

**Endpoint**: `https://api.example.com/dictionary`

**Method**: GET

**Parameters**:
- `word`: The word to look up
- `lang`: Language code (default: en)

**Example Request**:
```
GET /dictionary?word=hello&lang=en
```

**Response**:
```json
{
  "word": "hello",
  "phonetic": "/həˈləʊ/",
  "definitions": [
    {
      "partOfSpeech": "exclamation",
      "definition": "used as a greeting or to begin a phone conversation"
    }
  ],
  "examples": [
    "hello there, Katie!"
  ]
}
```

## Error Handling

All API responses follow this error format:

```javascript
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Error description'
  }
}
```

### Common Error Codes

- `NETWORK_ERROR`: Network connection failed
- `API_ERROR`: External API error
- `INVALID_REQUEST`: Invalid request parameters
- `RATE_LIMITED`: API rate limit exceeded
- `AUTH_ERROR`: Authentication failed

## Rate Limiting

- Translation API: 100 requests per minute
- Dictionary API: 200 requests per minute

## Authentication

API keys should be stored securely in Chrome storage and never exposed in client-side code.

## Browser Extension APIs Used

- `chrome.runtime`: Message passing
- `chrome.storage`: Data persistence
- `chrome.tabs`: Tab management
- `chrome.i18n`: Internationalization
- `chrome.contextMenus`: Context menu integration
