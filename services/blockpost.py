"""
=====================================
АЮРВЕДА БОТ — Робот 1: Медичний Блокпост
=====================================
Завдання: Жорстка медична фільтрація продуктів.
Якщо у користувача активний прапорець хвороби —
продукти-тригери ПОВНІСТЮ видаляються з раціону.
Безпека понад усе.
"""

import json
from pathlib import Path
from loguru import logger
from config import DATA_PATH


class MedicalBlockpost:
    """
    Робот 1 конвеєра: фільтрує продукти за медичними станами.
    
    Принцип: якщо продукт потрапляє в заблокований список
    для будь-якого активного медичного стану — він ВИКЛЮЧАЄТЬСЯ.
    """

    def __init__(self):
        self._conditions_db = None
        self._load_conditions()

    def _load_conditions(self):
        """Завантажує базу медичних станів"""
        conditions_file = DATA_PATH / "medical_conditions.json"
        try:
            with open(conditions_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            self._conditions_db = {c["id"]: c for c in data["conditions"]}
            logger.info(f"[Blockpost] Завантажено {len(self._conditions_db)} медичних станів")
        except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
            logger.error(f"[Blockpost] Помилка завантаження бази станів: {e}")
            self._conditions_db = {}

    def get_blocked_filters(self, active_conditions: list) -> dict:
        """
        Повертає зведений набір заблокованих категорій та тегів
        для всіх активних медичних станів користувача.
        
        Args:
            active_conditions: список id активних хвороб ['ulcer', 'diabetes']
        
        Returns:
            dict з blocked_categories та blocked_tags
        """
        blocked_categories = set()
        blocked_tags = set()
        active_details = []

        for condition_id in active_conditions:
            condition = self._conditions_db.get(condition_id)
            if not condition:
                logger.warning(f"[Blockpost] Невідомий стан: {condition_id}")
                continue

            blocked_categories.update(condition.get("blocked_categories", []))
            blocked_tags.update(condition.get("blocked_tags", []))
            active_details.append({
                "id": condition_id,
                "name_uk": condition["name_uk"],
                "icon": condition["icon"],
                "ayurveda_note": condition.get("ayurveda_note", "")
            })

        return {
            "blocked_categories": list(blocked_categories),
            "blocked_tags": list(blocked_tags),
            "active_conditions": active_details
        }

    def filter_products(self, products: list, active_conditions: list) -> tuple:
        """
        Фільтрує список продуктів через медичний блокпост.
        
        Args:
            products: список продуктів (dict з categories та tags)
            active_conditions: список id активних хвороб
        
        Returns:
            tuple: (safe_products, blocked_products)
            - safe_products: дозволені продукти
            - blocked_products: заблоковані продукти (з причиною блокування)
        """
        if not active_conditions:
            return products, []

        filters = self.get_blocked_filters(active_conditions)
        blocked_categories = set(filters["blocked_categories"])
        blocked_tags = set(filters["blocked_tags"])

        safe_products = []
        blocked_products = []

        for product in products:
            product_categories = set(product.get("categories", []))
            product_tags = set(product.get("tags", []))

            # Перевіряємо перетин з заблокованими категоріями
            blocking_categories = product_categories & blocked_categories
            # Перевіряємо перетин з заблокованими тегами
            blocking_tags = product_tags & blocked_tags

            if blocking_categories or blocking_tags:
                blocked_product = {**product, "blocked": True}

                # Додаємо пояснення чому заблокований
                reasons = []
                for cid in active_conditions:
                    cond = self._conditions_db.get(cid, {})
                    cond_blocked_cats = set(cond.get("blocked_categories", []))
                    cond_blocked_tags = set(cond.get("blocked_tags", []))
                    if (product_categories & cond_blocked_cats) or (product_tags & cond_blocked_tags):
                        reasons.append({
                            "condition_id": cid,
                            "condition_name": cond.get("name_uk", cid),
                            "condition_icon": cond.get("icon", "⚠️")
                        })

                blocked_product["block_reasons"] = reasons
                blocked_products.append(blocked_product)
            else:
                product_copy = {**product, "blocked": False}
                safe_products.append(product_copy)

        logger.info(
            f"[Blockpost] Фільтрація завершена: "
            f"дозволено={len(safe_products)}, заблоковано={len(blocked_products)}"
        )

        return safe_products, blocked_products

    def get_condition_info(self, condition_id: str) -> dict:
        """Повертає інформацію про медичний стан"""
        return self._conditions_db.get(condition_id, {})

    def get_all_conditions(self) -> list:
        """Повертає список всіх медичних станів для відображення в UI"""
        return list(self._conditions_db.values())


# Синглтон — один екземпляр для всього додатку
_blockpost_instance = None


def get_blockpost() -> MedicalBlockpost:
    global _blockpost_instance
    if _blockpost_instance is None:
        _blockpost_instance = MedicalBlockpost()
    return _blockpost_instance
