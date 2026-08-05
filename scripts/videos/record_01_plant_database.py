"""Playwright screen recording for the Plant Database module.

Records a ~85 second demo at 1920x1080 (16:9), saves WebM to raw/,
which is later muxed with narration MP3 into an MP4.
"""
import asyncio
import os
import shutil
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("APP_URL", "https://herbal-nexus.preview.emergentagent.com")
RAW_DIR = Path(__file__).parent / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)


async def record():
    # Clear old raw output so the fresh WebM is easy to find
    for f in RAW_DIR.glob("*.webm"):
        f.unlink()

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=str(RAW_DIR),
            record_video_size={"width": 1920, "height": 1080},
        )
        page = await context.new_page()

        # ─── SCENE 1: Landing page hero (~4s) ───────────────────
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(4000)

        # ─── SCENE 2: Navigate to Plant Database (~3s) ──────────
        await page.goto(f"{BASE_URL}/plant-database", wait_until="networkidle")
        await page.wait_for_timeout(3500)

        # ─── SCENE 3: Type search query (~10s) ──────────────────
        # Human-like typing: character by character with delay
        search_input = page.locator('[data-testid=mode-tabs] + div input, input[placeholder*="Curcuma"]').first
        await search_input.click()
        await page.wait_for_timeout(700)
        await search_input.type("Withania somnifera", delay=110)
        await page.wait_for_timeout(1200)

        # ─── SCENE 4: Submit + wait for results (~20s) ─────────
        await search_input.press("Enter")
        # Wait for results to arrive (up to 30s)
        try:
            await page.wait_for_selector('[data-testid=results-table]', timeout=30000)
        except Exception:
            pass
        await page.wait_for_timeout(4000)

        # ─── SCENE 5: Interact with results (~40s) ─────────────
        # Scroll slowly to reveal more rows
        for _ in range(3):
            await page.mouse.wheel(0, 300)
            await page.wait_for_timeout(1400)

        # Hover a compound row
        rows = await page.locator('[data-testid^=row-]').count()
        if rows > 0:
            await page.locator('[data-testid^=row-]').first.hover()
            await page.wait_for_timeout(1500)

        # Try the results search filter
        try:
            rs = page.locator('[data-testid=results-search]')
            if await rs.count() > 0:
                await rs.click()
                await page.wait_for_timeout(600)
                await rs.type("with", delay=140)
                await page.wait_for_timeout(2500)
                await rs.press("Backspace")
                await rs.press("Backspace")
                await rs.press("Backspace")
                await rs.press("Backspace")
                await page.wait_for_timeout(1500)
        except Exception:
            pass

        # Scroll back to top for closing shot
        await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
        await page.wait_for_timeout(3000)

        # Sort by molecular weight if available
        try:
            sort_mw = page.locator('[data-testid=sortable-mw]')
            if await sort_mw.count() > 0:
                await sort_mw.click()
                await page.wait_for_timeout(3500)
        except Exception:
            pass

        # Final resting shot
        await page.wait_for_timeout(6000)

        # Flush the video by closing the context
        await context.close()
        await browser.close()

    # Rename the recorded file
    webms = list(RAW_DIR.glob("*.webm"))
    if not webms:
        raise RuntimeError("No WebM produced by Playwright")
    webm = webms[0]
    dst = RAW_DIR / "01_plant_database.webm"
    if dst.exists():
        dst.unlink()
    shutil.move(str(webm), str(dst))
    print(f"Video saved: {dst} ({dst.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    asyncio.run(record())
