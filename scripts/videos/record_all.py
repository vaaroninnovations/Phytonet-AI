"""Record all remaining module demos + long walkthrough in one Playwright run.

Each function drives a distinct scene, records to raw/, and returns.
Duration targets:
   02_target_prediction   ~ 65s
   03_disease_targets     ~ 60s
   04_admet               ~ 65s
   05_molecular_docking   ~ 75s
   06_ai_agent            ~ 65s
   07_walkthrough         ~ 150s (spans multiple modules)
"""
import asyncio
import os
import shutil
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("APP_URL", "https://herbal-nexus.preview.emergentagent.com")
RAW = Path(__file__).parent / "raw"
RAW.mkdir(parents=True, exist_ok=True)


async def _fresh_ctx(p):
    browser = await p.chromium.launch(
        headless=True, args=["--disable-blink-features=AutomationControlled"],
    )
    context = await browser.new_context(
        viewport={"width": 1920, "height": 1080},
        record_video_dir=str(RAW),
        record_video_size={"width": 1920, "height": 1080},
    )
    return browser, context


async def _flush(browser, context, target_slug):
    await context.close()
    await browser.close()
    files = sorted(RAW.glob("*.webm"), key=lambda p: p.stat().st_mtime)
    if not files:
        raise RuntimeError(f"No WebM for {target_slug}")
    latest = files[-1]
    dst = RAW / f"{target_slug}.webm"
    if dst.exists():
        dst.unlink()
    shutil.move(str(latest), str(dst))
    print(f"  ✔ {dst.name}  ({dst.stat().st_size // 1024} KB)")


# ─────────────────────── 02 · Target Prediction ────────────────────────
async def rec_target_prediction():
    print("[02] Target Prediction …")
    async with async_playwright() as p:
        browser, ctx = await _fresh_ctx(p)
        page = await ctx.new_page()
        # Hero intro on landing page
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(3000)
        # Navigate directly to the module
        await page.goto(f"{BASE_URL}/target-prediction", wait_until="networkidle")
        await page.wait_for_timeout(5000)
        # Scroll slowly to reveal UI panels
        for _ in range(3):
            await page.mouse.wheel(0, 320)
            await page.wait_for_timeout(2000)
        # If a search input exists (empty-state or filled), interact with it
        try:
            si = page.locator('[data-testid=target-search]')
            if await si.count() > 0:
                await si.click()
                await page.wait_for_timeout(500)
                await si.type("EGFR", delay=130)
                await page.wait_for_timeout(3000)
        except Exception:
            pass
        # Return to top and hold
        await page.evaluate("window.scrollTo({top:0, behavior:'smooth'})")
        await page.wait_for_timeout(4000)
        # Extra tail
        await page.wait_for_timeout(8000)
        await _flush(browser, ctx, "02_target_prediction")


# ─────────────────────── 03 · Disease Targets ──────────────────────────
async def rec_disease_targets():
    print("[03] Disease Targets …")
    async with async_playwright() as p:
        browser, ctx = await _fresh_ctx(p)
        page = await ctx.new_page()
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(2500)
        await page.goto(f"{BASE_URL}/disease-target-identification", wait_until="networkidle")
        await page.wait_for_timeout(3500)

        # Type in the disease search
        try:
            si = page.locator('[data-testid=disease-search-input]')
            await si.click()
            await page.wait_for_timeout(600)
            await si.type("Type 2 diabetes", delay=110)
            await page.wait_for_timeout(2000)
            # Pick first hit if visible
            hits = page.locator('[data-testid^=disease-hit-]')
            if await hits.count() > 0:
                await hits.first.click()
                await page.wait_for_timeout(4000)
        except Exception:
            pass

        # Wait for targets to load
        try:
            await page.wait_for_selector('[data-testid=disease-table-search], [data-testid=disease-auto-card]', timeout=25000)
        except Exception:
            pass
        await page.wait_for_timeout(3000)
        # Scroll to reveal targets
        for _ in range(4):
            await page.mouse.wheel(0, 280)
            await page.wait_for_timeout(1600)
        # Filter targets
        try:
            ts = page.locator('[data-testid=disease-table-search]')
            if await ts.count() > 0:
                await ts.click()
                await ts.type("INS", delay=140)
                await page.wait_for_timeout(3500)
        except Exception:
            pass
        await page.wait_for_timeout(4000)
        await _flush(browser, ctx, "03_disease_targets")


# ─────────────────────── 04 · ADMET ─────────────────────────────────────
async def rec_admet():
    print("[04] ADMET …")
    async with async_playwright() as p:
        browser, ctx = await _fresh_ctx(p)
        page = await ctx.new_page()
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(2500)
        await page.goto(f"{BASE_URL}/admet", wait_until="networkidle")
        await page.wait_for_timeout(5000)
        for _ in range(4):
            await page.mouse.wheel(0, 320)
            await page.wait_for_timeout(1800)
        # ADMET search interaction
        try:
            si = page.locator('[data-testid=admet-search]')
            if await si.count() > 0:
                await si.click()
                await si.type("curcumin", delay=130)
                await page.wait_for_timeout(3500)
        except Exception:
            pass
        await page.evaluate("window.scrollTo({top:0, behavior:'smooth'})")
        await page.wait_for_timeout(4000)
        await page.wait_for_timeout(8000)
        await _flush(browser, ctx, "04_admet")


# ─────────────────────── 05 · Molecular Docking ────────────────────────
async def rec_molecular_docking():
    print("[05] Molecular Docking …")
    async with async_playwright() as p:
        browser, ctx = await _fresh_ctx(p)
        page = await ctx.new_page()
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(2500)
        await page.goto(f"{BASE_URL}/molecular-docking", wait_until="networkidle")
        await page.wait_for_timeout(5000)
        for _ in range(5):
            await page.mouse.wheel(0, 320)
            await page.wait_for_timeout(1800)
        await page.evaluate("window.scrollTo({top:0, behavior:'smooth'})")
        await page.wait_for_timeout(4000)
        await page.wait_for_timeout(10000)
        await _flush(browser, ctx, "05_molecular_docking")


# ─────────────────────── 06 · PhytoNet AI Agent ────────────────────────
async def rec_ai_agent():
    print("[06] PhytoNet AI Agent …")
    async with async_playwright() as p:
        browser, ctx = await _fresh_ctx(p)
        page = await ctx.new_page()
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(2500)
        await page.goto(f"{BASE_URL}/phytonet", wait_until="networkidle")
        await page.wait_for_timeout(5000)
        # Scroll through the module cards
        for _ in range(5):
            await page.mouse.wheel(0, 300)
            await page.wait_for_timeout(1700)
        # Hover a module card
        try:
            cards = page.locator('[data-testid^=module-card-]')
            n = await cards.count()
            for i in range(min(3, n)):
                await cards.nth(i).hover()
                await page.wait_for_timeout(1400)
        except Exception:
            pass
        await page.evaluate("window.scrollTo({top:0, behavior:'smooth'})")
        await page.wait_for_timeout(6000)
        await _flush(browser, ctx, "06_ai_agent")


# ─────────────────────── 07 · Long Walkthrough ─────────────────────────
async def rec_walkthrough():
    print("[07] Long Walkthrough …")
    async with async_playwright() as p:
        browser, ctx = await _fresh_ctx(p)
        page = await ctx.new_page()

        # Intro on landing
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.wait_for_timeout(5000)
        for _ in range(2):
            await page.mouse.wheel(0, 500)
            await page.wait_for_timeout(1500)
        await page.evaluate("window.scrollTo({top:0, behavior:'smooth'})")
        await page.wait_for_timeout(2500)

        # Plant Database segment
        await page.goto(f"{BASE_URL}/plant-database", wait_until="networkidle")
        await page.wait_for_timeout(3500)
        try:
            si = page.locator('input[placeholder*="Curcuma"]').first
            await si.click()
            await si.type("Withania somnifera", delay=95)
            await si.press("Enter")
            await page.wait_for_selector('[data-testid=results-table]', timeout=25000)
            await page.wait_for_timeout(6000)
        except Exception:
            await page.wait_for_timeout(6000)
        for _ in range(3):
            await page.mouse.wheel(0, 260)
            await page.wait_for_timeout(1500)

        # Target Prediction segment
        await page.goto(f"{BASE_URL}/target-prediction", wait_until="networkidle")
        await page.wait_for_timeout(5000)
        for _ in range(3):
            await page.mouse.wheel(0, 320)
            await page.wait_for_timeout(1600)

        # Disease Targets segment
        await page.goto(f"{BASE_URL}/disease-target-identification", wait_until="networkidle")
        await page.wait_for_timeout(3000)
        try:
            si = page.locator('[data-testid=disease-search-input]')
            await si.click()
            await si.type("Type 2 diabetes", delay=100)
            await page.wait_for_timeout(1500)
            hits = page.locator('[data-testid^=disease-hit-]')
            if await hits.count() > 0:
                await hits.first.click()
                await page.wait_for_timeout(6000)
        except Exception:
            pass
        for _ in range(3):
            await page.mouse.wheel(0, 300)
            await page.wait_for_timeout(1500)

        # ADMET segment
        await page.goto(f"{BASE_URL}/admet", wait_until="networkidle")
        await page.wait_for_timeout(4500)
        for _ in range(3):
            await page.mouse.wheel(0, 300)
            await page.wait_for_timeout(1500)

        # Molecular Docking segment
        await page.goto(f"{BASE_URL}/molecular-docking", wait_until="networkidle")
        await page.wait_for_timeout(4000)
        for _ in range(3):
            await page.mouse.wheel(0, 300)
            await page.wait_for_timeout(1500)

        # AI Agent segment
        await page.goto(f"{BASE_URL}/phytonet", wait_until="networkidle")
        await page.wait_for_timeout(4000)
        for _ in range(3):
            await page.mouse.wheel(0, 320)
            await page.wait_for_timeout(1600)

        # Closing shot on landing pricing
        await page.goto(f"{BASE_URL}/#pricing", wait_until="networkidle")
        await page.wait_for_timeout(6000)
        await _flush(browser, ctx, "07_walkthrough")


async def main():
    await rec_target_prediction()
    await rec_disease_targets()
    await rec_admet()
    await rec_molecular_docking()
    await rec_ai_agent()
    await rec_walkthrough()


if __name__ == "__main__":
    asyncio.run(main())
