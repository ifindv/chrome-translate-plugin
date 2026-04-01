/**
 * QuickTranslate - Content Script
 *
 * 功能说明：
 * - 监听用户划词事件（mouseup、contextmenu）
 * - 创建和管理翻译气泡UI
 * - 显示翻译结果（对照模式）
 * - 实现语音朗读功能
 * - 集成音标显示
 *
 * @module content
 * @version 1.0.0
 */

// ==================== 常量定义 ====================

/**
 * 气泡配置
 */
const BUBBLE_CONFIG = {
  MAX_WIDTH: 450,        // 最大宽度
  MIN_WIDTH: 250,        // 最小宽度
  MAX_HEIGHT: 400,       // 最大高度（增加以支持更多单词显示）
  ANIMATION_DURATION: 200,  // 动画时长
  CLOSE_DELAY: 2000       // 自动关闭延迟（毫秒）
};

/**
 * 样式配置
 */
const STYLE_CONFIG = {
  LIGHT: {
    backgroundColor: '#ffffff',
    textColor: '#333333',
    borderColor: '#e0e0e0',
    shadowColor: 'rgba(0, 0, 0, 0.15)'
  },
  DARK: {
    backgroundColor: '#2d2d2d',
    textColor: '#ffffff',
    borderColor: '#444444',
    shadowColor: 'rgba(0, 0, 0, 0.3)'
  }
};

/**
 * 当前选中文本
 */
let selectedText = '';
let selectionStart = { x: 0, y: 0 };

/**
 * 当前气泡引用
 */
let currentBubble = null;
let bubbleTimer = null;
let currentTranslation = null;
let currentPhonetic = null;
let currentWordIndex = 0; // 当前显示的单词索引（用于翻页）
let wordResults = []; // 当前翻译的所有单词结果

/**
 * 用户配置
 */
let userConfig = null;

// ==================== 消息通信函数 ====================

/**
 * 向background service worker发送消息
 * @param {Object} message - 消息对象
 * @returns {Promise<Object>} 响应结果
 */
async function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || { success: false, error: '无响应' });
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

// ==================== 划词检测 ====================

/**
 * 获取当前选中的文本
 * @returns {Object} 选中文本和位置信息
 */
function getSelectedText() {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed) {
    return { text: '', range: null };
  }

  const text = selection.toString().trim();

  if (!text) {
    return { text: '', range: null };
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return {
    text: text,
    range: range,
    rect: rect,
    x: rect.left + rect.width / 2,
    y: rect.bottom + window.scrollY
  };
}

/**
 * 检测文本语言（简单判断）
 * @param {string} text - 待检测文本
 * @returns {string} 语言代码 (zh, en)
 */
function detectLanguage(text) {
  // 统计中文字符数量
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const totalChars = text.length;

  // 如果中文字符超过30%，判断为中文
  return chineseChars / totalChars > 0.3 ? 'zh' : 'en';
}

/**
 * 处理选中文本
 */
async function handleSelection() {
  // 清除之前的气泡
  hideBubble(false); // 不清除选区

  // 获取选中文本
  const selectionInfo = getSelectedText();

  if (!selectionInfo.text) {
    return;
  }

  // 过滤无效文本
  if (selectionInfo.text.length > 10000) {
    console.warn('选中文本过长，超过10000字符');
    return;
  }

  selectedText = selectionInfo.text;

  // 使用选区rect位置作为气泡位置（更准确）
  selectionStart.x = selectionInfo.rect.left + selectionInfo.rect.width / 2;
  selectionStart.y = selectionInfo.rect.bottom + window.scrollY;

  // 检测语言并确定翻译目标
  const detectedLang = detectLanguage(selectedText);
  const targetLang = detectedLang === 'zh' ? 'en' : 'zh';

  // 显示加载气泡
  showBubble(selectionStart.x, selectionStart.y, null, true);

  // 发送翻译请求
  const translationResult = await sendMessage({
    action: 'translate',
    text: selectedText,
    from: 'auto',
    to: targetLang
  });

  if (translationResult.success && translationResult.translated) {
    currentTranslation = translationResult;

    // 如果启用音标且是英文单词，查询音标
    const config = userConfig || {};
    // 检查是否为单个单词（支持缩写词如 "U.S."）
    const wordCount = selectedText.trim().split(/\s+/).length;
    const isSingleWord = wordCount === 1 &&
                        /^[a-zA-Z\s.\-']+$/.test(selectedText.trim());
    if (config.showPhonetic && detectedLang === 'en' && isSingleWord) {
      const phoneticResult = await sendMessage({
        action: 'getPhonetic',
        word: selectedText.trim()
      });
      currentPhonetic = phoneticResult.success ? phoneticResult : null;
    }

    // 显示翻译结果
    showBubble(selectionStart.x, selectionStart.y, translationResult, false);
  } else {
    // 显示错误信息
    showBubble(selectionStart.x, selectionStart.y, {
      success: false,
      error: translationResult.error || '翻译失败'
    }, false);
  }
}

/**
 * 监听鼠标抬起事件（划词结束）
 */
document.addEventListener('mouseup', (event) => {
  // 保存必要的事件数据
  const eventData = {
    clientX: event.clientX,
    clientY: event.clientY,
    target: event.target
  };

  // 检查是否在气泡内点击，如果是则不处理
  if (isClickInBubble(event)) {
    return;
  }

  // 使用setTimeout等待选中文本稳定
  setTimeout(async () => {
    const selectionInfo = getSelectedText();

    // 只有当选中文本且不是简单点击时才处理
    if (selectionInfo.text && selectionInfo.text.length > 0) {
      // 检查是否需要翻译（可以根据配置判断）
    await handleSelection();
    }
  }, 100);
});

/**
 * 监听右键菜单事件
 */
document.addEventListener('contextmenu', async (event) => {
  // 取消自动关闭定时器
  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }
});

/**
 * 点击页面其他位置关闭气泡
 */
document.addEventListener('click', (event) => {
  if (currentBubble && !isClickInBubble(event)) {
    hideBubble();
  }
});

/**
 * 监听键盘事件（ESC关闭气泡，左右方向键翻页，Ctrl/Cmd+A不阻止）
 */
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideBubble();
  } else if (currentBubble && wordResults.length > 1) {
    // 左右方向键翻页
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPrevPage();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToNextPage();
    }
  }
});

/**
 * 阻止气泡容器上的默认选择行为
 */
document.addEventListener('selectionchange', (event) => {
  // 如果气泡存在，且选区改变了（用户在页面上做了选择操作）
  // 不要自动关闭气泡
  if (currentBubble && getSelectedText().text && getSelectedText().text !== selectedText) {
    // 新的选区被创建，更新选中内容
    const selectionInfo = getSelectedText();
    selectedText = selectionInfo.text;
  }
});

// ==================== 气泡UI创建 ====================

/**
 * 计算气泡的安全位置，确保不超出视口
 * @param {number} x - 原始X坐标
 * @param {number} y - 原始Y坐标
 * @returns {Object} 调整后的{x, y}坐标
 */
function calculateSafeBubblePosition(x, y) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const bubbleWidth = BUBBLE_CONFIG.MAX_WIDTH;
  const bubbleHeight = BUBBLE_CONFIG.MAX_HEIGHT;
  const padding = 20; // 边距

  // 调整X坐标：确保气泡不超出左右边界
  let safeX = x;
  if (x + bubbleWidth > viewportWidth - padding) {
    // 超出右边界，向左偏移
    safeX = viewportWidth - bubbleWidth - padding;
  }
  if (safeX < padding) {
    // 超出左边界，使用最小边距
    safeX = padding;
  }

  // 调整Y坐标：确保气泡不超出上下边界
  let safeY = y;
  if (y + bubbleHeight > viewportHeight - padding) {
    // 超出下边界，尝试显示在选区上方
    safeY = y - bubbleHeight - 10; // 选区上方10px
  }
  if (safeY < padding) {
    // 超出上边界，使用最小边距
    safeY = padding;
  }

  return { x: Math.max(padding, safeX), y: Math.max(padding, safeY) };
}

/**
 * 创建Shadow DOM包装器，避免样式冲突
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @returns {HTMLElement} 气泡容器
 */
function createBubbleContainer(x, y) {
  // 计算安全位置
  const safePosition = calculateSafeBubblePosition(x, y);

  // 创建容器div
  const container = document.createElement('div');
  container.id = 'qt-bubble-container';
  container.style.cssText = `
    position: absolute;
    left: ${safePosition.x}px;
    top: ${safePosition.y}px;
    z-index: 2147483647;
    pointer-events: none;
    user-select: none;
  `;

  // 创建Shadow DOM
  const shadow = container.attachShadow({ mode: 'open' });

  // 添加样式
  const style = document.createElement('style');
  style.textContent = getBubbleStyles(userConfig?.theme || 'light');
  shadow.appendChild(style);

  // 创建气泡
  const bubble = document.createElement('div');
  bubble.className = 'qt-bubble';
  bubble.style.cssText = `
    pointer-events: auto;
    display: flex;
    flex-direction: column;
  `;
  shadow.appendChild(bubble);

  container.shadowRoot = shadow;
  container.bubble = bubble;

  document.body.appendChild(container);

  return container;
}

/**
 * 获取气泡样式
 * @param {string} theme - 主题 (light/dark)
 * @returns {string} CSS样式字符串
 */
function getBubbleStyles(theme) {
  const config = STYLE_CONFIG[theme] || STYLE_CONFIG.LIGHT;

  return `
    :host {
      all: initial;
    }

    .qt-bubble {
      position: absolute;
      max-width: ${BUBBLE_CONFIG.MAX_WIDTH}px;
      min-width: ${BUBBLE_CONFIG.MIN_WIDTH}px;
      max-height: ${BUBBLE_CONFIG.MAX_HEIGHT}px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      background: ${config.backgroundColor};
      border: 1px solid ${config.borderColor};
      border-radius: 8px;
      box-shadow: 0 4px 12px ${config.shadowColor};
      color: ${config.textColor};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      transition: opacity ${BUBBLE_CONFIG.ANIMATION_DURATION}ms ease;
      opacity: 0;
    }

    .qt-bubble.show {
      opacity: 1;
    }

    .qt-loading {
      padding: 20px;
      text-align: center;
    }

    .qt-spinner {
      width: 30px;
      height: 30px;
      border: 3px solid ${config.borderColor};
      border-top-color: #4A90E2;
      border-radius: 50%;
      animation: qt-spin 0.8s linear infinite;
      margin: 0 auto;
    }

    @keyframes qt-spin {
      to { transform: rotate(360deg); }
    }

    .qt-header {
      padding: 12px 16px;
      border-bottom: 1px solid ${config.borderColor};
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .qt-title {
      font-weight: 600;
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
    }

    .qt-close-btn {
      background: none;
      border: none;
      color: #888;
      cursor: pointer;
      font-size: 18px;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .qt-close-btn:hover {
      background: ${config.borderColor};
      color: ${config.textColor};
    }

    .qt-content {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }

    .qt-original {
      font-weight: 500;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .qt-word-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .qt-word-list::-webkit-scrollbar {
      width: 4px;
    }

    .qt-word-list::-webkit-scrollbar-track {
      background: ${config.backgroundColor === '#ffffff' ? '#f0f0f0' : 'rgba(255, 255, 255, 0.05)'};
      border-radius: 2px;
    }

    .qt-word-list::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 2px;
    }

    .qt-word-list::-webkit-scrollbar-thumb:hover {
      background: #666;
    }

    .qt-word-entry {
      padding: 12px;
      border-radius: 6px;
    }

    .qt-word-entry:nth-child(odd) {
      background: ${config.backgroundColor === '#ffffff' ? '#f8f9fa' : 'rgba(255, 255, 255, 0.03)'};
    }

    .qt-word-list > .qt-word-entry:not(:last-child) {
      margin-bottom: 8px;
    }

    .qt-word-entry-original {
      font-weight: 500;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .qt-stem-info {
      font-size: 11px;
      color: #888;
      margin-bottom: 8px;
      font-style: italic;
    }

    .qt-tags {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .qt-tag {
      font-size: 10px;
      padding: 2px 8px;
      background: #4A90E2;
      color: white;
      border-radius: 10px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .qt-divider {
      height: 1px;
      background: ${config.borderColor};
      margin: 12px 0;
    }

    .qt-translated {
      line-height: 1.5;
    }

    .qt-buttons {
      padding: 12px 16px;
      border-top: 1px solid ${config.borderColor};
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .qt-btn {
      padding: 6px 12px;
      border: 1px solid ${config.borderColor};
      border-radius: 4px;
      background: transparent;
      color: ${config.textColor};
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
    }

    .qt-btn:hover {
      background: ${config.borderColor};
    }

    .qt-btn.active {
      background: #4A90E2;
      border-color: #4A90E2;
      color: white;
    }

    .qt-phonetic {
      font-size: 12px;
      color: #888;
      margin: 8px 0;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .qt-phonetic-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .qt-phonetic-label {
      font-weight: 600;
    }

    .qt-speak-btn {
      margin-left: auto;
      padding: 4px 8px;
      border: 1px solid ${config.borderColor};
      border-radius: 4px;
      background: transparent;
      color: ${config.textColor};
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .qt-speak-btn:hover {
      background: ${config.borderColor};
    }

    .qt-speak-btn svg {
      color: ${config.textColor};
    }

    .qt-source-badge {
      font-size: 10px;
      color: #666;
    }

    .qt-error {
      padding: 16px;
      color: #e74c3c;
      text-align: center;
    }

    .qt-section-title {
      font-weight: 600;
      font-size: 12px;
      color: #4A90E2;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .qt-phrases-section,
    .qt-examples-section {
      margin-top: 12px;
    }

    .qt-phrases-list,
    .qt-examples-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .qt-phrase-item,
    .qt-example-item {
      padding: 8px 10px;
      background: ${config.backgroundColor === '#ffffff' ? '#f5f5f5' : 'rgba(255, 255, 255, 0.05)'};
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.4;
    }

    .qt-example-item {
      font-style: italic;
    }

    .qt-hyphenated-parts {
      margin-top: 8px;
      padding: 8px 10px;
      background: ${config.backgroundColor === '#ffffff' ? '#f0f7ff' : 'rgba(74, 144, 226, 0.1)'};
      border-radius: 4px;
      border: 1px solid rgba(74, 144, 226, 0.2);
    }

    .qt-hyphenated-part {
      font-size: 11px;
      line-height: 1.4;
      padding: 2px 0;
    }

    .qt-part-original {
      font-weight: 500;
      color: ${config.textColor};
    }

    .qt-hyphen {
      color: #4A90E2;
      margin: 0 2px;
    }

    .qt-part-arrow {
      color: #888;
      margin: 0 4px;
    }

    .qt-part-translated {
      color: #4A90E2;
      font-weight: 500;
    }

    .qt-part-stem {
      font-size: 10px;
      color: #999;
      font-style: italic;
      margin-left: 4px;
    }

    .qt-pagination {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 16px 16px;
      gap: 12px;
    }

    .qt-pagination-info {
      font-size: 12px;
      color: #888;
      flex: 1;
      text-align: center;
    }

    .qt-pagination-btn {
      padding: 10px;
      border: 1px solid ${config.borderColor};
      border-radius: 4px;
      background: transparent;
      color: ${config.textColor};
      cursor: pointer;
      font-size: 12px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
    }

    .qt-pagination-btn:hover:not(:disabled) {
      background: ${config.borderColor};
    }

    .qt-pagination-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .qt-pagination-btn svg {
      width: 18px;
      height: 18px;
    }
  `;
}

// ==================== 气泡显示与更新 ====================

/**
 * 显示翻译气泡
 * @param {number} x - X坐标
 * @param {number} y - Y坐标
 * @param {Object|null} result - 翻译结果
 * @param {boolean} isLoading - 是否为加载状态
 */
function showBubble(x, y, result = null, isLoading = false) {
  // 计算安全位置
  const safePosition = calculateSafeBubblePosition(x, y);

  // 如果气泡不存在，创建新气泡
  if (!currentBubble || !document.body.contains(currentBubble)) {
    currentBubble = createBubbleContainer(x, y);
  } else {
    // 更新位置（使用安全位置）
    currentBubble.style.left = `${safePosition.x}px`;
    currentBubble.style.top = `${safePosition.y}px`;
  }

  const bubble = currentBubble.bubble;

  // 清空内容
  bubble.innerHTML = '';

  if (isLoading) {
    // 显示加载动画
    bubble.innerHTML = `
      <div class="qt-header">
        <span class="qt-title">QuickTranslate</span>
      </div>
      <div class="qt-loading">
        <div class="qt-spinner"></div>
      </div>
    `;
  } else if (result && !result.success) {
    // 显示错误信息
    showError(result.error);
  } else if (result) {
    // 显示翻译结果
    showTranslationResult(result);
  }

  // 显示气泡
  bubble.classList.add('show');

  // 设置自动关闭定时器
  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
  }
  bubbleTimer = setTimeout(() => {
    hideBubble();
  }, BUBBLE_CONFIG.CLOSE_DELAY);
}

/**
 * 显示加载动画
 */
// 已集成到showBubble函数中

/**
 * 显示翻译结果
 * @param {Object} result - 翻译结果对象
 */
function showTranslationResult(result) {
  const bubble = currentBubble.bubble;

  // 如果是多个单词，初始化翻页状态
  if (result.type === 'word-by-word' && result.wordResults) {
    wordResults = result.wordResults;
    currentWordIndex = 0;
  } else {
    wordResults = [];
    currentWordIndex = 0;
  }
  currentTranslation = result;

  // 构建HTML内容
  let html = `
    <div class="qt-header">
      <span class="qt-title">QuickTranslate</span>
      <button class="qt-close-btn" data-action="close">&times;</button>
    </div>
    <div class="qt-content">
      ${renderCurrentWordPage()}
    </div>
    ${wordResults.length > 1 ? `
      <div class="qt-pagination">
        <button class="qt-pagination-btn" data-action="prev-word" ${currentWordIndex === 0 ? 'disabled' : ''} title="上一个">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <span class="qt-pagination-info">${currentWordIndex + 1} / ${wordResults.length}</span>
        <button class="qt-pagination-btn" data-action="next-word" ${currentWordIndex === wordResults.length - 1 ? 'disabled' : ''} title="下一个">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    ` : ''}
    <div class="qt-buttons">
      <button class="qt-btn" data-action="speak-original" title="朗读">朗读</button>
      <button class="qt-btn" data-action="copy-text">复制</button>
    </div>
  `;

  bubble.innerHTML = html;

  // 绑定按钮事件
  bindBubbleEvents();
}

/**
 * 渲染当前单词页面（翻页模式）
 * @returns {string} HTML字符串
 */
function renderCurrentWordPage() {
  if (wordResults.length > 0) {
    // 翻页模式：显示单个单词
    const wordResult = wordResults[currentWordIndex];
    let html = `
      <div class="qt-original">${escapeHtml(wordResult.original)}</div>
    `;

    if (wordResult.tags && wordResult.tags.length > 0) {
      html += `
        <div class="qt-tags">
          ${wordResult.tags.map(tag => `<span class="qt-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      `;
    }

    if (wordResult.stemWord) {
      html += `
        <div class="qt-stem-info">原形: ${escapeHtml(wordResult.stemWord)}</div>
      `;
    }

    if (wordResult.isHyphenated && wordResult.subResults) {
      html += `
        <div class="qt-hyphenated-parts">
          <div class="qt-section-title">连字符拆分翻译:</div>
          ${wordResult.subResults.map((sub, idx) => `
            <div class="qt-hyphenated-part">
              <span class="qt-part-original">${escapeHtml(sub.original)}</span>
              ${idx < wordResult.subResults.length - 1 ? '<span class="qt-hyphen">-</span>' : ''}
              <span class="qt-part-arrow"> → </span>
              <span class="qt-part-translated">${escapeHtml(sub.translated)}</span>
              ${sub.stemWord ? `<span class="qt-part-stem"> (${escapeHtml(sub.stemWord)})</span>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `
      <div class="qt-divider"></div>
      <div class="qt-translated">${escapeHtml(wordResult.translated)}</div>
    `;
    return html;
  } else if (currentTranslation) {
    // 单个单词模式
    return renderSingleWordResult(currentTranslation);
  }
  return '';
}

/**
 * 翻页到上一页
 */
function goToPrevPage() {
  if (currentWordIndex > 0) {
    currentWordIndex--;
    updateBubbleContent();
  }
}

/**
 * 翻页到下一页
 */
function goToNextPage() {
  if (currentWordIndex < wordResults.length - 1) {
    currentWordIndex++;
    updateBubbleContent();
  }
}

/**
 * 更新气泡内容（更新当前单词和翻页状态）
 */
function updateBubbleContent() {
  const bubble = currentBubble.bubble;

  // 更新内容区域
  const contentArea = bubble.querySelector('.qt-content');
  if (contentArea) {
    contentArea.innerHTML = renderCurrentWordPage();
  }

  // 更新翻页区域
  if (wordResults.length > 1) {
    const paginationArea = bubble.querySelector('.qt-pagination');
    const prevBtn = paginationArea?.querySelector('[data-action="prev-word"]');
    const nextBtn = paginationArea?.querySelector('[data-action="next-word"]');
    const paginationInfo = paginationArea?.querySelector('.qt-pagination-info');

    if (prevBtn) prevBtn.disabled = currentWordIndex === 0;
    if (nextBtn) nextBtn.disabled = currentWordIndex === wordResults.length - 1;
    if (paginationInfo) paginationInfo.textContent = `${currentWordIndex + 1} / ${wordResults.length}`;
  }
}

/**
 * 渲染单词列表结果（多个单词）
 * @param {Object} result - 翻译结果
 * @returns {string} HTML字符串
 */
function renderWordByWordResult(result) {
  // 此函数已不再使用，改用翻页模式
  // 保留用于兼容性
  let html = `<div class="qt-word-list">`;
  for (const wordResult of result.wordResults) {
    html += `
      <div class="qt-word-entry">
        <div class="qt-word-entry-original">${escapeHtml(wordResult.original)}</div>
        ${wordResult.tags && wordResult.tags.length > 0 ? `
          <div class="qt-tags">
            ${wordResult.tags.map(tag => `<span class="qt-tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
        ${wordResult.stemWord ? `
          <div class="qt-stem-info">原形: ${escapeHtml(wordResult.stemWord)}</div>
        ` : ''}
        ${wordResult.isHyphenated && wordResult.subResults ? `
          <div class="qt-hyphenated-parts">
            <div class="qt-section-title">连字符拆分翻译:</div>
            ${wordResult.subResults.map((sub, idx) => `
              <div class="qt-hyphenated-part">
                <span class="qt-part-original">${escapeHtml(sub.original)}</span>
                ${idx < wordResult.subResults.length - 1 ? '<span class="qt-hyphen">-</span>' : ''}
                <span class="qt-part-arrow"> → </span>
                <span class="qt-part-translated">${escapeHtml(sub.translated)}</span>
                ${sub.stemWord ? `<span class="qt-part-stem"> (${escapeHtml(sub.stemWord)})</span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="qt-divider"></div>
        <div class="qt-translated">${escapeHtml(wordResult.translated)}</div>
      </div>
    `;
  }
  html += `</div>`;

  return html;
}

/**
 * 渲染单个单词结果
 * @param {Object} result - 翻译结果
 * @returns {string} HTML字符串
 */
function renderSingleWordResult(result) {
  let html = `
    <div class="qt-original">${escapeHtml(result.original)}</div>
  `;

  // 显示标签（如果有）
  if (result.tags && result.tags.length > 0) {
    html += `
      <div class="qt-tags">
        ${result.tags.map(tag => `<span class="qt-tag">${escapeHtml(tag)}</span>`).join('')}
      </div>
    `;
  }

  // 显示词根（如果有）
  if (result.stemWord) {
    html += `
      <div class="qt-stem-info">原形: ${escapeHtml(result.stemWord)}</div>
    `;
  }

  html += `
      <div class="qt-divider"></div>
      <div class="qt-translated">${escapeHtml(result.translated)}</div>
  `;

  return html;
}

/**
 * 显示错误信息
 * @param {string} error - 错误信息
 */
function showError(error) {
  const bubble = currentBubble.bubble;

  bubble.innerHTML = `
    <div class="qt-header">
      <span class="qt-title">QuickTranslate</span>
      <button class="qt-close-btn" data-action="close">&times;</button>
    </div>
    <div class="qt-error">
      ${escapeHtml(error || '翻译失败，请稍后重试')}
    </div>
  `;

  bindBubbleEvents();
}

/**
 * 绑定气泡内的事件
 */
function bindBubbleEvents() {
  const bubble = currentBubble.bubble;

  // 关闭按钮
  const closeBtn = bubble.querySelector('[data-action="close"]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      hideBubble();
    });
  }

  // 上一个单词按钮
  const prevBtn = bubble.querySelector('[data-action="prev-word"]');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      goToPrevPage();
    });
  }

  // 下一个单词按钮
  const nextBtn = bubble.querySelector('[data-action="next-word"]');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      goToNextPage();
    });
  }

  // 朗读原文按钮（先读美式，再读英式）
  const speakOriginalBtn = bubble.querySelector('[data-action="speak-original"]');
  if (speakOriginalBtn) {
    speakOriginalBtn.addEventListener('click', () => {
      const lang = currentTranslation?.detectedLang || detectLanguage(selectedText);

      if (lang === 'en') {
        // 英语：先读美式，再读英式
        speakWithSequence([
            { text: selectedText, lang: 'en-US' },
            { text: selectedText, lang: 'en-GB' }
        ]);
      } else {
        // 中文：只读一次
        sendMessage({
          action: 'speak',
          text: selectedText,
          lang: 'zh-CN'
        });
      }
    });
  }

  // 复制按钮
  const copyBtn = bubble.querySelector('[data-action="copy-text"]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      let textToCopy = '';

      if (currentTranslation?.type === 'word-by-word' && currentTranslation.wordResults) {
        // 多个单词：格式化为每个单词独立一行
        const lines = currentTranslation.wordResults.map(w => {
          return `${w.original}\n${w.translated}${w.tags && w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : ''}`;
        });
        textToCopy = lines.join('\n\n');
      } else {
        // 单个单词：原格式
        textToCopy = `${selectedText}\n${currentTranslation?.translated || ''}`;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        copyBtn.textContent = '已复制';
        setTimeout(() => {
          copyBtn.textContent = '复制';
        }, 1500);
      } catch (error) {
        console.error('复制失败:', error);
      }
    });
  }

  // 气泡内点击事件阻止冒泡
  bubble.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  // 鼠标进入气泡取消自动关闭
  bubble.addEventListener('mouseenter', () => {
    if (bubbleTimer) {
      clearTimeout(bubbleTimer);
      bubbleTimer = null;
    }
  });

  // 鼠标离开气泡重新设置定时器
  bubble.addEventListener('mouseleave', () => {
    bubbleTimer = setTimeout(() => {
      hideBubble();
    }, BUBBLE_CONFIG.CLOSE_DELAY);
  });
}

/**
 * 按顺序朗读多个语音
 * @param {Array} sequence - 语音序列 [{ text, lang }, ...]
 */
async function speakWithSequence(sequence) {
  for (const item of sequence) {
    await new Promise((resolve) => {
      sendMessage({
        action: 'speak',
        text: item.text,
        lang: item.lang
      });
      // 等待语音结束（大约估算时间）
      setTimeout(resolve, item.text.length * 80 + 500);
    });
  }
}

/**
 * 隐藏气泡
 * @param {boolean} clearSelection - 是否清除选区，默认为true
 */
function hideBubble(clearSelection = true) {
  if (currentBubble) {
    const bubble = currentBubble.bubble;
    bubble.classList.remove('show');

    // 等待动画结束后移除
    setTimeout(() => {
      if (currentBubble && document.body.contains(currentBubble)) {
        document.body.removeChild(currentBubble);
      }
      currentBubble = null;
      currentTranslation = null;
      currentPhonetic = null;
    }, BUBBLE_CONFIG.ANIMATION_DURATION);
  }

  if (bubbleTimer) {
    clearTimeout(bubbleTimer);
    bubbleTimer = null;
  }

  // 根据参数选择是否清除选中文本
  if (clearSelection && window.getSelection) {
    window.getSelection().removeAllRanges();
  }
}

/**
 * 判断点击是否在气泡内
 * @param {Event} event - 点击事件
 * @returns {boolean} 是否在气泡内
 */
function isClickInBubble(event) {
  if (!currentBubble) return false;
  return currentBubble.contains(event.target);
}

/**
 * HTML转义，防止XSS
 * @param {string} text - 待转义文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== 监听background消息 ====================

/**
 * 监听来自background的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showTranslation') {
    // 通过快捷键触发的翻译
    if (message.result) {
      showBubble(window.innerWidth / 2, 100, message.result);
    }
    sendResponse({ success: true });
  }
  return true;
});

// ==================== 初始化 ====================

/**
 * Content Script初始化
 */
async function init() {
  // 获取用户配置
  userConfig = await getConfig();

  console.log('QuickTranslate Content Script 已加载');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 监听配置更新
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.qt_config) {
    userConfig = changes.qt_config.newValue;
    console.log('配置已更新:', userConfig);
  }
});
