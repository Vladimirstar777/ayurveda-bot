"""
=====================================
АЮРВЕДА БОТ — Головний файл запуску
=====================================
Точка входу: запускає Telegram-бот та HTTP-сервер для Web App.
Режим: polling (локально) або webhook (Render.com)
"""

import asyncio
import json
import hashlib
import hmac
from pathlib import Path
from urllib.parse import parse_qs, unquote

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiohttp import web
from loguru import logger

from config import (
    BOT_TOKEN, PORT, HOST, DEBUG, BOT_MODE,
    WEBAPP_PATH, WEBHOOK_PATH, WEBHOOK_SECRET, WEBAPP_URL
)
from handlers import start, webapp_handler
from services.pipeline import run_ration_pipeline, get_api_data


# ==========================
# HTTP СЕРВЕР (для Web App)
# ==========================

def validate_telegram_init_data(init_data: str, bot_token: str) -> dict:
    """
    Перевіряє автентичність даних від Telegram Web App.
    Повертає розпарсені дані або None якщо перевірка не пройшла.
    """
    try:
        parsed = parse_qs(init_data)
        data_check_string_parts = []
        hash_value = ""

        for key, values in sorted(parsed.items()):
            if key == "hash":
                hash_value = values[0]
            else:
                data_check_string_parts.append(f"{key}={values[0]}")

        data_check_string = "\n".join(sorted(data_check_string_parts))

        # HMAC-SHA256 з токеном бота
        secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if computed_hash == hash_value:
            # Витягуємо user_id з user поля
            user_str = parsed.get("user", ["{}"])[0]
            user_data = json.loads(unquote(user_str))
            return user_data
        return None
    except Exception as e:
        logger.error(f"[Auth] Помилка валідації init_data: {e}")
        return None


def get_user_id_from_request(request: web.Request) -> int:
    """Отримує user_id з заголовку запиту"""
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    if not init_data:
        # Для локального тестування — беремо з заголовку X-Debug-User-Id
        debug_user = request.headers.get("X-Debug-User-Id", "")
        if debug_user and DEBUG:
            return int(debug_user)
        return None

    user_data = validate_telegram_init_data(init_data, BOT_TOKEN)
    if user_data:
        return user_data.get("id")
    return None


async def serve_webapp(request: web.Request) -> web.Response:
    """Роздає статичні файли Web App"""
    webapp_dir = WEBAPP_PATH

    # Шлях до файлу
    path = request.match_info.get("path", "index.html")
    if not path or path == "":
        path = "index.html"

    file_path = webapp_dir / path

    if not file_path.exists() or not file_path.is_file():
        file_path = webapp_dir / "index.html"

    if not file_path.exists():
        return web.Response(status=404, text="Not Found")

    # Визначаємо Content-Type
    content_types = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".ico": "image/x-icon",
    }
    ext = file_path.suffix.lower()
    content_type = content_types.get(ext, "application/octet-stream")

    with open(file_path, "rb") as f:
        content = f.read()

    return web.Response(body=content, content_type=content_type.split(";")[0].strip(),
                        headers={"Cache-Control": "no-cache"})


# ==========================
# API ЕНДПОІНТИ
# ==========================

async def api_get_init_data(request: web.Request) -> web.Response:
    """GET /api/init — Ініціалізаційні дані для Web App"""
    user_id = get_user_id_from_request(request)
    if not user_id:
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await get_api_data(user_id)
        return web.json_response(data)
    except Exception as e:
        logger.error(f"[API] Помилка /api/init для user_id={user_id}: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_get_ration(request: web.Request) -> web.Response:
    """POST /api/ration — Генерує раціон"""
    user_id = get_user_id_from_request(request)
    if not user_id:
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        body = await request.json() if request.content_length else {}
    except Exception:
        body = {}

    soul_state = body.get("soul_state", "balanced")

    try:
        ration = await run_ration_pipeline(user_id, soul_state=soul_state)
        return web.json_response(ration)
    except Exception as e:
        logger.error(f"[API] Помилка /api/ration для user_id={user_id}: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def api_save_profile(request: web.Request) -> web.Response:
    """POST /api/profile — Зберігає профіль"""
    user_id = get_user_id_from_request(request)
    if not user_id:
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        profile_data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    from services.storage import get_user_storage
    storage = get_user_storage(user_id)
    success = await storage.save_profile(profile_data)

    return web.json_response({"success": success})


async def api_save_blockpost(request: web.Request) -> web.Response:
    """POST /api/blockpost — Зберігає медичні прапорці"""
    user_id = get_user_id_from_request(request)
    if not user_id:
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        data = await request.json()
        conditions = data.get("conditions", [])
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    from services.storage import get_user_storage
    storage = get_user_storage(user_id)
    success = await storage.save_blockpost(conditions)

    return web.json_response({"success": success})


async def api_get_conditions(request: web.Request) -> web.Response:
    """GET /api/conditions — Список всіх медичних станів"""
    from services.blockpost import get_blockpost
    blockpost = get_blockpost()
    conditions = blockpost.get_all_conditions()
    return web.json_response({"conditions": conditions})


@web.middleware
async def cors_middleware(request: web.Request, handler):
    """Додає CORS заголовки для локальної розробки"""
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Telegram-Init-Data, X-Debug-User-Id, Authorization",
        })
    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# ==========================
# ADMIN API
# ==========================

async def api_admin_users(request: web.Request) -> web.Response:
    """GET /api/admin/users — Отримує список всіх користувачів для CRM"""
    auth_header = request.headers.get("Authorization", "")
    expected_password = "Bearer 12345678"  # Hardcoded as per user request
    if auth_header != expected_password:
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    from services.storage import admin_get_all_users
    users = await admin_get_all_users()
    return web.json_response({"users": users})


def create_web_app() -> web.Application:
    """Створює aiohttp додаток з усіма маршрутами"""
    app = web.Application(middlewares=[cors_middleware])

    # API маршрути
    app.router.add_get("/api/init", api_get_init_data)
    app.router.add_post("/api/ration", api_get_ration)
    app.router.add_post("/api/profile", api_save_profile)
    app.router.add_post("/api/blockpost", api_save_blockpost)
    app.router.add_get("/api/conditions", api_get_conditions)

    # Admin API маршрути
    app.router.add_get("/api/admin/users", api_admin_users)

    # Статичні файли Web App
    app.router.add_get("/webapp/", serve_webapp)
    app.router.add_get("/webapp/{path:.+}", serve_webapp)

    # Health check для Render.com
    app.router.add_get("/health", lambda r: web.json_response({"status": "ok"}))

    return app


# ==========================
# TELEGRAM БОТ
# ==========================

async def main():
    """Головна функція запуску"""
    if not BOT_TOKEN:
        logger.error("BOT_TOKEN не встановлено! Додай токен у файл .env")
        return

    # Налаштовуємо логування
    logger.add(
        "logs/bot_{time}.log",
        rotation="10 MB",
        retention="7 days",
        level="DEBUG" if DEBUG else "INFO",
        encoding="utf-8"
    )

    logger.info(f"🌿 Аюрведа Бот запускається... Режим: {BOT_MODE}")

    # Ініціалізація бота
    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML)
    )
    dp = Dispatcher()

    # Реєстрація хендлерів
    dp.include_router(start.router)
    dp.include_router(webapp_handler.router)

    # Ініціалізація БД
    from services.storage import init_db
    await init_db()

    # HTTP сервер
    web_app = create_web_app()
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, HOST, PORT)
    await site.start()
    logger.info(f"🌐 HTTP сервер запущено: http://{HOST}:{PORT}")

    # Запуск бота
    if BOT_MODE == "polling":
        logger.info("🤖 Запуск у режимі POLLING (локальна розробка)")
        try:
            await dp.start_polling(bot)
        finally:
            await bot.session.close()
            await runner.cleanup()
    else:
        logger.info(f"🔗 Запуск у режимі WEBHOOK: {WEBAPP_URL}{WEBHOOK_PATH}")
        await bot.set_webhook(
            url=f"{WEBAPP_URL}{WEBHOOK_PATH}",
            secret_token=WEBHOOK_SECRET
        )
        # Webhook обробник вже інтегрований через aiogram
        # Тримаємо сервер активним
        await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
