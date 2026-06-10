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
  restoreHabitsUI();
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
  
  // Update UI manually for performance
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

// ==========================
// ГЕНЕРАТОР СТРАВ
// ==========================
async function generateRecipes(mode = 'normal') {
  const states = State.currentSoulStates || [];
  if (states.length === 0) {
    showToast('⚠️ Оберіть хоча б один свій стан у вкладці "Раціон"', 'error');
    return;
  }

  const btnNormal = document.getElementById('recipe-generate-btn');
  const btnBachelor = document.getElementById('recipe-bachelor-btn');
  const resultsContainer = document.getElementById('recipe-results');
  
  const activeBtn = mode === 'bachelor' ? btnBachelor : btnNormal;
  const originalText = activeBtn.querySelector('.magic-btn-main').textContent;
  
  activeBtn.style.opacity = '0.7';
  activeBtn.querySelector('.magic-btn-main').textContent = 'Генерую...';
  
  // Доша для персоналізації
  const dosha = State.profile?.dosha_type || 'vata';
  
  // Імітація розумної генерації
  setTimeout(() => {
    activeBtn.style.opacity = '1';
    activeBtn.querySelector('.magic-btn-main').textContent = originalText;
    
    let htmlContent = '';
    
    if (mode === 'bachelor') {
      // Режим Холостяка (з того, що є)
      htmlContent = `
        <div class="product-card">
          <div class="product-card-header">
            <div class="product-emoji">🍳</div>
            <div class="product-info">
              <div class="product-name">Сковорода-рятівниця (Холостяк)</div>
            </div>
          </div>
          <div class="product-card-body-inner" style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:0;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Інгредієнти (з АТБ/Сільпо):</strong> 3 яйця, 1 помідор, пів огірка, оливкова олія, кріп, дрібка чорного перцю.</div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Приготування:</strong> Нарізати помідор, злегка припустити на олії. Вбити яйця. Зверху покришити кріп та огірок вприкуску. (5 хв)</div>
            <div style="font-size:12px; color:var(--gold-primary);"><strong>Аюрведа (${dosha}):</strong> ${dosha === 'pitta' ? 'Яйця трохи гріють, але свіжий огірок і кріп ідеально збалансують вогонь Піти.' : 'Тепла, масляниста страва відмінно заспокоює Вату та насичує Капху без важкості.'}</div>
          </div>
        </div>
        
        <div class="product-card mt-sm">
          <div class="product-card-header">
            <div class="product-emoji">🍝</div>
            <div class="product-info">
              <div class="product-name">Швидка Паста з Овочами</div>
            </div>
          </div>
          <div class="product-card-body-inner" style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:0;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Інгредієнти:</strong> Макарони (тверді сорти), масло/олія, зубчик часнику, сир (будь-який твердий), свіжа зелень.</div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Приготування:</strong> Відварити макарони. Розігріти олію з роздавленим часником (потім дістати його), перемішати з пастою, посипати сиром.</div>
            <div style="font-size:12px; color:var(--gold-primary);"><strong>Аюрведа (${dosha}):</strong> ${dosha === 'kapha' ? 'Додайте більше чорного перцю для розпалювання вогню травлення.' : 'Достатньо поживно, щоб відновити сили після робочого дня.'}</div>
          </div>
        </div>
      `;
    } else {
      // Нормальний режим (Локалізована Аюрведа)
      htmlContent = `
        <div class="product-card">
          <div class="product-card-header">
            <div class="product-emoji">🥣</div>
            <div class="product-info">
              <div class="product-name">Українське Кічарі (Локалізовано)</div>
            </div>
          </div>
          <div class="product-card-body-inner" style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:0;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Інгредієнти:</strong> Гречка (оригінал: рис басматі), Сочевиця (оригінал: маш), Вершкове масло (оригінал: гхі), морква, куркума.</div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Приготування:</strong> Промити гречку та сочевицю. Обсмажити натерті овочі з куркумою в маслі. Змішати, залити водою, варити 20 хв.</div>
            <div style="font-size:12px; color:var(--gold-primary);"><strong>Аюрведа (${dosha}):</strong> Найкращий детокс. Гречка краще підходить для нашого клімату, а куркума знімає запалення.</div>
          </div>
        </div>
        
        <div class="product-card mt-sm">
          <div class="product-card-header">
            <div class="product-emoji">🥗</div>
            <div class="product-info">
              <div class="product-name">Теплий салат з гарбузом</div>
            </div>
          </div>
          <div class="product-card-body-inner" style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:0;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Інгредієнти:</strong> Запечений гарбуз, волоські горіхи, оливкова олія (оригінал: кунжутна), листовий салат.</div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Приготування:</strong> Нарізати кубиками гарбуз, запекти (15 хв). Змішати з салатом, посипати горіхами, заправити олією.</div>
            <div style="font-size:12px; color:var(--gold-primary);"><strong>Аюрведа (${dosha}):</strong> ${dosha === 'vata' ? 'Теплий солодкуватий гарбуз — ідеальні ліки для заспокоєння нервової Вати.' : 'Легка та поживна вечеря, що не навантажує шлунок перед сном.'}</div>
          </div>
        </div>
        
        <div class="product-card mt-sm">
          <div class="product-card-header">
            <div class="product-emoji">☕</div>
            <div class="product-info">
              <div class="product-name">Адаптогенний Напій</div>
            </div>
          </div>
          <div class="product-card-body-inner" style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:0;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Інгредієнти:</strong> Відвар шипшини (оригінал: трифала), мед, кориця.</div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;"><strong>Приготування:</strong> Заварити шипшину в термосі. Перед вживанням додати дрібку кориці та ложку меду (в теплу, не гарячу воду).</div>
            <div style="font-size:12px; color:var(--gold-primary);"><strong>Аюрведа (${dosha}):</strong> Локальна заміна традиційним аюрведичним травам. Дає потужний вітамін С та знімає втому.</div>
          </div>
        </div>
      `;
    }
    
    resultsContainer.innerHTML = htmlContent;
    resultsContainer.classList.remove('hidden');
    showToast(`✅ Рецепти (${mode === 'bachelor' ? 'Холостяк' : 'Локальні'}) згенеровано!`, 'success');
  }, 1500);
}

// ==========================
// AI ASSISTANT CHAT
// ==========================
if (!State.aiHistory) State.aiHistory = [];

function toggleAssistant() {
  const chat = document.getElementById('ai-assistant-chat');
  chat.classList.toggle('hidden');
  
  if (!chat.classList.contains('hidden') && State.aiHistory.length === 0) {
    const name = State.profile?.name ? State.profile.name.split(' ')[0] : 'Друже';
    const msg = `Намасте, ${name}! Я твій Аюрведичний ШІ-Асистент. Бачу твій стан та медичний архів. Чим можу допомогти сьогодні?`;
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
    setTimeout(() => addAiMessage('У мене все круто! Мої сервери заряджені праною, і я готовий працювати з тобою скільки завгодно. А як твій настрій?', 'bot'), 600);
    return;
  }
  
  // 3. Патерн: Пока
  if (lowerText.includes('пока') || lowerText.includes('бувай') || lowerText.includes('до побачення') || lowerText.includes('до зустрічі')) {
    setTimeout(() => addAiMessage('Спасибі, що звернувся. Бережи себе та залишайся в балансі! Намасте 🙏', 'bot'), 600);
    return;
  }
  
  // 4. Патерн: Мені погано
  if (lowerText.includes('погано') || lowerText.includes('болить') || lowerText.includes('тривога')) {
    setTimeout(() => triggerPanicMode(false), 600);
    return;
  }
  
  // 5. Контекстна пам'ять (останні повідомлення)
  let contextReply = '';
  const lastUserMsg = State.aiHistory.slice(-3, -1).find(m => m.role === 'user');
  
  if (lastUserMsg) {
    contextReply = `Зважаючи на те, що ти раніше писав "${lastUserMsg.text.substring(0, 20)}...", я б порадив тобі дотримуватися спокою. `;
  }
  
  setTimeout(() => {
    addAiMessage(`${contextReply}Я проаналізував твій запит з огляду на твою Дошу (${State.profile?.dosha_type || 'Вата'}). Рекомендую зараз звернути увагу на теплі напої та відпочинок.`, 'bot');
  }, 1000);
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
  State.aiHistory.push({ role: sender, text: text });
  
  const messages = document.getElementById('ai-chat-messages');
  const msgEl = document.createElement('div');
  msgEl.className = `ai-message ${sender}`;
  msgEl.innerText = text;
  messages.appendChild(msgEl);
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
