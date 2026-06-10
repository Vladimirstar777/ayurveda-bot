"""
=====================================
АЮРВЕДА БОТ — Хендлер команди /start
=====================================
Обробляє першу взаємодію користувача з ботом.
"""

from aiogram import Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton, ReplyKeyboardMarkup, KeyboardButton, ReplyKeyboardRemove
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder
from loguru import logger
from config import WEBAPP_URL
from services.storage import get_user_storage
import json

router = Router()


def get_main_keyboard(webapp_url: str) -> InlineKeyboardMarkup:
    """Головна клавіатура з кнопкою Web App"""
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(
            text="🌿 Відкрити Аюрведа-Радника",
            web_app=WebAppInfo(url=webapp_url)
        )
    )
    builder.row(
        InlineKeyboardButton(text="📖 Про бота", callback_data="about"),
        InlineKeyboardButton(text="❓ Допомога", callback_data="help")
    )
    builder.row(
        InlineKeyboardButton(
            text="👑 Адмін Панель",
            web_app=WebAppInfo(url=webapp_url + "admin.html")
        )
    )
    return builder.as_markup()


@router.message(CommandStart())
async def cmd_start(message: Message):
    """Обробляє команду /start — вхід у бота"""
    user = message.from_user
    user_id = user.id

    logger.info(f"[Start] Новий користувач: {user_id} ({user.full_name})")

    storage = get_user_storage(user_id)
    has_profile = await storage.exists()
    profile = await storage.load_profile() if has_profile else {}

    # 1. Якщо профіль є і ми маємо телефон/дозвіл
    if has_profile and profile.get("phone_verified"):
        user_name = profile.get("name", user.first_name)
        greeting = (
            f"🙏 З поверненням, *{user_name}*!\n\n"
            f"Твій безпечний Аюрведа-профіль завантажено. Всі дані захищені.\n"
            f"Натисни кнопку нижче, щоб відкрити додаток 👇"
        )
        keyboard = get_main_keyboard(f"{WEBAPP_URL}/webapp/")
        await message.answer(text=greeting, parse_mode="Markdown", reply_markup=keyboard)
        return

    # 2. Якщо профілю немає або телефон не підтверджено — просимо контакт
    greeting = (
        f"🌿 *Namaste, {user.first_name}!*\n\n"
        f"Для створення захищеного профілю, який ніколи не видалиться, та безпечного зберігання твоїх медичних аналізів, "
        f"будь ласка, підтвердь свій номер телефону.\n\n"
        f"Натисни кнопку нижче 👇"
    )
    
    kb = ReplyKeyboardBuilder()
    kb.button(text="📱 Підтвердити номер телефону", request_contact=True)
    
    await message.answer(
        text=greeting,
        parse_mode="Markdown",
        reply_markup=kb.as_markup(resize_keyboard=True, one_time_keyboard=True)
    )

@router.message(lambda message: message.contact is not None)
async def handle_contact(message: Message):
    """Обробляє отриманий номер телефону"""
    user = message.from_user
    user_id = user.id
    contact = message.contact

    if contact.user_id != user_id:
        await message.answer("Будь ласка, надішліть саме ваш номер телефону, використовуючи кнопку меню.")
        return

    storage = get_user_storage(user_id)
    profile = await storage.load_profile()
    profile["phone"] = contact.phone_number
    profile["phone_verified"] = True
    profile["name"] = user.first_name
    await storage.save_profile(profile)

    success_msg = (
        f"✅ Авторизація успішна!\n"
        f"Твій акаунт надійно захищено. Відтепер твої медичні картки та фотографії будуть зберігатися безпечно і відновлюватися на будь-якому пристрої.\n\n"
        f"Відкрий Аюрведа-Радника 👇"
    )
    
    keyboard = get_main_keyboard(f"{WEBAPP_URL}/webapp/")
    
    # Видаляємо reply клавіатуру і надсилаємо інлайн
    await message.answer("Завантаження профілю...", reply_markup=ReplyKeyboardRemove())
    await message.answer(text=success_msg, parse_mode="Markdown", reply_markup=keyboard)


@router.message(Command("ration"))
async def cmd_ration(message: Message):
    """Команда /ration — швидкий доступ до раціону"""
    webapp_url = f"{WEBAPP_URL}/webapp/"
    keyboard = get_main_keyboard(webapp_url)

    await message.answer(
        text="🌿 *Аюрведа-Раціон*\n\nВідкрий додаток для персонального раціону на зараз:",
        parse_mode="Markdown",
        reply_markup=keyboard
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    """Команда /help — довідка"""
    help_text = (
        "📖 *Як користуватися ботом:*\n\n"
        "1️⃣ Натисни *«Відкрити Аюрведа-Радника»*\n"
        "2️⃣ У вкладці *«Профіль»* — заповни анкету\n"
        "3️⃣ У вкладці *«Здоров'я»* — відзнач медичні особливості\n"
        "4️⃣ На головній — натисни *«Підібрати раціон»*\n\n"
        "*Команди:*\n"
        "/start — Головне меню\n"
        "/ration — Відкрити раціон\n"
        "/help — Ця довідка\n\n"
        "🙏 Нехай їжа буде твоїм ліком!"
    )
    webapp_url = f"{WEBAPP_URL}/webapp/"
    keyboard = get_main_keyboard(webapp_url)

    await message.answer(
        text=help_text,
        parse_mode="Markdown",
        reply_markup=keyboard
    )
