"""
=====================================
АЮРВЕДА БОТ — Сервіс сховища даних (SQLite)
=====================================
Використовує aiosqlite для зберігання даних користувачів.
Це дозволяє легко витягувати всіх користувачів для адмін-панелі.
"""

import json
import asyncio
import aiosqlite
from datetime import datetime
from loguru import logger
from config import STORAGE_PATH

DB_FILE = STORAGE_PATH / "ayurveda.db"

async def init_db():
    """Ініціалізація бази даних та створення таблиць"""
    STORAGE_PATH.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_FILE) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                profile_data TEXT DEFAULT '{}',
                blockpost_data TEXT DEFAULT '{"conditions": []}',
                admin_notes TEXT DEFAULT '',
                manual_dosha TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS rations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                ration_data TEXT,
                generated_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            )
        """)
        await db.commit()
    logger.info(f"[Storage] SQLite База даних ініціалізована: {DB_FILE}")

class UserStorage:
    """Сховище даних конкретного користувача (SQLite)"""
    def __init__(self, user_id: int):
        self.user_id = user_id

    async def _ensure_user_exists(self, db: aiosqlite.Connection):
        """Перевіряє, чи існує запис користувача, і створює його за потреби"""
        async with db.execute("SELECT 1 FROM users WHERE user_id = ?", (self.user_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                now = datetime.now().isoformat()
                await db.execute(
                    "INSERT INTO users (user_id, created_at, updated_at) VALUES (?, ?, ?)",
                    (self.user_id, now, now)
                )

    async def exists(self) -> bool:
        """Перевіряє чи є профіль у користувача"""
        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT profile_data FROM users WHERE user_id = ?", (self.user_id,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0] and row[0] != '{}':
                    return True
        return False

    async def load_profile(self) -> dict:
        """Завантажує профіль користувача"""
        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT profile_data FROM users WHERE user_id = ?", (self.user_id,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0]:
                    try:
                        return json.loads(row[0])
                    except json.JSONDecodeError:
                        pass
        return {}

    async def save_profile(self, data: dict) -> bool:
        """Зберігає профіль користувача"""
        try:
            now = datetime.now().isoformat()
            data["updated_at"] = now
            if "created_at" not in data:
                data["created_at"] = now
                
            json_data = json.dumps(data, ensure_ascii=False)
            
            async with aiosqlite.connect(DB_FILE) as db:
                await self._ensure_user_exists(db)
                await db.execute(
                    "UPDATE users SET profile_data = ?, updated_at = ? WHERE user_id = ?",
                    (json_data, now, self.user_id)
                )
                await db.commit()
            logger.info(f"[Storage] Профіль збережено: user_id={self.user_id}")
            return True
        except Exception as e:
            logger.error(f"[Storage] Помилка збереження профілю {self.user_id}: {e}")
            return False

    async def load_blockpost(self) -> dict:
        """Завантажує медичні прапорці користувача"""
        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT blockpost_data FROM users WHERE user_id = ?", (self.user_id,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0]:
                    try:
                        return json.loads(row[0])
                    except json.JSONDecodeError:
                        pass
        return {"conditions": [], "updated_at": None}

    async def save_blockpost(self, conditions: list) -> bool:
        """Зберігає список активних медичних станів"""
        try:
            now = datetime.now().isoformat()
            data = {"conditions": conditions, "updated_at": now}
            json_data = json.dumps(data, ensure_ascii=False)
            
            async with aiosqlite.connect(DB_FILE) as db:
                await self._ensure_user_exists(db)
                await db.execute(
                    "UPDATE users SET blockpost_data = ?, updated_at = ? WHERE user_id = ?",
                    (json_data, now, self.user_id)
                )
                await db.commit()
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
            
            async with aiosqlite.connect(DB_FILE) as db:
                await self._ensure_user_exists(db)
                await db.execute(
                    "INSERT INTO rations (user_id, ration_data, generated_at) VALUES (?, ?, ?)",
                    (self.user_id, json_data, now)
                )
                await db.commit()
            return True
        except Exception as e:
            logger.error(f"[Storage] Помилка збереження раціону {self.user_id}: {e}")
            return False

    async def get_full_context(self) -> dict:
        """Повертає повний контекст користувача для конвеєра"""
        profile = await self.load_profile()
        blockpost = await self.load_blockpost()
        manual_dosha = ""
        async with aiosqlite.connect(DB_FILE) as db:
            async with db.execute("SELECT manual_dosha FROM users WHERE user_id = ?", (self.user_id,)) as cursor:
                row = await cursor.fetchone()
                if row and row[0]:
                    manual_dosha = row[0]
                    
        return {
            "user_id": self.user_id,
            "profile": profile,
            "blockpost": blockpost,
            "manual_dosha": manual_dosha
        }

def get_user_storage(user_id: int) -> UserStorage:
    """Фабричний метод"""
    return UserStorage(user_id)

async def admin_get_all_users() -> list:
    """Для Адмін-панелі: отримує всіх користувачів"""
    users = []
    async with aiosqlite.connect(DB_FILE) as db:
        async with db.execute("SELECT user_id, profile_data, blockpost_data, created_at, updated_at, admin_notes, manual_dosha FROM users ORDER BY updated_at DESC") as cursor:
            async for row in cursor:
                try:
                    profile = json.loads(row[1]) if row[1] else {}
                    blockpost = json.loads(row[2]) if row[2] else {"conditions": []}
                    users.append({
                        "user_id": row[0],
                        "profile": profile,
                        "blockpost": blockpost,
                        "created_at": row[3],
                        "updated_at": row[4],
                        "admin_notes": row[5] or "",
                        "manual_dosha": row[6] or ""
                    })
                except Exception as e:
                    logger.error(f"Error parsing user {row[0]}: {e}")
    return users

async def admin_update_user(user_id: int, admin_notes: str, manual_dosha: str) -> bool:
    """Для Адмін-панелі: оновлює нотатки та ручну дошу клієнта"""
    try:
        async with aiosqlite.connect(DB_FILE) as db:
            await db.execute(
                "UPDATE users SET admin_notes = ?, manual_dosha = ? WHERE user_id = ?",
                (admin_notes, manual_dosha, user_id)
            )
            await db.commit()
        return True
    except Exception as e:
        logger.error(f"[Storage] Помилка admin_update_user {user_id}: {e}")
        return False
