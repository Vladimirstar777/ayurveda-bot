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
  console.log('🌿 Аюрведа Бот ініціалізується...');
  initTelegram();
  startClock();
  initSoulStateButtons();
  initDatePicker();
  await loadInitData();
  updateUI();
}

async function loadInitData() {
  try {
    const data = await apiRequest('/api/init');
    State.profile = data.profile || {};
    State.blockpost = data.blockpost || { conditions: [] };
    State.availableConditions = data.available_conditions || [];
    State.currentDosha = State.profile.dosha_type || null;
    console.log('✅ Дані завантажено:', data);
  } catch (err) {
    console.warn('[Init] Не вдалося завантажити дані з сервера, використовую localStorage');
    // Fallback до localStorage для демо
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
    if (savedProfile) State.profile = JSON.parse(savedProfile);
    if (savedBlockpost) State.blockpost = JSON.parse(savedBlockpost);
    State.currentDosha = State.profile.dosha_type || null;
  } catch (e) {}
}

function saveToLocalStorage() {
  try {
    localStorage.setItem('ayurveda_profile', JSON.stringify(State.profile));
    localStorage.setItem('ayurveda_blockpost', JSON.stringify(State.blockpost));
  } catch (e) {}
}

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
// ОНОВЛЕННЯ UI
// ==========================
function updateUI() {
  updateHeader();
  updateMealPeriodCard();
  renderConditionsList();
  renderClientCard();
  fillProfileForm();
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
  { id: 'balanced', label: 'Збалансований', emoji: '⚖️' },
  { id: 'stress', label: 'Стрес', emoji: '😰' },
  { id: 'fatigue', label: 'Втома', emoji: '😴' },
  { id: 'inflammation', label: 'Жар', emoji: '🔥' },
  { id: 'digestive_issues', label: 'Травлення', emoji: '😣' },
  { id: 'low_immunity', label: 'Імунітет', emoji: '🛡️' },
];

function initSoulStateButtons() {
  const grid = document.getElementById('soul-state-grid');
  if (!grid) return;

  grid.innerHTML = SOUL_STATES.map(s => `
    <button
      class="soul-btn ${s.id === State.currentSoulState ? 'active' : ''}"
      id="soul-btn-${s.id}"
      onclick="selectSoulState('${s.id}')"
      aria-pressed="${s.id === State.currentSoulState}"
    >
      <span class="soul-btn-emoji">${s.emoji}</span>
      <span>${s.label}</span>
    </button>
  `).join('');
}

function selectSoulState(stateId) {
  State.currentSoulState = stateId;
  document.querySelectorAll('.soul-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });
  const activeBtn = document.getElementById(`soul-btn-${stateId}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
  }
  // Скидаємо попередній раціон
  if (State.rationData) {
    hideElement('ration-result');
    showElement('ration-empty');
    State.rationData = null;
  }
}

// ==========================
// ГЕНЕРАЦІЯ РАЦІОНУ
// ==========================
async function generateRation() {
  if (State.isLoading) return;

  State.isLoading = true;
  hideElement('ration-empty');
  hideElement('ration-result');
  showElement('ration-loading');

  // Анімація кнопки
  const btn = document.getElementById('magic-btn');
  if (btn) btn.style.opacity = '0.7';

  try {
    const data = await apiRequest('/api/ration', 'POST', {
      soul_state: State.currentSoulState
    });

    State.rationData = data;
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
  // Рекомендовані продукти
  const safeList = document.getElementById('safe-products-list');
  const safeCount = document.getElementById('safe-count');
  const recommended = data.recommended_products || [];

  safeCount.textContent = `${recommended.length} продуктів`;
  safeList.innerHTML = recommended.map(p => renderProductCard(p, false)).join('');

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
function switchTab(tabName) {
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
  updateDoshaDisplay(p.dosha_type);

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
  };

  const btn = document.getElementById('save-profile-btn');
  if (btn) btn.textContent = '⏳ Зберігаємо...';

  try {
    await apiRequest('/api/profile', 'POST', profileData);
    State.profile = { ...State.profile, ...profileData };
    State.currentDosha = dosha || null;
    saveToLocalStorage();
    updateHeader();
    showToast('✅ Профіль збережено!', 'success');
  } catch (err) {
    // Зберігаємо локально навіть якщо сервер недоступний
    State.profile = { ...State.profile, ...profileData };
    State.currentDosha = dosha || null;
    saveToLocalStorage();
    updateHeader();
    showToast('💾 Збережено локально', 'info');
  } finally {
    if (btn) btn.textContent = '💾 Зберегти профіль';
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
  const list = document.getElementById('conditions-list');
  if (!list) return;

  const conditions = State.availableConditions;
  if (!conditions.length) {
    list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:16px;">Завантаження станів...</div>';
    return;
  }

  const activeConditions = new Set(State.blockpost.conditions || []);

  list.innerHTML = conditions.map(cond => {
    const isActive = activeConditions.has(cond.id);
    return `
      <div class="condition-item ${isActive ? 'active' : ''}" id="cond-${cond.id}" onclick="toggleCondition('${cond.id}')">
        <div class="condition-icon">${cond.icon || '⚕️'}</div>
        <div class="condition-info">
          <div class="condition-name">${cond.name_uk}</div>
          <div class="condition-desc">${cond.description_uk || ''}</div>
        </div>
        <label class="toggle-switch" onclick="event.stopPropagation()">
          <input type="checkbox" id="toggle-${cond.id}" ${isActive ? 'checked' : ''} onchange="toggleCondition('${cond.id}')">
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }).join('');
}

function toggleCondition(condId) {
  const conditions = new Set(State.blockpost.conditions || []);
  if (conditions.has(condId)) {
    conditions.delete(condId);
  } else {
    conditions.add(condId);
  }
  State.blockpost.conditions = [...conditions];

  // Оновлюємо UI
  const item = document.getElementById(`cond-${condId}`);
  const toggle = document.getElementById(`toggle-${condId}`);
  if (item) item.classList.toggle('active', conditions.has(condId));
  if (toggle) toggle.checked = conditions.has(condId);
}

async function saveBlockpost() {
  try {
    await apiRequest('/api/blockpost', 'POST', { conditions: State.blockpost.conditions });
    saveToLocalStorage();
    showToast(`🛡️ Збережено ${State.blockpost.conditions.length} обмежень`, 'success');
    // Скидаємо раціон бо змінились обмеження
    State.rationData = null;
    hideElement('ration-result');
    showElement('ration-empty');
  } catch (err) {
    saveToLocalStorage();
    showToast('💾 Збережено локально', 'info');
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

  document.getElementById('stat-city').textContent = p.city ? p.city.substring(0, 5) : '—';
  document.getElementById('stat-conditions').textContent = (bp.conditions || []).length;

  // Аватар (перша літера імені)
  const avatar = document.getElementById('client-avatar');
  if (p.name) {
    avatar.textContent = p.name.charAt(0).toUpperCase();
  } else {
    avatar.textContent = '🌿';
  }

  // Активні обмеження
  renderCardConditions();
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

  // Визначаємо домінантну Дошу
  const dominant = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a)[0];

  // Зберігаємо результат
  document.getElementById('input-dosha').value = dominant;
  State.profile.dosha_type = dominant;
  State.currentDosha = dominant;
  updateDoshaDisplay(dominant);
  updateHeader();
  closeQuiz();

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
document.addEventListener('DOMContentLoaded', init);
