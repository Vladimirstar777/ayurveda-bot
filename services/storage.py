"""
=====================================
АЮРВЕДА БОТ — Сервіс сховища даних (SQLModel)
=====================================
Підтримує асинхронну роботу з двома БД:
- Локальна SQLite (для розробки)
- Хмарна PostgreSQL (для деплою на Render)
"""

import os
import json
from datetime import datetime
from loguru import logger
from pathlib import Path

from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker

from config import STORAGE_PATH
from services.models import User, Ration

# =====================================
# НАЛАШТУВАННЯ ДВИГУНА БАЗИ ДАНИХ
# =====================================
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Заміна протоколу для асинхронного PostgreSQL драйвера asyncpg
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    logger.info("[Storage] Використовується хмарна база PostgreSQL")
    engine = create_async_engine(DATABASE_URL, echo=False)
else:
    # Локальна SQLite база даних
    DB_FILE = STORAGE_PATH / "ayurveda.db"
    logger.info(f"[Storage] Використовується локальна база SQLite: {DB_FILE}")
    engine = create_async_engine(f"sqlite+aiosqlite:///{DB_FILE}", echo=False)

# Фабрика асинхронних сесій
async_session = sessionmaker(
    engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)


async def init_db():
    """Ініціалізація бази даних та створення таблиць"""
    STORAGE_PATH.mkdir(parents=True, exist_ok=True)
    try:
        async with engine.begin() as conn:
            # Створення таблиць
            await conn.run_sync(SQLModel.metadata.create_all)
        logger.info("[Storage] База даних успішно ініціалізована.")
    except Exception as e:
        logger.error(f"[Storage] Помилка ініціалізації бази даних: {e}")
        raise e


class UserStorage:
    """Сховище даних конкретного користувача (SQLModel)"""
    
    def __init__(self, user_id: int):
        self.user_id = user_id

    async def _ensure_user_exists(self, session: AsyncSession) -> User:
        """Перевіряє, чи існує запис користувача, і створює його за потреби"""
        user = await session.get(User, self.user_id)
        if not user:
            now = datetime.now().isoformat()
            user = User(
                user_id=self.user_id,
                profile_data="{}",
                blockpost_data='{"conditions": []}',
                admin_notes="",
                manual_dosha="",
                created_at=now,
                updated_at=now
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
        return user

    async def exists(self) -> bool:
        """Перевіряє чи є заповнений профіль у користувача"""
        try:
            async with async_session() as session:
                user = await session.get(User, self.user_id)
                if user and user.profile_data and user.profile_data != '{}':
                    return True
        except Exception as e:
            logger.error(f"[Storage] Помилка перевірки exists для {self.user_id}: {e}")
        return False

    async def load_profile(self) -> dict:
        """Завантажує профіль користувача"""
        try:
            async with async_session() as session:
                user = await session.get(User, self.user_id)
                if user and user.profile_data:
                    try:
                        return json.loads(user.profile_data)
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            logger.error(f"[Storage] Помилка завантаження профілю {self.user_id}: {e}")
        return {}

    async def save_profile(self, data: dict) -> bool:
        """Зберігає профіль користувача (злиття з існуючим)"""
        try:
            async with async_session() as session:
                user = await self._ensure_user_exists(session)
                existing = {}
                if user.profile_data:
                    try:
                        existing = json.loads(user.profile_data)
                    except json.JSONDecodeError:
                        pass
                
                # Оновлюємо профіль новими даними
                existing.update(data)
                now = datetime.now().isoformat()
                existing["updated_at"] = now
                if "created_at" not in existing:
                    existing["created_at"] = now
                    
                user.profile_data = json.dumps(existing, ensure_ascii=False)
                user.updated_at = now
                
                session.add(user)
                await session.commit()
            logger.info(f"[Storage] Профіль збережено: user_id={self.user_id}")
            return True
        except Exception as e:
            logger.error(f"[Storage] Помилка збереження профілю {self.user_id}: {e}")
            return False

    async def load_blockpost(self) -> dict:
        """Завантажує медичні прапорці користувача"""
        try:
            async with async_session() as session:
                user = await session.get(User, self.user_id)
                if user and user.blockpost_data:
                    try:
                        return json.loads(user.blockpost_data)
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            logger.error(f"[Storage] Помилка завантаження блокпосту {self.user_id}: {e}")
        return {"conditions": [], "updated_at": None}

    async def save_blockpost(self, conditions: list) -> bool:
        """Зберігає список активних медичних станів"""
        try:
            now = datetime.now().isoformat()
            data = {"conditions": conditions, "updated_at": now}
            json_data = json.dumps(data, ensure_ascii=False)
            
            async with async_session() as session:
                user = await self._ensure_user_exists(session)
                user.blockpost_data = json_data
                user.updated_at = now
                
                session.add(user)
                await session.commit()
            logger.info(f"[Storage] Блокпост збережено: user_id={self.user_id}, conditions={conditions}")
            return True
        except Exception as e:
            logger.error(f"[Storage] Помилка збереження блокпосту {self.user_id}: {e}")
            return False

    async def save_ration(self, ration_data: dict) -> bool:
        """Зберігає згенерований раціон"""
        try:
            now = datetime.now().isoformat()
            ration_data["generated_at"] = now
            json_data = json.dumps(ration_data, ensure_ascii=False)
            
            async with async_session() as session:
                await self._ensure_user_exists(session)
                ration = Ration(
                    user_id=self.user_id,
                    ration_data=json_data,
                    generated_at=now
                )
                session.add(ration)
                await session.commit()
            logger.info(f"[Storage] Раціон збережено: user_id={self.user_id}")
            return True
        except Exception as e:
            logger.error(f"[Storage] Помилка збереження раціону {self.user_id}: {e}")
            return False

    async def get_full_context(self) -> dict:
        """Повертає повний контекст користувача для конвеєра"""
        profile = await self.load_profile()
        blockpost = await self.load_blockpost()
        manual_dosha = ""
        try:
            async with async_session() as session:
                user = await session.get(User, self.user_id)
                if user:
                    manual_dosha = user.manual_dosha or ""
        except Exception as e:
            logger.error(f"[Storage] Помилка отримання контексту {self.user_id}: {e}")
            
        return {
            "user_id": self.user_id,
            "profile": profile,
            "blockpost": blockpost,
            "manual_dosha": manual_dosha
        }


def get_user_storage(user_id: int) -> UserStorage:
    """Фабричний метод створення сховища користувача"""
    return UserStorage(user_id)


async def admin_get_all_users() -> list:
    """Для Адмін-панелі: отримує всіх користувачів"""
    users_list = []
    try:
        async with async_session() as session:
            statement = select(User).order_by(User.updated_at.desc())
            results = await session.execute(statement)
            users = results.scalars().all()
            for u in users:
                try:
                    profile = json.loads(u.profile_data) if u.profile_data else {}
                    blockpost = json.loads(u.blockpost_data) if u.blockpost_data else {"conditions": []}
                    users_list.append({
                        "user_id": u.user_id,
                        "profile": profile,
                        "blockpost": blockpost,
                        "created_at": u.created_at,
                        "updated_at": u.updated_at,
                        "admin_notes": u.admin_notes or "",
                        "manual_dosha": u.manual_dosha or ""
                    })
                except Exception as e:
                    logger.error(f"Помилка парсингу користувача {u.user_id}: {e}")
    except Exception as e:
        logger.error(f"[Storage] Помилка отримання всіх користувачів: {e}")
    return users_list


async def admin_update_user(user_id: int, admin_notes: str, manual_dosha: str) -> bool:
    """Для Адмін-панелі: оновлює нотатки та ручну дошу клієнта"""
    try:
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user:
                user.admin_notes = admin_notes
                user.manual_dosha = manual_dosha
                session.add(user)
                await session.commit()
                logger.info(f"[Storage] Адмін оновив користувача {user_id}")
                return True
        return False
    except Exception as e:
        logger.error(f"[Storage] Помилка admin_update_user {user_id}: {e}")
        return False
