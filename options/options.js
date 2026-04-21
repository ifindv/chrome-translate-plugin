/**
 * QuickTranslate - Options 逻辑文件
 *
 * 功能说明：
 * - 处理用户设置
 * - 保存和加载配置
 * - 主题切换
 * - API配置管理
 * - 缓存管理
 *
 * @module options
 * @version 1.0.0
 */

// ==================== 常量定义 ====================

/**
 * 存储键名
 */
const STORAGE_KEYS = {
  CONFIG: 'qt_config',
  TRANSLATION_CACHE: 'qt_translation_cache',
  DICTIONARY_EN_ZH: 'qt_dictionary_en_zh'
};

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  // 快捷键设置
  shortcut: 'Ctrl+Shift+T',

  // 翻译行为
  autoTranslate: true,
  autoDetect: true,

  // 显示选项
  bubbleCloseDelay: 10000,

  // 外观设置
  theme: 'dark',
  fontSize: 'medium',
  fontFamily: 'system'
};

// ==================== 状态管理 ====================

/**
 * 当前配置
 */
let config = { ...DEFAULT_CONFIG };

/**
 * 是否有未保存的更改
 */
let hasUnsavedChanges = false;

// ==================== DOM元素引用 ====================

/**
 * DOM元素引用
 */
const elements = {
  appBody: null,

  // 导航按钮
  navBtns: null,
  sections: null,

  // 通用设置
  shortcutSelect: null,
  saveShortcutBtn: null,
  autoTranslateSwitch: null,
  autoDetectSwitch: null,
  bubbleCloseDelayInput: null,

  // 翻译设置
  statsEnZh: null,
  refreshStatsBtn: null,
  reloadDictBtn: null,
  clearCacheBtn: null,

  // 外观设置
  themeBtns: null,
  fontSizeSelect: null,
  fontFamilySelect: null,

  // 底部按钮
  saveBtn: null,
  resetBtn: null,
  saveStatus: null
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
  const data = await chrome.storage.local.get(STORAGE_KEYS.CONFIG);
  return data[STORAGE_KEYS.CONFIG] || { ...DEFAULT_CONFIG };
}

/**
 * 保存用户配置
 * @param {Object} newConfig - 配置对象
 * @returns {Promise<Object>} 保存结果
 */
async function saveConfig(newConfig) {
  config = { ...config, ...newConfig };
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: config
  });
  return sendMessage({ action: 'saveConfig', config });
}

/**
 * 清空翻译缓存
 */
async function clearCache() {
  await chrome.storage.local.remove(STORAGE_KEYS.TRANSLATION_CACHE);
  await chrome.storage.local.set({ [STORAGE_KEYS.TRANSLATION_CACHE]: {} });
  return sendMessage({ action: 'clearCache' });
}

/**
 * 清空词典
 */
async function reloadDictionary() {
  try {
    // 清空存储中的词典
    await chrome.storage.local.set({ [STORAGE_KEYS.DICTIONARY_EN_ZH]: {} });

    // 通知 background 重新加载词典
    const result = await sendMessage({ action: 'reloadDictionary' });
    if (result.success) {
      await updateDictionaryStats();
      showSaveStatus('词典已重新加载');
    } else {
      showSaveStatus('重新加载词典失败', 'error');
    }
  } catch (error) {
    console.error('重新加载词典失败:', error);
    showSaveStatus('重新加载词典失败', 'error');
  }
}

/**
 * 更新词典统计
 */
async function updateDictionaryStats() {
  try {
    const result = await sendMessage({ action: 'getDictionaryStats' });

    if (result.success) {
      if (elements.statsEnZh) {
        elements.statsEnZh.textContent = `英汉: ${result.stats?.en_zh_count || 0} 词`;
      }
    }
  } catch (error) {
    console.error('获取词典统计失败:', error);
  }
}

// ==================== UI更新 ====================

/**
 * 加载配置到UI
 */
function loadConfigToUI() {
  // 通用设置
  elements.shortcutSelect.value = config.shortcut || DEFAULT_CONFIG.shortcut;
  elements.autoTranslateSwitch.checked = config.autoTranslate !== false;
  elements.autoDetectSwitch.checked = config.autoDetect !== false;
  elements.bubbleCloseDelayInput.value = config.bubbleCloseDelay || DEFAULT_CONFIG.bubbleCloseDelay;

  // 外观设置
  applyTheme(config.theme || DEFAULT_CONFIG.theme);
  elements.fontSizeSelect.value = config.fontSize || DEFAULT_CONFIG.fontSize;
  elements.fontFamilySelect.value = config.fontFamily || DEFAULT_CONFIG.fontFamily;
}

/**
 * 从UI获取配置
 * @returns {Object} 配置对象
 */
function getConfigFromUI() {
  // 获取当前激活的主题
  const activeThemeBtn = document.querySelector('.qt-theme-btn.qt-theme-btn--active');
  const currentTheme = activeThemeBtn ? activeThemeBtn.dataset.theme : config.theme || DEFAULT_CONFIG.theme;

  return {
    shortcut: elements.shortcutSelect.value,
    autoTranslate: elements.autoTranslateSwitch.checked,
    autoDetect: elements.autoDetectSwitch.checked,
    bubbleCloseDelay: parseInt(elements.bubbleCloseDelayInput.value) || DEFAULT_CONFIG.bubbleCloseDelay,
    theme: currentTheme,
    fontSize: elements.fontSizeSelect.value,
    fontFamily: elements.fontFamilySelect.value
  };
}

/**
 * 应用主题
 * @param {string} theme - 主题名称
 */
function applyTheme(theme) {
  config.theme = theme;
  if (elements.appBody) {
    elements.appBody.setAttribute('data-theme', theme);
  }

  // 更新主题按钮状态
  if (elements.themeBtns) {
    elements.themeBtns.forEach(btn => {
      if (btn.dataset.theme === theme) {
        btn.classList.add('qt-theme-btn--active');
      } else {
        btn.classList.remove('qt-theme-btn--active');
      }
    });
  }
}

/**
 * 显示保存状态
 * @param {string} status - 状态消息
 * @param {string} type - 类型 (success/error)
 */
function showSaveStatus(status, type = 'success') {
  if (!elements.saveStatus) return;

  elements.saveStatus.textContent = status;
  elements.saveStatus.className = 'qt-save-status';
  elements.saveStatus.classList.add(`qt-save-status--${type}`);

  setTimeout(() => {
    elements.saveStatus.textContent = '';
    elements.saveStatus.className = 'qt-save-status';
  }, 2000);
}

/**
 * 切换设置区块
 * @param {string} sectionId - 区块ID
 */
function switchSection(sectionId) {
  // 更新导航按钮状态
  elements.navBtns.forEach(btn => {
    if (btn.dataset.section === sectionId.replace('section-', '')) {
      btn.classList.add('qt-nav-btn--active');
    } else {
      btn.classList.remove('qt-nav-btn--active');
    }
  });

  // 显示对应区块
  elements.sections.forEach(section => {
    if (section.id === sectionId) {
      section.classList.add('qt-section--active');
    } else {
      section.classList.remove('qt-section--active');
    }
  });
}

// ==================== 事件监听 ====================

/**
 * 初始化事件监听器
 */
function initEventListeners() {
  // 导航切换
  elements.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionId = 'section-' + btn.dataset.section;
      switchSection(sectionId);
    });
  });

  // 保存快捷键
  if (elements.saveShortcutBtn) {
    elements.saveShortcutBtn.addEventListener('click', async () => {
      const shortcut = elements.shortcutSelect.value;
      await saveConfig({ shortcut });
      showSaveStatus('快捷键已保存');
    });
  }

  // 刷新词典统计
  if (elements.refreshStatsBtn) {
    elements.refreshStatsBtn.addEventListener('click', async () => {
      await updateDictionaryStats();
    });
  }

  // 导入英汉词典
  if (elements.importEnZhBtn && elements.importEnZhInput) {
    elements.importEnZhBtn.addEventListener('click', async () => {
      await importDictionary('en_zh');
    });
  }

  // 导入汉英词典
  if (elements.importZhEnBtn && elements.importZhEnInput) {
    elements.importZhEnBtn.addEventListener('click', async () => {
      await importDictionary('zh_en');
    });
  }

  // 清空词典
  if (elements.clearDictBtn && elements.clearDictSelect) {
    elements.clearDictBtn.addEventListener('click', async () => {
      const dictType = elements.clearDictSelect.value;
      const dictName = dictType === 'en_zh' ? '英汉词典' : dictType === 'zh_en' ? '汉英词典' : '全部词典';
      const confirmed = confirm(`确定要清空${dictName}吗？此操作不可撤销。`);
      if (confirmed) {
        await clearDictionary(dictType);
      }
    });
  }

  // 输入框变化监听（标记未保存状态）
  const inputs = [
    'autoTranslateSwitch', 'autoDetectSwitch',
    'bubbleCloseDelayInput',
    'fontSizeSelect', 'fontFamilySelect'
  ];

  inputs.forEach(id => {
    const element = elements[id];
    if (element) {
      element.addEventListener('change', () => {
        hasUnsavedChanges = true;
      });
      element.addEventListener('input', () => {
        hasUnsavedChanges = true;
      });
    }
  });

  // 主题切换
  if (elements.themeBtns) {
    elements.themeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        applyTheme(theme);
        hasUnsavedChanges = true;
      });
    });
  }

  // 刷新词典统计
  if (elements.refreshStatsBtn) {
    elements.refreshStatsBtn.addEventListener('click', async () => {
      await updateDictionaryStats();
      showSaveStatus('词典统计已更新');
    });
  }

  // 重新加载词典
  if (elements.reloadDictBtn) {
    elements.reloadDictBtn.addEventListener('click', async () => {
      const confirmed = confirm('确定要重新加载词典吗？这将清空当前缓存并从CSV文件重新加载词库。');
      if (confirmed) {
        await reloadDictionary();
      }
    });
  }

  // 清空缓存
  if (elements.clearCacheBtn) {
    elements.clearCacheBtn.addEventListener('click', async () => {
      const confirmed = confirm('确定要清空所有翻译缓存吗？');
      if (confirmed) {
        const result = await clearCache();
        if (result.success) {
          showSaveStatus('缓存已清空');
        } else {
          showSaveStatus('清空缓存失败', 'error');
        }
      }
    });
  }

  // 保存设置
  if (elements.saveBtn) {
    elements.saveBtn.addEventListener('click', async () => {
      try {
        const newConfig = getConfigFromUI();
        await saveConfig(newConfig);
        hasUnsavedChanges = false;
        showSaveStatus('设置已保存');
      } catch (error) {
        console.error('保存设置失败:', error);
        showSaveStatus('保存失败', 'error');
      }
    });
  }

  // 重置设置
  if (elements.resetBtn) {
    elements.resetBtn.addEventListener('click', async () => {
      const confirmed = confirm('确定要重置所有设置为默认值吗？此操作不可撤销。');
      if (confirmed) {
        config = { ...DEFAULT_CONFIG };
        loadConfigToUI();
        await saveConfig(config);
        hasUnsavedChanges = false;
        showSaveStatus('已重置为默认设置');
      }
    });
  }

  // 页面关闭前提示未保存的更改
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ==================== 初始化 ====================

/**
 * 初始化Options页面
 */
async function init() {
  // 获取DOM元素
  elements.appBody = document.body;
  elements.navBtns = document.querySelectorAll('.qt-nav-btn');
  elements.sections = document.querySelectorAll('.qt-section');

  // 通用设置元素
  elements.shortcutSelect = document.getElementById('qt-shortcut');
  elements.saveShortcutBtn = document.getElementById('qt-save-shortcut');
  elements.autoTranslateSwitch = document.getElementById('qt-auto-translate');
  elements.autoDetectSwitch = document.getElementById('qt-auto-detect');
  elements.bubbleCloseDelayInput = document.getElementById('qt-bubble-close-delay');

  // 翻译设置元素
  elements.statsEnZh = document.getElementById('qt-stats-en-zh');
  elements.refreshStatsBtn = document.getElementById('qt-refresh-stats');
  elements.reloadDictBtn = document.getElementById('qt-reload-dict');
  elements.clearCacheBtn = document.getElementById('qt-clear-cache');

  // 外观设置元素
  elements.themeBtns = document.querySelectorAll('.qt-theme-btn');
  elements.fontSizeSelect = document.getElementById('qt-font-size');
  elements.fontFamilySelect = document.getElementById('qt-font-family');

  // 底部按钮元素
  elements.saveBtn = document.getElementById('qt-save-btn');
  elements.resetBtn = document.getElementById('qt-reset-btn');
  elements.saveStatus = document.getElementById('qt-save-status');

  // 加载配置
  config = await getConfig();

  // 应用配置到UI
  loadConfigToUI();

  // 初始化事件监听器
  initEventListeners();

  // 更新词典统计
  await updateDictionaryStats();

  console.log('QuickTranslate Options 已加载');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 监听外部配置变化（如从其他标签页修改）
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (namespace === 'local' && changes.qt_config) {
    const newConfig = changes.qt_config.newValue;
    if (newConfig && !hasUnsavedChanges) {
      config = newConfig;
      loadConfigToUI();
    }
  }
});

/**
 * 导入词典
 * @param {string} dictType - 词典类型 ('en_zh' 或 'zh_en')
 */
async function importDictionary(dictType) {
  try {
    const inputId = dictType === 'en_zh' ? 'importEnZhInput' : 'importZhEnInput';
    const input = document.getElementById(inputId);

    if (!input || !input.files.length) {
      alert('请选择要导入的文件');
      return;
    }

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const content = e.target.result;
        const entries = parseDictionaryFile(content, dictType);

        // 保存到 chrome.storage
        const storageKey = dictType === 'en_zh' ? STORAGE_KEYS.DICTIONARY_EN_ZH : 'qt_dictionary_zh_en';
        await chrome.storage.local.set({ [storageKey]: entries });

        alert(`成功导入 ${entries.length} 个词条`);
        await updateDictionaryStats();
      } catch (err) {
        console.error('导入词典失败:', err);
        alert('导入词典失败: ' + err.message);
      }
    };

    reader.readAsText(file);
  } catch (err) {
    console.error('导入词典失败:', err);
    alert('导入词典失败: ' + err.message);
  }
}

/**
 * 清空词典
 * @param {string} dictType - 词典类型 ('en_zh', 'zh_en' 或 'all')
 */
async function clearDictionary(dictType) {
  try {
    const keysToRemove = [];

    if (dictType === 'en_zh' || dictType === 'all') {
      keysToRemove.push(STORAGE_KEYS.DICTIONARY_EN_ZH);
    }
    if (dictType === 'zh_en' || dictType === 'all') {
      keysToRemove.push('qt_dictionary_zh_en');
    }

    await chrome.storage.local.remove(keysToRemove);
    alert('词典已清空');
    await updateDictionaryStats();
  } catch (err) {
    console.error('清空词典失败:', err);
    alert('清空词典失败: ' + err.message);
  }
}

/**
 * 解析词典文件
 * @param {string} content - 文件内容
 * @returns {Array} 词典条目数组
 */
function parseDictionaryFile(content) {
  const entries = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/[\t,|]/);
    if (parts.length >= 2) {
      entries.push({
        word: parts[0].trim(),
        translation: parts[1].trim()
      });
    }
  }

  return entries;
}
