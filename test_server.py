#!/usr/bin/env python3
"""
Тест-запуск: тільки HTTP-сервер без Telegram бота
Для локального тестування Web App у браузері
"""
import asyncio
from aiohttp import web
from loguru import logger
import json
from pathlib import Path

BASE_DIR = Path(__file__).parent
WEBAPP_PATH = BASE_DIR / "webapp"
DATA_PATH = BASE_DIR / "data"

# ============================
# Мок-дані для тестування
# ============================
MOCK_USER_ID = 123456789

MOCK_PROFILE = {
    "name": "Тестовий Користувач",
    "dosha_type": "vata",
    "city": "Київ",
    "birth_date": "1990-05-15"
}

MOCK_BLOCKPOST = {"conditions": []}

async def serve_static(request):
    path = request.match_info.get("path", "index.html") or "index.html"
    file_path = WEBAPP_PATH / path
    if not file_path.exists() or not file_path.is_file():
        file_path = WEBAPP_PATH / "index.html"
    if not file_path.exists():
        return web.Response(status=404, text="Not Found")

    types = {".html":"text/html;charset=utf-8",".css":"text/css;charset=utf-8",
             ".js":"application/javascript;charset=utf-8",".json":"application/json"}
    ct = types.get(file_path.suffix.lower(), "text/plain")
    content = file_path.read_bytes()
    return web.Response(body=content, content_type=ct.split(";")[0],
                       headers={"Cache-Control": "no-cache"})

async def api_init(request):
    with open(DATA_PATH / "medical_conditions.json", encoding="utf-8") as f:
        mc = json.load(f)
    return web.json_response({
        "profile": MOCK_PROFILE,
        "blockpost": MOCK_BLOCKPOST,
        "available_conditions": mc["conditions"],
        "has_profile": True
    })

async def api_conditions(request):
    with open(DATA_PATH / "medical_conditions.json", encoding="utf-8") as f:
        mc = json.load(f)
    return web.json_response({"conditions": mc["conditions"]})

async def api_ration(request):
    # Запускаємо повний конвеєр
    from services.pipeline import run_ration_pipeline
    from services.storage import get_user_storage

    # Ініціалізуємо мок-профіль якщо треба
    storage = get_user_storage(MOCK_USER_ID)
    if not await storage.exists():
        await storage.save_profile(MOCK_PROFILE)

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    soul_state = body.get("soul_state", "balanced")
    ration = await run_ration_pipeline(MOCK_USER_ID, soul_state=soul_state)
    return web.json_response(ration)

async def api_profile(request):
    data = await request.json()
    MOCK_PROFILE.update(data)
    return web.json_response({"success": True})

async def api_blockpost(request):
    data = await request.json()
    MOCK_BLOCKPOST["conditions"] = data.get("conditions", [])
    return web.json_response({"success": True})

@web.middleware
async def cors_mw(request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Debug-User-Id",
        })
    resp = await handler(request)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

async def main():
    app = web.Application(middlewares=[cors_mw])
    app.router.add_get("/api/init", api_init)
    app.router.add_get("/api/conditions", api_conditions)
    app.router.add_post("/api/ration", api_ration)
    app.router.add_post("/api/profile", api_profile)
    app.router.add_post("/api/blockpost", api_blockpost)
    app.router.add_get("/webapp/", serve_static)
    app.router.add_get("/webapp/{path:.+}", serve_static)
    app.router.add_get("/health", lambda r: web.json_response({"status": "ok"}))

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 8080)
    await site.start()
    print("=" * 50)
    print("  AYURVEDA BOT - Test-server zapusheno!")
    print("=" * 50)
    print("  Open in browser: http://127.0.0.1:8080/webapp/")
    print("  Press Ctrl+C to stop")
    print("=" * 50)
    await asyncio.Event().wait()

if __name__ == "__main__":
    asyncio.run(main())
