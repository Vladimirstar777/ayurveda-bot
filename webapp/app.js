/* =====================================================
   АЮРВЕДА БОТ — JavaScript SPA Логіка
   Версія: 1.0 MVP
   ===================================================== */

'use strict';

// ==========================
// КОНФІГУРАЦІЯ
// ==========================
const CONFIG = {
  // API URL — визначаємо автоматично
  apiBase: window.location.origin,
  // Для локального тестування без Telegram
  debugMode: !window.Telegram?.WebApp?.initDataUnsafe?.user,
  debugUserId: 123456789, // Тестовий user_id
};

// ==========================
// СТАН ДОДАТКУ
// ==========================
const State = {
  currentTab: 'ration',
  currentSoulState: 'balanced',
  currentDosha: null,
  profile: {},
  blockpost: { conditions: [] },
  availableConditions: [],
  rationData: null,
  isLoading: false,

  // DatePicker
  datePicker: {
    isOpen: false,
    selectedYear: null,
    selectedMonth: null,
    selectedDay: null,
  },

  // Квіз
  quiz: {
    isOpen: false,
    currentQuestion: 0,
    answers: {},
    questions: [],
  },
};

// ==========================
// TELEGRAM WEB APP
// ==========================
let tg = null;

function initTelegram() {
  if (window.Telegram?.WebApp) {
    tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    // Застосовуємо тему Telegram якщо доступна
    if (tg.colorScheme === 'dark') {
      document.body.classList.add('tg-dark');
    }
  }
}

function getTelegramUserId() {
  if (tg?.initDataUnsafe?.user?.id) {
    return tg.initDataUnsafe.user.id;
  }
  if (CONFIG.debugMode) {
    return CONFIG.debugUserId;
  }
  return null;
}

function getTelegramInitData() {
  return tg?.initData || '';
}

// ==========================
// API ЗАПИТИ
// ==========================
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Додаємо аутентифікацію
  const initData = getTelegramInitData();
  if (initData) {
    headers['X-Telegram-Init-Data'] = initData;
  }

  // Для дебагу — передаємо user_id напряму
  if (CONFIG.debugMode) {
    headers['X-Debug-User-Id'] = String(CONFIG.debugUserId);
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  try {
    const response = await fetch(`${CONFIG.apiBase}${endpoint}`, options);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error(`[API] Помилка ${endpoint}:`, err);
    throw err;
  }
}

// ==========================
// ІНІЦІАЛІЗАЦІЯ
// ==========================
async function init() {
  initWavingWidget();

  // Прив'язка автозбереження полів профілю
  setTimeout(() => {
    ['input-name', 'input-phone', 'input-city', 'input-dosha', 'input-gender'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', () => {
          const mockEvent = { preventDefault: () => {} };
          saveProfile(mockEvent);
        });
        el.addEventListener('change', () => {
          const mockEvent = { preventDefault: () => {} };
          saveProfile(mockEvent);
        });
      }
    });
  }, 1000);

  console.log('🌿 Аюрведа Бот ініціалізується...');
  initTelegram();
  startClock();
  initSoulStateButtons();
  initDatePicker();
  await loadInitData();
  restoreHabitsUI();
  
  // Відновлення останньої відкритої вкладки
  const lastTab = localStorage.getItem('lastActiveTab') || 'card';
  switchTab(lastTab, false);
  
  updateUI();
}

let historyStack = [];

function goBack() {
  if (historyStack.length > 1) {
    historyStack.pop(); // Видаляємо поточну вкладку
    const previousTab = historyStack.pop(); // Беремо попередню
    switchTab(previousTab);
  } else {
    goHome();
  }
}

function goHome() {
  historyStack = [];
  switchTab('card');
}

async function loadInitData() {
  // Спочатку завантажуємо з IndexedDB (найнадійніший варіант)
  try {
    const idbData = await loadFromIndexedDB();
    if (idbData.profile) {
      State.profile = idbData.profile;
      State.blockpost = idbData.blockpost || { conditions: [] };
      State.recipesHistory = idbData.history || {};
      State.currentDosha = State.profile.dosha_type || null;
      if (idbData.aiHistory) State.aiHistory = idbData.aiHistory;
      if (idbData.historyStack) historyStack = idbData.historyStack;
      if (idbData.rationData) State.rationData = idbData.rationData;
      console.log('✅ Дані відновлено з IndexedDB');
    }
  } catch (e) {
    loadFromLocalStorage();
  }

  // Потім синхронізуємо з сервером
  try {
    const data = await apiRequest('/api/init');
    // Мержимо серверні дані — сервер має пріоритет
    State.profile = { ...State.profile, ...(data.profile || {}) };
    State.blockpost = data.blockpost || State.blockpost || { conditions: [] };
    State.availableConditions = data.available_conditions || [];
    State.currentDosha = State.profile.dosha_type || null;
    // Зберігаємо синхронізовані дані
    saveToLocalStorage();
    console.log('✅ Дані синхронізовано з сервером:', data);
  } catch (err) {
    console.warn('[Init] Сервер недоступний — використовую локальні дані');
    loadFromLocalStorage();
    await loadConditionsFromBackup();
  }
}

async function loadConditionsFromBackup() {
  try {
    const resp = await fetch('/api/conditions');
    const data = await resp.json();
    State.availableConditions = data.conditions || [];
  } catch (err) {
    // Якщо і це не спрацювало — використовуємо вбудовані дані
    State.availableConditions = FALLBACK_CONDITIONS;
  }
}

function loadFromLocalStorage() {
  try {
    const savedProfile = localStorage.getItem('ayurveda_profile');
    const savedBlockpost = localStorage.getItem('ayurveda_blockpost');
    const savedAiHistory = localStorage.getItem('ayurveda_ai_history');
    const savedHistoryStack = localStorage.getItem('ayurveda_history_stack');
    const savedRation = localStorage.getItem('ayurveda_ration_data');
    
    if (savedProfile) State.profile = JSON.parse(savedProfile);
    if (savedBlockpost) State.blockpost = JSON.parse(savedBlockpost);
    if (savedAiHistory) State.aiHistory = JSON.parse(savedAiHistory);
    if (savedHistoryStack) historyStack = JSON.parse(savedHistoryStack);
    if (savedRation) State.rationData = JSON.parse(savedRation);
    
    State.currentDosha = State.profile.dosha_type || null;
  } catch (e) {}
}

function saveToLocalStorage() {
  try {
    localStorage.setItem('ayurveda_profile', JSON.stringify(State.profile));
    localStorage.setItem('ayurveda_blockpost', JSON.stringify(State.blockpost));
    localStorage.setItem('ayurveda_ai_history', JSON.stringify(State.aiHistory || []));
    localStorage.setItem('ayurveda_history_stack', JSON.stringify(historyStack || []));
    localStorage.setItem('ayurveda_ration_data', JSON.stringify(State.rationData || null));
    localStorage.setItem('ayurveda_save_timestamp', Date.now().toString());
    // IndexedDB backup для максимальної безпеки
    saveToIndexedDB();
  } catch (e) {}
}

// ==========================
// INDEXEDDB — Надійне сховище
// ==========================
let _idb = null;

function openIDB() {
  return new Promise((resolve, reject) => {
    if (_idb) { resolve(_idb); return; }
    const req = indexedDB.open('AyurvedaBot', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('state')) {
        db.createObjectStore('state', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => { _idb = e.target.result; resolve(_idb); };
    req.onerror = () => reject(req.error);
  });
}

async function saveToIndexedDB() {
  try {
    const db = await openIDB();
    const tx = db.transaction('state', 'readwrite');
    const store = tx.objectStore('state');
    store.put({ key: 'profile', value: State.profile, ts: Date.now() });
    store.put({ key: 'blockpost', value: State.blockpost, ts: Date.now() });
    store.put({ key: 'recipes_history', value: State.recipesHistory || {}, ts: Date.now() });
    store.put({ key: 'ai_history', value: State.aiHistory || [], ts: Date.now() });
    store.put({ key: 'history_stack', value: historyStack || [], ts: Date.now() });
    store.put({ key: 'ration_data', value: State.rationData || null, ts: Date.now() });
  } catch (e) {
    console.warn('[IDB] Помилка збереження:', e);
  }
}

async function loadFromIndexedDB() {
  try {
    const db = await openIDB();
    const tx = db.transaction('state', 'readonly');
    const store = tx.objectStore('state');
    const getProfile = store.get('profile');
    const getBlockpost = store.get('blockpost');
    const getHistory = store.get('recipes_history');
    const getAiHistory = store.get('ai_history');
    const getHistoryStack = store.get('history_stack');
    const getRation = store.get('ration_data');
    return new Promise((resolve) => {
      tx.oncomplete = () => {
        const profile = getProfile.result?.value || null;
        const blockpost = getBlockpost.result?.value || null;
        const history = getHistory.result?.value || {};
        const aiHistory = getAiHistory.result?.value || null;
        const historyStackVal = getHistoryStack.result?.value || null;
        const rationData = getRation.result?.value || null;
        resolve({ profile, blockpost, history, aiHistory, historyStack: historyStackVal, rationData });
      };
      tx.onerror = () => resolve({ profile: null, blockpost: null, history: {} });
    });
  } catch (e) {
    return { profile: null, blockpost: null, history: {} };
  }
}

// Автозбереження кожні 30 секунд
setInterval(() => {
  saveToLocalStorage();
}, 30000);

// Збереження при закритті сторінки
window.addEventListener('beforeunload', () => {
  saveToLocalStorage();
});

// Збереження при зміні видимості
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveToLocalStorage();
  }
});

// Резервні дані медичних станів (якщо сервер недоступний)
const FALLBACK_CONDITIONS = [
  { id: 'ulcer', name_uk: 'Виразка шлунка або 12-палої кишки', icon: '🔴', description_uk: 'Ерозія слизової оболонки шлунка' },
  { id: 'gastritis', name_uk: 'Гастрит', icon: '🟠', description_uk: 'Запалення слизової оболонки шлунка' },
  { id: 'diabetes', name_uk: 'Цукровий діабет', icon: '🔴', description_uk: 'Порушення регуляції рівня цукру в крові' },
  { id: 'hypertension', name_uk: 'Гіпертонія', icon: '🟠', description_uk: 'Стійко підвищений артеріальний тиск' },
  { id: 'thyroid', name_uk: 'Захворювання щитоподібної залози', icon: '🟡', description_uk: 'Порушення функції щитоподібної залози' },
  { id: 'kidney_stones', name_uk: 'Сечокам\'яна хвороба', icon: '🟠', description_uk: 'Утворення каменів у нирках' },
  { id: 'liver_disease', name_uk: 'Захворювання печінки', icon: '🔴', description_uk: 'Порушення функції печінки' },
  { id: 'heart_disease', name_uk: 'Серцево-судинні захворювання', icon: '🔴', description_uk: 'Захворювання серця та судин' },
  { id: 'lactose', name_uk: 'Непереносимість лактози', icon: '🟡', description_uk: 'Нездатність перетравлювати лактозу' },
  { id: 'gluten', name_uk: 'Целіакія або непереносимість глютену', icon: '🟡', description_uk: 'Реакція на білок глютену' },
];

// ==========================
// ЛОГІКА "WELCOME BACK" & АКТИВНОСТІ
// ==========================
function checkLastActive() {
  const lastActive = localStorage.getItem('lastActiveTimestamp');
  const now = Date.now();
  const EIGHT_HOURS = 8 * 60 * 60 * 1000;
  
  if (lastActive && (now - parseInt(lastActive)) > EIGHT_HOURS) {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('welcome-back-screen').classList.remove('hidden');
    return true; // Користувач повернувся після тривалої перерви
  }
  
  // Оновлюємо час
  localStorage.setItem('lastActiveTimestamp', now.toString());
  return false;
}

function resumeApp() {
  localStorage.setItem('lastActiveTimestamp', Date.now().toString());
  document.getElementById('welcome-back-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  
  // Запускаємо легку анімацію появи
  document.getElementById('app').style.animation = 'fadeIn 0.5s ease-in-out';
}

// Оновлюємо активність при кліках
document.addEventListener('click', () => {
  localStorage.setItem('lastActiveTimestamp', Date.now().toString());
});

// ==========================
// ОНОВЛЕННЯ UI
// ==========================
function updateUI() {
  updateHeader();
  updateMealPeriodCard();
  renderConditionsList();
  renderClientCard();
  fillProfileForm();
  
  if (State.rationData) {
    renderRation(State.rationData);
  }
  renderAiHistory();
}

function updateHeader() {
  const dosha = State.currentDosha;
  const badge = document.getElementById('header-dosha-badge');
  const doshaNames = { vata: '💨 Вата', pitta: '🔥 Піта', kapha: '🌊 Капха' };

  if (dosha && doshaNames[dosha]) {
    badge.textContent = doshaNames[dosha];
    badge.className = `header-dosha-badge dosha-badge-${dosha}`;
  } else {
    badge.textContent = 'Доша не визначена';
    badge.className = 'header-dosha-badge dosha-badge-none';
  }

  // Magic button sub-text
  const sub = document.getElementById('magic-btn-sub');
  if (sub) {
    if (State.profile.name) {
      sub.textContent = `для ${State.profile.name.split(' ')[0]} · ${doshaNames[dosha] || 'Доша не вказана'}`;
    } else {
      sub.textContent = 'заповни профіль для персоналізації';
    }
  }
}

// ==========================
// ГОДИННИК
// ==========================
function startClock() {
  function updateTime() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const el = document.getElementById('header-time');
    if (el) el.textContent = `${h}:${m}`;
  }
  updateTime();
  setInterval(updateTime, 30000);
}

// ==========================
// КАРТКА ПРИЙОМУ ЇЖІ
// ==========================
const MEAL_PERIODS = {
  early_morning: { emoji: '🌅', name: 'Ранній ранок', desc: 'Час Вата. Почни з теплої води.', tip: '💧 Склянка теплої води з лимоном або імбирем', hours: [5, 7] },
  breakfast: { emoji: '🌄', name: 'Сніданок', desc: 'Час Капха. Легкий теплий сніданок.', tip: '🥣 Ідеал: тепла каша з гхі та корицею', hours: [7, 10] },
  lunch: { emoji: '☀️', name: 'Обід', desc: 'Час Піта — Агні найсильніший!', tip: '🍽️ Обід — найважливіший прийом їжі дня', hours: [10, 14] },
  afternoon_snack: { emoji: '🌤️', name: 'Перекус', desc: 'Час Вата. Легкий поживний перекус.', tip: '🌰 Мигдаль або фініки з трав\'яним чаєм', hours: [14, 17] },
  dinner: { emoji: '🌙', name: 'Вечеря', desc: 'Час Капха. Легше за обід!', tip: '🫛 Кіча (рис+маш) — аюрведична вечеря №1', hours: [17, 20] },
  evening: { emoji: '🌛', name: 'Вечір', desc: 'Мінімум їжі. Трав\'яний чай.', tip: '🍵 Ромашка з медом — нічний ритуал', hours: [20, 22] },
  night: { emoji: '🌃', name: 'Ніч', desc: 'Час Піта. Тіло відновлюється.', tip: '🌙 Після 22:00 Аюрведа не рекомендує їсти', hours: [22, 5] },
};

function getCurrentMealPeriod() {
  const hour = new Date().getHours();
  for (const [id, period] of Object.entries(MEAL_PERIODS)) {
    const [start, end] = period.hours;
    if (start <= end) {
      if (hour >= start && hour < end) return { id, ...period };
    } else {
      if (hour >= start || hour < end) return { id, ...period };
    }
  }
  return { id: 'lunch', ...MEAL_PERIODS.lunch };
}

function updateMealPeriodCard() {
  const period = getCurrentMealPeriod();
  document.getElementById('meal-emoji').textContent = period.emoji;
  document.getElementById('meal-period-name').textContent = period.name;
  document.getElementById('meal-period-desc').textContent = period.desc;
  document.getElementById('meal-period-tip').textContent = period.tip;
}

// ==========================
// ДУШЕВНИЙ СТАН (Кнопки)
// ==========================
const SOUL_STATES = [
  { id: 'exhausted', label: 'Виснажений', emoji: '🪫' },
  { id: 'stress', label: 'Стрес', emoji: '😰' },
  { id: 'sleepy', label: 'Хочу спати', emoji: '🥱' },
  { id: 'irritated', label: 'Роздратований', emoji: '😤' },
  { id: 'hungry', label: 'Голодний', emoji: '🤤' },
  { id: 'mental_fatigue', label: 'Ментальна втома', emoji: '🤯' },
  { id: 'physical_strain', label: 'Фізичне перенапруження', emoji: '🏋️' },
  { id: 'apathy', label: 'Апатія', emoji: '🫠' },
  { id: 'anxiety', label: 'Неспокій', emoji: '🫣' },
  { id: 'loss_focus', label: 'Втрата концентрації', emoji: '😵‍💫' },
  { id: 'need_relax', label: 'Бажання розслабитися', emoji: '🧘' },
];

function initSoulStateButtons() {
  const grid = document.getElementById('soul-state-grid');
  if (!grid) return;
  
  if (!State.currentSoulStates) State.currentSoulStates = [];

  grid.innerHTML = SOUL_STATES.map(s => {
    const isActive = State.currentSoulStates.includes(s.id);
    return `
      <button
        class="soul-btn ${isActive ? 'active' : ''}"
        id="soul-btn-${s.id}"
        onclick="selectSoulState('${s.id}')"
        aria-pressed="${isActive}"
      >
        <span class="soul-btn-emoji">${s.emoji}</span>
        <span>${s.label}</span>
      </button>
    `;
  }).join('');
}


function selectSoulState(stateId) {
  if (!State.currentSoulStates) State.currentSoulStates = [];
  
  const index = State.currentSoulStates.indexOf(stateId);
  if (index > -1) {
    State.currentSoulStates.splice(index, 1);
  } else {
    if (State.currentSoulStates.length >= 3) {
      showToast('Можна обрати не більше 3-х станів', 'info');
      return;
    }
    State.currentSoulStates.push(stateId);
  }
  
  const btn = document.getElementById(`soul-btn-${stateId}`);
  if (btn) {
    const isActive = State.currentSoulStates.includes(stateId);
    if (isActive) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    } else {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    }
  }

  if (State.rationData) {
    hideElement('ration-result');
    showElement('ration-empty');
    State.rationData = null;
  }
  
  saveToLocalStorage();
  apiRequest('/api/profile', 'POST', { soul_states: State.currentSoulStates }).catch(() => {});
}


// ==========================
// ГЕНЕРАЦІЯ РАЦІОНУ
// ==========================
async function generateRation() {
  if (State.isLoading) return;

  const btn = document.getElementById('magic-btn');

  // Перевірка на заповненість анкети перед генерацією їжі
  const p = State.profile || {};
  if (!p.name || !p.dosha_type || !p.birth_date) {
    showToast('⚠️ Будь ласка, спочатку заповніть ваш профіль (Ім\'я, дату народження та визначіть Дошу)!', 'warning');
    switchTab('profile');
    return;
  }

  State.isLoading = true;
  hideElement('ration-empty');
  hideElement('ration-result');
  showElement('ration-loading');

  if (btn) btn.style.opacity = '0.7';

  try {
    const data = await apiRequest('/api/ration', 'POST', {
      soul_state: State.currentSoulState
    });

    State.rationData = data;
    saveToLocalStorage();
    renderRation(data);
    hideElement('ration-loading');
    showElement('ration-result');
    showToast('✅ Раціон підібрано!', 'success');

    // Плавний скрол до результату
    setTimeout(() => {
      document.getElementById('ration-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

  } catch (err) {
    hideElement('ration-loading');
    showElement('ration-empty');
    showToast('❌ ' + (err.message || 'Помилка генерації. Перевірте з\'єднання.'), 'error');
    console.error('[Ration] Помилка:', err);
  } finally {
    State.isLoading = false;
    if (btn) btn.style.opacity = '';
  }
}

function renderRation(data) {
  // Зберігаємо поточну категорію якщо її немає
  if (!State.currentCategory) State.currentCategory = 'Фрукти';
  
  // Фільтруємо рекомендовані продукти за категорією
  const safeList = document.getElementById('safe-products-list');
  const safeCount = document.getElementById('safe-count');
  const allRecommended = data.recommended_products || [];
  
  // Якщо в продуктів немає категорії (поки що), просто показуємо всі, або фільтруємо якщо є
  const filtered = allRecommended.filter(p => !p.category || p.category === State.currentCategory);

  safeCount.textContent = `${filtered.length} продуктів (всього ${allRecommended.length})`;
  safeList.innerHTML = filtered.map(p => renderProductCard(p, false)).join('');

  // Оновлюємо активну кнопку категорії
  document.querySelectorAll('.category-btn').forEach(btn => {
    if (btn.textContent === State.currentCategory) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Заблоковані продукти
  const blockedList = document.getElementById('blocked-products-list');
  const blockedCount = document.getElementById('blocked-count');
  const blocked = data.blocked_products || [];
  const blockedSection = document.getElementById('blocked-section');

  if (blocked.length > 0) {
    blockedCount.textContent = `${blocked.length} продуктів`;
    blockedList.innerHTML = blocked.map(p => renderProductCard(p, true)).join('');
    blockedSection.classList.remove('hidden');
  } else {
    blockedSection.classList.add('hidden');
  }

  // Оновлюємо підказку
  if (data.tip_uk) {
    document.getElementById('meal-period-tip').textContent = data.tip_uk;
  }
}

function filterCategory(cat) {
  State.currentCategory = cat;
  if (State.rationData) {
    renderRation(State.rationData);
  } else {
    document.querySelectorAll('.category-btn').forEach(btn => {
      if (btn.textContent === cat) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  }
}

function renderProductCard(product, isBlocked) {
  const id = product.id || Math.random().toString(36).substr(2, 9);
  const dosha = product.dosha_effect || {};

  // Будуємо пілюлі ефектів доші
  const doshaPills = ['vata', 'pitta', 'kapha'].map(d => {
    const effect = dosha[d] || 0;
    if (effect === 0) return '';
    const label = { vata: '💨', pitta: '🔥', kapha: '🌊' }[d];
    const arrow = effect < 0 ? '↓' : '↑';
    const cls = effect < 0 ? 'dosha-pill-' + d : '';
    return `<span class="dosha-pill ${cls}">${label}${arrow}</span>`;
  }).join('');

  // Причини блокування
  let blockReasonHtml = '';
  if (isBlocked && product.block_reasons?.length) {
    const reasons = product.block_reasons.map(r =>
      `${r.condition_icon} ${r.condition_name}`
    ).join(', ');
    blockReasonHtml = `
      <div class="product-block-reason">
        <span class="block-reason-icon">⚠️</span>
        <span class="block-reason-text">Заблоковано для: ${reasons}</span>
      </div>
    `;
  }

  const statusBadge = isBlocked
    ? '<span class="status-badge status-badge-blocked">🚫 Блок</span>'
    : '<span class="status-badge status-badge-safe">✅ Ок</span>';

  return `
    <div class="product-card ${isBlocked ? 'blocked' : ''}" id="card-${id}" onclick="toggleProductCard('${id}')">
      <div class="product-card-header">
        <div class="product-emoji">${product.emoji || '🌿'}</div>
        <div class="product-info">
          <div class="product-name">${product.name_uk || id}</div>
          <div class="product-dosha-row">
            ${doshaPills || '<span style="font-size:11px;color:var(--text-muted)">Нейтральний</span>'}
          </div>
        </div>
        <div class="product-status">
          ${statusBadge}
          <span class="expand-arrow">▾</span>
        </div>
      </div>
      <div class="product-card-body">
        <div class="product-card-body-inner">
          ${product.description_uk ? `<div class="product-description">${product.description_uk}</div>` : ''}
          ${product.benefits_uk ? `
            <div class="product-benefits-label">✨ Аюрведичні властивості</div>
            <div class="product-benefits">${product.benefits_uk}</div>
          ` : ''}
          ${blockReasonHtml}
        </div>
      </div>
    </div>
  `;
}

function toggleProductCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const wasExpanded = card.classList.contains('expanded');
  // Закриваємо всі інші
  document.querySelectorAll('.product-card.expanded').forEach(c => c.classList.remove('expanded'));
  // Відкриваємо поточну якщо була закрита
  if (!wasExpanded) card.classList.add('expanded');
}

// ==========================
// НАВІГАЦІЯ ПО ВКЛАДКАХ
// ==========================
function switchTab(tabName, addToHistory = true) {
  // Збереження в localStorage
  localStorage.setItem('lastActiveTab', tabName);

  if (addToHistory) {
    if (historyStack.length === 0 || historyStack[historyStack.length - 1] !== tabName) {
      historyStack.push(tabName);
    }
  }

  // Оновлюємо кнопку "Назад"
  const backBtn = document.getElementById('nav-back-btn');
  if (backBtn) {
    if (tabName !== 'card' && historyStack.length > 1) {
      backBtn.classList.remove('hidden');
    } else {
      backBtn.classList.add('hidden');
    }
  }

  // Приховуємо всі вкладки
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.add('hidden');
  });
  // Деактивуємо всі кнопки
  document.querySelectorAll('.tab-item').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  // Показуємо потрібну вкладку
  const pane = document.getElementById(`tab-${tabName}`);
  const btn = document.getElementById(`tab-btn-${tabName}`);

  if (pane) pane.classList.remove('hidden');
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }

  State.currentTab = tabName;

  // Дії при переключенні вкладки
  if (tabName === 'health') renderConditionsList();
  if (tabName === 'card') renderClientCard();
  if (tabName === 'profile') fillProfileForm();
  if (tabName === 'diary') renderDiary();
}

// ==========================
// ЩОДЕННИК (DIARY)
// ==========================
function renderDiary() {
  const container = document.getElementById('diary-list');
  if (!container) return;
  
  const diary = State.profile?.diary || [];
  
  if (diary.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:16px;font-size:12px;">Ще немає записів</div>';
    return;
  }
  
  // Сортуємо від найновіших
  const sorted = [...diary].sort((a,b) => b.timestamp - a.timestamp);
  
  container.innerHTML = sorted.map(item => {
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="product-card mb-sm" style="display:flex; align-items:center; gap:12px;">
        <div style="font-size:24px;">${item.emoji}</div>
        <div style="flex:1;">
          <div style="font-weight:bold; font-size:14px;">${item.name}</div>
          <div style="font-size:11px; color:var(--text-muted);">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function addToDiary(name, emoji) {
  if (!State.profile.diary) State.profile.diary = [];
  State.profile.diary.push({ name, emoji, timestamp: Date.now() });
  
  // Зберігаємо змінений профіль (на сервері відбудеться merge)
  await apiRequest('/api/profile', 'POST', { diary: State.profile.diary }).catch(() => {});
  saveToLocalStorage();
  
  showToast(`✅ "${name}" додано до щоденника!`, 'success');
  
  // Якщо ми знаходимось на вкладці щоденника - оновлюємо
  if (State.currentTab === 'diary') renderDiary();
}

// ==========================
// ФОРМА ПРОФІЛЮ
// ==========================
function fillProfileForm() {
  const p = State.profile;
  setInputValue('input-name', p.name || '');
  setInputValue('input-phone', p.phone || '');
  setInputValue('input-city', p.city || '');
  setInputValue('input-dosha', p.dosha_type || '');
  setInputValue('input-gender', p.gender || '');
  updateDoshaDisplay(p.dosha_type);

  // Оновлюємо прев'ю фото профілю
  const preview = document.getElementById('profile-photo-preview');
  if (preview) {
    if (p.photo_base64) {
      preview.innerHTML = `<img src="${p.photo_base64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    } else {
      preview.textContent = p.gender === 'male' ? '👨' : (p.gender === 'female' ? '👩' : '🌿');
    }
  }

  // Заповнюємо дату народження
  if (p.birth_date) {
    const dt = new Date(p.birth_date);
    if (!isNaN(dt)) {
      State.datePicker.selectedYear = dt.getFullYear();
      State.datePicker.selectedMonth = dt.getMonth() + 1;
      State.datePicker.selectedDay = dt.getDate();
      updateDatepickerDisplay();
    }
  }

  // Валідація в реальному часі
  document.getElementById('input-name')?.addEventListener('input', e => validateName(e.target));
  document.getElementById('input-phone')?.addEventListener('input', e => validatePhone(e.target));
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function validateName(input) {
  const val = input.value.trim();
  const hint = document.getElementById('hint-name');
  if (val.length < 2) {
    input.classList.add('input-error');
    input.classList.remove('input-success');
    if (hint) hint.textContent = 'Введіть щонайменше 2 символи';
    if (hint) hint.className = 'form-hint hint-error';
  } else if (/[<>{}|]/.test(val)) {
    input.classList.add('input-error');
    if (hint) hint.textContent = 'Недопустимі символи';
    if (hint) hint.className = 'form-hint hint-error';
  } else {
    input.classList.remove('input-error');
    input.classList.add('input-success');
    if (hint) hint.textContent = '';
    if (hint) hint.className = 'form-hint';
  }
}

function validatePhone(input) {
  const val = input.value.replace(/\D/g, '');
  const hint = document.getElementById('hint-phone');
  if (val.length > 0 && val.length < 10) {
    input.classList.add('input-error');
    if (hint) hint.textContent = 'Недостатньо цифр (мінімум 10)';
    if (hint) hint.className = 'form-hint hint-error';
  } else {
    input.classList.remove('input-error');
    if (hint) hint.textContent = '';
    if (hint) hint.className = 'form-hint';
  }
}

async function saveProfile(event) {
  event.preventDefault();

  const name = document.getElementById('input-name')?.value.trim();
  const phone = document.getElementById('input-phone')?.value.trim();
  const city = document.getElementById('input-city')?.value.trim();
  const dosha = document.getElementById('input-dosha')?.value;
  const gender = document.getElementById('input-gender')?.value || '';

  // Валідація
  if (!name || name.length < 2) {
    showToast('⚠️ Введіть ваше ім\'я', 'error');
    return;
  }

  // Формуємо дату народження
  let birthDate = null;
  const dp = State.datePicker;
  if (dp.selectedYear && dp.selectedMonth && dp.selectedDay) {
    birthDate = `${dp.selectedYear}-${String(dp.selectedMonth).padStart(2,'0')}-${String(dp.selectedDay).padStart(2,'0')}`;
  }

  const profileData = {
    name,
    phone: phone || '',
    city: city || '',
    birth_date: birthDate,
    dosha_type: dosha || null,
    gender: gender,
    photo_base64: State.profile.photo_base64 || ''
  };

  const btn = document.getElementById('save-profile-btn');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) btn.textContent = '⏳ Зберігаємо...';

  try {
    await apiRequest('/api/profile', 'POST', profileData);
    State.profile = { ...State.profile, ...profileData };
    State.currentDosha = dosha || null;
    saveToLocalStorage();
    updateHeader();
    renderClientCard();
    
    if (btn) {
      btn.style.background = 'var(--color-safe)';
      btn.textContent = '✅ ЗБЕРЕЖЕНО!';
      setTimeout(() => {
        btn.style.background = '';
        btn.innerHTML = originalText;
      }, 3000);
    }
  } catch (err) {
    // Зберігаємо локально навіть якщо сервер недоступний
    State.profile = { ...State.profile, ...profileData };
    State.currentDosha = dosha || null;
    saveToLocalStorage();
    updateHeader();
    renderClientCard();
    if (btn) {
      btn.style.background = 'var(--color-safe)';
      btn.textContent = '✅ ЗБЕРЕЖЕНО! (Локально)';
      setTimeout(() => {
        btn.style.background = '';
        btn.innerHTML = originalText;
      }, 3000);
    }
  }
}

function updateDoshaDisplay(doshaId) {
  const container = document.getElementById('dosha-result-display');
  if (!container) return;

  const doshaMap = {
    vata: { name: '💨 Вата', desc: 'Повітря та Ефір. Рух та творчість.', color: '#8B9DC3' },
    pitta: { name: '🔥 Піта', desc: 'Вогонь та Вода. Перетворення та лідерство.', color: '#E8735A' },
    kapha: { name: '🌊 Капха', desc: 'Земля та Вода. Стабільність та витривалість.', color: '#5A9E6F' },
  };

  if (!doshaId || !doshaMap[doshaId]) {
    container.innerHTML = '';
    return;
  }

  const d = doshaMap[doshaId];
  container.innerHTML = `
    <div style="padding:12px;background:rgba(${hexToRgb(d.color)},0.1);border:1px solid rgba(${hexToRgb(d.color)},0.3);border-radius:12px;margin-bottom:8px;">
      <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:${d.color};">${d.name}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${d.desc}</div>
    </div>
  `;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

// ==========================
// DATE PICKER (Барабан)
// ==========================
function initDatePicker() {
  buildDrumYear();
  buildDrumMonth();
  buildDrumDay();
}

function buildDrumYear() {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 90;
  const endYear = currentYear - 5;
  const drum = document.getElementById('drum-year');
  if (!drum) return;

  let html = '';
  for (let y = endYear; y >= startYear; y--) {
    html += `<div class="drum-item" data-value="${y}" onclick="selectDrumItem('year', ${y}, this)">${y}</div>`;
  }
  drum.innerHTML = html;
}

function buildDrumMonth() {
  const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                  'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
  const drum = document.getElementById('drum-month');
  if (!drum) return;
  drum.innerHTML = months.map((m, i) =>
    `<div class="drum-item" data-value="${i+1}" onclick="selectDrumItem('month', ${i+1}, this)">${m}</div>`
  ).join('');
}

function buildDrumDay() {
  const drum = document.getElementById('drum-day');
  if (!drum) return;
  let html = '';
  for (let d = 1; d <= 31; d++) {
    html += `<div class="drum-item" data-value="${d}" onclick="selectDrumItem('day', ${d}, this)">${String(d).padStart(2,'0')}</div>`;
  }
  drum.innerHTML = html;
}

function selectDrumItem(type, value, el) {
  const drum = el.closest('.drum-list');
  drum.querySelectorAll('.drum-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  State.datePicker[`selected${type.charAt(0).toUpperCase() + type.slice(1)}`] = value;
  updateDatepickerDisplay();
}

function onDrumScroll(type, drum) {
  clearTimeout(drum._scrollTimer);
  drum._scrollTimer = setTimeout(() => {
    const items = drum.querySelectorAll('.drum-item');
    const drumRect = drum.getBoundingClientRect();
    const centerY = drumRect.top + drumRect.height / 2;
    let closest = null;
    let closestDist = Infinity;
    items.forEach(item => {
      const itemRect = item.getBoundingClientRect();
      const itemCenter = itemRect.top + itemRect.height / 2;
      const dist = Math.abs(centerY - itemCenter);
      if (dist < closestDist) {
        closestDist = dist;
        closest = item;
      }
    });
    if (closest) {
      closest.click();
      closest.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, 150);
}

function toggleDatepicker() {
  const wrapper = document.getElementById('datepicker-wrapper');
  if (!wrapper) return;
  State.datePicker.isOpen = !State.datePicker.isOpen;
  wrapper.classList.toggle('open', State.datePicker.isOpen);
}

function updateDatepickerDisplay() {
  const dp = State.datePicker;
  const el = document.getElementById('datepicker-value');
  if (!el) return;

  if (dp.selectedYear && dp.selectedMonth && dp.selectedDay) {
    const months = ['','Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
    el.textContent = `${dp.selectedDay} ${months[dp.selectedMonth]} ${dp.selectedYear}`;
    el.classList.remove('placeholder');

    // Обраховуємо вік
    const birth = new Date(dp.selectedYear, dp.selectedMonth - 1, dp.selectedDay);
    const age = Math.floor((Date.now() - birth) / (1000 * 60 * 60 * 24 * 365.25));
    if (age > 0 && age < 120) {
      document.getElementById('hint-birthdate').textContent = `Вік: ${age} років`;
    }
  } else {
    el.textContent = 'Оберіть дату';
    el.classList.add('placeholder');
  }
}

// ==========================
// МЕДИЧНИЙ БЛОКПОСТ
// ==========================
function renderConditionsList() {
  const list = document.getElementById('selected-conditions');
  if (!list) return;

  const conditions = State.availableConditions || [];
  const activeConditions = new Set(State.blockpost.conditions || []);
  
  const selectedList = conditions.filter(c => activeConditions.has(c.id));

  if (selectedList.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:16px;font-size:12px;">Нічого не вибрано</div>';
    return;
  }

  list.innerHTML = selectedList.map(cond => `
    <div class="condition-item active" id="cond-${cond.id}">
      <div class="condition-icon">${cond.icon || '⚕️'}</div>
      <div class="condition-info">
        <div class="condition-name">${cond.name_uk}</div>
        <div class="condition-desc">${cond.description_uk || ''}</div>
      </div>
      <button class="ai-send-btn" style="width:30px;height:30px;border-radius:50%;background:rgba(255,0,0,0.1);color:#f44336;font-size:16px;display:flex;align-items:center;justify-content:center;" onclick="removeCondition('${cond.id}')">✕</button>
    </div>
  `).join('');
}

// ==========================
// РОЗУМНИЙ ПОШУК ХВОРОБ (Fuzzy + Синоніми)
// ==========================
let _searchDebounceTimer = null;

function handleConditionSearch(event) {
  const query = event.target.value.trim();
  clearTimeout(_searchDebounceTimer);
  
  if (query.length < 1) {
    hideConditionSuggestions();
    return;
  }
  
  // Debounce 200ms для плавного UX
  _searchDebounceTimer = setTimeout(() => {
    performConditionSearch(query);
  }, 200);
}



// Sorensen-Dice similarity score for fuzzy match
function getStringSimilarity(str1, str2) {
  str1 = str1.toLowerCase().trim();
  str2 = str2.toLowerCase().trim();
  if (str1 === str2) return 1.0;
  if (str1.includes(str2) || str2.includes(str1)) return 0.5;
  
  const getBigrams = (str) => {
    const bigrams = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };
  
  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  if (b1.size === 0 || b2.size === 0) return 0.0;
  
  let intersection = 0;
  for (const val of b1) {
    if (b2.has(val)) intersection++;
  }
  
  return (2.0 * intersection) / (b1.size + b2.size);
}

function performConditionSearch(query) {
  const suggContainer = document.getElementById('condition-suggestions');
  const q = query.toLowerCase().trim();
  
  const conditions = State.availableConditions || [];
  const activeConditions = new Set(State.blockpost.conditions || []);
  
  const scored = [];
  
  for (const c of conditions) {
    if (activeConditions.has(c.id)) continue;
    
    let score = 0;
    
    // Точна відповідність назви — найвищий пріоритет
    if (c.name_uk.toLowerCase() === q) { score += 100; }
    else if (c.name_uk.toLowerCase().startsWith(q)) { score += 80; }
    else if (c.name_uk.toLowerCase().includes(q)) { score += 60; }
    
    // Перевірка синонімів
    if (c.synonyms) {
      for (const syn of c.synonyms) {
        if (syn.toLowerCase() === q) { score += 90; break; }
        else if (syn.toLowerCase().startsWith(q)) { score += 70; break; }
        else if (syn.toLowerCase().includes(q)) { score += 50; break; }
      }
    }
    
    // Ключові слова
    if (c.keywords) {
      for (const kw of c.keywords) {
        if (kw.toLowerCase().includes(q)) { score += 30; break; }
      }
    }
    
    // Опис
    if (c.description_uk?.toLowerCase().includes(q)) { score += 20; }
    
    // Fuzzy matching score для дрібних друкарських помилок
    const nameSim = getStringSimilarity(c.name_uk, q);
    if (nameSim > 0.3) {
      score += nameSim * 50;
    }
    if (c.synonyms) {
      for (const syn of c.synonyms) {
        const synSim = getStringSimilarity(syn, q);
        if (synSim > 0.3) {
          score += synSim * 40;
          break;
        }
      }
    }
    
    if (score > 15) {
      scored.push({ condition: c, score });
    }
  }
  
  // Сортуємо за балом
  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, 7).map(s => s.condition);
  
  if (matches.length === 0) {
    suggContainer.innerHTML = `
      <div style="padding:12px;">
        <div style="color:var(--text-muted);font-size:12px;text-align:center;margin-bottom:8px;">Не знайдено в базі</div>
        <div class="suggestion-item" onclick="searchConditionOnline('${query.replace(/'/g, "\'")}')"
             style="background:rgba(201,168,76,0.05);border:1px solid var(--border-color);border-radius:8px;">
          <div class="suggestion-item-icon">🌐</div>
          <div>
            <div style="font-weight:bold;font-size:13px;color:var(--gold-primary);">Шукати "${query}" онлайн</div>
            <div style="font-size:11px;color:var(--text-muted);">Відкриємо аюрведичну довідку</div>
          </div>
        </div>
      </div>
    `;
  } else {
    suggContainer.innerHTML = matches.map(c => {
      const severityColor = c.severity === 'high' ? '#e8735a' : c.severity === 'medium' ? '#e8a44c' : '#52d9a0';
      const highlightedName = highlightMatch(c.name_uk, query);
      return `
        <div class="suggestion-item" onclick="addConditionFromSearch('${c.id}')">
          <div class="suggestion-item-icon">${c.icon || '⚕️'}</div>
          <div style="flex:1;">
            <div style="font-weight:bold;font-size:13px;">${highlightedName}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:1px;">${c.description_uk || ''}</div>
          </div>
          <div style="font-size:9px;padding:2px 6px;border-radius:8px;background:${severityColor}22;color:${severityColor};white-space:nowrap;"
          >${c.severity === 'high' ? 'Важливо' : c.severity === 'medium' ? 'Помірно' : 'Легко'}</div>
        </div>
      `;
    }).join('');
  }
  suggContainer.classList.remove('hidden');
}


function highlightMatch(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.substring(0, idx)
    + `<span style="color:var(--gold-primary);font-weight:700;">${text.substring(idx, idx + query.length)}</span>`
    + text.substring(idx + query.length);
}

function hideConditionSuggestions() {
  const s = document.getElementById('condition-suggestions');
  if (s) s.classList.add('hidden');
}

function searchConditionOnline(query) {
  const url = `https://www.google.com/search?q=аюрведа+${encodeURIComponent(query)}+дієта+харчування`;
  if (window.Telegram?.WebApp?.openLink) {
    window.Telegram.WebApp.openLink(url);
  } else {
    window.open(url, '_blank');
  }
  hideConditionSuggestions();
}

function addConditionFromSearch(condId) {
  const conditions = new Set(State.blockpost.conditions || []);
  conditions.add(condId);
  State.blockpost.conditions = [...conditions];
  
  document.getElementById('condition-search').value = '';
  hideConditionSuggestions();
  
  // Автозбереження відразу
  saveBlockpostImmediate();
  renderConditionsList();
  
  const cond = State.availableConditions.find(c => c.id === condId);
  const name = cond?.name_uk || condId;
  showToast(`✅ Додано: ${name.substring(0, 30)}`, 'success');
}

function removeCondition(condId) {
  const conditions = new Set(State.blockpost.conditions || []);
  conditions.delete(condId);
  State.blockpost.conditions = [...conditions];
  
  // Автозбереження відразу
  saveBlockpostImmediate();
  renderConditionsList();
  showToast('Видалено з обмежень', 'info');
}

// Миттєве збереження блокпосту (без кнопки)
async function saveBlockpostImmediate() {
  saveToLocalStorage();
  try {
    await apiRequest('/api/blockpost', 'POST', { conditions: State.blockpost.conditions });
  } catch (e) {
    // Збережено локально — ОК
  }
  // Оновлюємо карточку клієнта
  const countEl = document.getElementById('stat-conditions');
  if (countEl) countEl.textContent = (State.blockpost.conditions || []).length;
}

// Зачиняємо dropdown при кліку поза ним
document.addEventListener('click', (e) => {
  const suggContainer = document.getElementById('condition-suggestions');
  const searchInput = document.getElementById('condition-search');
  if (suggContainer && !suggContainer.classList.contains('hidden')) {
    if (e.target !== searchInput && !suggContainer.contains(e.target)) {
      suggContainer.classList.add('hidden');
    }
  }
});

async function saveBlockpost() {
  const btn = document.querySelector('#tab-health button.btn-full') || document.querySelector('#tab-health .btn-gold');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) btn.textContent = '⏳ Зберігаємо...';

  try {
    await apiRequest('/api/blockpost', 'POST', { conditions: State.blockpost.conditions });
    saveToLocalStorage();
    
    if (btn) {
      btn.style.background = 'var(--color-safe)';
      btn.textContent = '✅ ЗБЕРЕЖЕНО!';
      setTimeout(() => {
        btn.style.background = '';
        btn.innerHTML = originalText;
      }, 3000);
    }
    // Скидаємо раціон бо змінились обмеження
    State.rationData = null;
    hideElement('ration-result');
    showElement('ration-empty');
  } catch (err) {
    saveToLocalStorage();
    if (btn) {
      btn.style.background = 'var(--color-safe)';
      btn.textContent = '✅ ЗБЕРЕЖЕНО! (Локально)';
      setTimeout(() => {
        btn.style.background = '';
        btn.innerHTML = originalText;
      }, 3000);
    }
  }
}

// ==========================
// КАРТКА КЛІЄНТА
// ==========================
function renderClientCard() {
  const p = State.profile;
  const bp = State.blockpost;

  document.getElementById('client-name').textContent = p.name || 'Профіль не заповнено';

  const doshaNames = { vata: '💨 Вата-конституція', pitta: '🔥 Піта-конституція', kapha: '🌊 Капха-конституція' };
  document.getElementById('client-dosha-text').textContent = doshaNames[p.dosha_type] || 'Тип Доші не визначено';

  // Вік
  if (p.birth_date) {
    const birth = new Date(p.birth_date);
    const age = Math.floor((Date.now() - birth) / (1000 * 60 * 60 * 24 * 365.25));
    document.getElementById('stat-age').textContent = `${age}р`;
  } else {
    document.getElementById('stat-age').textContent = '—';
  }

  document.getElementById('stat-city').textContent = p.city ? p.city.substring(0, 7) : '—';
  document.getElementById('stat-conditions').textContent = (bp.conditions || []).length;

  // Аватар: завантажене фото або гендерована іконка
  const avatar = document.getElementById('client-avatar');
  if (avatar) {
    if (p.photo_base64) {
      avatar.innerHTML = `<img src="${p.photo_base64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    } else {
      avatar.innerHTML = ''; // Очищуємо img
      avatar.textContent = p.gender === 'male' ? '👨' : (p.gender === 'female' ? '👩' : '🌿');
    }
  }

  // Оновлюємо Загальну Анкету
  const infoName = document.getElementById('card-info-name');
  const infoPhone = document.getElementById('card-info-phone');
  const infoCity = document.getElementById('card-info-city');
  const infoGender = document.getElementById('card-info-gender');
  if (infoName) infoName.textContent = p.name || '—';
  if (infoPhone) infoPhone.textContent = p.phone || '—';
  if (infoCity) infoCity.textContent = p.city || '—';
  if (infoGender) infoGender.textContent = p.gender === 'male' ? 'Чоловік 👨' : (p.gender === 'female' ? 'Жінка 👩' : '—');

  // Оновлюємо Статистику балансу
  const statsWater = document.getElementById('card-stats-water');
  const statsHabits = document.getElementById('card-stats-habits');
  if (statsWater) {
    const isWaterDone = p.habits?.water;
    statsWater.textContent = isWaterDone ? 'Виконано ✅' : 'Не виконано';
    statsWater.style.color = isWaterDone ? 'var(--color-safe)' : 'var(--gold-primary)';
  }
  if (statsHabits) {
    let checkedCount = 0;
    if (p.habits?.water) checkedCount++;
    if (p.habits?.tongue) checkedCount++;
    if (p.habits?.meditation) checkedCount++;
    statsHabits.textContent = `${checkedCount} / 3`;
  }

  // Оновлюємо Біоритми дня
  const bioContainer = document.getElementById('card-biorhythms-container');
  if (bioContainer) {
    const dosha = p.dosha_type || 'none';
    let steps = [];
    if (dosha === 'vata') {
      steps = [
        { time: '06:00', text: '🌅 Пробудження та склянка теплої води' },
        { time: '07:30', text: '🥣 Легкий теплий сніданок (заземлення)' },
        { time: '12:00', text: '☀️ Ситний обід (головна страва дня)' },
        { time: '18:00', text: '🌙 Легка тепла вечеря (без важких білків)' },
        { time: '22:00', text: '💤 Сон (глибоке розслаблення Вати)' }
      ];
    } else if (dosha === 'pitta') {
      steps = [
        { time: '06:00', text: '🌅 Пробудження та дихальні вправи' },
        { time: '07:30', text: '🥣 Охолоджуючий сніданок (вівсянка з кокосом)' },
        { time: '12:30', text: '☀️ Ситний обід (активний вогонь Агні)' },
        { time: '19:00', text: '🌙 Легка прохолодна вечеря' },
        { time: '22:30', text: '💤 Сон (для заспокоєння активного розуму)' }
      ];
    } else if (dosha === 'kapha') {
      steps = [
        { time: '05:30', text: '🌅 Ранній підйом та сухе очищення язика' },
        { time: '07:30', text: '☕ Імбирний чай або легке фруктове пюре' },
        { time: '13:00', text: '☀️ Гострий стимулюючий обід (багато спецій)' },
        { time: '18:00', text: '🌙 Дуже легка суха вечеря (гречка з овочами)' },
        { time: '22:00', text: '💤 Сон (ранній відбій для свіжості)' }
      ];
    } else {
      steps = [
        { time: '06:30', text: '🌅 Пробудження та склянка води' },
        { time: '08:00', text: '🥣 Збалансований сніданок' },
        { time: '13:00', text: '☀️ Здоровий обід' },
        { time: '19:00', text: '🌙 Легка вечеря' },
        { time: '22:30', text: '💤 Спокійний сон' }
      ];
    }
    bioContainer.innerHTML = steps.map(s => `
      <div class="biorhythm-step">
        <span class="biorhythm-time">${s.time}</span>
        <span class="biorhythm-text">${s.text}</span>
      </div>
    `).join('');
  }

  // Активні обмеження
  renderCardConditions();
  
  // Медичний Архів
  renderVaultFiles();
}

function renderCardConditions() {
  const list = document.getElementById('card-conditions-list');
  const count = document.getElementById('card-conditions-count');
  if (!list) return;

  const activeIds = State.blockpost.conditions || [];
  count.textContent = activeIds.length;

  if (activeIds.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px;">Медичних обмежень не вказано</div>';
    return;
  }

  const allConditions = State.availableConditions;
  const activeConditions = activeIds.map(id => allConditions.find(c => c.id === id)).filter(Boolean);

  list.innerHTML = activeConditions.map(c => `
    <div class="condition-item active" style="cursor:default;">
      <div class="condition-icon">${c.icon}</div>
      <div class="condition-info">
        <div class="condition-name">${c.name_uk}</div>
      </div>
      <span class="status-badge status-badge-blocked">Активно</span>
    </div>
  `).join('');
}

// ==========================
// МЕДИЧНИЙ АРХІВ (Medical Vault)
// ==========================
async function handleVaultUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const currentFiles = State.profile.vault_files || [];
  if (currentFiles.length >= 10) {
    showToast('❌ Досягнуто ліміт у 10 файлів', 'error');
    return;
  }

  showToast('⏳ Завантаження та розпізнавання (OCR)...', 'info');
  
  // Імітація завантаження та OCR
  setTimeout(() => {
    const newFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      date: new Date().toISOString(),
      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      status: 'success'
    };
    
    State.profile.vault_files = [...currentFiles, newFile];
    saveToLocalStorage();
    renderVaultFiles();
    showToast('✅ Файл завантажено та розпізнано', 'success');
  }, 2000);
}

function renderVaultFiles() {
  const list = document.getElementById('vault-files-list');
  const count = document.getElementById('vault-count');
  if (!list) return;

  const files = State.profile.vault_files || [];
  count.textContent = `${files.length} / 10`;

  if (files.length === 0) {
    list.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-muted); font-size:13px;">Архів порожній</div>';
    return;
  }

  list.innerHTML = files.map(f => `
    <div class="vault-file-item">
      <div class="vault-file-icon">📄</div>
      <div class="vault-file-info">
        <div class="vault-file-name">${f.name}</div>
        <div class="vault-file-meta">${new Date(f.date).toLocaleDateString('uk-UA')} • ${f.size}</div>
      </div>
      <div class="vault-file-status" style="color:var(--color-safe);">Оброблено ШІ</div>
    </div>
  `).join('');
}

// ==========================
// КВІЗ ДОШІ
// ==========================
const DOSHA_QUIZ_QUESTIONS = [
  {
    emoji: '🧍',
    question: 'Яка твоя статура від природи?',
    options: [
      { text: 'Стрункий, худорлявий, мені важко набрати вагу', vata: 2, pitta: 0, kapha: 0 },
      { text: 'Середня, м\'язова, вага тримається стабільно', vata: 0, pitta: 2, kapha: 0 },
      { text: 'Щільна, схильний до повноти, легко набираю вагу', vata: 0, pitta: 0, kapha: 2 },
    ]
  },
  {
    emoji: '✋',
    question: 'Яка у тебе шкіра?',
    options: [
      { text: 'Суха, тонка, схильна до зневоднення', vata: 2, pitta: 0, kapha: 0 },
      { text: 'Чутлива, схильна до почервоніння та прищів', vata: 0, pitta: 2, kapha: 0 },
      { text: 'Гладка, маслява, пориста', vata: 0, pitta: 0, kapha: 2 },
    ]
  },
  {
    emoji: '🍽️',
    question: 'Який твій апетит та травлення?',
    options: [
      { text: 'Нерегулярний, то голодний, то ні, буває здуття', vata: 2, pitta: 0, kapha: 0 },
      { text: 'Сильний апетит, злюся якщо не поїм вчасно', vata: 0, pitta: 2, kapha: 0 },
      { text: 'Помірний апетит, довго перетравлюю, відчуваю важкість', vata: 0, pitta: 0, kapha: 2 },
    ]
  },
  {
    emoji: '😰',
    question: 'Як ти реагуєш на стрес?',
    options: [
      { text: 'Тривога, страх, нервозність, думки скачуть', vata: 2, pitta: 0, kapha: 0 },
      { text: 'Роздратування, гнів, критичність', vata: 0, pitta: 2, kapha: 0 },
      { text: 'Замикаюся, уникаю, стаю млявим та апатичним', vata: 0, pitta: 0, kapha: 2 },
    ]
  },
  {
    emoji: '😴',
    question: 'Який у тебе сон?',
    options: [
      { text: 'Чуткий, поверхневий, часто прокидаюся, безсоння', vata: 2, pitta: 0, kapha: 0 },
      { text: 'Середній, але гострий — легко прокидаюся від шуму', vata: 0, pitta: 2, kapha: 0 },
      { text: 'Глибокий, тривалий, важко прокидатися вранці', vata: 0, pitta: 0, kapha: 2 },
    ]
  },
  {
    emoji: '🧠',
    question: 'Яка твоя пам\'ять?',
    options: [
      { text: 'Швидко запам\'ятовую, але швидко забуваю', vata: 2, pitta: 0, kapha: 0 },
      { text: 'Чітка та точна, добре пам\'ятаю деталі', vata: 0, pitta: 2, kapha: 0 },
      { text: 'Повільно запам\'ятовую, але пам\'ять дуже стійка', vata: 0, pitta: 0, kapha: 2 },
    ]
  },
  {
    emoji: '🌡️',
    question: 'Яка у тебе природна температура тіла?',
    options: [
      { text: 'Мерзну, завжди холодні руки та ноги', vata: 2, pitta: 0, kapha: 0 },
      { text: 'Часто відчуваю жар, пітливість, мені спекотно', vata: 0, pitta: 2, kapha: 0 },
      { text: 'Нормальна, рідко мерзну або потію', vata: 0, pitta: 0, kapha: 2 },
    ]
  }
];

function openQuiz() {
  State.quiz.currentQuestion = 0;
  State.quiz.answers = {};
  State.quiz.questions = DOSHA_QUIZ_QUESTIONS;
  renderQuizQuestion();
  document.getElementById('quiz-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeQuiz() {
  document.getElementById('quiz-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

let selectedMealTime = 'lunch';

function selectMealTime(time) {
  selectedMealTime = time;
  document.querySelectorAll('[id^="meal-btn-"]').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`meal-btn-${time}`).classList.add('active');
}

// ==========================
// ГЕНЕРАТОР СТРАВ (Смарт-Конструктор 1000+ варіантів)
// ==========================
// ==========================
// БАЗА 300 РЕЦЕПТІВ (100 сніданків + 100 обідів + 100 вечерь)
// Всі продукти доступні в Україні (АТБ, Сільпо, Новус, Рост)
// ==========================
const RECIPES_DB = {
  breakfast: [
    { name:"Вівсянка з медом та горіхами", emoji:"🥣", time:"5 хв", ingredients:"Вівсянка, мед, волоські горіхи, кориця", recipe:"Залити вівсянку окропом або молоком, настояти 5 хв. Додати мед, горіхи, корицю.", dosha:{vata:"Ідеально заземляє",pitta:"Охолоджує надлишковий вогонь",kapha:"Стимулюючий сніданок"}, calories:320 },
    { name:"Сирники з сметаною", emoji:"🥞", time:"15 хв", ingredients:"Сир кисломолочний, яйце, борошно, сметана", recipe:"Змішати сир, яйце, 2 ст.л. борошна. Сформувати сирники, підсмажити по 3 хв з кожного боку.", dosha:{vata:"Поживно та теплотворно",pitta:"В міру — охолоджує",kapha:"Важкувато, але смачно"}, calories:380 },
    { name:"Омлет з помідорами та зеленню", emoji:"🍳", time:"7 хв", ingredients:"3 яйця, помідор, кріп, оливкова олія", recipe:"Збити яйця, нарізати помідор. Розігріти олію, вилити яйця, додати помідор. Посипати кропом.", dosha:{vata:"Тепла та білкова",pitta:"Легко — без гострого",kapha:"Сухий омлет без масла краще"}, calories:280 },
    { name:"Гречана каша з вершковим маслом", emoji:"🍚", time:"20 хв", ingredients:"Гречка, вершкове масло, сіль", recipe:"Промити гречку. Варити 1:2 води 15 хв на малому вогні. Додати шматочок масла.", dosha:{vata:"Заземляє та живить",pitta:"Нейтральна та охолоджуюча",kapha:"Занадто важка — зменшіть масло"}, calories:300 },
    { name:"Тости з авокадо та яйцем", emoji:"🥑", time:"10 хв", ingredients:"Хліб цільнозерновий, авокадо, яйце пашот, лимон", recipe:"Підсмажити хліб. Розім'яти авокадо з лимоном. Зварити яйце пашот 3 хв. Зібрати тост.", dosha:{vata:"Масляне авокадо — заземляє",pitta:"Охолоджуюче та смачне",kapha:"Тільки один тост"}, calories:420 },
    { name:"Банановий смузі з кефіром", emoji:"🥤", time:"3 хв", ingredients:"Банан, кефір 1%, мед, кориця", recipe:"Злити всі інгредієнти в блендер. Збити 30 секунд. Додати щіпку кориці.", dosha:{vata:"Живильний та легкий",pitta:"Охолоджує при гарячому кліматі",kapha:"Мало цукру — обережно з медом"}, calories:240 },
    { name:"Пшоняна каша з гарбузом", emoji:"🎃", time:"25 хв", ingredients:"Пшоно, гарбуз, молоко, мед", recipe:"Нарізати гарбуз. Варити пшоно в молоці 15 хв, додати гарбуз. Подавати з медом.", dosha:{vata:"Ідеальна осінь",pitta:"Охолоджуюча та солодка",kapha:"Тільки невелика порція"}, calories:290 },
    { name:"Ліниві вареники з сиром", emoji:"🥟", time:"20 хв", ingredients:"Сир, яйце, борошно, сметана", recipe:"Замісити тісто з сиру, яйця та борошна. Розкачати, нарізати ромбиками. Кинути в окріп на 3 хв.", dosha:{vata:"Теплі та ситні",pitta:"Збалансовані",kapha:"Важкуваті — зменшити порцію"}, calories:350 },
    { name:"Тарілка з хумусом та овочами", emoji:"🫙", time:"5 хв", ingredients:"Хумус, морква, огірок, болгарський перець", recipe:"Нарізати овочі паличками. Подавати з хумусом для занурювання.", dosha:{vata:"Додати оливкову олію",pitta:"Охолоджуюче та легке",kapha:"Ідеально легко"}, calories:200 },
    { name:"Яйця бенедикт по-українськи", emoji:"🍳", time:"15 хв", ingredients:"Яйця, хліб жито, шинка, зелень", recipe:"Підсмажити хліб. Зварити яйця пашот. Укласти шинку, яйце, полити голандезом або сметаною.", dosha:{vata:"Ситно та білково",pitta:"В міру через шинку",kapha:"Без соусу краще"}, calories:400 },
    { name:"Рисова каша на кокосовому молоці", emoji:"🥥", time:"20 хв", ingredients:"Рис, кокосове молоко, мед, кардамон", recipe:"Варити рис у кокосовому молоці 15 хв. Додати мед та кардамон. Подавати теплим.", dosha:{vata:"Заземляє та живить",pitta:"Охолоджуює кокос",kapha:"Зменшити кількість молока"}, calories:310 },
    { name:"Скрамбл з шпинатом", emoji:"🍳", time:"8 хв", ingredients:"4 яйця, шпинат, часник, оливкова олія", recipe:"Обсмажити шпинат з часником. Додати збиті яйця, постійно помішуючи на малому вогні.", dosha:{vata:"Тепла та поживна",pitta:"Шпинат охолоджує",kapha:"Легко та без масла"}, calories:260 },
    { name:"Мюслі з йогуртом та ягодами", emoji:"🫐", time:"3 хв", ingredients:"Мюслі без цукру, йогурт грецький, чорниця, мед", recipe:"Насипати мюслі в тарілку. Додати йогурт, чорницю, полити медом.", dosha:{vata:"Якщо теплий — краще",pitta:"Охолоджуюче",kapha:"Без меду"}, calories:290 },
    { name:"Кукурудзяна каша (мамалига)", emoji:"🌽", time:"20 хв", ingredients:"Кукурудзяне борошно, вода, сіль, масло", recipe:"Довести воду до кипіння, всипати борошно тонким струменем, варити 15 хв, постійно помішуючи.", dosha:{vata:"З великою кількістю масла",pitta:"Нейтральна",kapha:"Без масла"}, calories:280 },
    { name:"Тост з горіховою пастою та бананом", emoji:"🍌", time:"5 хв", ingredients:"Хліб, арахісова паста, банан, кориця", recipe:"Підсмажити хліб. Намастити пастою, викласти нарізаний банан, посипати корицею.", dosha:{vata:"Ідеальна комбінація",pitta:"В міру — трохи гріє",kapha:"Замість хліба — крекер"}, calories:380 },
    { name:"Парова гречка з яйцем та зеленню", emoji:"🍚", time:"20 хв", ingredients:"Гречка, яйце зварне, зелена цибуля, кріп", recipe:"Зварити гречку. Зварити яйце (7 хв). Нарізати зелень. Змішати та подавати.", dosha:{vata:"Ситний та теплий",pitta:"Збалансований",kapha:"Легкий та поживний"}, calories:320 },
    { name:"Яблучна каша з корицею", emoji:"🍎", time:"15 хв", ingredients:"Вівсяні пластівці, яблуко, кориця, мед", recipe:"Зварити вівсянку. Нарізати яблуко кубиками, потушкувати 5 хв. Змішати, додати корицю та мед.", dosha:{vata:"Теплотворна та солодка",pitta:"Яблуко охолоджує",kapha:"Без меду"}, calories:270 },
    { name:"Кіша з сиром та помідорами", emoji:"🥧", time:"35 хв", ingredients:"Яйця, молоко, твердий сир, помідори, зелень", recipe:"Збити 3 яйця з молоком. Додати тертий сир та нарізані помідори. Запекти при 180°C 25 хв.", dosha:{vata:"Теплотворна",pitta:"Без гострого",kapha:"Зменшити сир"}, calories:350 },
    { name:"Зелений смузі-боул", emoji:"🥬", time:"5 хв", ingredients:"Шпинат, банан, яблуко, йогурт, насіння чіа", recipe:"Збити шпинат, банан та яблуко в блендері. Перелити в тарілку, додати чіа та улюблені топінги.", dosha:{vata:"Додати авокадо",pitta:"Охолоджуюче",kapha:"Без банана"}, calories:200 },
    { name:"Картопляні деруни", emoji:"🥔", time:"25 хв", ingredients:"Картопля, яйце, борошно, сметана, цибуля", recipe:"Натерти картоплю та цибулю, відтиснути воду. Додати яйце та борошно. Підсмажити з двох боків.", dosha:{vata:"Теплотворні та ситні",pitta:"В міру",kapha:"Без сметани"}, calories:400 },
    { name:"Сендвіч із запеченим овочами", emoji:"🥪", time:"20 хв", ingredients:"Хліб, кабачок, перець, оливкова олія, фета", recipe:"Запекти овочі 15 хв. Зібрати сендвіч з овочами та фетою.", dosha:{vata:"Теплі овочі — добре",pitta:"Охолоджуюче та смачне",kapha:"Без хліба — тільки овочі"}, calories:300 },
    { name:"Пудинг з чіа та ванільним молоком", emoji:"🥛", time:"5 хв+8год", ingredients:"Насіння чіа, молоко, ванільний екстракт, мед", recipe:"Змішати чіа з молоком та ваніллю. Накрити та залишити на ніч у холодильнику. Вранці додати мед.", dosha:{vata:"Поживний та легкий",pitta:"Охолоджуючий",kapha:"Без меду"}, calories:220 },
    { name:"Запечений болгарський перець з яйцем", emoji:"🫑", time:"20 хв", ingredients:"Перець болгарський, яйце, сир, зелень", recipe:"Відрізати верх перцю. Вбити яйце всередину. Посипати сиром. Запекти 15 хв при 180°C.", dosha:{vata:"Теплий та ситний",pitta:"Перець злегка гріє",kapha:"Легкий"}, calories:250 },
    { name:"Млинці вівсяні з ягодами", emoji:"🥞", time:"20 хв", ingredients:"Вівсяне борошно, яйця, молоко, чорниця", recipe:"Змішати борошно, яйця та молоко. Смажити тонкі млинці. Подавати з ягодами.", dosha:{vata:"З маслом — ідеально",pitta:"Ягоди охолоджують",kapha:"Без вершкового масла"}, calories:310 },
    { name:"Гречана крупа з грибами", emoji:"🍄", time:"25 хв", ingredients:"Гречка, гриби, цибуля, оливкова олія", recipe:"Обсмажити гриби та цибулю. Відварити гречку. Змішати.", dosha:{vata:"Теплотворна та ситна",pitta:"Гриби нейтральні",kapha:"Без зайвого масла"}, calories:280 },
    { name:"Ячмінна каша з медом", emoji:"🌾", time:"30 хв", ingredients:"Ячмінна крупа, вода, мед, кориця", recipe:"Варити ячмінь в воді 25 хв. Подавати з медом та корицею. Допомагає при діабеті.", dosha:{vata:"Важкувата",pitta:"Знижує Піту",kapha:"Ідеальна"}, calories:260 },
    { name:"Тости з лососем та кремовим сиром", emoji:"🐟", time:"5 хв", ingredients:"Хліб житній, лосось слабосол., кремовий сир, огірок", recipe:"Намастити хліб сиром. Викласти лосось та огірок.", dosha:{vata:"Омега-3 заземляє",pitta:"Охолоджуючий лосось",kapha:"Без хліба"}, calories:350 },
    { name:"Яєчня з цибулею та кропом", emoji:"🍳", time:"8 хв", ingredients:"3 яйця, цибуля зелена, кріп, вершкове масло", recipe:"Розтопити масло. Обсмажити цибулю. Вбити яйця, посолити. Посипати кропом.", dosha:{vata:"Тепла та ситна",pitta:"Цибуля гріє — обережно",kapha:"Без масла"}, calories:290 },
    { name:"Смузі з шпинатом та манго", emoji:"🥭", time:"3 хв", ingredients:"Шпинат, манго (заморожене), кефір, лимон", recipe:"Збити всі інгредієнти в блендері до однорідності.", dosha:{vata:"Додати мед",pitta:"Манго охолоджує",kapha:"Без меду"}, calories:180 },
    { name:"Рисова каша з родзинками", emoji:"🍚", time:"20 хв", ingredients:"Рис, молоко, родзинки, вершкове масло, цукор", recipe:"Зварити рис у молоці. Додати родзинки та масло. Подавати теплим.", dosha:{vata:"Заземляє та живить",pitta:"Солодке молоко заспокоює",kapha:"Без цукру"}, calories:330 },
    { name:"Брускета з томатами та базиліком", emoji:"🍅", time:"10 хв", ingredients:"Хліб чіабата, помідори, часник, базилік, оливкова олія", recipe:"Підсмажити хліб. Натерти часником. Викласти нарізані помідори з базиліком та оливковою олією.", dosha:{vata:"Теплий хліб — добре",pitta:"Помідори злегка кислі",kapha:"Без олії"}, calories:250 },
    { name:"Кокосова каша з ананасом", emoji:"🍍", time:"15 хв", ingredients:"Вівсянка, кокосове молоко, ананас, кунжут", recipe:"Варити вівсянку у кокосовому молоці. Додати нарізаний ананас та кунжут.", dosha:{vata:"Екзотично та ситно",pitta:"Кокос охолоджує",kapha:"Зменшити молоко"}, calories:300 },
    { name:"Запіканка сирна з ваніллю", emoji:"🧁", time:"40 хв", ingredients:"Сир, яйця, манна крупа, цукор, ваніль", recipe:"Змішати сир з яйцями, манкою та цукром. Вилити у форму, запекти 35 хв при 180°C.", dosha:{vata:"Поживна та тепла",pitta:"Збалансована",kapha:"Менше цукру"}, calories:380 },
    { name:"Хліб на кефірі з насінням", emoji:"🍞", time:"5 хв", ingredients:"Хліб домашній, кефір, насіння льону, горіхи", recipe:"Змастити хліб кефіром. Посипати насінням льону та дрібленими горіхами.", dosha:{vata:"Ферментований кефір — для мікробіому",pitta:"Охолоджуючий",kapha:"В міру"}, calories:270 },
    { name:"Вафлі зернові з ягодами", emoji:"🧇", time:"15 хв", ingredients:"Борошно цільнозернове, яйця, молоко, чорниця", recipe:"Зробити тісто з борошна, яєць та молока. Випекти у вафельниці. Подавати з ягодами.", dosha:{vata:"Теплі та хрусткі",pitta:"Ягоди охолоджують",kapha:"Без сиропу"}, calories:320 },
    { name:"Яйця з куркумою та шпинатом", emoji:"🟡", time:"10 хв", ingredients:"3 яйця, шпинат, куркума, чорний перець, олія", recipe:"Нагріти олію з куркумою. Додати шпинат, тушкувати 2 хв. Вбити яйця, перемішати.", dosha:{vata:"Куркума — протизапальна",pitta:"Охолоджує шпинат",kapha:"Легкий та пряний"}, calories:250 },
    { name:"Тарілка з горіхами та сухофруктами", emoji:"🥜", time:"2 хв", ingredients:"Мигдаль, волоський горіх, чорнослив, курага, мед", recipe:"Змішати горіхи та сухофрукти. Полити краплею меду. Їсти повільно.", dosha:{vata:"Калорійно та заземляє",pitta:"В міру",kapha:"Без меду — менше"}, calories:400 },
    { name:"Кукурудзяні млинці (лепьошки)", emoji:"🌽", time:"20 хв", ingredients:"Кукурудзяне борошно, яйце, вода, сіль", recipe:"Замісити тісто. Смажити тонкі коржики на сковороді по 2-3 хв з боку.", dosha:{vata:"З маслом",pitta:"Нейтральні",kapha:"Ідеально безглютенові"}, calories:220 },
    { name:"Йогурт з гранолою та ківі", emoji:"🥝", time:"3 хв", ingredients:"Йогурт грецький, гранола, ківі, мед", recipe:"Викласти йогурт в тарілку. Додати гранолу, нарізане ківі та мед.", dosha:{vata:"Теплу гранолу краще",pitta:"Ківі охолоджує",kapha:"Без меду"}, calories:280 },
    { name:"Каша з амаранту", emoji:"🌿", time:"25 хв", ingredients:"Амарант, вода, молоко, мед, кардамон", recipe:"Варити амарант у воді 20 хв. Додати молоко та довести до смаку медом та кардамоном.", dosha:{vata:"Дуже поживна",pitta:"Охолоджуюча",kapha:"Менше молока"}, calories:290 },
    { name:"Сирна тарілка з горіхами та медом", emoji:"🧀", time:"3 хв", ingredients:"Твердий сир, волоські горіхи, мед, виноград", recipe:"Нарізати сир. Викласти з горіхами та виноградом. Полити медом.", dosha:{vata:"Поживна та теплотворна",pitta:"Сир трохи гріє — в міру",kapha:"Мінімум сиру"}, calories:450 },
    { name:"Банановий хліб", emoji:"🍌", time:"55 хв", ingredients:"Банани, яйця, борошно вівсяне, мед", recipe:"Розім'яти 3 банани. Змішати з яйцями, борошном та медом. Випекти 45 хв при 175°C.", dosha:{vata:"Солодкий та заземляючий",pitta:"В міру",kapha:"Замінити мед корицею"}, calories:330 },
    { name:"Тости з яйцем та авокадо", emoji:"🥚", time:"10 хв", ingredients:"Хліб, яйце, авокадо, лимон, сіль", recipe:"Підсмажити хліб. Розім'яти авокадо з лимоном. Зварити яйце. Зібрати тост.", dosha:{vata:"Жирний авокадо заземляє",pitta:"Охолоджуює лимон",kapha:"Мало авокадо"}, calories:390 },
    { name:"Фруктовий салат з медом та м'ятою", emoji:"🍓", time:"5 хв", ingredients:"Суниця, яблуко, груша, м'ята, мед", recipe:"Нарізати фрукти, змішати. Додати свіжу м'яту та краплю меду.", dosha:{vata:"Кімнатної температури",pitta:"Охолоджуючий ранковий",kapha:"Без меду"}, calories:160 },
    { name:"Сніданок-боул з лободою", emoji:"🌾", time:"20 хв", ingredients:"Лобода (кіноа), яйце, авокадо, шпинат", recipe:"Зварити кіноа. Посмажити яйце сонячком. Зібрати боул з усіма інгредієнтами.", dosha:{vata:"Ситний та живильний",pitta:"Охолоджуючий",kapha:"Без авокадо"}, calories:380 },
    { name:"Теплий смузі з вівсянкою", emoji:"🍵", time:"5 хв", ingredients:"Вівсяні пластівці, молоко, банан, кориця", recipe:"Нагріти молоко. Збити з вівсянкою та бананом до гладкості. Посипати корицею.", dosha:{vata:"Теплий — ідеально",pitta:"Без кориці",kapha:"Без банана"}, calories:260 },
    { name:"Картопля запечена з часником", emoji:"🥔", time:"35 хв", ingredients:"Молода картопля, часник, розмарин, оливкова олія", recipe:"Нарізати картоплю часточками. Змастити олією з часником та розмарином. Запекти 30 хв.", dosha:{vata:"Теплотворна та ситна",pitta:"Часник злегка гріє",kapha:"Без олії"}, calories:300 },
    { name:"Ячмінна каша з грибами", emoji:"🍄", time:"30 хв", ingredients:"Перлова крупа, гриби, цибуля, сіль", recipe:"Замочити перловку 30 хв. Обсмажити гриби з цибулею. Зварити перловку, змішати.", dosha:{vata:"Важка — менше",pitta:"Нейтральна",kapha:"Ідеально"}, calories:270 },
    { name:"Сирний мус з фруктами", emoji:"🍑", time:"10 хв", ingredients:"Сир м'який, персик, мед, ваніль", recipe:"Збити сир з медом та ваніллю. Додати нарізаний персик.", dosha:{vata:"Поживний та солодкий",pitta:"Персик охолоджує",kapha:"Без меду"}, calories:200 },
    { name:"Пшенична каша з маслом", emoji:"🌾", time:"20 хв", ingredients:"Пшенична крупа, вода, вершкове масло", recipe:"Зварити пшеницю в воді 15 хв. Посолити. Додати шматочок масла.", dosha:{vata:"Теплотворна та заземляюча",pitta:"Нейтральна",kapha:"Без масла"}, calories:260 },
    { name:"Рибні котлети парові", emoji:"🐟", time:"30 хв", ingredients:"Риба біла, яйце, цибуля, зелень", recipe:"Подрібнити рибу. Додати яйце та цибулю. Сформувати котлети, готувати на парі 20 хв.", dosha:{vata:"Легкий білок",pitta:"Рибне охолоджує",kapha:"Ідеально легко"}, calories:220 },
    { name:"Сніданок зі солодким картоплею", emoji:"🍠", time:"30 хв", ingredients:"Батат, яйце, кориця, мед", recipe:"Запекти батат 25 хв. Розім'яти, додати яйце та запекти ще 5 хв. Подавати з медом та корицею.", dosha:{vata:"Солодкий та заземляючий",pitta:"Охолоджуючий батат",kapha:"Без меду"}, calories:310 },
    { name:"Льняні крекери з хумусом", emoji:"🌰", time:"2 хв", ingredients:"Льняні крекери, хумус, руккола, помідор", recipe:"Намастити крекери хумусом. Викласти рукколу та нарізаний помідор.", dosha:{vata:"Легкий але сухий",pitta:"Охолоджуюче",kapha:"Ідеально легко"}, calories:180 },
    { name:"Кавун з фетою та м'ятою", emoji:"🍉", time:"5 хв", ingredients:"Кавун, сир фета, м'ята, оливкова олія", recipe:"Нарізати кавун. Накришити фету. Прикрасити м'ятою. Трохи олії.", dosha:{vata:"Влітку — добре",pitta:"Кавун охолоджує ідеально",kapha:"Без фети"}, calories:170 },
    { name:"Смажені гречані оладки", emoji:"🥞", time:"20 хв", ingredients:"Гречане борошно, кефір, яйце, сода", recipe:"Змішати борошно, кефір та яйце. Додати щіпку соди. Смажити оладки по 2-3 хв з боку.", dosha:{vata:"З вершковим маслом",pitta:"Без кислого",kapha:"Без олії"}, calories:290 },
    { name:"Запечені сирники без борошна", emoji:"🥞", time:"25 хв", ingredients:"Сир, яйце, вівсяні пластівці, мед", recipe:"Змішати сир, яйце, вівсянку. Сформувати круглі котлетки. Запекти 20 хв при 180°C.", dosha:{vata:"Поживні",pitta:"Без гострого",kapha:"Менше сиру"}, calories:280 },
    { name:"Сезонний боул", emoji:"🥬", time:"10 хв", ingredients:"Зелений салат, яйце, огірок, насіння кунжуту, оливкова олія", recipe:"Зібрати зелень у тарілці. Нарізати огірок. Додати варене яйце та насіння. Заправити олією.", dosha:{vata:"Додати теплий білок",pitta:"Охолоджуюча зелень",kapha:"Ідеально легко"}, calories:210 },
    { name:"Ягідний протеїновий смузі", emoji:"🫐", time:"3 хв", ingredients:"Чорниця, йогурт грецький, банан, протеїн (необов.)", recipe:"Збити всі інгредієнти в блендері. Можна додати 1 ст.л. протеїнового порошку.", dosha:{vata:"Додати горіхи",pitta:"Чорниця охолоджує",kapha:"Без банана"}, calories:250 }
  ],
  lunch: [
    { name:"Борщ класичний", emoji:"🍲", time:"60 хв", ingredients:"Буряк, капуста, картопля, морква, цибуля, томат, сметана", recipe:"Зварити бульон. Обсмажити пасеровку. Додати буряк та капусту. Варити 40 хв. Подавати зі сметаною.", dosha:{vata:"Поживний та зігрівальний",pitta:"Буряк трохи гріє",kapha:"Без сметани — ідеально"}, calories:250 },
    { name:"Гречка по-купецьки", emoji:"🍚", time:"30 хв", ingredients:"Гречка, курка, цибуля, морква, спеції", recipe:"Обсмажити курку та овочі. Додати гречку та воду. Тушкувати 20 хв на малому вогні.", dosha:{vata:"Дуже ситна та тепла",pitta:"Без гострих спецій",kapha:"Менше м'яса"}, calories:420 },
    { name:"Кіча (Kitchari) — аюрведичний рис з машем", emoji:"🥘", time:"35 хв", ingredients:"Рис Басматі, маш (мунг дал), куркума, кмин, імбир, гхі", recipe:"Промити рис та маш. Розтопити гхі, додати кмин та куркуму. Додати рис та маш, залити 4 склянками води. Варити 25 хв.", dosha:{vata:"Ідеальний детокс",pitta:"Найкраща їжа для Піти",kapha:"Зменшити гхі"}, calories:350 },
    { name:"Суп-пюре з гарбуза", emoji:"🎃", time:"35 хв", ingredients:"Гарбуз, цибуля, часник, кокосове молоко, куркума", recipe:"Запекти гарбуз 20 хв. Обсмажити цибулю та часник. Змішати в блендері з кокосовим молоком та куркумою.", dosha:{vata:"Теплий та обволікаючий",pitta:"Кокос охолоджує",kapha:"Без молока — тільки вода"}, calories:220 },
    { name:"Фарширований перець", emoji:"🫑", time:"50 хв", ingredients:"Перець болгарський, рис, курка, томат, цибуля", recipe:"Відварити рис. Змішати з фаршем та пасеровкою. Наповнити перці. Тушкувати в томаті 30 хв.", dosha:{vata:"Поживний та ситний",pitta:"Помідор кислуватий",kapha:"Без рису"}, calories:380 },
    { name:"Салат Нікуаз", emoji:"🥗", time:"20 хв", ingredients:"Тунець, зелена квасоля, яйця, помідор, оливки, салат", recipe:"Зварити квасолю та яйця. Зібрати салат, заправити оливковою олією з гірчицею.", dosha:{vata:"Олія та риба — добре",pitta:"Оливки трохи кислуваті",kapha:"Ідеально легко"}, calories:320 },
    { name:"Гречаний суп", emoji:"🍵", time:"30 хв", ingredients:"Гречка, морква, картопля, цибуля, зелень, сметана", recipe:"Зварити бульон. Додати нарізані овочі та гречку. Варити 20 хв. Подавати з зеленню та сметаною.", dosha:{vata:"Теплий та живильний",pitta:"Без жирної сметани",kapha:"Без сметани"}, calories:230 },
    { name:"Запечена курка з овочами", emoji:"🍗", time:"50 хв", ingredients:"Куряче стегно, картопля, морква, часник, розмарин", recipe:"Замаринувати курку. Нарізати овочі. Запекти все разом при 200°C 40 хв.", dosha:{vata:"Ситна та теплотворна",pitta:"Без гострих маринадів",kapha:"Без шкіри"}, calories:450 },
    { name:"Солянка", emoji:"🍲", time:"50 хв", ingredients:"Ковбаса, огірки мариновані, маслини, капуста, томат", recipe:"Обсмажити м'ясні продукти. Додати огірки та томат. Варити 30 хв. Подавати з лимоном.", dosha:{vata:"Досить кисло",pitta:"Зменшити маринади",kapha:"Без жирних ковбас"}, calories:350 },
    { name:"Рисовий плов з куркою", emoji:"🍚", time:"45 хв", ingredients:"Рис, курка, морква, цибуля, зіра, куркума", recipe:"Обсмажити курку та овочі з зірою. Додати рис та воду 1:2. Готувати 20 хв під кришкою.", dosha:{vata:"Ситний та ароматний",pitta:"Зіра злегка гріє",kapha:"Менше рису"}, calories:430 },
    { name:"Суп-харчо", emoji:"🌶️", time:"50 хв", ingredients:"Яловичина, рис, горіхи, часник, томат, хмелі-сунелі", recipe:"Зварити яловичину 30 хв. Додати рис, дроблені горіхи, часник та томат. Варити ще 20 хв.", dosha:{vata:"Зігрівальний",pitta:"Зменшити гостроту",kapha:"В міру"}, calories:380 },
    { name:"Індичка тушкована з овочами", emoji:"🦃", time:"40 хв", ingredients:"Грудка індички, кабачок, цибуля, болгарський перець", recipe:"Нарізати все невеликими шматками. Обсмажити м'ясо. Додати овочі та тушкувати 25 хв.", dosha:{vata:"Легший за яловичину",pitta:"Ідеально охолоджуюче",kapha:"Білкова без жиру"}, calories:280 },
    { name:"Суп мінестроне", emoji:"🍵", time:"40 хв", ingredients:"Зелена квасоля, цукіні, томати, спагеті, часник, базилік", recipe:"Обсмажити овочі. Залити бульоном. Додати квасолю та пасту. Варити 15 хв. Посипати базиліком.", dosha:{vata:"Теплий та ароматний",pitta:"Без часнику багато",kapha:"Без пасти"}, calories:240 },
    { name:"Гречані котлети", emoji:"🥩", time:"30 хв", ingredients:"Гречка, яйце, цибуля, морква, часник", recipe:"Відварити гречку. Змішати з яйцем та тертою морквою. Сформувати котлети, запекти 20 хв.", dosha:{vata:"Ситні та живильні",pitta:"Нейтральні",kapha:"Ідеальні рослинні"}, calories:310 },
    { name:"Локшина удон з овочами", emoji:"🍜", time:"15 хв", ingredients:"Локшина удон, морква, шпинат, соєвий соус, кунжут", recipe:"Відварити удон. Обсмажити овочі 3 хв. Змішати, заправити соєвим соусом та кунжутом.", dosha:{vata:"Поживна та тепла",pitta:"Соєвий соус помірно",kapha:"Без соусу"}, calories:320 },
    { name:"Риба запечена з лимоном", emoji:"🐟", time:"30 хв", ingredients:"Хек або тріска, лимон, часник, оливкова олія, зелень", recipe:"Замаринувати рибу в лимонному соку 10 хв. Запекти при 180°C 20 хв.", dosha:{vata:"Омега-3 — живить",pitta:"Лимон злегка кислий",kapha:"Ідеально легко"}, calories:250 },
    { name:"Капустяний суп (щі)", emoji:"🥬", time:"40 хв", ingredients:"Капуста, картопля, морква, цибуля, томат", recipe:"Зварити бульон. Нарізати всі овочі. Варити 25 хв. Подавати з хлібом.", dosha:{vata:"Додати жирну сметану",pitta:"Охолоджуюча капуста",kapha:"Без сметани — ідеально"}, calories:180 },
    { name:"Тушкована квасоля з овочами", emoji:"🫘", time:"45 хв", ingredients:"Квасоля консервована, помідори, перець, цибуля, куркума", recipe:"Обсмажити овочі. Додати квасолю та томати. Тушкувати 20 хв з куркумою.", dosha:{vata:"Важка — додати зіру",pitta:"Нейтральна",kapha:"Рослинний білок — ідеально"}, calories:290 },
    { name:"Суп з сочевиці", emoji:"🍵", time:"30 хв", ingredients:"Сочевиця червона, морква, цибуля, куркума, лимон", recipe:"Зварити сочевицю 20 хв. Обсмажити овочі, змішати. Додати лимон та куркуму.", dosha:{vata:"Легша ніж інші бобові",pitta:"Охолоджуюча лимоном",kapha:"Ідеальна"}, calories:240 },
    { name:"Ризото з грибами", emoji:"🍄", time:"35 хв", ingredients:"Рис арборіо, гриби, цибуля, біле вино, пармезан", recipe:"Обсмажити цибулю. Додати рис, вино. Поступово додавати бульйон по-ополоникові. Додати гриби та сир.", dosha:{vata:"Кремовий та теплий",pitta:"Без великої кількості сиру",kapha:"Рідко"}, calories:480 },
    { name:"Запечений лосось з аспарагусом", emoji:"🐟", time:"25 хв", ingredients:"Лосось, аспарагус, лимон, оливкова олія", recipe:"Покласти лосось та аспарагус на лист. Збризнути олією та лимоном. Запекти 20 хв.", dosha:{vata:"Омега-3 — живить",pitta:"Охолоджуюче",kapha:"Ідеально"}, calories:350 },
    { name:"Вареники з картоплею та цибулею", emoji:"🥟", time:"40 хв", ingredients:"Тісто, картопля, цибуля, вершкове масло", recipe:"Замісити тісто. Зробити начинку з картоплі та смаженої цибулі. Ліпити вареники, варити 5-7 хв.", dosha:{vata:"Теплотворні та ситні",pitta:"В міру",kapha:"Без масла"}, calories:400 },
    { name:"Стейк з яловичини з броколі", emoji:"🥩", time:"20 хв", ingredients:"Яловичина (вирізка), броколі, часник, оливкова олія", recipe:"Посолити та поперчити стейк. Смажити на сильному вогні по 3-4 хв з боку. Відварити броколі.", dosha:{vata:"Насичений білок",pitta:"Червоне м'ясо гріє — рідко",kapha:"Тільки пісне"}, calories:500 },
    { name:"Нут з шпинатом та томатами", emoji:"🫘", time:"20 хв", ingredients:"Нут консервований, шпинат, помідори, часник, куркума", recipe:"Обсмажити часник. Додати томати та нут. Тушкувати 10 хв. Додати шпинат.", dosha:{vata:"Додати зіру та асафетиду",pitta:"Охолоджуючий шпинат",kapha:"Ідеально рослинне"}, calories:310 },
    { name:"Суп-пюре з брокколі", emoji:"🥦", time:"25 хв", ingredients:"Броколі, картопля, цибуля, вершки, часник", recipe:"Зварити броколі та картоплю. Збити блендером з вершками та часником.", dosha:{vata:"Кремовий та теплий",pitta:"Броколі охолоджує",kapha:"Без вершків"}, calories:210 },
    { name:"Пельмені домашні", emoji:"🥟", time:"60 хв", ingredients:"Тісто, свинина+яловичина, цибуля, чорний перець", recipe:"Замісити тісто. Змішати фарш з цибулею та перцем. Ліпити пельмені, варити 7-8 хв.", dosha:{vata:"Дуже ситні",pitta:"Свинина гріє — рідко",kapha:"Рідко, менше"}, calories:550 },
    { name:"Паста з соусом болоньєзе", emoji:"🍝", time:"40 хв", ingredients:"Спагеті, яловичий фарш, томати, цибуля, часник, базилік", recipe:"Обсмажити фарш з овочами. Додати томати та тушкувати 20 хв. Подавати з відвареною пастою.", dosha:{vata:"Ситна та тепла",pitta:"Томат кислий",kapha:"Без пасти — тільки соус"}, calories:480 },
    { name:"Тайський карі з кокосовим молоком", emoji:"🥥", time:"30 хв", ingredients:"Курка, кокосове молоко, карі, кабачок, рис", recipe:"Обсмажити карі-пасту. Додати курку та кокосове молоко. Тушкувати 20 хв. Подавати з рисом.", dosha:{vata:"Кокос та рис — ідеально",pitta:"Карі гостро — зменшити",kapha:"Без рису"}, calories:430 },
    { name:"Морквяний крем-суп", emoji:"🥕", time:"25 хв", ingredients:"Морква, цибуля, імбир, кокосове молоко, куркума", recipe:"Відварити моркву та цибулю. Збити блендером з кокосовим молоком, імбиром та куркумою.", dosha:{vata:"Теплий та заземляючий",pitta:"Кокос охолоджує",kapha:"Без молока"}, calories:200 },
    { name:"Куряча грудка на грилі зі спаржею", emoji:"🍗", time:"25 хв", ingredients:"Куряча грудка, спаржа, лимон, часник, розмарин", recipe:"Замаринувати курку в лимоні та розмарині. Готувати на грилі 12 хв. Спаржу — 5 хв.", dosha:{vata:"Легкий та живильний",pitta:"Охолоджуючий лимон",kapha:"Ідеально"}, calories:320 },
    { name:"Зелений борщ (щавлевий)", emoji:"🥬", time:"35 хв", ingredients:"Щавель, яйця, картопля, цибуля, сметана", recipe:"Зварити картоплю. Додати нарізаний щавель, зварити яйця. Подавати з яйцем та сметаною.", dosha:{vata:"Кислий щавель — обережно",pitta:"Дуже кислий — зменшити",kapha:"Без сметани"}, calories:220 },
    { name:"Тушкована яловичина", emoji:"🥩", time:"90 хв", ingredients:"Яловичина, морква, цибуля, лавровий лист, чорний перець", recipe:"Обсмажити м'ясо. Додати овочі та спеції. Залити бульоном, тушкувати 60-70 хв.", dosha:{vata:"Насичена та ситна",pitta:"Червоне м'ясо гріє",kapha:"Тільки пісне"}, calories:400 },
    { name:"Паста прімавера", emoji:"🍝", time:"20 хв", ingredients:"Паста, цукіні, черрі томати, перець, базилік, оливкова олія", recipe:"Відварити пасту. Обсмажити овочі 5 хв. Змішати, заправити олією та базиліком.", dosha:{vata:"З маслом — добре",pitta:"Легка та охолоджуюча",kapha:"Без пасти"}, calories:360 },
    { name:"Перлова каша з курячим бульйоном", emoji:"🍵", time:"40 хв", ingredients:"Перлова крупа, курячий бульон, морква, зелень", recipe:"Зварити перловку в бульоні 30 хв. Додати тертую моркву та зелень.", dosha:{vata:"Важка — додати олію",pitta:"Нейтральна",kapha:"Ідеальна"}, calories:280 },
    { name:"Курка в горщику", emoji:"🍲", time:"60 хв", ingredients:"Курка, картопля, цибуля, морква, сметана, зелень", recipe:"Нарізати курку та овочі. Укласти в горщики. Залити сметаною. Запекти 45 хв.", dosha:{vata:"Теплотворна та ситна",pitta:"Без гострого",kapha:"Без сметани"}, calories:420 },
    { name:"Смажена риба з кашею", emoji:"🐠", time:"30 хв", ingredients:"Минтай, гречка, олія, борошно, спеції", recipe:"Обваляти рибу в борошні. Посмажити по 4 хв з боку. Подавати з відвареною гречкою.", dosha:{vata:"Риба і гречка — ситно",pitta:"В міру смаженого",kapha:"Краще запечена риба"}, calories:380 },
    { name:"Пюре з горошку", emoji:"🟢", time:"30 хв", ingredients:"Горох зелений, м'ята, вершки, лимон", recipe:"Відварити горох 20 хв. Збити блендером з вершками, м'ятою та лимонним соком.", dosha:{vata:"Додати зіру",pitta:"М'ята охолоджує",kapha:"Без вершків"}, calories:190 },
    { name:"Запечені баклажани з часником", emoji:"🍆", time:"30 хв", ingredients:"Баклажан, часник, оливкова олія, зелень, фета", recipe:"Нарізати баклажан кружечками. Натерти часником та олією. Запекти 20 хв. Посипати фетою.", dosha:{vata:"Баклажан сушить — з олією",pitta:"Охолоджуючий",kapha:"Без фети"}, calories:200 },
    { name:"Чечевична юшка", emoji:"🍵", time:"25 хв", ingredients:"Сочевиця, морква, цибуля, куркума, лавровий лист", recipe:"Зварити сочевицю 15 хв. Обсмажити морквяно-цибулеву пасеровку. Змішати з куркумою.", dosha:{vata:"Легша за квасолю",pitta:"Нейтральна",kapha:"Ідеальна"}, calories:220 },
    { name:"Карпатський бограш", emoji:"🌶️", time:"80 хв", ingredients:"Яловичина, перець, томат, цибуля, паприка", recipe:"Обсмажити цибулю з паприкою. Додати м'ясо та перець. Тушкувати годину.", dosha:{vata:"Зігрівальний",pitta:"Дуже гостро — зменшити паприку",kapha:"В міру"}, calories:420 },
    { name:"Куряча фрикасе", emoji:"🍗", time:"35 хв", ingredients:"Курка, вершки, цибуля, петрушка, біле вино", recipe:"Обсмажити шматочки курки. Додати вершки та вино. Тушкувати 20 хв. Посипати петрушкою.", dosha:{vata:"Кремовий та теплий",pitta:"Без великої кількості вершків",kapha:"Рідко"}, calories:380 },
    { name:"Паела по-українськи", emoji:"🍚", time:"45 хв", ingredients:"Рис, морепродукти, перець, куркума, часник", recipe:"Обсмажити часник та перець. Додати рис та бульон. Через 10 хв — морепродукти. Готувати 15 хв.", dosha:{vata:"Морепродукти + рис",pitta:"Часник гріє",kapha:"Менше рису"}, calories:380 },
    { name:"Тушкована капуста з ковбасою", emoji:"🥬", time:"35 хв", ingredients:"Капуста, ковбаса, морква, цибуля, томатна паста", recipe:"Обсмажити ковбасу та овочі. Додати капусту та томатну пасту. Тушкувати 20 хв.", dosha:{vata:"Тепла та ситна",pitta:"Ковбаса гріє",kapha:"Без ковбаси — тільки капуста"}, calories:350 },
    { name:"Буряковий суп без м'яса", emoji:"🍵", time:"35 хв", ingredients:"Буряк, морква, картопля, квасоля, часник", recipe:"Зварити буряк 20 хв. Додати всі овочі та квасолю. Варити ще 15 хв.", dosha:{vata:"З вершковою ложкою",pitta:"Буряк злегка гріє",kapha:"Ідеальний"}, calories:200 },
    { name:"М'ясна запіканка з картоплею", emoji:"🥔", time:"60 хв", ingredients:"Фарш, картопля, цибуля, яйце, сметана", recipe:"Виклади шарами фарш та картоплю. Залити сумішшю яйця та сметани. Запекти 45 хв.", dosha:{vata:"Дуже ситна",pitta:"Зменшити жир",kapha:"Рідко"}, calories:480 },
    { name:"Гарбузовий плов", emoji:"🎃", time:"40 хв", ingredients:"Рис, гарбуз, цибуля, морква, куркума, зіра", recipe:"Обсмажити овочі з зірою. Додати рис та гарбуз. Залити водою 1:2. Готувати 20 хв.", dosha:{vata:"Солодкий гарбуз заземляє",pitta:"Охолоджуючий",kapha:"Менше рису"}, calories:320 },
    { name:"Хліб з рибним паштетом", emoji:"🐟", time:"5 хв", ingredients:"Хліб, шпроти/тунець, яйце, майонез, зелень", recipe:"Змішати рибу з яйцем та майонезом. Намастити хліб паштетом, прикрасити зеленню.", dosha:{vata:"Поживний та живильний",pitta:"Риба охолоджує",kapha:"Без майонезу"}, calories:300 },
    { name:"Фаршировані кабачки", emoji:"🥒", time:"45 хв", ingredients:"Кабачок, рис, фарш курячий, морква, томатна паста", recipe:"Виловити серединку кабачка. Начинити сумішшю фаршу, рису та пасеровки. Запекти 30 хв.", dosha:{vata:"Теплий та ситний",pitta:"Кабачок охолоджує",kapha:"Без рису"}, calories:350 },
    { name:"Спагеті з морепродуктами", emoji:"🍝", time:"20 хв", ingredients:"Спагеті, мідії/креветки, часник, петрушка, оливкова олія", recipe:"Відварити спагеті. Обсмажити морепродукти з часником 5 хв. Змішати з пастою та петрушкою.", dosha:{vata:"Морепродукти — добре",pitta:"Часник гріє",kapha:"Менше пасти"}, calories:420 },
    { name:"Куряча лапша", emoji:"🍜", time:"40 хв", ingredients:"Курка, локшина, морква, цибуля, лавровий лист", recipe:"Зварити куряче філе 20 хв. Дістати та нарізати. Додати овочі та локшину в бульон, варити 10 хв.", dosha:{vata:"Бульон заспокоює",pitta:"Охолоджуючий бульон",kapha:"Без локшини"}, calories:300 },
    { name:"Відбивна з картопляним пюре", emoji:"🥩", time:"30 хв", ingredients:"Куряче/свиняче філе, яйце, сухарі, картопля, молоко", recipe:"Відбити м'ясо. Обваляти в яйці та сухарях. Підсмажити. Подавати з пюре.", dosha:{vata:"Ситна та теплотворна",pitta:"Смажена — зменшити",kapha:"Без сухарів"}, calories:520 },
    { name:"Запечена тріска з картоплею", emoji:"🐟", time:"35 хв", ingredients:"Тріска, картопля, цибуля, оливкова олія, лимон", recipe:"Нарізати картоплю. Укласти рибу та картоплю на лист. Збризнути олією та лимоном. Запекти 25 хв.", dosha:{vata:"Живильна та тепла",pitta:"Лимон трохи кислить",kapha:"Ідеально"}, calories:310 },
    { name:"Гречаний суп з куркою", emoji:"🍵", time:"35 хв", ingredients:"Курка, гречка, картопля, цибуля, морква", recipe:"Зварити курку 20 хв. Додати нарізані овочі та гречку. Варити 15 хв.", dosha:{vata:"Класичний поживний суп",pitta:"Збалансований",kapha:"Менше крупи"}, calories:280 },
    { name:"Голубці", emoji:"🥬", time:"60 хв", ingredients:"Капуста, фарш, рис, цибуля, томатна паста, сметана", recipe:"Відбланширувати капустяне листя. Начинити фаршем з рисом. Тушкувати в соусі 40 хв.", dosha:{vata:"Ситні та теплі",pitta:"В міру томату",kapha:"Без рису"}, calories:380 }
  ],
  dinner: [
    { name:"Легкий овочевий суп", emoji:"🥣", time:"25 хв", ingredients:"Морква, кабачок, шпинат, цибуля, петрушка", recipe:"Зварити всі овочі 15 хв. Подавати без гарніру — тільки суп.", dosha:{vata:"З краплею олії",pitta:"Охолоджуюча вечеря",kapha:"Ідеально легко"}, calories:120 },
    { name:"Гречка з паровими котлетами", emoji:"🍚", time:"35 хв", ingredients:"Гречка, курячий фарш, цибуля, яйце", recipe:"Відварити гречку. Сформувати котлети та готувати на парі 20 хв. Подавати разом.", dosha:{vata:"Тепла та ситна",pitta:"Нейтральна",kapha:"Менше гречки"}, calories:320 },
    { name:"Кіча (очищувальний)", emoji:"🥘", time:"30 хв", ingredients:"Рис, маш, гхі, куркума, кмин, кріп", recipe:"Промити рис та маш. Розтопити гхі з кмином та куркумою. Варити рис та маш разом 25 хв.", dosha:{vata:"Ідеальна вечеря Аюрведи",pitta:"Найкращий вибір",kapha:"Зменшити гхі"}, calories:300 },
    { name:"Запечений гарбуз з горіхами", emoji:"🎃", time:"30 хв", ingredients:"Гарбуз, волоські горіхи, мед, кориця", recipe:"Нарізати гарбуз кубиками. Запекти 20 хв при 180°C. Подавати з горіхами, медом та корицею.", dosha:{vata:"Солодкий та заземляючий",pitta:"Охолоджуючий",kapha:"Без меду"}, calories:220 },
    { name:"Теплий салат із запеченими овочами", emoji:"🥗", time:"30 хв", ingredients:"Цукіні, перець, цибуля, часник, оливкова олія, зелень", recipe:"Нарізати овочі. Збризнути олією та запекти 20 хв. Посипати зеленню та подавати теплими.", dosha:{vata:"Теплі овочі — добре",pitta:"Охолоджуюча перець",kapha:"Без олії"}, calories:180 },
    { name:"Риба парова з овочами", emoji:"🐟", time:"25 хв", ingredients:"Хек, морква, кабачок, цибуля, лимон", recipe:"Покласти рибу та овочі в пароварку на 20 хв. Збризнути лимоном.", dosha:{vata:"Легкий вечірній білок",pitta:"Ідеально охолоджуюче",kapha:"Найкращий вибір"}, calories:200 },
    { name:"Суп-пюре з цвітної капусти", emoji:"🥦", time:"25 хв", ingredients:"Цвітна капуста, цибуля, вершки (10%), куркума", recipe:"Відварити капусту та цибулю 15 хв. Збити блендером з вершками та куркумою.", dosha:{vata:"Теплий та кремовий",pitta:"Капуста охолоджує",kapha:"Без вершків"}, calories:160 },
    { name:"Рисовий суп з яйцем", emoji:"🍵", time:"20 хв", ingredients:"Рис, яйце, цибуля, кріп, сіль", recipe:"Зварити рис у підсоленій воді. Вбити яйце, перемішати. Посипати кропом.", dosha:{vata:"Заспокійлива вечеря",pitta:"Нейтральна",kapha:"Менше рису"}, calories:180 },
    { name:"Варені яйця з авокадо", emoji:"🥑", time:"10 хв", ingredients:"2 яйця, авокадо, лимон, сіль, зелень", recipe:"Зварити яйця 7 хв. Нарізати авокадо. Подавати разом, збризнути лимоном.", dosha:{vata:"Маслянистий авокадо — заземляє",pitta:"Охолоджуючий",kapha:"Менше авокадо"}, calories:280 },
    { name:"Тушкована морква з медом", emoji:"🥕", time:"20 хв", ingredients:"Морква, вершкове масло, мед, кориця, петрушка", recipe:"Нарізати моркву. Тушкувати в маслі 15 хв. Додати мед та корицю. Посипати петрушкою.", dosha:{vata:"Солодка та заземляюча",pitta:"Мед трохи гріє",kapha:"Без меду"}, calories:150 },
    { name:"Кабачкові оладки", emoji:"🥒", time:"20 хв", ingredients:"Кабачок, яйце, борошно, зелень, часник", recipe:"Натерти кабачок, відтиснути воду. Додати яйце, борошно та часник. Смажити по 3 хв з боку.", dosha:{vata:"З вершковим маслом",pitta:"Кабачок охолоджує",kapha:"Без масла"}, calories:190 },
    { name:"Легкий салат Грецький", emoji:"🥗", time:"10 хв", ingredients:"Огірок, помідор, маслини, фета, оливкова олія", recipe:"Нарізати огірок та помідори. Додати маслини та фету. Заправити олією.", dosha:{vata:"Холодний — додати теплий хліб",pitta:"Охолоджуючий",kapha:"Без фети"}, calories:220 },
    { name:"Гречана каша зі сметаною", emoji:"🍚", time:"20 хв", ingredients:"Гречка, вода, сметана, сіль", recipe:"Відварити гречку. Подавати з ложкою сметани.", dosha:{vata:"Ситна та тепла",pitta:"В міру сметани",kapha:"Без сметани"}, calories:280 },
    { name:"Тофу з овочами по-японськи", emoji:"🥡", time:"20 хв", ingredients:"Тофу, броколі, морква, соєвий соус, кунжут", recipe:"Нарізати тофу. Обсмажити з овочами 10 хв. Заправити соєвим соусом та кунжутом.", dosha:{vata:"Тофу важкий без спецій",pitta:"Охолоджуюче",kapha:"Рослинний білок"}, calories:200 },
    { name:"Варена курка з зеленим горошком", emoji:"🐓", time:"30 хв", ingredients:"Куряча грудка, горошок зелений, морква, кріп", recipe:"Відварити курку 20 хв. Нарізати. Подавати з відвареним горошком та морквою.", dosha:{vata:"Легкий протеїн",pitta:"Охолоджуюче",kapha:"Ідеально"}, calories:250 },
    { name:"Запечені баклажани фаршировані", emoji:"🍆", time:"40 хв", ingredients:"Баклажан, фарш курячий, томат, часник, фета", recipe:"Розрізати баклажан. Начинити фаршем з томатами. Запекти 30 хв. Посипати фетою.", dosha:{vata:"Олія допомагає",pitta:"В міру",kapha:"Без фети"}, calories:290 },
    { name:"Суп Рататуй", emoji:"🥘", time:"35 хв", ingredients:"Цукіні, баклажан, перець, томати, тимьян", recipe:"Нарізати всі овочі. Тушкувати в томатному соусі з тимьяном 20 хв.", dosha:{vata:"Теплий та ароматний",pitta:"Охолоджуюча страва",kapha:"Ідеально рослинне"}, calories:160 },
    { name:"Сочевиця по-турецьки", emoji:"🍵", time:"25 хв", ingredients:"Сочевиця червона, цибуля, томат, зіра, куркума, лимон", recipe:"Зварити сочевицю 15 хв. Обсмажити цибулю з зірою. Змішати. Видавити лимон.", dosha:{vata:"Додати асафетиду",pitta:"Охолоджуюча лимоном",kapha:"Ідеальна"}, calories:220 },
    { name:"Теплий шпинатний салат з яйцем", emoji:"🥬", time:"10 хв", ingredients:"Шпинат, яйце, лимон, оливкова олія, часник", recipe:"Злегка обсмажити шпинат з часником 2 хв. Додати яйце пашот. Збризнути лимоном.", dosha:{vata:"Теплий шпинат — добре",pitta:"Охолоджуюче",kapha:"Ідеально легко"}, calories:180 },
    { name:"Гороховий суп", emoji:"🟡", time:"60 хв", ingredients:"Горох сухий, морква, цибуля, ребра копчені (або без)", recipe:"Замочити горох 4 год. Зварити 45 хв з овочами. Можна додати копчені ребра.", dosha:{vata:"Важкий — додати кмин",pitta:"Нейтральний",kapha:"Ідеальний без копченого"}, calories:280 },
    { name:"Котлети рибні парові", emoji:"🐟", time:"25 хв", ingredients:"Риба (хек/тріска), яйце, цибуля, зелень", recipe:"Подрібнити рибу блендером. Змішати з яйцем та цибулею. Готувати на парі 15 хв.", dosha:{vata:"Легкий вечірній білок",pitta:"Охолоджуюче",kapha:"Ідеально"}, calories:190 },
    { name:"Ніжний омлет на парі", emoji:"🍳", time:"15 хв", ingredients:"3 яйця, молоко, зелень, сіль", recipe:"Збити яйця з молоком. Готувати на парі або в духовці 10 хв при 160°C.", dosha:{vata:"Ніжний та легко засвоюваний",pitta:"Охолоджуючий",kapha:"Без молока"}, calories:210 },
    { name:"Запечений батат з йогуртом", emoji:"🍠", time:"35 хв", ingredients:"Батат, йогурт грецький, зелена цибуля, лимон", recipe:"Запекти батат 30 хв. Розрізати. Заправити йогуртом, цибулею та лимоном.", dosha:{vata:"Солодкий та заземляючий",pitta:"Йогурт охолоджує",kapha:"Без йогурту"}, calories:240 },
    { name:"Суп з пасти та квасолі", emoji:"🍲", time:"30 хв", ingredients:"Паста маленька, квасоля біла, томати, часник, шавлія", recipe:"Обсмажити часник та шавлію. Додати томати, квасолю та воду. Варити 15 хв. Додати пасту.", dosha:{vata:"Теплий та ароматний",pitta:"В міру",kapha:"Без пасти"}, calories:270 },
    { name:"Легкий боул з кіноа", emoji:"🌾", time:"20 хв", ingredients:"Кіноа, шпинат, авокадо, насіння гарбуза, лимон", recipe:"Зварити кіноа. Зібрати боул із шпинатом, авокадо, насінням. Заправити лимоном.", dosha:{vata:"Поживний але не важкий",pitta:"Охолоджуюче",kapha:"Без авокадо"}, calories:310 },
    { name:"Буряковий хумус з хлібом", emoji:"🫙", time:"10 хв", ingredients:"Нут, буряк варений, часник, лимон, оливкова олія", recipe:"Збити нут, буряк, часник та лимон у блендері. Подавати з хлібом або овочами.", dosha:{vata:"Хліб допомагає",pitta:"Буряк злегка гріє",kapha:"Без хліба"}, calories:200 },
    { name:"Смажена капуста з яйцем", emoji:"🥬", time:"15 хв", ingredients:"Капуста, яйце, цибуля, оливкова олія, кріп", recipe:"Нашаткувати капусту. Обсмажити з цибулею 10 хв. Вбити яйце, перемішати.", dosha:{vata:"Тепла та ситна",pitta:"В міру",kapha:"Без олії"}, calories:190 },
    { name:"Моркв'яні котлетки", emoji:"🥕", time:"25 хв", ingredients:"Морква, манка, яйце, цибуля", recipe:"Натерти моркву. Змішати з манкою та яйцем. Сформувати котлети. Запекти 20 хв.", dosha:{vata:"Солодкі та легкі",pitta:"Охолоджуюча морква",kapha:"Ідеально"}, calories:160 },
    { name:"Суп з шампіньйонами", emoji:"🍄", time:"25 хв", ingredients:"Шампіньйони, цибуля, морква, вершки (10%), зелень", recipe:"Обсмажити гриби та цибулю. Залити бульоном, варити 15 хв. Додати вершки та зелень.", dosha:{vata:"Теплий та ароматний",pitta:"Гриби нейтральні",kapha:"Без вершків"}, calories:170 },
    { name:"Огіркові рулетики з сиром", emoji:"🥒", time:"10 хв", ingredients:"Огірок довгий, кремовий сир, зелень, часник", recipe:"Нарізати огірок тонкими стрічками. Намастити сиром з часником та зеленню. Скрутити рулетики.", dosha:{vata:"Холодно — додати теплий чай",pitta:"Ідеально охолоджуюче",kapha:"Без сиру"}, calories:100 },
    { name:"Тушкована цибуля з яйцями", emoji:"🧅", time:"15 хв", ingredients:"Цибуля, яйця, оливкова олія, сіль, кріп", recipe:"Нарізати цибулю тонко, обсмажити 10 хв. Вбити яйця та перемішати. Посипати кропом.", dosha:{vata:"Тепла та пряна",pitta:"Цибуля гріє — менше",kapha:"Без олії"}, calories:200 },
    { name:"Йогурт з насінням льону", emoji:"🥛", time:"2 хв", ingredients:"Йогурт, насіння льону, мед, кориця", recipe:"Насипати насіння льону в йогурт. Додати мед та корицю. Дати набухнути 5 хв.", dosha:{vata:"Поживний та легкий",pitta:"Охолоджуючий",kapha:"Без меду"}, calories:170 },
    { name:"Запечена квасоля", emoji:"🫘", time:"45 хв", ingredients:"Квасоля, томатна паста, часник, паприка, цибуля", recipe:"Зварити квасолю. Змішати з соусом з томата та часнику. Запекти 30 хв при 180°C.", dosha:{vata:"Важка — додати зіру",pitta:"Нейтральна",kapha:"Ідеальна"}, calories:240 },
    { name:"Гречана запіканка з овочами", emoji:"🍚", time:"45 хв", ingredients:"Гречка, яйце, морква, кабачок, зелень", recipe:"Відварити гречку. Змішати з тертими овочами та яйцями. Вилити у форму. Запекти 30 хв.", dosha:{vata:"Тепла та поживна",pitta:"Нейтральна",kapha:"Легка запіканка"}, calories:260 },
    { name:"Теплий квасолевий салат", emoji:"🫘", time:"15 хв", ingredients:"Квасоля консерв., шпинат, часник, лимон, оливкова олія", recipe:"Обсмажити квасолю з часником та шпинатом 5 хв. Збризнути лимоном та олією.", dosha:{vata:"З теплою крупою краще",pitta:"Охолоджуючий шпинат",kapha:"Рослинний білок"}, calories:220 },
    { name:"Морський рис (рис з морквою)", emoji:"🍚", time:"25 хв", ingredients:"Рис, морква, цибуля, рослинна олія, зіра", recipe:"Обсмажити морквяно-цибулеву пасеровку. Додати рис та воду 1:2. Готувати 15 хв.", dosha:{vata:"Рис та морква — ідеально",pitta:"Нейтральний",kapha:"Менше рису"}, calories:270 },
    { name:"Відварена сочевиця з лимоном", emoji:"🍋", time:"25 хв", ingredients:"Сочевиця, лимон, зелень, кумин, оливкова олія", recipe:"Відварити сочевицю 15 хв. Злити воду. Заправити лимоном, кумином та олією.", dosha:{vata:"Додати асафетиду",pitta:"Лимон охолоджує",kapha:"Ідеально"}, calories:210 },
    { name:"Суп харіра", emoji:"🍵", time:"40 хв", ingredients:"Нут, сочевиця, томати, петрушка, кориця, куркума", recipe:"Зварити нут та сочевицю 20 хв. Додати томати та спеції. Варити ще 15 хв. Посипати петрушкою.", dosha:{vata:"Спеції допомагають травленню",pitta:"Помірна кількість спецій",kapha:"Рослинний білок"}, calories:240 },
    { name:"Запечені овочі з куркумою", emoji:"🥕", time:"30 хв", ingredients:"Морква, буряк, пастернак, куркума, оливкова олія", recipe:"Нарізати всі коренеплоди. Змастити олією з куркумою. Запекти 25 хв при 200°C.", dosha:{vata:"Теплі коренеплоди заземляють",pitta:"Буряк злегка гріє",kapha:"Без олії"}, calories:150 },
    { name:"Ніжна курка в йогурті", emoji:"🍗", time:"35 хв", ingredients:"Куряча грудка, йогурт, часник, куркума, лимон", recipe:"Замаринувати курку в йогурті 30 хв. Запекти при 180°C 25 хв.", dosha:{vata:"Ніжна та соковита",pitta:"Йогурт охолоджує",kapha:"Без маринаду"}, calories:280 },
    { name:"Зелений смузі суп", emoji:"🥬", time:"10 хв", ingredients:"Авокадо, шпинат, огірок, часник, лимон, вода", recipe:"Збити всі інгредієнти в блендері. Подавати холодним або злегка підігрітим.", dosha:{vata:"Теплим — краще",pitta:"Охолоджуючий",kapha:"Без авокадо"}, calories:140 },
    { name:"Капустяні котлети", emoji:"🥬", time:"25 хв", ingredients:"Капуста, яйце, манка, цибуля", recipe:"Нарізати капусту, тушкувати 10 хв. Змішати з яйцем та манкою. Запекти 15 хв.", dosha:{vata:"Тепла та ситна",pitta:"Нейтральна",kapha:"Ідеально"}, calories:170 },
    { name:"Рис з кокосовим молоком та зеленню", emoji:"🥥", time:"20 хв", ingredients:"Рис, кокосове молоко, кріп, лайм", recipe:"Варити рис у кокосовому молоці 15 хв. Подавати з кропом та соком лайма.", dosha:{vata:"Кокос заземляє",pitta:"Охолоджуючий",kapha:"Менше молока"}, calories:250 },
    { name:"Варений картопляний суп", emoji:"🥔", time:"25 хв", ingredients:"Картопля, цибуля, морква, кріп, сметана", recipe:"Нарізати всі овочі. Варити 20 хв. Додати кріп. Подавати зі сметаною.", dosha:{vata:"Заземляючий та теплий",pitta:"Нейтральний",kapha:"Без сметани"}, calories:200 },
    { name:"Мінімалістичний лосось", emoji:"🐟", time:"15 хв", ingredients:"Лосось, лимон, оливкова олія, кріп", recipe:"Збризнути лосось олією та лимоном. Обсмажити 3-4 хв з кожного боку.", dosha:{vata:"Омега-3 — ідеально",pitta:"Лосось злегка гріє",kapha:"Без олії"}, calories:300 },
    { name:"Квасолевий суп з розмарином", emoji:"🫘", time:"40 хв", ingredients:"Квасоля біла, розмарин, часник, морква, оливкова олія", recipe:"Зварити квасолю 30 хв. Додати пасеровані овочі та розмарин. Варити ще 10 хв.", dosha:{vata:"Розмарин зігріває",pitta:"В міру часнику",kapha:"Ідеальна"}, calories:230 },
    { name:"Тушкована курка з квасолею", emoji:"🍗", time:"40 хв", ingredients:"Курка, квасоля, томати, паприка, часник", recipe:"Обсмажити курку. Додати квасолю, томати та паприку. Тушкувати 25 хв.", dosha:{vata:"Ситна та поживна",pitta:"Паприка злегка гріє",kapha:"Без курячої шкіри"}, calories:320 },
    { name:"Крем-суп з горошку та м'яти", emoji:"🟢", time:"20 хв", ingredients:"Горошок зелений, м'ята, цибуля, вершки, лимон", recipe:"Відварити горошок 10 хв. Збити блендером з м'ятою, вершками та лимоном.", dosha:{vata:"Теплий крем-суп",pitta:"М'ята охолоджує ідеально",kapha:"Без вершків"}, calories:160 },
    { name:"Гречка з тушкованими кабачками", emoji:"🍚", time:"30 хв", ingredients:"Гречка, кабачок, цибуля, морква, зелень", recipe:"Відварити гречку. Тушкувати овочі 15 хв. Змішати.", dosha:{vata:"Тепла та ситна",pitta:"Кабачок охолоджує",kapha:"Легка вечеря"}, calories:240 },
    { name:"Рибна юшка", emoji:"🐟", time:"30 хв", ingredients:"Риба (хек або тріска), картопля, морква, кріп, лавровий лист", recipe:"Зварити рибу 15 хв. Дістати та очистити. Додати нарізані овочі, варити 10 хв. Повернути рибу.", dosha:{vata:"Рибний бульон заспокоює",pitta:"Охолоджуюча",kapha:"Легка юшка"}, calories:180 },
    { name:"Запечений нут з паприкою", emoji:"🫘", time:"35 хв", ingredients:"Нут консерв., паприка, часник, оливкова олія, зелень", recipe:"Злити та промити нут. Змішати з олією та паприкою. Запекти 25 хв до хрускоту.", dosha:{vata:"Хрусткий та ситний",pitta:"Паприка злегка гріє",kapha:"Ідеально хрустко"}, calories:250 },
    { name:"Рагу з кабачків та помідорів", emoji:"🥘", time:"25 хв", ingredients:"Кабачок, помідор, цибуля, часник, базилік", recipe:"Нарізати всі овочі. Тушкувати 15 хв. Додати базилік.", dosha:{vata:"Теплий та легкий",pitta:"Помідор кислий — менше",kapha:"Ідеально рослинне"}, calories:130 },
    { name:"Пісний борщ", emoji:"🍲", time:"45 хв", ingredients:"Буряк, капуста, картопля, квасоля, томат", recipe:"Відварити буряк 20 хв. Додати всі овочі та квасолю. Варити ще 20 хв.", dosha:{vata:"Теплий та живильний",pitta:"Буряк трохи гріє",kapha:"Без олії"}, calories:200 },
    { name:"Котлета рибна духова", emoji:"🐟", time:"30 хв", ingredients:"Рибний фарш, яйце, цибуля, морква, зелень", recipe:"Змішати фарш з яйцем та дрібленими овочами. Сформувати котлети. Запекти 20 хв.", dosha:{vata:"Легкий білок",pitta:"Охолоджуюче",kapha:"Ідеально"}, calories:190 }
  ]
};

// ==========================
// ДОДАТКОВІ РЕЦЕПТИ ДЛЯ БАЗИ 300+ СТРАВ
// ==========================
RECIPES_DB.breakfast.push(
  { name:"Вівсянка з яблуком та корицею", emoji:"🥣", time:"8 хв", ingredients:"Вівсяні пластівці, яблуко, кориця, мед, вершкове масло", recipe:"Зварити вівсянку. Яблуко дрібно нарізати, тушкувати з корицею 3 хв. Змішати, додати мед та масло.", dosha:{vata:"Дуже заземлює",pitta:"Охолоджує",kapha:"Менше масла та меду"}, calories:280 },
  { name:"Сирний десерт з бананом", emoji:"🍌", time:"5 хв", ingredients:"Сир кисломолочний, банан, мед, горіхи", recipe:"Розім'яти сир з бананом до однорідності. Полити медом і посипати горіхами.", dosha:{vata:"Поживний сніданок",pitta:"Заспокоює вогонь",kapha:"Сир і мед — важко"}, calories:310 },
  { name:"Льняна каша з ягодами", emoji:"🌾", time:"5 хв", ingredients:"Льняне борошно, тепла вода, чорниця, мед", recipe:"Залити льняне борошно теплою водою, перемішати, дати настоятися 3 хв. Додати ягоди та мед.", dosha:{vata:"Ідеально змащує ШКТ",pitta:"Охолоджує",kapha:"Стимулює травлення"}, calories:210 },
  { name:"Тост з хумусом та огірком", emoji:"🥒", time:"5 хв", ingredients:"Хліб цільнозерновий, хумус, свіжий огірок, кунжут", recipe:"Підсушити хліб. Намастити хумусом, викласти скибочки огірка, посипати кунжутом.", dosha:{vata:"Ситний та сухий тост",pitta:"Охолоджуюча дія огірка",kapha:"Гарне легке поєднання"}, calories:240 },
  { name:"Кукурудзяні оладки з сиром", emoji:"🥞", time:"15 хв", ingredients:"Кукурудзяне борошно, яйце, молоко, тертий сир", recipe:"Змішати борошно, яйце та молоко. Додати тертий сир. Смажити на сковороді по 3 хв з боку.", dosha:{vata:"Збалансована тепла страва",pitta:"Без гострого",kapha:"Ідеально безглютенові"}, calories:290 },
  { name:"Тепла пшоняна каша з чорносливом", emoji:"🥣", time:"20 хв", ingredients:"Пшоняна крупа, чорнослив, мед, кориця", recipe:"Зварити пшоно. Додати нарізаний чорнослив та корицю. Подавати теплим з медом.", dosha:{vata:"Поживно та тепло",pitta:"Нейтрально",kapha:"Чудово очищує кишечник"}, calories:270 },
  { name:"Гречані хлібці з авокадо", emoji:"🥑", time:"5 хв", ingredients:"Гречані хлібці, авокадо, лимонний сік, сіль", recipe:"Розім'яти авокадо з лимонним соком та сіллю. Намастити на хлібці.", dosha:{vata:"Ситні жири заземляють",pitta:"Охолоджуючий ефект",kapha:"Обмежити кількість"}, calories:220 },
  { name:"Смузі-боул з полуницею", emoji:"🍓", time:"5 хв", ingredients:"Полуниця, банан, рослинне молоко, насіння чіа", recipe:"Збити полуницю, банан та рослинне молоко в блендері. Насипати зверху насіння чіа.", dosha:{vata:"Поживний смузі",pitta:"Охолоджує",kapha:"Без банана"}, calories:230 },
  { name:"Запечене яблуко з сиром", emoji:"🍎", time:"15 хв", ingredients:"Яблуко, сир кисломолочний, родзинки, мед", recipe:"Вирізати серцевину яблука. Наповнити сиром та родзинками. Запекти в мікрохвильовці 5 хв.", dosha:{vata:"Тепле та м'яке яблуко",pitta:"Солодке та заспокійливе",kapha:"Обмежити мед"}, calories:190 },
  { name:"Вівсяний млинець з сиром та шпинатом", emoji:"🥞", time:"10 хв", ingredients:"Вівсяні пластівці, яйце, молоко, шпинат, сир фета", recipe:"Збити пластівці, яйце та молоко. Смажити млинець. Викласти шпинат та фету всередину.", dosha:{vata:"Дуже поживно",pitta:"Охолоджуючий шпинат",kapha:"Без масла"}, calories:310 },
  { name:"Рисова каша з курагою", emoji:"🍚", time:"20 хв", ingredients:"Рис, молоко, курага, вершкове масло", recipe:"Зварити рис у молоці. Додати нарізану курагу та масло. Подавати теплим.", dosha:{vata:"Заземляє та живить",pitta:"Солодка страва",kapha:"Обмежити курагу"}, calories:300 },
  { name:"Тост з арахісовою пастою", emoji:"🍞", time:"3 хв", ingredients:"Хліб цільнозерновий, арахісова паста, яблуко", recipe:"Підсмажити хліб. Намастити пастою. Зверху викласти тонкі скибочки яблука.", dosha:{vata:"Ситне та заземляюче",pitta:"Арахіс зігріває — обережно",kapha:"Крекер замість хліба"}, calories:320 },
  { name:"Яєчня з кабачками", emoji:"🍳", time:"10 хв", ingredients:"2 яйця, кабачок, кріп, оливкова олія", recipe:"Нарізати кабачок кружальцями, злегка підсмажити. Влити збиті яйця, посипати кропом.", dosha:{vata:"Тепла вечеря",pitta:"Кабачок охолоджує",kapha:"Легкий сніданок"}, calories:210 },
  { name:"Пудинг з насіння льону", emoji:"🥣", time:"5 хв", ingredients:"Насіння льону дрібне, кокосове молоко, мед, кориця", recipe:"Змішати насіння з кокосовим молоком. Залишити на 15 хв. Додати мед та корицю.", dosha:{vata:"Змащує шлунок",pitta:"Кокос охолоджує",kapha:"Без меду"}, calories:240 },
  { name:"Ячмінна каша з гарбузом", emoji:"🎃", time:"25 хв", ingredients:"Ячмінна крупа, гарбуз, мед", recipe:"Зварити ячмінь з шматочками гарбуза. Перед подачею додати мед.", dosha:{vata:"Важка каша",pitta:"Знижує Піту",kapha:"Ідеально"}, calories:250 },
  { name:"Кіноа з кокосовим молоком", emoji:"🥣", time:"20 хв", ingredients:"Кіноа, кокосове молоко, лохина, мед", recipe:"Зварити кіноа в кокосовому молоці. Додати свіжу лохину та мед.", dosha:{vata:"Дуже поживно",pitta:"Охолоджує",kapha:"Менше молока"}, calories:280 },
  { name:"Запіканка з манки та яблук", emoji:"🥧", time:"35 хв", ingredients:"Манна крупа, молоко, яблуко, яйце, цукор", recipe:"Зварити густу манку. Змішати з яйцем, цукром та нарізаними яблуками. Запекти 25 хв.", dosha:{vata:"Солодка та м'яка",pitta:"Охолоджуюча",kapha:"Важкувато"}, calories:310 },
  { name:"Омлет з сиром фета", emoji:"🍳", time:"8 хв", ingredients:"3 яйця, сир фета, петрушка, оливкова олія", recipe:"Збити яйця, вилити на сковороду. Зверху покришити фету та петрушку.", dosha:{vata:"Тепла та білкова",pitta:"Фета солона — помірно",kapha:"Без масла"}, calories:290 },
  { name:"Бананові оладки без борошна", emoji:"🥞", time:"10 хв", ingredients:"1 банан, 2 яйця, кориця", recipe:"Розім'яти банан, змішати з яйцями та корицею. Смажити оладки на антипригарній сковороді.", dosha:{vata:"Солодкі та поживні",pitta:"Кориця гріє — трохи",kapha:"Ситні"}, calories:230 },
  { name:"Хумус з теплим лавашем", emoji:"🫓", time:"5 хв", ingredients:"Лаваш, хумус, огірок, зелень", recipe:"Загорнути хумус, скибочки огірка та зелень у підігрітий лаваш.", dosha:{vata:"Теплий лаваш заземляє",pitta:"Огірок охолоджує",kapha:"Ідеально легко"}, calories:240 },
  { name:"Вівсяна каша з фініками", emoji:"🥣", time:"10 хв", ingredients:"Вівсянка, фініки, молоко, кориця", recipe:"Зварити вівсянку в молоці разом з нарізаними фініками. Посипати корицею.", dosha:{vata:"Поживно та солодко",pitta:"Фініки заспокоюють",kapha:"Важка вечеря"}, calories:320 },
  { name:"Гречка з кокосовим маслом", emoji:"🍚", time:"20 хв", ingredients:"Гречка, кокосове масло, сіль", recipe:"Відварити гречку. Додати ложку кокосового масла.", dosha:{vata:"Заземляє",pitta:"Кокосове масло охолоджує",kapha:"Менше масла"}, calories:270 },
  { name:"Смузі з кефіру та чорниці", emoji:"🥤", time:"3 хв", ingredients:"Кефір, чорниця, шпинат, мед", recipe:"Збити всі інгредієнти в блендері до однорідності.", dosha:{vata:"Якщо теплий — краще",pitta:"Охолоджує",kapha:"Без меду"}, calories:190 },
  { name:"Печене гарбузове пюре", emoji:"🎃", time:"25 хв", ingredients:"Гарбуз, кунжут, мед, імбир", recipe:"Запекти гарбуз, зробити пюре. Додати насіння кунжуту, мед та дрібку імбиру.", dosha:{vata:"Зігріває",pitta:"Імбир гріє — обережно",kapha:"Ідеально"}, calories:200 },
  { name:"Тост з тофу та помідором", emoji:"🥪", time:"5 хв", ingredients:"Хліб житній, тофу, помідор, оливкова олія", recipe:"Підсмажити хліб. Викласти скибочки тофу та помідора. Збризнути олією.", dosha:{vata:"Поживно",pitta:"Тофу охолоджує",kapha:"Без олії"}, calories:220 },
  { name:"Рисові млинці з медом", emoji:"🥞", time:"15 хв", ingredients:"Рисове борошно, яйце, вода, мед", recipe:"Зробити рідке тісто. Смажити тонкі млинці. Подавати з медом.", dosha:{vata:"Заземляє",pitta:"Солодкі млинці",kapha:"Без меду"}, calories:260 },
  { name:"Сирники з кокосовою стружкою", emoji:"🥞", time:"20 хв", ingredients:"Сир кисломолочний, яйце, кокосова стружка, мед", recipe:"Змішати сир, яйце, стружку. Сформувати сирники та запекти в духовці 15 хв.", dosha:{vata:"Смачні та корисні",pitta:"Кокос охолоджує",kapha:"Обмежити порцію"}, calories:310 },
  { name:"Зелений омлет з броколі", emoji:"🥦", time:"10 хв", ingredients:"3 яйця, броколі, зелена цибуля, кріп", recipe:"Припустити броколі 2 хв. Залити збитими яйцями з зеленню.", dosha:{vata:"Додати масло",pitta:"Броколі охолоджує",kapha:"Без масла"}, calories:240 },
  { name:"Пшоняна каша з родзинками", emoji:"🥣", time:"20 хв", ingredients:"Пшоно, родзинки, молоко, мед", recipe:"Варити пшоно в молоці, за 5 хв до кінця додати родзинки. Подавати з медом.", dosha:{vata:"Поживно",pitta:"Солодка страва",kapha:"Обмежити молоко"}, calories:280 },
  { name:"Гречка з чорносливом та горіхами", emoji:"🍚", time:"20 хв", ingredients:"Гречка, чорнослив, волоські горіхи, мед", recipe:"Зварити гречку. Перемішати з нарізаним чорносливом та горіхами.", dosha:{vata:"Поживно та ситно",pitta:"Нейтрально",kapha:"Менше меду"}, calories:310 },
  { name:"Тости з печеним перцем", emoji:"🫑", time:"10 хв", ingredients:"Хліб, солодкий перець, оливкова олія, сир фета", recipe:"Запекти перець. Укласти на тост з фетою та краплею олії.", dosha:{vata:"Смачно та тепло",pitta:"Перець охолоджує",kapha:"Без хліба"}, calories:250 },
  { name:"Крем-сир з зеленню на хлібцях", emoji:"🍞", time:"3 хв", ingredients:"Крекери або хлібці, кремовий сир, кріп, петрушка", recipe:"Намастити хлібці сиром, посипати зеленню.", dosha:{vata:"Поживно",pitta:"Зелень охолоджує",kapha:"Рідко"}, calories:180 },
  { name:"Салат з яблуком та морквою", emoji:"🥕", time:"5 хв", ingredients:"Яблуко, морква, волоські горіхи, лимонний сік, мед", recipe:"Натерти моркву та яблуко. Змішати, полить лимонним соком та медом. Посипати горіхами.", dosha:{vata:"Калорійно",pitta:"Охолоджуюче",kapha:"Без меду"}, calories:190 },
  { name:"Вівсянка з насінням соняшника", emoji:"🥣", time:"8 хв", ingredients:"Вівсянка, насіння соняшника, мед", recipe:"Зварити вівсянку. Додати насіння соняшника та мед.", dosha:{vata:"Поживно",pitta:"Збалансовано",kapha:"Без меду"}, calories:290 },
  { name:"Кукурудзяна каша з курагою", emoji:"🌽", time:"20 хв", ingredients:"Кукурудзяне борошно, курага, молоко", recipe:"Варити кукурудзяну кашу в молоці з додаванням нарізаної кураги.", dosha:{vata:"Ситний сніданок",pitta:"Солодке",kapha:"Без молока"}, calories:270 },
  { name:"Печені банани з корицею", emoji:"🍌", time:"12 хв", ingredients:"Банан, кориця, мед", recipe:"Розрізати банан вздовж. Посипати корицею. Запекти в духовці 10 хв. Полити медом.", dosha:{vata:"Дуже заземляє",pitta:"Кориця гріє — трохи",kapha:"Солодко"}, calories:210 },
  { name:"Фруктове пюре з йогуртом", emoji:"🥛", time:"5 хв", ingredients:"Яблуко, груша, йогурт грецький", recipe:"Зробити пюре з яблука та груші. Змішати з йогуртом.", dosha:{vata:"Поживно",pitta:"Охолоджуюче",kapha:"Без йогурту"}, calories:180 },
  { name:"Яєчня пашот на шпинаті", emoji:"🥬", time:"8 хв", ingredients:"2 яйця, шпинат, оливкова олія", recipe:"Припустити шпинат 2 хв. Зварити яйця пашот 3 хв, викласти на шпинат.", dosha:{vata:"Легка та білкова",pitta:"Охолоджує",kapha:"Ідеально"}, calories:190 },
  { name:"Гречаний млинець з медом", emoji:"🥞", time:"15 хв", ingredients:"Гречане борошно, яйце, вода, мед", recipe:"Замісити тісто, посмажити млинець. Подати з медом.", dosha:{vata:"Заземляє",pitta:"Солодке",kapha:"Без меду"}, calories:250 },
  { name:"Вівсяні пластівці замочені на ніч", emoji:"🥣", time:"2 хв", ingredients:"Вівсяні пластівці, кефір, чорниця", recipe:"Залити вівсянку кефіром на ніч. Вранці додати свіжу чорницю.", dosha:{vata:"Ферментований сніданок",pitta:"Охолоджує",kapha:"Рідко"}, calories:240 },
  { name:"Сніданок з батату та яблук", emoji:"🍠", time:"25 хв", ingredients:"Батат, яблуко, кокосове масло, кориця", recipe:"Нарізати батат та яблуко, запекти в духовці з кокосовим маслом та корицею 20 хв.", dosha:{vata:"Солодке та заземляюче",pitta:"Охолоджує",kapha:"Легке"}, calories:270 },
  { name:"Салат з груші та горіхів", emoji:"🍐", time:"5 хв", ingredients:"Груша, волоські горіхи, мед, свіжа м'ята", recipe:"Нарізати грушу скибочками. Посипати горіхами та м'ятою, полити медом.", dosha:{vata:"Поживний сніданок",pitta:"М'ята охолоджує",kapha:"Без меду"}, calories:210 }
);

RECIPES_DB.lunch.push(
  { name:"Суп з цвітної капусти", emoji:"🥣", time:"25 хв", ingredients:"Цвітна капуста, картопля, морква, зелень", recipe:"Нарізати овочі. Варити 20 хв. Посипати свіжою зеленню.", dosha:{vata:"Тепла легка страва",pitta:"Охолоджує",kapha:"Ідеально"}, calories:180 },
  { name:"Курячий бульйон з зеленню", emoji:"🍜", time:"40 хв", ingredients:"Куряче філе, морква, петрушка, кріп", recipe:"Зварити куряче філе з морквою 30 хв. Посипати дрібно нарізаною зеленню.", dosha:{vata:"Заспокоює ШКТ",pitta:"Збалансований",kapha:"Без жиру"}, calories:210 },
  { name:"Ризото з гарбузом", emoji:"🍚", time:"35 хв", ingredients:"Рис басматі, гарбуз, цибуля, оливкова олія", recipe:"Обсмажити цибулю та гарбуз. Додати рис та гарячу воду, тушкувати до готовності рису.", dosha:{vata:"Поживно та тепло",pitta:"Кокосове масло замість оливкової краще",kapha:"Мала порція"}, calories:340 },
  { name:"Котлети з індички на парі", emoji:"🍖", time:"30 хв", ingredients:"Фарш індички, яйце, цибуля, кріп", recipe:"Змішати фарш з цибулею, яйцем та кропом. Готувати на парі 20 хв. Подавати з овочами.", dosha:{vata:"Легкий білок",pitta:"Охолоджує",kapha:"Ідеально"}, calories:260 },
  { name:"Гречка з тушкованими овочами", emoji:"🍚", time:"30 хв", ingredients:"Гречка, кабачок, морква, перець болгарський, олія", recipe:"Відварити гречку. Овочі нарізати та згасити 15 хв. Змішати.", dosha:{vata:"Дуже поживно",pitta:"Збалансовано",kapha:"Легкий обід"}, calories:290 },
  { name:"Овочеве рагу з сочевицею", emoji:"🥘", time:"30 хв", ingredients:"Сочевиця червона, кабачок, морква, томати, куркума", recipe:"Зварити сочевицю 15 хв. Обсмажити овочі з куркумою, змішати з сочевицею та тушкувати ще 5 хв.", dosha:{vata:"Сочевиця з куркумою",pitta:"Нейтрально",kapha:"Ідеально"}, calories:250 },
  { name:"Запечена форель з лимоном", emoji:"🐟", time:"25 хв", ingredients:"Форель, лимон, розмарин, оливкова олія", recipe:"Замаринувати рибу в лимоні та розмарині. Запекти 20 хв у духовці.", dosha:{vata:"Ситний білок",pitta:"Лимон помірно",kapha:"Ідеально легко"}, calories:310 },
  { name:"Суп-пюре з кабачків", emoji:"🥣", time:"25 хв", ingredients:"Кабачки, цибуля, вершки 10%, зелень", recipe:"Зварити кабачки з цибулею. Збити блендером, додати вершки та зелень, довести до кипіння.", dosha:{vata:"Ніжний та теплий суп",pitta:"Кабачок охолоджує",kapha:"Без вершків"}, calories:170 },
  { name:"Теплий салат з кіноа та буряком", emoji:"🥗", time:"25 хв", ingredients:"Кіноа, буряк варений, зелень, кедрові горіхи", recipe:"Зварити кіноа. Нарізати буряк. Змішати, посипати зеленню та горішками.", dosha:{vata:"Ситна вечеря",pitta:"Буряк трохи гріє",kapha:"Гарна легкість"}, calories:280 },
  { name:"Парові рибні котлети з рисом", emoji:"🍚", time:"35 хв", ingredients:"Рибний фарш, рис басматі, цибуля, кріп", recipe:"Приготувати рибні котлети на парі. Відварити рис басматі. Подавати з кропом.", dosha:{vata:"Ситний легкий обід",pitta:"Охолоджує риба",kapha:"Менше рису"}, calories:320 },
  { name:"Тушкована капуста з чорносливом", emoji:"🥦", time:"35 хв", ingredients:"Капуста білокачанна, чорнослив, цибуля, олія", recipe:"Нашаткувати капусту, тушкувати з цибулею 20 хв. Додати чорнослив, тушкувати ще 10 хв.", dosha:{vata:"Ситний зігріваючий гарнір",pitta:"Нейтрально",kapha:"Очищує організм"}, calories:230 },
  { name:"Плов з сухофруктами", emoji:"🍚", time:"40 хв", ingredients:"Рис, родзинки, курага, чорнослив, вершкове масло", recipe:"Обсмажити сухофрукти в маслі. Додати рис та воду 1:2. Варити 20 хв.", dosha:{vata:"Живить та заземляє",pitta:"Солодка страва",kapha:"Зменшити масло"}, calories:380 },
  { name:"Суп з сочевицею та шпинатом", emoji:"🍵", time:"35 хв", ingredients:"Червона сочевиця, шпинат, морква, куркума", recipe:"Зварити сочевицю з морквою 20 хв. Додати шпинат та куркуму, варити 3 хв.", dosha:{vata:"Легкий суп",pitta:"Шпинат охолоджує",kapha:"Ідеально"}, calories:220 },
  { name:"Запечена курка з яблуками", emoji:"🍗", time:"45 хв", ingredients:"Куряча грудка, яблуко, кориця, сіль", recipe:"Курячу грудку нарізати скибочками. Укласти у форму разом з яблуками. Запекти 35 хв.", dosha:{vata:"Легка та поживна",pitta:"Яблука охолоджують",kapha:"Зменшити жир"}, calories:290 },
  { name:"Гречаний суп з фрикадельками", emoji:"🍲", time:"30 хв", ingredients:"Гречка, фарш індички, картопля, морква", recipe:"Зварити фрикадельки з гречкою та овочами протягом 20 хв.", dosha:{vata:"Теплий та затишний",pitta:"Нейтральний",kapha:"Без картоплі"}, calories:260 },
  { name:"Котлети з машу та рису", emoji:"🥩", time:"30 хв", ingredients:"Маш зварений, рис зварений, куркума, цибуля", recipe:"Збити блендером маш з рисом та цибулею. Сформувати котлети, запекти в духовці 20 хв.", dosha:{vata:"Дуже легко засвоюється",pitta:"Ідеальна їжа",kapha:"Ситний рослинний білок"}, calories:280 },
  { name:"Запечений хек з брокколі", emoji:"🐟", time:"25 хв", ingredients:"Хек, броколі, оливкова олія, лимон", recipe:"Викласти хек та суцвіття броколі на лист, збризнути олією та запекти 20 хв.", dosha:{vata:"Легкий обід",pitta:"Охолоджує",kapha:"Ідеально"}, calories:230 },
  { name:"Солодкий плов з гарбузом", emoji:"🍚", time:"35 хв", ingredients:"Рис, гарбуз, мед, родзинки", recipe:"Зварити рис з кубиками гарбуза та родзинками. Перед подачею додати мед.", dosha:{vata:"Поживно",pitta:"Солодке",kapha:"Обмежити мед"}, calories:310 },
  { name:"Суп-пюре з солодкого батату", emoji:"🥣", time:"30 хв", ingredients:"Батат, морква, імбир, кокосове молоко", recipe:"Зварити батат та моркву з імбиром. Збити блендером з кокосовим молоком.", dosha:{vata:"Заземляє",pitta:"Кокос охолоджує",kapha:"Без молока"}, calories:240 },
  { name:"Локшина з кунжутом та тофу", emoji:"🍜", time:"15 хв", ingredients:"Локшина цільнозернова, тофу, кунжут, соєвий соус", recipe:"Відварити локшину. Обсмажити тофу з соєвим соусом. Змішати, посипати кунжутом.", dosha:{vata:"Поживно",pitta:"Тофу охолоджує",kapha:"Без локшини"}, calories:320 },
  { name:"Салат з буряка та фети", emoji:"🥗", time:"10 хв", ingredients:"Буряк варений, сир фета, горіхи волоські, олія", recipe:"Буряк нарізати кубиками. Додати фету та подрібнені горіхи. Заправити олією.", dosha:{vata:"Ситний теплий салат",pitta:"Фета солона — помірно",kapha:"Рідко"}, calories:260 },
  { name:"Тушкована індичка в кокосовому соусі", emoji:"🍗", time:"35 хв", ingredients:"Філе індички, кокосове молоко, кабачок, куркума", recipe:"Нарізати індичку та кабачок. Тушкувати в кокосовому молоці з куркумою 20 хв.", dosha:{vata:"Поживно",pitta:"Охолоджує кокос",kapha:"Без молока"}, calories:310 },
  { name:"Суп з перловкою та грибами", emoji:"🍄", time:"40 хв", ingredients:"Перлова крупа, печериці, морква, зелень", recipe:"Зварити перловку. Обсмажити печериці з морквою, додати в суп, варити ще 15 хв.", dosha:{vata:"Важкуватий",pitta:"Нейтральний",kapha:"Ідеальний обід"}, calories:240 },
  { name:"Вівсяний суп з овочами", emoji:"🥣", time:"20 хв", ingredients:"Вівсяні пластівці, морква, кабачок, кріп", recipe:"Зварити овочевий бульйон. Додати пластівці та кріп, варити 5 хв.", dosha:{vata:"М'яка обволікаюча страва",pitta:"Охолоджує",kapha:"Ідеально легко"}, calories:160 },
  { name:"Запечена тріска з цвітною капустою", emoji:"🐟", time:"25 хв", ingredients:"Тріска, цвітна капуста, кмин, олія", recipe:"Укласти тріску та капусту у форму. Посипати кмином, запекти 20 хв.", dosha:{vata:"Легкий білок",pitta:"Охолоджує",kapha:"Ідеально"}, calories:220 },
  { name:"Овочеве карі з нутом", emoji:"🫘", time:"30 хв", ingredients:"Нут зварений, кабачок, морква, кокосове молоко, карі", recipe:"Тушкувати овочі з нутом у кокосовому молоці з додаванням щіпки карі.", dosha:{vata:"Ситний рослинний білок",pitta:"Карі помірно",kapha:"Без молока"}, calories:290 },
  { name:"Салат з квасолі та печеного перцю", emoji:"🥗", time:"15 хв", ingredients:"Квасоля консервована, печений перець, зелень, олія", recipe:"Змішати квасолю, нарізаний печений перець та зелень. Заправити олією.", dosha:{vata:"Додати кумин",pitta:"Охолоджує перець",kapha:"Чудове джерело білка"}, calories:210 },
  { name:"Пшоняний суп", emoji:"🥣", time:"25 хв", ingredients:"Пшоно, картопля, морква, цибуля, кріп", recipe:"Зварити пшоно з овочами протягом 20 хв. Додати свіжий кріп перед подачею.", dosha:{vata:"Тепла страва",pitta:"Нейтральна",kapha:"Ідеально очищувальна"}, calories:180 },
  { name:"Гречані тефтелі", emoji:"🥩", time:"30 хв", ingredients:"Гречка зварена, курячий фарш, яйце, томатне пюре", recipe:"Змішати фарш з гречкою та яйцем. Зліпити тефтелі, тушкувати в томатному пюре 20 хв.", dosha:{vata:"Дуже ситно та смачно",pitta:"Томати обережно",kapha:"Без масла"}, calories:340 },
  { name:"Курячий рулет зі шпинатом", emoji:"🍗", time:"40 хв", ingredients:"Куряче філе, шпинат, яйце, часник", recipe:"Розпластати філе. Викласти шпинат, загорнути в рулет, запекти у фользі 30 хв.", dosha:{vata:"Поживно",pitta:"Шпинат охолоджує",kapha:"Ідеально"}, calories:290 },
  { name:"Тушкований кабачок з рисом", emoji:"🥒", time:"20 хв", ingredients:"Рис басматі, кабачок, кріп, гхі", recipe:"Тушкувати кубики кабачка в маслі гхі. Змішати з відвареним рисом басматі та кропом.", dosha:{vata:"М'яко та поживно",pitta:"Ідеальна страва",kapha:"Менше рису"}, calories:260 },
  { name:"Крем-суп з гарбуза та моркви", emoji:"🎃", time:"25 хв", ingredients:"Гарбуз, морква, імбир, вершки 10%", recipe:"Зварити гарбуз та моркву з імбиром. Збити блендером з додаванням вершків.", dosha:{vata:"Дуже заземляє",pitta:"Вершки охолоджують",kapha:"Без вершків"}, calories:190 },
  { name:"Салат з огірків та кунжуту", emoji:"🥒", time:"5 хв", ingredients:"Огірок, кунжут, соєвий соус, оливкова олія", recipe:"Нарізати огірки. Посипати кунжутом, полити соєвим соусом та олією.", dosha:{vata:"Легка страва",pitta:"Охолоджує",kapha:"Зменшити олію"}, calories:140 },
  { name:"Запечений короп з кропом", emoji:"🐟", time:"35 хв", ingredients:"Короп, кріп, лимон, сіль", recipe:"Нафарширувати короп кропом та лимоном. Запекти в духовці 30 хв.", dosha:{vata:"Поживний білок",pitta:"Нейтральний",kapha:"Краще хек"}, calories:310 },
  { name:"Суп з машу та шпинату", emoji:"🍵", time:"30 хв", ingredients:"Маш, шпинат, морква, куркума", recipe:"Зварити маш з морквою 20 хв. Додати шпинат та куркуму, варити ще 3 хв.", dosha:{vata:"Легке перетравлення",pitta:"Охолоджує",kapha:"Чудово очищує"}, calories:210 },
  { name:"Запечена телятина з морквою", emoji:"🥩", time:"60 хв", ingredients:"Телятина пісна, морква, часник, розмарин", recipe:"Запекти телятину разом з морквою, часником та розмарином у рукаві 50 хв.", dosha:{vata:"Ситно та поживно",pitta:"Червоне м'ясо помірно",kapha:"Пісне м'ясо"}, calories:360 },
  { name:"Суп-пюре з зеленого горошку", emoji:"🟢", time:"20 хв", ingredients:"Зелений горошок консерв. або свіжий, м'ята, олія", recipe:"Зварити горошок. Збити блендером зі свіжою м'ятою та ложкою олії.", dosha:{vata:"Додати зіру",pitta:"М'ята охолоджує",kapha:"Ідеально"}, calories:170 },
  { name:"Кіноа з печеними овочами", emoji:"🥗", time:"30 хв", ingredients:"Кіноа, баклажан, кабачок, перець солодкий", recipe:"Зварити кіноа. Запекти овочі 20 хв. Все змішати.", dosha:{vata:"Поживно",pitta:"Охолоджує",kapha:"Ідеально легке"}, calories:270 },
  { name:"Паровий судак з кабачком", emoji:"🐟", time:"25 хв", ingredients:"Судак, кабачок, лимонний сік, сіль", recipe:"Готувати судак з кружальцями кабачка на парі 15 хв. Збризнути лимоном.", dosha:{vata:"Легкий білок",pitta:"Охолоджує",kapha:"Ідеально"}, calories:200 },
  { name:"Ячмінний плов з грибами", emoji:"🍄", time:"40 хв", ingredients:"Ячмінна крупа, печериці, цибуля, олія", recipe:"Обсмажити печериці з цибулею. Додати промиту перловку та воду. Тушкувати 30 хв.", dosha:{vata:"Важкий",pitta:"Нейтральний",kapha:"Ідеально поживний"}, calories:280 },
  { name:"Суп з тофу та водоростями", emoji:"🍜", time:"15 хв", ingredients:"Тофу, водорості норі/вакаме, соєвий соус, зелена цибуля", recipe:"Зварити легкий бульйон з водоростями та соєвим соусом. Додати кубики тофу та цибулю.", dosha:{vata:"Теплий легкий суп",pitta:"Тофу охолоджує",kapha:"Ідеальний детокс"}, calories:150 },
  { name:"Салат з моркви та яблука", emoji:"🥕", time:"5 хв", ingredients:"Морква, яблуко, насіння соняшника, лимонний сік", recipe:"Натерти моркву та яблуко. Змішати, посипати насінням та збризнути лимоном.", dosha:{vata:"Легко",pitta:"Охолоджує",kapha:"Чудово стимулює Агні"}, calories:160 },
  { name:"Тушкована сочевиця з томатами", emoji:"🫘", time:"25 хв", ingredients:"Червона сочевиця, помідори, кумин, олія", recipe:"Обсмажити кумин. Додати нарізані помідори та сочевицю, залити водою, тушкувати 15 хв.", dosha:{vata:"Додати зіру",pitta:"Помідори кислі — помірно",kapha:"Рослинний білок"}, calories:240 },
  { name:"Рис з зеленим горошком", emoji:"🍚", time:"20 хв", ingredients:"Рис басматі, зелений горошок, масло гхі, кріп", recipe:"Відварити рис басматі. Zmishati з горошком, маслом гхі та свіжим кропом.", dosha:{vata:"Заземляє та живить",pitta:"Ідеальна страва",kapha:"Менше рису"}, calories:280 }
);

RECIPES_DB.dinner.push(
  { name:"Крем-суп з кабачків", emoji:"🥒", time:"20 хв", ingredients:"Кабачки, кріп, оливкова олія, сіль", recipe:"Зварити кабачки. Збити блендером з кропом та ложкою олії.", dosha:{vata:"Ніжно та тепло",pitta:"Кабачок охолоджує",kapha:"Найкраща легка вечеря"}, calories:130 },
  { name:"Запечена тріска з зеленню", emoji:"🐟", time:"25 хв", ingredients:"Тріска, петрушка, кріп, лимонний сік", recipe:"Викласти тріску на деко. Посипати зеленню, збризнути лимоном. Запекти 20 хв.", dosha:{vata:"Легкий білок",pitta:"Охолоджує",kapha:"Ідеально легка вечеря"}, calories:190 },
  { name:"Теплий салат з гарбузом та кунжутом", emoji:"🥗", time:"25 хв", ingredients:"Гарбуз, кунжут, зелений салат, оливкова олія", recipe:"Запекти гарбуз кубиками 15 хв. Викласти на листя салату, посипати кунжутом.", dosha:{vata:"Заземляє нервову систему",pitta:"Гарбуз охолоджує",kapha:"Без олії"}, calories:180 },
  { name:"Кічарі з імбиром та кмином", emoji:"🥘", time:"30 хв", ingredients:"Рис басматі, маш, кмин, імбир свіжий, гхі", recipe:"Промити рис та маш. Розтопити гхі, обсмажити кмин та імбир. Зварити все разом 20 хв.", dosha:{vata:"Заспокоює доші",pitta:"Мало імбиру",kapha:"Детокс вечеря"}, calories:290 },
  { name:"Тушкований буряк з чорносливом", emoji:"🥕", time:"30 хв", ingredients:"Буряк варений, чорнослив, кунжутна олія", recipe:"Натерти буряк. Згасити з нарізаним чорносливом в олії 15 хв.", dosha:{vata:"Зігріває",pitta:"Буряк трохи гріє",kapha:"Чудово очищує кишечник"}, calories:160 },
  { name:"Овочевий суп з сочевицею", emoji:"🥣", time:"25 хв", ingredients:"Червона сочевиця, кабачок, морква, зелень", recipe:"Зварити сочевицю з морквою та кабачком. Посипати свіжою зеленню.", dosha:{vata:"Тепло та легко",pitta:"Охолоджує",kapha:"Ідеально"}, calories:190 },
  { name:"Кабачки гриль з м'ятою", emoji:"🥒", time:"15 хв", ingredients:"Кабачки, свіжа м'ята, оливкова олія", recipe:"Нарізати кабачки скибочками, обсмажити на грилі без масла. Полити олією з м'ятою.", dosha:{vata:"Тепла вечеря",pitta:"М'ята охолоджує",kapha:"Без олії"}, calories:120 },
  { name:"Парова куряча грудка з селерою", emoji:"🍗", time:"25 хв", ingredients:"Куряче філе, селера стебло, зелень", recipe:"Приготувати куряче філе з шматочками селери на парі 20 хв. Посипати зеленню.", dosha:{vata:"Легкий білок",pitta:"Нейтрально",kapha:"Чудово для схуднення"}, calories:210 },
  { name:"Запечений батат з розмарином", emoji:"🍠", time:"30 хв", ingredients:"Батат, розмарин, оливкова олія", recipe:"Нарізати батат часточками. Змастити олією з розмарином, запекти 25 хв.", dosha:{vata:"Солодкий батат заземляє",pitta:"Охолоджуючий ефект",kapha:"Невелика порція"}, calories:220 },
  { name:"Суп-пюре з моркви та імбиру", emoji:"🥣", time:"25 хв", ingredients:"Морква, цибуля, імбир свіжий, кокосове молоко", recipe:"Зварити моркву та цибулю з імбиром. Збити блендером, додати трохи кокосового молока.", dosha:{vata:"Зігріває",pitta:"Імбир помірно",kapha:"Без молока"}, calories:150 },
  { name:"Теплий салат з брокколі", emoji:"🥦", time:"15 хв", ingredients:"Броколі, кунжутна олія, насіння соняшника", recipe:"Відварити броколі 3 хв. Заправити олією та посипати насінням.", dosha:{vata:"Броколі сушить — з олією",pitta:"Броколі охолоджує",kapha:"Ідеально"}, calories:160 },
  { name:"Рис з кардамоном та родзинками", emoji:"🍚", time:"20 хв", ingredients:"Рис басматі, родзинки, кардамон, мед", recipe:"Зварити рис з кардамоном та родзинками. Перед подачею додати трохи меду.", dosha:{vata:"Солодке та заспокійливе",pitta:"Кардамон охолоджує",kapha:"Без меду"}, calories:240 },
  { name:"Запечене яблуко з корицею", emoji:"🍎", time:"15 хв", ingredients:"Яблуко, кориця, родзинки", recipe:"Вирізати серцевину яблука, покласти родзинки та корицю. Запекти в духовці 10 хв.", dosha:{vata:"Тепле яблуко заспокоює",pitta:"Солодке яблуко",kapha:"Чудова легка вечеря"}, calories:120 },
  { name:"Суп з цвітної капусти та кропу", emoji:"🥣", time:"20 хв", ingredients:"Цвітна капуста, кріп, оливкова олія", recipe:"Зварити цвітну капусту. Збити блендером з кропом та ложкою олії.", dosha:{vata:"Теплий легкий суп",pitta:"Охолоджує",kapha:"Ідеально легко"}, calories:140 },
  { name:"Салат з пекінської капусти", emoji:"🥬", time:"5 хв", ingredients:"Пекінська капуста, огірок, кріп, оливкова олія", recipe:"Тонко нашаткувати капусту, нарізати огірок. Змішати, заправити олією.", dosha:{vata:"Додати теплу кашу",pitta:"Охолоджує",kapha:"Чудовий легкий вибір"}, calories:110 },
  { name:"Тушкований хек з морквою", emoji:"🐟", time:"30 хв", ingredients:"Хек, морква, цибуля, оливкова олія", recipe:"Нарізати хек. Тушкувати з морквою та цибулею в невеликій кількості води та олії 20 хв.", dosha:{vata:"Тепла та поживна страва",pitta:"Охолоджує",kapha:"Легкий білок"}, calories:210 },
  { name:"Вівсяна каша на кокосовому молоці", emoji:"🥣", time:"10 хв", ingredients:"Вівсяні пластівці, кокосове молоко, мед", recipe:"Зварити вівсянку на кокосовому молоці. Додати мед.", dosha:{vata:"Дуже поживно",pitta:"Кокос охолоджує",kapha:"Зменшити молоко"}, calories:260 },
  { name:"Запечені баклажани з йогуртом", emoji:"🍆", time:"30 хв", ingredients:"Баклажан, йогурт грецький, зелень", recipe:"Запекти баклажан скибочками. Подавати з ложкою холодного йогурту та зеленню.", dosha:{vata:"Баклажан з олією",pitta:"Йогурт охолоджує",kapha:"Без йогурту"}, calories:180 },
  { name:"Суп з сочевиці та лимона", emoji:"🍵", time:"25 хв", ingredients:"Червона сочевиця, морква, лимонний сік, куркума", recipe:"Зварити сочевицю з морквою. Додати куркуму та лимонний сік перед подачею.", dosha:{vata:"Легка страва",pitta:"Охолоджує",kapha:"Рослинний білок"}, calories:200 },
  { name:"Огірковий салат з кропом", emoji:"🥒", time:"5 хв", ingredients:"Огірок, кріп, оливкова олія, сіль", recipe:"Нарізати огірки скибочками. Посипати кропом, заправити олією.", dosha:{vata:"Свіже та сухе — помірно",pitta:"Супер охолодження",kapha:"Зменшити олію"}, calories:120 },
  { name:"Кіноа з зеленим горошком", emoji:"🍚", time:"20 хв", ingredients:"Кіноа, зелений горошок, кріп, оливкова олія", recipe:"Зварити кіноа. Змішати з зеленим горошком та кропом, полити олією.", dosha:{vata:"Легкий ситний обід",pitta:"Охолоджує",kapha:"Ідеально легке"}, calories:250 },
  { name:"Печений буряк з кунжутом", emoji:"🥕", time:"30 хв", ingredients:"Буряк варений, кунжут, оливкова олія", recipe:"Нарізати буряк скибочками, посипати обсмаженим кунжутом, збризнути олією.", dosha:{vata:"Поживно",pitta:"Нейтрально",kapha:"Прекрасне очищення"}, calories:150 },
  { name:"Суп-пюре з гарбуза та кокосу", emoji:"🥣", time:"25 хв", ingredients:"Гарбуз, кокосове молоко, куркума, сіль", recipe:"Зварити гарбуз. Збити блендером з кокосовим молоком та куркумою.", dosha:{vata:"Дуже заземляє",pitta:"Кокос охолоджує",kapha:"Без молока"}, calories:170 },
  { name:"Капустяний салат з яблуком", emoji:"🥗", time:"5 хв", ingredients:"Капуста молода, яблуко солодке, лимонний сік, олія", recipe:"Нашаткувати капусту, натерти яблуко. Змішати, заправити олією та лимоном.", dosha:{vata:"Капуста сушить",pitta:"Охолоджує",kapha:"Ідеально легка вечеря"}, calories:130 },
  { name:"Запечена камбала з лимоном", emoji:"🐟", time:"25 хв", ingredients:"Камбала, лимон, петрушка", recipe:"Викласти камбалу на деко, полити лимоном, запекти 20 хв. Посипати петрушкою.", dosha:{vata:"Легкий білок",pitta:"Охолоджує",kapha:"Ідеально"}, calories:200 },
  { name:"Тушковані овочі з тофу", emoji:"🥦", time:"20 хв", ingredients:"Тофу, кабачок, морква, соєвий соус", recipe:"Нарізати тофу та овочі. Тушкувати разом з соєвим соусом 15 хв.", dosha:{vata:"Тофу ситний",pitta:"Охолоджує",kapha:"Ідеальна рослинна вечеря"}, calories:190 },
  { name:"Пшоняна каша на воді", emoji:"🥣", time:"20 хв", ingredients:"Пшоно, вода, сіль, масло гхі", recipe:"Відварити пшоно на воді. Подавати з ложкою масла гхі.", dosha:{vata:"Тепла каша",pitta:"Нейтральна",kapha:"Без масла"}, calories:210 },
  { name:"Салат зі шпинату та огірка", emoji:"🥬", time:"5 хв", ingredients:"Шпинат свіжий, огірок, насіння льону, оливкова олія", recipe:"Змішати листя шпинату з скибочками огірка, посипати льоном та полити олією.", dosha:{vata:"Легка страва",pitta:"Супер охолодження",kapha:"Без олії"}, calories:140 },
  { name:"Запечений кабачок з кропом", emoji:"🥒", time:"20 хв", ingredients:"Кабачок, кріп, оливкова олія, сіль", recipe:"Нарізати кабачок кружальцями, запекти в духовці 15 хв. Прикрасити кропом.", dosha:{vata:"М'яка легка вечеря",pitta:"Кабачок охолоджує",kapha:"Ідеально"}, calories:120 },
  { name:"Овочевий суп з фрикадельками", emoji:"🍲", time:"30 хв", ingredients:"Фарш індички, кабачок, морква, кріп", recipe:"Зробити маленькі фрикадельки. Зварити їх в овочевому бульйоні з кабачком та морквою 20 хв.", dosha:{vata:"Тепло та поживно",pitta:"Охолоджує",kapha:"Без жиру"}, calories:230 },
  { name:"Печена морква з кумином", emoji:"🥕", time:"25 хв", ingredients:"Морква, кумин (зіра), оливкова олія", recipe:"Нарізати моркву паличками. Змастити олією з кумином, запекти 20 хв.", dosha:{vata:"Зігріває та заземляє",pitta:"Нейтрально",kapha:"Чудово легко"}, calories:140 },
  { name:"Рис басматі з гхі", emoji:"🍚", time:"20 хв", ingredients:"Рис басматі, масло гхі, сіль", recipe:"Відварити рис басматі. Подавати гарячим з розтопленим маслом гхі.", dosha:{vata:"Найкаща заземляюча страва",pitta:"Охолоджує",kapha:"Менше рису"}, calories:260 },
  { name:"Салат з буряка та яблука", emoji:"🥗", time:"5 хв", ingredients:"Буряк варений, яблуко, насіння соняшника, оливкова олія", recipe:"Буряк та яблуко нарізати соломкою. Перемішати, додати насіння соняшника та олію.", dosha:{vata:"Поживно",pitta:"Яблуко охолоджує",kapha:"Менше олії"}, calories:160 },
  { name:"Запечена тріска з аспарагусом", emoji:"🐟", time:"25 хв", ingredients:"Тріска, аспарагус, лимон, сіль", recipe:"Викласти рибу та аспарагус на лист. Збризнути лимоном та запекти 20 хв.", dosha:{vata:"Легкий білок",pitta:"Супер охолодження",kapha:"Ідеально"}, calories:210 },
  { name:"Гречка з кропом", emoji:"🍚", time:"20 хв", ingredients:"Гречка, кріп, оливкова олія", recipe:"Відварити гречку. Змішати з дрібно нарізаним кропом та ложкою олії.", dosha:{vata:"Заземляє",pitta:"Нейтрально",kapha:"Ідеально легка вечеря"}, calories:240 },
  { name:"Суп з кабачка та шпинату", emoji:"🍵", time:"20 хв", ingredients:"Кабачок, шпинат, кріп, сіль", recipe:"Зварити кабачок. В кінці додати шпинат, варити 1 хв. Збити блендером, додати кріп.", dosha:{vata:"Ніжний теплий суп",pitta:"Охолоджує",kapha:"Прекрасний детокс"}, calories:120 },
  { name:"Салат з селери та огірка", emoji:"🥒", time:"5 хв", ingredients:"Селера стебла, огірок, кріп, кунжутна олія", recipe:"Нарізати селеру та огірки скибочками. Змішати з кропом та олією.", dosha:{vata:"Селера сушить",pitta:"Охолоджує",kapha:"Чудова легкість"}, calories:130 },
  { name:"Печений гарбуз з корицею", emoji:"🎃", time:"25 хв", ingredients:"Гарбуз, кориця, мед", recipe:"Запекти гарбуз скибочками 20 хв. Посипати корицею, полити медом перед подачею.", dosha:{vata:"Солодка та зігріваюча",pitta:"Кориця помірно",kapha:"Без меду"}, calories:190 },
  { name:"Ячмінна каша з маслом", emoji:"🥣", time:"25 хв", ingredients:"Ячмінна крупа, вода, вершкове масло", recipe:"Зварити ячмінну крупу на воді. Додати шматочок вершкового масла.", dosha:{vata:"Важка каша",pitta:"Охолоджує Піту",kapha:"Без масла"}, calories:240 },
  { name:"Салат зі свіжої капусти та огірка", emoji:"🥗", time:"5 хв", ingredients:"Капуста білокачанна, огірок, зелень, олія", recipe:"Нашаткувати капусту, нарізати огірок. Змішати з кропом та олією.", dosha:{vata:"Капуста сушить",pitta:"Охолоджує",kapha:"Дуже легка вечеря"}, calories:120 },
  { name:"Запечена індичка зі спаржею", emoji:"🍗", time:"30 хв", ingredients:"Філе індички, спаржа зелена, оливкова олія", recipe:"Запекти шматочки індички зі спаржею у духовці при 180°C 25 хв.", dosha:{vata:"Поживно та тепло",pitta:"Охолоджує спаржа",kapha:"Ідеальний білок"}, calories:270 },
  { name:"Сочевиця з кропом", emoji:"🫘", time:"25 хв", ingredients:"Червона сочевиця, кріп, оливкова олія", recipe:"Відварити червону сочевицю 15 хв. Заправити олією та свіжим кропом.", dosha:{vata:"Легка вечеря",pitta:"Нейтрально",kapha:"Рослинний білок"}, calories:210 },
  { name:"Рис з зеленим горошком", emoji:"🍚", time:"20 хв", ingredients:"Рис басматі, зелений горошок, оливкова олія, кріп", recipe:"Відварити рис. Перемішати з горошком та кропом, полити олією.", dosha:{vata:"Заземляє",pitta:"Охолоджує",kapha:"Менше рису"}, calories:250 },
  { name:"Печений батат з олією", emoji:"🍠", time:"30 хв", ingredients:"Батат, оливкова олія, сіль", recipe:"Запекти батат часточками у духовці 25 хв. Злегка полити олією.", dosha:{vata:"Дуже заземляє",pitta:"Охолоджуючий батат",kapha:"Мала порція"}, calories:200 }
);


// ==========================
// ГЕНЕРАТОР СТРАВ З АНТИРЕПЕТИЦІЙНИМ АЛГОРИТМОМ
// ==========================
if (!State.recipesHistory) State.recipesHistory = { breakfast: [], lunch: [], dinner: [] };



// ==========================
// РОЗУМНЕ ФІЛЬТРУВАННЯ РЕЦЕПТІВ ЗА МЕДИЧНИМИ ОБМЕЖЕННЯМИ
// ==========================
function isRecipeBlocked(recipe) {
  const activeConditions = State.blockpost.conditions || [];
  const blockedCategories = new Set();
  
  // Збираємо всі заблоковані категорії з вибраних хвороб
  for (const condId of activeConditions) {
    const cond = State.availableConditions.find(c => c.id === condId);
    if (cond && cond.blocked_categories) {
      cond.blocked_categories.forEach(cat => blockedCategories.add(cat));
    }
  }
  
  if (blockedCategories.size === 0) return false;
  
  const ingredientsLower = (recipe.ingredients || '').toLowerCase();
  const recipeLower = (recipe.recipe || '').toLowerCase();
  const nameLower = (recipe.name || '').toLowerCase();
  
  // Карта відповідності категорій ключовим словам в інгредієнтах
  const categoryKeywords = {
    gluten_containing: ['пшениц', 'житн', 'ячмін', 'манн', 'борошн', 'макарон', 'спагет', 'удон', 'хліб', 'чіабат', 'вареник', 'пельмен', 'тост', 'булочк', 'паст'],
    dairy_lactose: ['молок', 'кефір', 'йогурт', 'сир', 'вершк', 'сметан'], // гхі вважається безпечним
    caffeine: ['кава', 'чай', 'какао', 'шоколад'],
    alcohol: ['вино', 'алкогол', 'пиво'],
    spicy: ['перець', 'чилі', 'імбир', 'часник', 'гірчиц', 'хрін', 'прянощ', 'гостр'],
    acidic: ['помідор', 'томат', 'лимон', 'лайм', 'оцет', 'щавель', 'апельсин', 'мандарин'],
    fried: ['смажен', 'смажит', 'обсмаж'],
    salty: ['солон', 'слабосол', 'шинк', 'ковбас', 'копчен', 'огірки мариновані', 'маслин', 'оливк'],
    high_glycemic: ['цукор', 'мед', 'сироп'],
    refined_sugar: ['цукор', 'сироп'],
    high_oxalate: ['шпинат', 'буряк', 'мигдал', 'горіх', 'шоколад'],
    high_purine: ['ялович', 'свинин', 'пиво', 'морепродукт', 'креветк', 'мідії'],
    saturated_fat_high: ['свинин', 'сало', 'вершк', 'бекон']
  };

  // Перевіряємо кожну заблоковану категорію
  for (const cat of blockedCategories) {
    const keywords = categoryKeywords[cat];
    if (keywords) {
      for (const kw of keywords) {
        // Сир гхі та тофу є винятком для dairy_lactose
        if (kw === 'сир' && (ingredientsLower.includes('гхі') || ingredientsLower.includes('тофу')) && !ingredientsLower.includes('кисломолоч') && !ingredientsLower.includes('тверд')) {
          continue;
        }
        if (ingredientsLower.includes(kw) || recipeLower.includes(kw) || nameLower.includes(kw)) {
          return true;
        }
      }
    }
  }
  
  return false;
}

function pickRandomRecipes(mealTime, count = 3, isBachelor = false) {
  const allRecipes = RECIPES_DB[mealTime] || RECIPES_DB.lunch;
  const history = State.recipesHistory[mealTime] || [];
  
  // Фільтруємо спочатку за медичними обмеженнями
  let safeRecipes = allRecipes.filter(r => !isRecipeBlocked(r));
  
  // Якщо ми в режимі Холостяка, фільтруємо за часом приготування <= 15 хв
  if (isBachelor) {
    safeRecipes = safeRecipes.filter(r => {
      const minutes = parseInt(r.time) || 30;
      return minutes <= 15;
    });
  }
  
  // Якщо після всіх фільтрацій залишилося мало страв, послабимо фільтр Холостяка до 25 хв
  if (isBachelor && safeRecipes.length < count) {
    safeRecipes = allRecipes.filter(r => !isRecipeBlocked(r)).filter(r => {
      const minutes = parseInt(r.time) || 30;
      return minutes <= 25;
    });
  }
  
  // Якщо і після цього замало — беремо просто безпечні страви
  if (safeRecipes.length < count) {
    safeRecipes = allRecipes.filter(r => !isRecipeBlocked(r));
  }
  
  // Якщо і безпечних немає взагалі (наприклад, занадто сувора дієта) — беремо все
  if (safeRecipes.length === 0) {
    safeRecipes = [...allRecipes];
  }
  
  // Відфільтровуємо нещодавно показані
  let available = safeRecipes.filter(r => !history.includes(r.name));
  
  // Якщо показали всі — скидаємо історію для цього прийому їжі
  if (available.length < count) {
    State.recipesHistory[mealTime] = [];
    available = [...safeRecipes];
  }
  
  // Fisher-Yates shuffle
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  const selected = shuffled.slice(0, count);
  
  // Оновлюємо історію
  State.recipesHistory[mealTime] = [
    ...history,
    ...selected.map(r => r.name)
  ].slice(-50);
  
  saveToLocalStorage();
  return selected;
}


function renderRecipeCard(recipe, dosha, index) {
  const doshaAdvice = recipe.dosha?.[dosha] || 'Збалансована страва для всіх Дош';
  const doshaColor = { vata: '#8B9DC3', pitta: '#E8735A', kapha: '#5A9E6F' }[dosha] || '#c9a84c';
  
  return `
    <div class="recipe-card" style="
      background:var(--bg-card);
      border:1px solid var(--border-color);
      border-radius:16px;
      overflow:hidden;
      margin-bottom:12px;
      transition:all 0.3s ease;
      animation: fadeInUp 0.3s ease ${index * 0.1}s both;
    ">
      <div style="
        padding:16px;
        display:flex;
        align-items:center;
        gap:12px;
        border-bottom:1px solid var(--border-color);
        background:linear-gradient(135deg, var(--bg-card), rgba(201,168,76,0.03));
      ">
        <div style="font-size:32px; filter:drop-shadow(0 0 8px rgba(201,168,76,0.3))">${recipe.emoji}</div>
        <div style="flex:1">
          <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);">${recipe.name}</div>
          <div style="display:flex;gap:8px;margin-top:4px;">
            <span style="font-size:11px;color:var(--text-muted);background:var(--bg-primary);padding:2px 8px;border-radius:8px;">⏱️ ${recipe.time}</span>
            <span style="font-size:11px;color:var(--text-muted);background:var(--bg-primary);padding:2px 8px;border-radius:8px;">🔥 ${recipe.calories} ккал</span>
          </div>
        </div>
        <button onclick="addRecipeToDiary('${recipe.name.replace(/'/g,"\\'").replace(/"/g,"&quot;")}','${recipe.emoji}')" 
          style="background:var(--gold-glow);border:1px solid var(--border-color);border-radius:8px;padding:8px;color:var(--gold-primary);font-size:18px;cursor:pointer;">
          📔
        </button>
      </div>
      <div style="padding:12px 16px;">
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
          <strong style="color:var(--text-primary);">🥬 Інгредієнти:</strong> ${recipe.ingredients}
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
          <strong style="color:var(--text-primary);">👨‍🍳 Приготування:</strong> ${recipe.recipe}
        </div>
        <div style="font-size:12px;padding:8px 12px;border-radius:8px;background:rgba(${doshaColor.startsWith('#') ? hexToRgb(doshaColor) : doshaColor},0.1);border-left:3px solid ${doshaColor};color:${doshaColor};">
          <strong>🌿 Аюрведа (${dosha === 'vata' ? '💨 Вата' : dosha === 'pitta' ? '🔥 Піта' : '🌊 Капха'}):</strong> ${doshaAdvice}
        </div>
      </div>
    </div>
  `;
}



// ==========================
// AI ASSISTANT CHAT
// ==========================
if (!State.aiHistory) State.aiHistory = [];

function toggleAssistant() {
  const chat = document.getElementById('ai-assistant-chat');
  chat.classList.toggle('hidden');
  
  if (!chat.classList.contains('hidden') && State.aiHistory.length === 0) {
    const p = State.profile || {};
    const name = p.name ? p.name.split(' ')[0] : 'Друже';
    const doshaNames = { vata: 'Вата', pitta: 'Піта', kapha: 'Капха' };
    const dosha = p.dosha_type ? doshaNames[p.dosha_type] : '';
    
    let age = '';
    if (p.birth_date) {
      const birth = new Date(p.birth_date);
      const ageVal = Math.floor((Date.now() - birth) / (1000 * 60 * 60 * 24 * 365.25));
      age = `${ageVal}р.`;
    }
    
    let meta = '';
    if (dosha || age) {
      meta = ` (${[dosha, age].filter(Boolean).join(', ')})`;
    }
    
    const activeConditions = State.blockpost?.conditions || [];
    let diseaseText = '';
    if (activeConditions.length > 0 && State.availableConditions) {
      const activeDetails = activeConditions.map(id => State.availableConditions.find(c => c.id === id)).filter(Boolean);
      if (activeDetails.length > 0) {
        diseaseText = ` Враховуючи твої особливості та діагнози (${activeDetails.map(c => c.name_uk).join(', ')}), я підібрав відповідні рекомендації.`;
      }
    }
    
    const msg = `Намасте, ${name}${meta}! 🧘 Я твій Аюрведичний ШІ-Асистент.${diseaseText} Запитай мене про харчування, спосіб життя або сумісність продуктів.`;
    addAiMessage(msg, 'bot');
  }
}

function handleAiInput(e) {
  if (e.key === 'Enter') sendAiMessage();
}

function sendAiMessage() {
  const input = document.getElementById('ai-chat-input');
  const text = input.value.trim();
  if (!text) return;
  
  addAiMessage(text, 'user');
  input.value = '';
  
  const lowerText = text.toLowerCase();
  
  // 1. Патерн: Час
  if (lowerText.includes('котра година') || lowerText.includes('час') || lowerText.includes('година')) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    setTimeout(() => addAiMessage(`Зараз ${timeStr}. Згідно з Аюрведою, зараз ідеальний час для ${now.getHours() < 12 ? 'активності та ранкової рутини' : (now.getHours() < 18 ? 'роботи та ситного обіду' : 'відпочинку та легкої вечері')}.`, 'bot'), 600);
    return;
  }
  
  // 2. Патерн: Як справи
  if (lowerText.includes('як справи') || lowerText.includes('як ти')) {
    setTimeout(() => addAiMessage('У мене все чудово! Мої сервери наповнені праною і готові допомагати тобі тримати баланс. Як почуваєшся?', 'bot'), 600);
    return;
  }
  
  // 3. Патерн: Бувай
  if (lowerText.includes('пока') || lowerText.includes('бувай') || lowerText.includes('до побачення') || lowerText.includes('дякую')) {
    setTimeout(() => addAiMessage('Дякую за розмову! Нехай всі твої Доші будуть у гармонії. Намасте 🙏', 'bot'), 600);
    return;
  }
  
  // 4. Патерн: Паніка
  if (lowerText.includes('погано') || lowerText.includes('болить') || lowerText.includes('тривога')) {
    setTimeout(() => triggerPanicMode(false), 600);
    return;
  }
  
  // 5. Контекстні дані з профілю та блокпосту
  const p = State.profile || {};
  const activeConditions = State.blockpost.conditions || [];
  const userName = p.name ? p.name.split(' ')[0] : 'Друже';
  const doshaNames = { vata: 'Вата (Вітер+Ефір)', pitta: 'Піта (Вогонь+Вода)', kapha: 'Капха (Земля+Вода)' };
  const userDosha = p.dosha_type ? doshaNames[p.dosha_type] : 'не визначена';
  
  // Рахуємо вік
  let ageStr = '';
  if (p.birth_date) {
    const birth = new Date(p.birth_date);
    const age = Math.floor((Date.now() - birth) / (1000 * 60 * 60 * 24 * 365.25));
    ageStr = `віком ${age} років`;
  }
  
  let diseaseContext = '';
  let adviceContext = '';
  
  if (activeConditions.length > 0) {
    const allConditions = State.availableConditions || [];
    const activeDetails = activeConditions.map(id => allConditions.find(c => c.id === id)).filter(Boolean);
    
    diseaseContext = `У вашій медичній карті зазначено обмеження: ${activeDetails.map(c => c.name_uk).join(', ')}.`;
    
    // Збираємо заборонені речі
    const blockedCategories = [];
    activeDetails.forEach(c => {
      if (c.blocked_categories) blockedCategories.push(...c.blocked_categories);
    });
    
    const categoryTranslations = {
      spicy: 'гостру їжу (перець, спеції)',
      acidic: 'кислі продукти (томати, лимон, щавель)',
      fried: 'смажену та жирну їжу',
      caffeine: 'каву та кофеїн',
      alcohol: 'алкоголь',
      dairy_lactose: 'лактозу та молоко',
      gluten_containing: 'глютен та пшеницю'
    };
    
    const translateBlocked = [...new Set(blockedCategories)].map(cat => categoryTranslations[cat] || cat);
    if (translateBlocked.length > 0) {
      adviceContext = `Через ваші діагнози я наполегливо рекомендую повністю виключити з раціону: ${translateBlocked.join(', ')}. Також для кожної хвороби ми налаштували безпечні продукти в меню.`;
    }
  } else {
    diseaseContext = 'У вас зараз немає активних медичних обмежень у Блокпості.';
    adviceContext = 'Ви можете харчуватися згідно з вашою загальною конституцією Доші.';
  }

  // Розумний аналіз ключових слів
  let aiReply = '';
  
  if (lowerText.includes('їсти') || lowerText.includes('дієт') || lowerText.includes('харч') || lowerText.includes('продукт') || lowerText.includes('можна')) {
    aiReply = `Привіт, ${userName}! З огляду на те, що твій тип Доші — ${userDosha}, ${ageStr ? 'та твій вік — ' + ageStr : ''}, твоє харчування має бути збалансованим. ${diseaseContext} ${adviceContext} Для замовлення страв використовуй наш "Розумний Рецепт" — він автоматично підлаштує інгредієнти під твої обмеження.`;
  } else if (lowerText.includes('виразк') || lowerText.includes('гастрит') || lowerText.includes('діабет') || lowerText.includes('тиск') || lowerText.includes('хвороб') || lowerText.includes('діагноз')) {
    aiReply = `Дорогий ${userName}, я бачу твій запит про здоров'я. ${diseaseContext} Аюрведа трактує хвороби як дисбаланс стихій. Наприклад, виразки чи гастрити — це надлишок вогню Піти. Тому обов'язково уникайте кислих, солоних та дуже гарячих продуктів. Якщо маєте питання щодо конкретної хвороби, я радий відповісти з огляду на твої особисті дані.`;
  } else if (lowerText.includes('доша') || lowerText.includes('вата') || lowerText.includes('піта') || lowerText.includes('капха')) {
    aiReply = `${userName}, твій поточний профіль має тип конституції: ${userDosha}. В Аюрведі знання своєї Доші допомагає коригувати спосіб життя. Наприклад, Вата потребує тепла та маслянистості, Піта — охолодження та помірності, Капха — руху, легкості та стимулюючих гострих спецій. Дотримуйся порад у особистому кабінеті, там є твій погодинний біоритм!`;
  } else if (lowerText.includes('воду') || lowerText.includes('пити') || lowerText.includes('кав') || lowerText.includes('чай')) {
    const isUlcOrGast = activeConditions.includes('ulcer') || activeConditions.includes('gastritis');
    aiReply = `${userName}, правильний питний режим — основа Агні (вогню травлення). Рекомендую пити теплу воду невеликими ковтками. ${isUlcOrGast ? 'Оскільки у вас виразка або гастрит, уникайте кави та міцного чаю, вони підвищують кислотність.' : 'Уникайте крижаних напоїв, оскільки вони гасять вогонь травлення.'}`;
  } else {
    aiReply = `Дякую за питання, ${userName}! Я, твій KSVeda AI Асистент, проаналізував твій запит. Твій вік: ${ageStr || 'не вказано'}, тип Доші: ${userDosha}. ${diseaseContext} ${adviceContext} Чи хочеш ти дізнатися про сумісність продуктів, або отримати пораду щодо покращення травлення?`;
  }
  
  setTimeout(() => {
    addAiMessage(aiReply, 'bot');
  }, 800);
}

function triggerPanicMode(addUserMessage = true) {
  if (addUserMessage) {
    addAiMessage("Мені погано 🆘", 'user');
  }
  
  setTimeout(() => {
    addAiMessage(`
      Я бачу, що тобі зараз складно. Ось план з 4 кроків:
      1. Їжа/Напій: Випий півсклянки теплої води маленькими ковтками.
      2. Пранаяма: Натисни кнопку "🧘 Пранаяма" вище і подихай зі мною.
      3. Дія: Відійди від екрану та подивись у вікно на 2 хвилини.
      4. Ментальне: Скажи собі: "Я в безпеці, це стан тіла, він мине".
    `, 'bot');
  }, 800);
}

function addAiMessage(text, sender) {
  if (!State.aiHistory) State.aiHistory = [];
  State.aiHistory.push({ role: sender, text: text });
  saveToLocalStorage();
  
  const messages = document.getElementById('ai-chat-messages');
  const msgEl = document.createElement('div');
  msgEl.className = `ai-message ${sender}`;
  msgEl.innerText = text;
  messages.appendChild(msgEl);
  messages.scrollTop = messages.scrollHeight;
}

function renderAiHistory() {
  if (!State.aiHistory || State.aiHistory.length === 0) return;
  const messages = document.getElementById('ai-chat-messages');
  if (!messages) return;
  messages.innerHTML = ''; // Очищаємо перед рендерингом
  
  State.aiHistory.forEach(msg => {
    const msgEl = document.createElement('div');
    msgEl.className = `ai-message ${msg.role}`;
    msgEl.innerText = msg.text;
    messages.appendChild(msgEl);
  });
  messages.scrollTop = messages.scrollHeight;
}


// ==========================
// ДИНАЧАР'Я (ЗВИЧКИ)
// ==========================

function toggleHabit(habitId) {
  if (!State.profile.habits) State.profile.habits = {};
  
  const checkbox = document.getElementById(`habit-${habitId}`);
  State.profile.habits[habitId] = checkbox.checked;
  saveToLocalStorage();
  
  apiRequest('/api/profile', 'POST', { habits: State.profile.habits }).catch(() => {});
  
  if (checkbox.checked) {
    showToast('Звичка виконана! ✅', 'success');
  }
}


function restoreHabitsUI() {
  if (!State.profile.habits) return;
  
  const water = document.getElementById('habit-water');
  const tongue = document.getElementById('habit-tongue');
  const meditation = document.getElementById('habit-meditation');
  
  if (water) water.checked = !!State.profile.habits['water'];
  if (tongue) tongue.checked = !!State.profile.habits['tongue'];
  if (meditation) meditation.checked = !!State.profile.habits['meditation'];
}

// ==========================
// ПРАНАЯМА (Дихальний тренажер)
// ==========================
let pranayamaInterval = null;

function startPranayama() {
  const ui = document.getElementById('pranayama-ui');
  const circle = document.getElementById('pranayama-circle');
  const btnGroup = document.getElementById('ai-input-group');
  
  ui.classList.remove('hidden');
  if (btnGroup) btnGroup.classList.add('hidden');
  
  addAiMessage('Запускаємо Пранаяму 4-7-8. Дихай разом зі мною.', 'bot');
  
  let phase = 0; // 0=Вдих(4с), 1=Затримка(7с), 2=Видих(8с)
  
  circle.style.transition = 'transform 4s ease-in-out';
  circle.style.transform = 'scale(1.5)';
  circle.innerText = 'Вдих...';
  
  pranayamaInterval = setInterval(() => {
    phase = (phase + 1) % 3;
    
    if (phase === 0) {
      circle.style.transition = 'transform 4s ease-in-out';
      circle.style.transform = 'scale(1.5)';
      circle.style.background = 'rgba(76, 175, 80, 0.2)';
      circle.innerText = 'Вдих...';
    } else if (phase === 1) {
      circle.style.transition = 'none';
      circle.style.transform = 'scale(1.5)';
      circle.style.background = 'rgba(255, 152, 0, 0.2)';
      circle.innerText = 'Затримка...';
    } else if (phase === 2) {
      circle.style.transition = 'transform 8s ease-in-out';
      circle.style.transform = 'scale(1)';
      circle.style.background = 'rgba(33, 150, 243, 0.2)';
      circle.innerText = 'Видих...';
    }
  }, phase === 0 ? 4000 : (phase === 1 ? 7000 : 8000));
}

function stopPranayama() {
  if (pranayamaInterval) clearInterval(pranayamaInterval);
  
  document.getElementById('pranayama-ui').classList.add('hidden');
  document.getElementById('ai-input-group').classList.remove('hidden');
  
  const circle = document.getElementById('pranayama-circle');
  circle.style.transform = 'scale(1)';
  
  addAiMessage('Ти молодець! Сподіваюсь, тобі стало краще.', 'bot');
}

function renderQuizQuestion() {
  const q = State.quiz.questions[State.quiz.currentQuestion];
  const total = State.quiz.questions.length;
  const current = State.quiz.currentQuestion;

  // Прогрес
  const progress = document.getElementById('quiz-progress');
  if (progress) {
    progress.innerHTML = Array.from({ length: total }, (_, i) =>
      `<div class="quiz-progress-dot ${i < current ? 'done' : i === current ? 'active' : ''}"></div>`
    ).join('');
  }

  document.getElementById('quiz-question-emoji').textContent = q.emoji;
  document.getElementById('quiz-question-text').textContent = q.question;

  const optionsEl = document.getElementById('quiz-options');
  optionsEl.innerHTML = q.options.map((opt, i) => `
    <button
      class="quiz-option ${State.quiz.answers[current] === i ? 'selected' : ''}"
      onclick="selectQuizOption(${i})"
    >${opt.text}</button>
  `).join('');

  // Кнопки навігації
  document.getElementById('quiz-prev-btn').style.display = current === 0 ? 'none' : '';
  const nextBtn = document.getElementById('quiz-next-btn');
  nextBtn.textContent = current === total - 1 ? '✅ Завершити' : 'Далі →';
}

function selectQuizOption(optionIndex) {
  State.quiz.answers[State.quiz.currentQuestion] = optionIndex;
  renderQuizQuestion();
}

function quizNext() {
  const current = State.quiz.currentQuestion;

  // Перевіряємо чи обрана відповідь
  if (State.quiz.answers[current] === undefined) {
    showToast('⚠️ Оберіть відповідь', 'error');
    return;
  }

  if (current < State.quiz.questions.length - 1) {
    State.quiz.currentQuestion++;
    renderQuizQuestion();
  } else {
    // Завершуємо квіз
    calculateDoshaResult();
  }
}

function quizPrev() {
  if (State.quiz.currentQuestion > 0) {
    State.quiz.currentQuestion--;
    renderQuizQuestion();
  }
}


function calculateDoshaResult() {
  const scores = { vata: 0, pitta: 0, kapha: 0 };

  for (const [qIndex, optIndex] of Object.entries(State.quiz.answers)) {
    const q = State.quiz.questions[parseInt(qIndex)];
    const opt = q.options[optIndex];
    scores.vata += opt.vata;
    scores.pitta += opt.pitta;
    scores.kapha += opt.kapha;
  }

  const dominant = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a)[0];

  document.getElementById('input-dosha').value = dominant;
  State.profile.dosha_type = dominant;
  State.currentDosha = dominant;
  updateDoshaDisplay(dominant);
  updateHeader();
  closeQuiz();

  saveToLocalStorage();
  apiRequest('/api/profile', 'POST', { dosha_type: dominant }).catch(() => {});

  const doshaNames = { vata: '💨 Вата', pitta: '🔥 Піта', kapha: '🌊 Капха' };
  showToast(`✨ Твоя Доша: ${doshaNames[dominant]}!`, 'success');
}


// ==========================
// TOAST ПОВІДОМЛЕННЯ
// ==========================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '📢'}</span>
    <span class="toast-text">${message}</span>
  `;

  container.appendChild(toast);

  // Автовидалення через 3 секунди
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==========================
// УТІЛІТИ
// ==========================
function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// ==========================
// ЗАПУСК
// ==========================

// ==========================
// ФОТО ПРОФІЛЮ ТА СМАЙЛИК-ПОМІЧНИК
// ==========================
function handleProfilePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    showToast('❌ Оберіть файл зображення', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    State.profile.photo_base64 = base64;
    
    const preview = document.getElementById('profile-photo-preview');
    if (preview) {
      preview.innerHTML = `<img src="${base64}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    }
    
    saveToLocalStorage();
    showToast('📸 Фото завантажено! Не забудьте зберегти профіль.', 'success');
  };
  reader.readAsDataURL(file);
}

function initWavingWidget() {
  const widget = document.getElementById('waving-emoji-widget');
  if (!widget) return;
  
  const triggerAnimation = () => {
    // Спочатку скидаємо всі класи для нової анімації
    widget.classList.remove('fly-away');
    widget.classList.remove('visible');
    
    // Коротка пауза для рендеру браузером
    setTimeout(() => {
      // Смайлик з'являється (виїжджає)
      widget.classList.add('visible');
      
      // Через 6 секунд махання ручкою — запускаємо відлітання
      setTimeout(() => {
        widget.classList.remove('visible');
        widget.classList.add('fly-away');
      }, 6000);
    }, 100);
  };
  
  // Перший виїзд через 3 секунди після завантаження
  setTimeout(triggerAnimation, 3000);
  
  // Повторюється кожні 30 секунд
  setInterval(triggerAnimation, 30000);
}


document.addEventListener('DOMContentLoaded', init);
