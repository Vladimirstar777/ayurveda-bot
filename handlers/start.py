"""
=====================================
АЮРВЕДА БОТ — Хендлер команди /start
=====================================
Обробляє першу взаємодію користувача з ботом.
"""

from aiogram import Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.utils.keyboard import InlineKeyboardBuilder
from loguru import logger
from config import WEBAPP_URL
from services.storage import get_user_storage

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

    # Перевіряємо чи є вже профіль
    storage = get_user_storage(user_id)
    has_profile = await storage.exists()
    profile = await storage.load_profile() if has_profile else {}

    # Формуємо вітальне повідомлення
    if has_profile and profile.get("name"):
        user_name = profile.get("name", user.first_name)
        greeting = (
            f"🙏 З поверненням, *{user_name}*!\n\n"
            f"Твій персональний Аюрведа-Радник готовий до роботи.\n"
            f"Натисни кнопку нижче, щоб отримати раціон на зараз ✨"
        )
    else:
        greeting = (
            f"🌿 *Namaste, {user.first_name}!*\n\n"
            f"Я — твій особистий *Аюрведа-Радник*.\n\n"
            f"Я підберу харчування саме для тебе на основі:\n"
            f"• 🧬 Твого типу Доші (Пракріті)\n"
            f"• ⏰ Часу доби та пори року\n"
            f"• 🏥 Твоїх медичних особливостей\n"
            f"• 💫 Твого ментального стану зараз\n\n"
            f"Для початку — відкрий додаток та заповни коротку анкету 👇"
        )

    webapp_url = f"{WEBAPP_URL}/webapp/"
    keyboard = get_main_keyboard(webapp_url)

    await message.answer(
        text=greeting,
        parse_mode="Markdown",
        reply_markup=keyboard
    )


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
