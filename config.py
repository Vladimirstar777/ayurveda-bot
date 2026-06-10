"""
=====================================
АЮРВЕДА БОТ — Конфігурація системи
=====================================
Завантажує всі налаштування з .env файлу
та надає їх усім модулям проєкту.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Завантажуємо .env файл
load_dotenv()

# =========================
# БАЗОВІ ШЛЯХИ ПРОЄКТУ
# =========================
BASE_DIR = Path(__file__).parent
STORAGE_PATH = Path(os.getenv("STORAGE_PATH", "./storage"))
DATA_PATH = BASE_DIR / "data"
WEBAPP_PATH = BASE_DIR / "webapp"

# Створюємо папку сховища якщо не існує
STORAGE_PATH.mkdir(parents=True, exist_ok=True)

# =========================
# TELEGRAM НАЛАШТУВАННЯ
# =========================
BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")
WEBAPP_URL: str = os.getenv("WEBAPP_URL", "http://localhost:8080")
BOT_MODE: str = os.getenv("BOT_MODE", "polling")  # webhook або polling
WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "ayurveda_secret_2026")
WEBHOOK_PATH = "/webhook"

# =========================
# СЕРВЕР НАЛАШТУВАННЯ
# =========================
PORT: int = int(os.getenv("PORT", 8080))
HOST: str = "0.0.0.0"

# =========================
# РЕЖИМ РОЗРОБКИ
# =========================
DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"

# =========================
# АЮРВЕДА КОНСТАНТИ
# =========================

# Часові зони Дош (години доби)
DOSHA_TIME_ZONES = {
    "kapha": {
        "morning": (6, 10),    # 06:00 - 10:00 — Капха-ранок
        "evening": (18, 22),   # 18:00 - 22:00 — Капха-вечір
    },
    "pitta": {
        "midday": (10, 14),    # 10:00 - 14:00 — Піта-полудень
        "midnight": (22, 2),   # 22:00 - 02:00 — Піта-ніч
    },
    "vata": {
        "afternoon": (14, 18), # 14:00 - 18:00 — Вата-полудень
        "dawn": (2, 6),        # 02:00 - 06:00 — Вата-світанок
    }
}

# Часи прийому їжі
MEAL_TIMES = {
    "breakfast": (6, 10),    # Сніданок
    "lunch": (10, 14),       # Обід
    "snack": (14, 17),       # Перекус
    "dinner": (17, 20),      # Вечеря
    "light_snack": (20, 22), # Легкий вечірній перекус
}

# Сезони (для Етапу 3 — Аюрведа-Матриця)
SEASONS = {
    "spring": [3, 4, 5],     # Весна — Капха-сезон
    "summer": [6, 7, 8],     # Літо — Піта-сезон
    "autumn": [9, 10, 11],   # Осінь — Вата-сезон
    "winter": [12, 1, 2],    # Зима — Вата/Капха-сезон
}

# Медичні стани Блокпосту
MEDICAL_CONDITIONS = [
    "ulcer",          # Виразка
    "gastritis",      # Гастрит
    "diabetes",       # Діабет
    "hypertension",   # Гіпертонія
    "thyroid",        # Проблеми з щитоподібною залозою
    "kidney_stones",  # Камені в нирках
    "liver_disease",  # Захворювання печінки
    "heart_disease",  # Серцево-судинні захворювання
    "lactose",        # Непереносимість лактози
    "gluten",         # Целіакія/непереносимість глютену
]

# Перевірка обов'язкових налаштувань
if not BOT_TOKEN:
    print("⚠️  УВАГА: BOT_TOKEN не встановлено! Додайте токен у файл .env")
