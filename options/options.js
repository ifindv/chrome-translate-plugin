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
  DICTIONARY_EN_ZH: 'qt_dictionary_en_zh',
  DICTIONARY_ZH_EN: 'qt_dictionary_zh_en'
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
  showPhonetic: true,
  bubbleCloseDelay: 2000,

  // 外观设置
  theme: 'light',
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
  showPhoneticSwitch: null,
  bubbleCloseDelayInput: null,

  // 翻译设置
  translateEngineSelect: null,
  baiduAppIdInput: null,
  baiduSecretInput: null,
  enableBaiduSwitch: null,
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
async function clearDictionary(dictType) {
  try {
    if (dictType === 'en_zh' || dictType === 'all') {
      await chrome.storage.local.set({ [STORAGE_KEYS.DICTIONARY_EN_ZH]: {} });
    }
    if (dictType === 'zh_en' || dictType === 'all') {
      await chrome.storage.local.set({ [STORAGE_KEYS.DICTIONARY_ZH_EN]: {} });
    }

    // 通知 background 重新加载词典
    await sendMessage({ action: 'reloadDictionary' });
    await updateDictionaryStats();
    showSaveStatus('词典已清空');
  } catch (error) {
    console.error('清空词典失败:', error);
    showSaveStatus('清空词典失败', 'error');
  }
}

/**
 * 导入词典
 */
async function importDictionary(dictType) {
  const input = dictType === 'en_zh' ? elements.importEnZhInput : elements.importZhEnInput;

  if (!input.files || input.files.length === 0) {
    showSaveStatus('请先选择文件', 'error');
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      // 验证数据格式
      if (typeof data !== 'object') {
        throw new Error('词典数据格式不正确');
      }

      // 发送到后台服务
      const result = await sendMessage({
        action: 'importDictionary',
        data: data,
        dictType: dictType
      });

      if (result.success) {
        showSaveStatus('词典导入成功');
        input.value = ''; // 清空文件选择
        await updateDictionaryStats();
      } else {
        showSaveStatus('词典导入失败: ' + result.error, 'error');
      }
    } catch (error) {
      console.error('导入词典失败:', error);
      showSaveStatus('导入失败: ' + error.message, 'error');
    }
  };

  reader.onerror = () => {
    showSaveStatus('文件读取失败', 'error');
  };

  reader.readAsText(file);
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
      if (elements.statsZhEn) {
        elements.statsZhEn.textContent = `汉英: ${result.stats?.zh_en_count || 0} 词`;
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
  elements.showPhoneticSwitch.checked = config.showPhonetic !== false;
  elements.bubbleCloseDelayInput.value = config.bubbleCloseDelay || DEFAULT_CONFIG.bubbleCloseDelay;

  // 翻译设置
  elements.translateEngineSelect.value = config.translateEngine || DEFAULT_CONFIG.translateEngine;
  elements.baiduAppIdInput.value = config.baiduAppId || '';
  elements.baiduSecretInput.value = config.baiduSecretKey || '';
  elements.enableBaiduSwitch.checked = config.enableBaidu || false;

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
  return {
    shortcut: elements.shortcutSelect.value,
    autoTranslate: elements.autoTranslateSwitch.checked,
    autoDetect: elements.autoDetectSwitch.checked,
    showPhonetic: elements.showPhoneticSwitch.checked,
    bubbleCloseDelay: parseInt(elements.bubbleCloseDelayInput.value) || DEFAULT_CONFIG.bubbleCloseDelay,
    translateEngine: elements.translateEngineSelect.value,
    baiduAppId: elements.baiduAppIdInput.value,
    baiduSecretKey: elements.baiduSecretInput.value,
    enableBaidu: elements.enableBaiduSwitch.checked,
    theme: config.theme,
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
    'autoTranslateSwitch', 'autoDetectSwitch', 'showPhoneticSwitch',
    'bubbleCloseDelayInput', 'translateEngineSelect',
    'baiduAppIdInput', 'baiduSecretInput', 'enableBaiduSwitch',
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
  elements.showPhoneticSwitch = document.getElementById('qt-show-phonetic');
  elements.bubbleCloseDelayInput = document.getElementById('qt-bubble-close-delay');

  // 翻译设置元素
  elements.statsEnZh = document.getElementById('qt-stats-en-zh');
  elements.statsZhEn = document.getElementById('qt-stats-zh-en');
  elements.refreshStatsBtn = document.getElementById('qt-refresh-stats');
  elements.importEnZhInput = document.getElementById('qt-import-en-zh');
  elements.importEnZhBtn = document.getElementById('qt-import-en-zh-btn');
  elements.importZhEnInput = document.getElementById('qt-import-zh-en');
  elements.importZhEnBtn = document.getElementById('qt-import-zh-en-btn');
  elements.clearDictSelect = document.getElementById('qt-clear-dict-select');
  elements.clearDictBtn = document.getElementById('qt-clear-dict-btn');
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
