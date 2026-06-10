"""
=====================================
АЮРВЕДА БОТ — Конвеєр (Pipeline)
=====================================
Оркестратор, що координує роботу всіх трьох роботів:
[Вхідний потік] → [Робот 1: Блокпост] → [Робот 2+3: Матриця+Душа] → [Результат]
"""

from loguru import logger
from services.storage import get_user_storage
from services.blockpost import get_blockpost
from services.ration_engine import get_ration_engine


async def run_ration_pipeline(
    user_id: int,
    soul_state: str = "balanced"
) -> dict:
    """
    Головна функція конвеєра. Запускає всіх трьох роботів.
    
    Args:
        user_id: Telegram user_id
        soul_state: ментальний стан з soul_states.json
    
    Returns:
        Повний результат раціону для рендеру у Web App
    """
    logger.info(f"[Pipeline] Запуск конвеєра для user_id={user_id}, стан={soul_state}")

    # --- ВХІДНИЙ ПОТІК ---
    # Зчитуємо персональний контекст користувача
    storage = get_user_storage(user_id)
    context = await storage.get_full_context()
    profile = context["profile"]
    blockpost_data = context["blockpost"]
    active_conditions = blockpost_data.get("conditions", [])

    # --- РОБОТ 1: МЕДИЧНИЙ БЛОКПОСТ ---
    blockpost = get_blockpost()
    engine = get_ration_engine()
    all_products = engine.get_all_products()

    safe_products, blocked_products = blockpost.filter_products(
        products=all_products,
        active_conditions=active_conditions
    )

    # --- РОБОТИ 2+3: МАТРИЦЯ + ДУШЕВНИЙ СИНЕРГІЗМ ---
    ration = engine.generate_ration(
        profile=profile,
        blockpost_data=blockpost_data,
        safe_products=safe_products,
        blocked_products=blocked_products,
        soul_state=soul_state
    )

    # Додаємо мета-дані профілю до відповіді
    ration["user_profile"] = {
        "name": profile.get("name", ""),
        "dosha_type": profile.get("dosha_type"),
        "has_profile": bool(profile),
        "active_conditions": active_conditions,
        "conditions_count": len(active_conditions)
    }

    # Зберігаємо згенерований раціон в папку користувача
    await storage.save_ration(ration)

    logger.info(f"[Pipeline] Конвеєр завершено: user_id={user_id}")
    return ration


async def get_api_data(user_id: int) -> dict:
    """
    Повертає повні дані для ініціалізації Web App.
    Включає профіль, блокпост та базову інформацію.
    """
    storage = get_user_storage(user_id)
    context = await storage.get_full_context()

    blockpost = get_blockpost()
    all_conditions = blockpost.get_all_conditions()

    return {
        "profile": context["profile"],
        "blockpost": context["blockpost"],
        "available_conditions": all_conditions,
        "has_profile": await storage.exists()
    }
