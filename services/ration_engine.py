"""
=====================================
АЮРВЕДА БОТ — Роботи 2 і 3: Двигун Раціону
=====================================
Робот 2: Матрична адаптація (вік × сезон × Доша)
Робот 3: Душевний синергізм (ментальні стани)
"""

import json
from datetime import date, datetime
from pathlib import Path
from loguru import logger
from config import DATA_PATH


# ==========================
# КОЕФІЦІЄНТИ ВІКОВОГО ПЕРІОДУ (Робот 2)
# ==========================
AGE_COEFFICIENTS = {
    # (вік_від, вік_до): {vata_mod, pitta_mod, kapha_mod}
    (0, 16):    {"vata": 0.0, "pitta": 0.0, "kapha": 0.3},   # Дитинство — Капха
    (17, 35):   {"vata": 0.0, "pitta": 0.2, "kapha": 0.0},   # Молодість — Піта
    (36, 55):   {"vata": 0.0, "pitta": 0.1, "kapha": 0.0},   # Зрілість — Піта/Вата
    (56, 75):   {"vata": 0.3, "pitta": 0.0, "kapha": 0.0},   # Зрілій вік — Вата
    (76, 120):  {"vata": 0.5, "pitta": 0.0, "kapha": 0.0},   # Літній вік — Вата
}

# Нейтральний коефіцієнт якщо дата народження невідома
NEUTRAL_AGE_COEFF = {"vata": 0.0, "pitta": 0.0, "kapha": 0.0}

# Коефіцієнти сезону
SEASON_COEFFICIENTS = {
    "spring": {"vata": 0.0, "pitta": 0.0, "kapha": 0.3},  # Капха-сезон
    "summer": {"vata": 0.0, "pitta": 0.3, "kapha": 0.0},  # Піта-сезон
    "autumn": {"vata": 0.3, "pitta": 0.0, "kapha": 0.0},  # Вата-сезон
    "winter": {"vata": 0.3, "pitta": 0.0, "kapha": 0.0},  # Вата-сезон
}


class RationEngine:
    """
    Двигун генерації персонального аюрведичного раціону.
    Реалізує Роботи 2 та 3 конвеєра.
    """

    def __init__(self):
        self._products_db = None
        self._time_db = None
        self._soul_db = None
        self._load_databases()

    def _load_databases(self):
        """Завантажує всі необхідні бази даних"""
        try:
            with open(DATA_PATH / "products.json", "r", encoding="utf-8") as f:
                data = json.load(f)
            self._products_db = data["products"]

            with open(DATA_PATH / "time_recommendations.json", "r", encoding="utf-8") as f:
                self._time_db = json.load(f)

            with open(DATA_PATH / "soul_states.json", "r", encoding="utf-8") as f:
                self._soul_db = json.load(f)

            logger.info(f"[RationEngine] Завантажено {len(self._products_db)} продуктів")
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.error(f"[RationEngine] Помилка завантаження БД: {e}")
            self._products_db = []
            self._time_db = {}
            self._soul_db = {}

    def get_current_season(self, month: int = None) -> str:
        """Визначає поточний сезон за місяцем"""
        if month is None:
            month = datetime.now().month
        seasons = self._time_db.get("seasons", {})
        for season_id, season_data in seasons.items():
            if month in season_data.get("months", []):
                return season_id
        return "autumn"  # дефолтний сезон

    def get_current_meal_period(self, hour: int = None) -> dict:
        """Визначає поточний тип прийому їжі за годиною"""
        if hour is None:
            hour = datetime.now().hour

        periods = self._time_db.get("meal_periods", {})

        # Визначаємо відповідний період
        for period_id, period_data in periods.items():
            hours = period_data.get("hours", [])
            if len(hours) >= 2:
                start, end = hours[0], hours[1]
                if start <= hour < end:
                    return {**period_data, "id": period_id}

        # Дефолт — обід
        return periods.get("lunch", {"id": "lunch", "name_uk": "Обід", "emoji": "☀️"})

    def get_age_coefficient(self, birth_date_str: str = None) -> dict:
        """
        Робот 2: Визначає коефіцієнт вікового періоду.
        Якщо дата невідома — повертає нейтральний коефіцієнт (не руйнує систему).
        """
        if not birth_date_str:
            return NEUTRAL_AGE_COEFF

        try:
            birth_date = datetime.fromisoformat(birth_date_str).date()
            today = date.today()
            age = today.year - birth_date.year - (
                (today.month, today.day) < (birth_date.month, birth_date.day)
            )

            for (age_from, age_to), coeff in AGE_COEFFICIENTS.items():
                if age_from <= age <= age_to:
                    return coeff

            return NEUTRAL_AGE_COEFF
        except (ValueError, TypeError) as e:
            logger.warning(f"[RationEngine] Помилка розбору дати: {birth_date_str} — {e}")
            return NEUTRAL_AGE_COEFF

    def calculate_dosha_scores(
        self,
        dosha_type: str = None,
        birth_date: str = None,
        season: str = None,
        soul_state: str = None
    ) -> dict:
        """
        Робот 2: Обчислює фінальні бали для кожної Доші.
        
        Формула: базовий_бал × (1 + коефіцієнт_віку + коефіцієнт_сезону)
        """
        # Базові бали Пракріті (Доші користувача)
        base_scores = {"vata": 1.0, "pitta": 1.0, "kapha": 1.0}

        # Якщо відомий тип Доші — підсилюємо відповідну Дошу
        if dosha_type in ("vata", "pitta", "kapha"):
            base_scores[dosha_type] = 2.0

        # Коефіцієнт віку
        age_coeff = self.get_age_coefficient(birth_date)

        # Коефіцієнт сезону
        current_season = season or self.get_current_season()
        season_coeff = SEASON_COEFFICIENTS.get(current_season, NEUTRAL_AGE_COEFF)

        # Фінальні бали
        final_scores = {}
        for dosha in ("vata", "pitta", "kapha"):
            final_scores[dosha] = base_scores[dosha] * (
                1.0 + age_coeff.get(dosha, 0) + season_coeff.get(dosha, 0)
            )

        return final_scores

    def score_product(
        self,
        product: dict,
        dosha_scores: dict,
        meal_period_id: str,
        soul_state: str = None,
        current_season: str = None
    ) -> float:
        """
        Обчислює релевантність продукту для поточного контексту.
        Вищий бал = більш рекомендований.
        """
        score = 0.0

        # 1. Вплив на Доші (основний бал)
        dosha_effect = product.get("dosha_effect", {})
        for dosha, dosha_score in dosha_scores.items():
            effect = dosha_effect.get(dosha, 0)
            # Продукт що знижує домінантну Дошу отримує вищий бал
            score += effect * (-dosha_score * 0.5)

        # 2. Відповідність часу прийому їжі
        meal_times = product.get("meal_time", [])
        if meal_period_id in meal_times or "all" in meal_times or "any" in meal_times:
            score += 2.0

        # 3. Відповідність сезону
        seasons = product.get("season", [])
        if current_season and (current_season in seasons or "all" in seasons):
            score += 1.0

        # 4. Робот 3: Душевний синергізм
        if soul_state:
            soul_data = self._soul_db.get("states", {}).get(soul_state, {})
            boosted_tags = set(soul_data.get("boosted_tags", []))
            reduced_tags = set(soul_data.get("reduced_tags", []))
            product_tags = set(product.get("tags", []))

            score += len(product_tags & boosted_tags) * 1.5
            score -= len(product_tags & reduced_tags) * 1.5

            # Пріоритетні продукти при душевному стані
            priority_products = soul_data.get("priority_products", [])
            if product.get("id") in priority_products:
                score += 3.0

        # 5. Базовий бонус за sattvic продукти
        if "sattvic" in product.get("tags", []):
            score += 0.5

        return score

    def generate_ration(
        self,
        profile: dict,
        blockpost_data: dict,
        safe_products: list,
        blocked_products: list,
        soul_state: str = "balanced",
        current_hour: int = None,
        current_month: int = None
    ) -> dict:
        """
        Головна функція: генерує персональний раціон.
        
        Returns:
            dict з рекомендованими та заблокованими продуктами
        """
        # Поточний контекст
        if current_hour is None:
            current_hour = datetime.now().hour
        if current_month is None:
            current_month = datetime.now().month

        current_season = self.get_current_season(current_month)
        meal_period = self.get_current_meal_period(current_hour)

        # Доша-бали (Робот 2)
        dosha_type = profile.get("dosha_type")
        birth_date = profile.get("birth_date")

        dosha_scores = self.calculate_dosha_scores(
            dosha_type=dosha_type,
            birth_date=birth_date,
            season=current_season,
            soul_state=soul_state
        )

        # Фільтруємо продукти за часом прийому їжі та сезоном
        meal_period_id = meal_period.get("id", "lunch")
        time_recommended = self._time_db.get("meal_periods", {}).get(meal_period_id, {}).get("recommended_ids", [])

        # Скоруємо та сортуємо продукти (Робот 3 вбудований у score_product)
        scored_products = []
        for product in safe_products:
            # Пріоритет продуктам рекомендованим для цього часу
            base_score = self.score_product(
                product=product,
                dosha_scores=dosha_scores,
                meal_period_id=meal_period_id,
                soul_state=soul_state,
                current_season=current_season
            )
            # Бонус якщо в рекомендованих для цього часу
            if product.get("id") in time_recommended:
                base_score += 2.0

            scored_products.append({**product, "relevance_score": round(base_score, 2)})

        # Сортуємо за балом (найкращі — першими)
        scored_products.sort(key=lambda x: x["relevance_score"], reverse=True)

        # Отримуємо ментальний стан
        soul_data = self._soul_db.get("states", {}).get(soul_state, {})

        # Формуємо результат
        result = {
            "meal_period": meal_period,
            "current_season": {
                "id": current_season,
                **self._time_db.get("seasons", {}).get(current_season, {})
            },
            "dosha_scores": dosha_scores,
            "dominant_dosha": max(dosha_scores, key=dosha_scores.get),
            "soul_state": {
                "id": soul_state,
                **soul_data
            },
            "recommended_products": scored_products[:20],  # Топ-20 рекомендованих
            "blocked_products": blocked_products[:10],      # До 10 заблокованих
            "total_recommended": len(scored_products),
            "total_blocked": len(blocked_products),
            "tip_uk": soul_data.get("tip_uk", meal_period.get("tip_uk", "")),
            "generated_at": datetime.now().isoformat()
        }

        logger.info(
            f"[RationEngine] Раціон згенеровано: "
            f"рекомендовано={len(scored_products)}, заблоковано={len(blocked_products)}, "
            f"доша={result['dominant_dosha']}, стан={soul_state}"
        )

        return result

    def get_all_products(self) -> list:
        """Повертає всі продукти з бази"""
        return self._products_db or []


# Синглтон
_engine_instance = None


def get_ration_engine() -> RationEngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = RationEngine()
    return _engine_instance
