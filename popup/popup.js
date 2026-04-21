/**
 * QuickTranslate - Popup逻辑文件
 *
 * 功能说明：
 * - 处理用户输入和翻译请求
 * - 显示翻译结果
 * - 快捷键提示
 * - 配置跳转
 *
 * @module popup
 * @version 1.0.0
 */

// ==================== 常量定义 ====================

/**
 * 配置项
 */
const CONFIG = {
  MAX_TEXT_LENGTH: 10000,
  DEBOUNCE_DELAY: 300
};

// ==================== 状态管理 ====================

/**
 * 当前状态
 */
const state = {
  sourceLang: 'auto',
  targetLang: 'zh',
  isTranslating: false,
  theme: 'light',
  config: null
};

/**
 * 防抖定时器
 */
let debounceTimer = null;

// ==================== DOM元素引用 ====================

/**
 * DOM元素引用
 */
const elements = {
  // 头部元素
  settingsBtn: null,
  appBody: null,

  // 输入元素
  sourceLangSelect: null,
  targetLangSelect: null,
  swapLangBtn: null,
  sourceText: null,
  clearBtn: null,
  sourceCount: null,
  translateBtn: null,

  // 结果元素
  resultSection: null,
  resultTitle: null,
  resultText: null,
  resultSource: null,
  speakResultBtn: null,
  copyResultBtn: null,

  // 加载元素
  loading: null,

  // 快捷提示
  tips: null,

  // 底部元素
  helpLink: null
};

// ==================== 消息通信 ====================

/**
 * 向background发送消息
 * @param {Object} message - 消息对象
 * @returns {Promise<Object>} 响应结果
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: '无响应' });
      }
    });
  });
}

/**
 * 获取用户配置
 * @returns {Promise<Object>} 配置对象
 */
async function getConfig() {
  const response = await sendMessage({ action: 'getConfig' });
  return response.success ? response.config : null;
}



// ==================== 翻译功能 ====================

/**
 * 执行翻译
 * @param {string} text - 待翻译文本
 * @param {string} from - 源语言
 * @param {string} to - 目标语言
 */
async function translate(text, from = state.sourceLang, to = state.targetLang) {
  // 验证输入
  if (!text || text.trim().length === 0) {
    showResult('', false);
    return;
  }

  if (state.isTranslating) {
    return;
  }

  state.isTranslating = true;
  updateUIState();

  try {
    // 发送翻译请求
    const response = await sendMessage({
      action: 'translate',
      text: text,
      from: from,
      to: to
    });

    if (response.success) {
      showResult(response.translated, true, response);
    } else {
      showResult('翻译失败: ' + (response.error || '未知错误'), false);
    }
  } catch (error) {
    console.error('翻译失败:', error);
    showResult('翻译失败，请稍后重试', false);
  } finally {
    state.isTranslating = false;
    updateUIState();
  }
}

/**
 * 显示翻译结果
 * @param {string} text - 结果文本
 * @param {boolean} success - 是否成功
 * @param {Object} detail - 详细信息
 */
function showResult(text, success, detail = null) {
  if (success && text) {
    elements.resultText.innerHTML = escapeHtml(text);
    elements.resultSection.style.display = 'block';

    // 显示来源信息
    if (detail) {
      const sourceText = detail.source === 'offline' ? '离线词典' :
        detail.source === 'mymemory' ? 'MyMemory' :
          detail.source === 'baidu' ? '百度翻译' : '未知';
      elements.resultSource.textContent = `来源: ${sourceText}${detail.fromCache ? ' (缓存)' : ''}`;
    } else {
      elements.resultSource.textContent = '';
    }
  } else {
    elements.resultText.innerHTML = '<div class="qt-placeholder">翻译结果将显示在这里</div>';
    elements.resultSource.textContent = '';
  }
}

/**
 * 更新UI状态
 */
function updateUIState() {
  // 翻译按钮状态
  elements.translateBtn.disabled = state.isTranslating || !elements.sourceText.value.trim();

  // 加载动画
  elements.loading.style.display = state.isTranslating ? 'flex' : 'none';

  // 结果区域显示状态
  if (!state.isTranslating) {
    elements.resultSection.style.display = !state.isTranslating && elements.resultText.querySelector('.qt-placeholder') === null
      ? 'block'
      : 'none';
  } else {
    elements.resultSection.style.display = 'none';
  }
}

// ==================== 事件处理 ====================

/**
 * 初始化事件监听器
 */
function initEventListeners() {
  // 设置按钮
  if (elements.settingsBtn) {
    elements.settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // 语言选择
  if (elements.sourceLangSelect) {
    elements.sourceLangSelect.addEventListener('change', (e) => {
      state.sourceLang = e.target.value;
      if (elements.sourceText.value.trim()) {
        translate(elements.sourceText.value, state.sourceLang, state.targetLang);
      }
    });
  }

  if (elements.targetLangSelect) {
    elements.targetLangSelect.addEventListener('change', (e) => {
      state.targetLang = e.target.value;
      if (elements.sourceText.value.trim()) {
        translate(elements.sourceText.value, state.sourceLang, state.targetLang);
      }
    });
  }

  // 交换语言
  if (elements.swapLangBtn) {
    elements.swapLangBtn.addEventListener('click', () => {
      // 交换保存的语言
      const temp = state.sourceLang;
      state.sourceLang = state.targetLang === 'zh' ? 'en' : 'zh';
      state.targetLang = temp === 'auto' ? 'zh' : temp;

      // 更新UI
      elements.sourceLangSelect.value = state.sourceLang;
      elements.targetLangSelect.value = state.targetLang;

      // 交换文本内容
      const resultText = elements.resultText.textContent;
      if (resultText && !elements.resultText.querySelector('.qt-placeholder')) {
        elements.sourceText.value = resultText;
        updateCharCount();
        translate(resultText, state.sourceLang, state.targetLang);
      }
    });
  }

  // 文本输入
  if (elements.sourceText) {
    elements.sourceText.addEventListener('input', () => {
      updateCharCount();
      updateUIState();

      // 防抖：停止输入500ms后自动翻译
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      const text = elements.sourceText.value.trim();
      if (text) {
        debounceTimer = setTimeout(() => {
          translate(text, state.sourceLang, state.targetLang);
        }, 500);
      }
    });
  }

  // 清空按钮
  if (elements.clearBtn) {
    elements.clearBtn.addEventListener('click', () => {
      elements.sourceText.value = '';
      updateCharCount();
      updateUIState();
      showResult('', false);
      elements.sourceText.focus();
    });
  }

  // 翻译按钮
  if (elements.translateBtn) {
    elements.translateBtn.addEventListener('click', () => {
      const text = elements.sourceText.value.trim();
      if (text) {
        translate(text, state.sourceLang, state.targetLang);
      }
    });
  }

  // 朗读结果按钮
  if (elements.speakResultBtn) {
    elements.speakResultBtn.addEventListener('click', async () => {
      const resultText = elements.resultText.textContent;
      if (resultText && !elements.resultText.querySelector('.qt-placeholder')) {
        await sendMessage({
          action: 'speak',
          text: resultText,
          lang: state.targetLang === 'zh' ? 'zh-CN' : 'en-US'
        });
      }
    });
  }

  // 复制结果按钮
  if (elements.copyResultBtn) {
    elements.copyResultBtn.addEventListener('click', async () => {
      const resultText = elements.resultText.textContent;
      if (resultText && !elements.resultText.querySelector('.qt-placeholder')) {
        try {
          await navigator.clipboard.writeText(resultText);
          const originalText = elements.copyResultBtn.innerHTML;
          elements.copyResultBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#52c41a" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          setTimeout(() => {
            elements.copyResultBtn.innerHTML = originalText;
          }, 1500);
        } catch (error) {
          console.error('复制失败:', error);
        }
      }
    });
  }

  // 帮助链接
  if (elements.helpLink) {
    elements.helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({
        url: 'https://github.com/ifindv/chrome-translate-plugin'
      });
    });
  }
}

/**
 * 更新字符计数
 */
function updateCharCount() {
  const count = elements.sourceText.value.length;
  elements.sourceCount.textContent = `${count}/${CONFIG.MAX_TEXT_LENGTH}`;

  // 限制输入长度
  if (count >= CONFIG.MAX_TEXT_LENGTH) {
    elements.sourceCount.style.color = 'var(--qt-error-color)';
  } else {
    elements.sourceCount.style.color = 'var(--qt-text-disabled)';
  }
}

/**
 * HTML转义
 * @param {string} text - 待转义文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== 主题管理 ====================

/**
 * 应用主题
 * @param {string} theme - 主题名称 (light/dark)
 */
function applyTheme(theme) {
  state.theme = theme;
  if (elements.appBody) {
    elements.appBody.setAttribute('data-theme', theme);
  }
}

// ==================== 初始化 ====================

/**
 * 初始化Popup
 */
async function init() {
  // 获取DOM元素
  elements.appBody = document.body;
  elements.settingsBtn = document.getElementById('qt-settings-btn');
  elements.sourceLangSelect = document.getElementById('qt-source-lang');
  elements.targetLangSelect = document.getElementById('qt-target-lang');
  elements.swapLangBtn = document.getElementById('qt-swap-lang');
  elements.sourceText = document.getElementById('qt-source-text');
  elements.clearBtn = document.getElementById('qt-clear-btn');
  elements.sourceCount = document.getElementById('qt-source-count');
  elements.translateBtn = document.getElementById('qt-translate-btn');
  elements.resultSection = document.getElementById('qt-result-section');
  elements.resultText = document.getElementById('qt-result-text');
  elements.resultSource = document.getElementById('qt-result-source');
  elements.speakResultBtn = document.getElementById('qt-speak-result-btn');
  elements.copyResultBtn = document.getElementById('qt-copy-result-btn');
  elements.loading = document.getElementById('qt-loading');
  elements.helpLink = document.getElementById('qt-help-link');

  // 获取用户配置
  state.config = await getConfig();

  if (state.config) {
    // 应用主题
    applyTheme(state.config.theme || 'light');

    // 应用默认语言设置
    if (state.config.defaultTargetLang) {
      state.targetLang = state.config.defaultTargetLang;
      elements.targetLangSelect.value = state.targetLang;
    }
  }

  // 初始化事件监听器
  initEventListeners();

  // 更新UI状态
  updateUIState();

  // 自动聚焦输入框
  elements.sourceText.focus();

  console.log('QuickTranslate Popup 已加载');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 监听配置变化
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.qt_config) {
    const newConfig = changes.qt_config.newValue;
    state.config = newConfig;

    // 应用主题变化
    if (newConfig.theme !== state.theme) {
      applyTheme(newConfig.theme);
    }
  }
});
