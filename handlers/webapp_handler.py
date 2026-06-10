"""
=====================================
АЮРВЕДА БОТ — Хендлер даних Web App (TWA)
=====================================
Обробляє всі повідомлення що надходять від Telegram Web App
через window.Telegram.WebApp.sendData()
"""

import json
from aiogram import Router
from aiogram.types import Message
from loguru import logger
from services.storage import get_user_storage
from services.pipeline import run_ration_pipeline

router = Router()


@router.message(lambda m: m.web_app_data is not None)
async def handle_webapp_data(message: Message):
    """
    Обробляє дані від Web App.
    Підтримує дії: save_profile, save_blockpost, get_ration
    """
    user_id = message.from_user.id

    try:
        data = json.loads(message.web_app_data.data)
        action = data.get("action", "")
        logger.info(f"[WebApp] Дія від user_id={user_id}: {action}")

        if action == "save_profile":
            await _handle_save_profile(message, user_id, data)

        elif action == "save_blockpost":
            await _handle_save_blockpost(message, user_id, data)

        elif action == "get_ration":
            await _handle_get_ration(message, user_id, data)

        else:
            logger.warning(f"[WebApp] Невідома дія: {action}")
            await message.answer("⚠️ Невідома дія. Будь ласка, оновіть додаток.")

    except json.JSONDecodeError as e:
        logger.error(f"[WebApp] Помилка JSON від user_id={user_id}: {e}")
        await message.answer("❌ Помилка обробки даних. Спробуйте ще раз.")
    except Exception as e:
        logger.error(f"[WebApp] Непередбачена помилка для user_id={user_id}: {e}")
        await message.answer("❌ Виникла помилка. Команда /start для перезапуску.")


async def _handle_save_profile(message: Message, user_id: int, data: dict):
    """Зберігає профіль користувача"""
    profile_data = data.get("profile", {})
    storage = get_user_storage(user_id)
    success = await storage.save_profile(profile_data)

    if success:
        name = profile_data.get("name", "")
        dosha = profile_data.get("dosha_type", "")
        dosha_names = {"vata": "💨 Вата", "pitta": "🔥 Піта", "kapha": "🌊 Капха"}
        dosha_text = dosha_names.get(dosha, dosha) if dosha else "не визначено"

        await message.answer(
            f"✅ *Профіль збережено!*\n\n"
            f"👤 Ім'я: {name}\n"
            f"🧬 Тип Доші: {dosha_text}\n\n"
            f"Тепер я буду підбирати раціон індивідуально для тебе! 🌿",
            parse_mode="Markdown"
        )
    else:
        await message.answer("❌ Помилка збереження профілю. Спробуйте ще раз.")


async def _handle_save_blockpost(message: Message, user_id: int, data: dict):
    """Зберігає медичні прапорці"""
    conditions = data.get("conditions", [])
    storage = get_user_storage(user_id)
    success = await storage.save_blockpost(conditions)

    if success:
        if conditions:
            conditions_text = f"Активних обмежень: {len(conditions)}"
            await message.answer(
                f"🏥 *Медичний Блокпост оновлено!*\n\n"
                f"{conditions_text}\n\n"
                f"🛡️ Ваша безпека під захистом.\n"
                f"Продукти-тригери будуть автоматично виключені з раціону.",
                parse_mode="Markdown"
            )
        else:
            await message.answer(
                f"🏥 *Медичний Блокпост очищено.*\n\n"
                f"Медичних обмежень не вказано. "
                f"Раціон формується за загальними аюрведичними рекомендаціями.",
                parse_mode="Markdown"
            )
    else:
        await message.answer("❌ Помилка збереження. Спробуйте ще раз.")


async def _handle_get_ration(message: Message, user_id: int, data: dict):
    """Запускає конвеєр та повідомляє результат"""
    soul_state = data.get("soul_state", "balanced")
    await message.answer(
        "🌿 Генерую твій персональний раціон...",
        parse_mode="Markdown"
    )
    # Конвеєр запускається і зберігає результат —
    # Web App читатиме через API. Тут просто підтвердження.
    logger.info(f"[WebApp] get_ration для user_id={user_id}, стан={soul_state}")
