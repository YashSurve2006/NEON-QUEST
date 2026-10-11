"""NEON QUEST smoke test: loads the game in headless Chromium, drives menus and
gameplay, captures screenshots and fails on any JavaScript error."""
import sys, time, pathlib, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/index.html"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/nq-shots")
OUT.mkdir(parents=True, exist_ok=True)
errors = []

def watch(page, tag):
    page.on("pageerror", lambda e: errors.append(f"[{tag}] pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"[{tag}] console.error: {m.text}") if m.type == "error" else None)

def state(page):
    return page.evaluate("() => ({state: window.NQ.game.state, level: window.NQ.game.levelNo, lives: window.NQ.game.lives, score: window.NQ.game.score, coins: window.NQ.game.coinsGot, x: Math.round(window.NQ.game.p ? window.NQ.game.p.x : -1)})")

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])

    # ---------- desktop ----------
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    watch(page, "desktop")
    page.goto(URL)
    page.wait_for_timeout(800)
    page.screenshot(path=str(OUT / "01-menu-desktop.png"))
    assert page.is_visible("#s-menu"), "main menu not visible"

    page.click("text=How to play")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "02-howto-desktop.png"), full_page=False)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    page.click("text=Level select")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "03-levels-desktop.png"))
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    page.click("text=▶ Play")
    page.wait_for_timeout(400)
    print("after play:", state(page))
    page.wait_for_timeout(2600)
    print("after intro:", state(page))
    page.screenshot(path=str(OUT / "04-level1-desktop.png"))

    # bot: run right, jump on a rhythm, stomp things
    page.keyboard.down("ArrowRight")
    for i in range(60):
        if i % 12 == 0:
            page.keyboard.down("Space")
        if i % 12 == 4:
            page.keyboard.up("Space")
        page.wait_for_timeout(120)
    page.keyboard.up("ArrowRight")
    page.keyboard.up("Space")
    print("after run:", state(page))
    page.screenshot(path=str(OUT / "05-level1-running.png"))

    # pause / resume
    page.keyboard.press("p")
    page.wait_for_timeout(250)
    print("paused:", state(page)["state"], "| pause visible:", page.is_visible("#o-pause"))
    page.screenshot(path=str(OUT / "06-paused.png"))
    page.keyboard.press("p")
    page.wait_for_timeout(200)
    print("resumed:", state(page)["state"])

    # jump the level-3 state directly to test the boss arena + win/clear screens
    page.evaluate("() => { const G = window.NQ.game; G.newGame(3); }")
    page.wait_for_timeout(2600)
    page.evaluate("() => { const G = window.NQ.game; G.p.x = 118*40; G.p.y = 12*40+4; G.p.vx=0; G.p.vy=0; G.cam = 100*40; }")
    page.wait_for_timeout(700)
    print("boss state:", page.evaluate("() => window.NQ.game.boss.state"), "lock:", page.evaluate("() => window.NQ.game.world.lockOn"))
    page.screenshot(path=str(OUT / "07-boss-arena.png"))

    # finish level 3 -> victory screen
    page.evaluate("() => { const G = window.NQ.game; G.boss.alive=false; G.boss.hp=0; G.world.setLock(false); G.p.x=137*40-6; G.p.y=12*40+4; G.p.vx=0; G.p.vy=0; }")
    page.wait_for_timeout(900)
    print("after level 3 flag:", state(page)["state"])
    page.screenshot(path=str(OUT / "08-victory.png"))
    page.click("text=Play again")
    page.wait_for_timeout(300)
    print("after play again:", state(page))

    # finish level 1 -> level clear screen -> next level
    page.evaluate("() => { const G = window.NQ.game; G.newGame(1); }")
    page.wait_for_timeout(2600)
    page.evaluate("() => { const G = window.NQ.game; G.p.x = 116*40-6; G.p.y = 12*40+4; G.p.vx=0; G.p.vy=0; }")
    page.wait_for_timeout(400)
    print("after level 1 flag:", state(page)["state"])
    page.screenshot(path=str(OUT / "08b-level-clear.png"))
    page.click("text=Next level")
    page.wait_for_timeout(300)
    print("after next:", state(page))

    # game over path
    page.wait_for_function("window.NQ.game.state === 'play'")
    page.evaluate("() => { const G = window.NQ.game; G.lives = 1; G.p.inv = 0; G.p.y = 700; }")
    page.wait_for_timeout(1200)
    print("after death:", state(page)["state"])
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT / "09-game-over.png"))

    # high score table has entries after a game over
    page.click("text=Main menu")
    page.wait_for_timeout(300)
    page.click("text=High scores")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "10-scores.png"))
    page.keyboard.press("Escape")

    # endless: losing the last life ends the run; "New run" starts again at score 0
    page.evaluate("() => window.NQ.game.newRun()")
    page.wait_for_function("window.NQ.game.state === 'play'")
    page.evaluate("() => { const G = window.NQ.game; G.score = 4321; G.lives = 1; G.p.inv = 0; G.p.y = 700; }")
    page.wait_for_function("window.NQ.game.state === 'over'", timeout=8000)
    print("endless run over:", state(page), "| label:", page.evaluate("() => window.NQ.game.levelLabel"))
    page.screenshot(path=str(OUT / "14-endless-over.png"))
    page.click("#btn-retry")
    page.wait_for_function("window.NQ.game.state === 'intro' || window.NQ.game.state === 'play'")
    fresh = page.evaluate("() => ({score: window.NQ.game.score, lives: window.NQ.game.lives, mode: window.NQ.game.mode, label: window.NQ.game.levelLabel})")
    print("new run:", fresh)
    assert fresh["score"] == 0 and fresh["mode"] == "endless" and fresh["label"] == "STAGE 1", fresh
    page.wait_for_function("window.NQ.game.state === 'play'")
    page.screenshot(path=str(OUT / "15-endless-stage1.png"))
    page.close()

    # ---------- mobile phone (touch) ----------
    ctx = browser.new_context(viewport={"width": 844, "height": 390}, is_mobile=True, has_touch=True, device_scale_factor=2)
    m = ctx.new_page()
    watch(m, "mobile")
    m.goto(URL)
    m.wait_for_timeout(700)
    m.screenshot(path=str(OUT / "11-menu-mobile.png"))
    m.click("text=▶ Play")
    m.wait_for_timeout(2800)
    m.screenshot(path=str(OUT / "12-game-mobile.png"))
    box = m.locator("[data-hold=right]").bounding_box()
    m.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    print("touch controls visible:", m.is_visible("#touch"))
    ctx.close()

    # ---------- portrait phone ----------
    ctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    q = ctx2.new_page()
    watch(q, "portrait")
    q.goto(URL)
    q.wait_for_timeout(600)
    q.screenshot(path=str(OUT / "13-menu-portrait.png"))
    overflow = q.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
    print("horizontal overflow on portrait phone:", overflow)
    ctx2.close()
    browser.close()

print("\nERRORS:" if errors else "\nNo JavaScript errors.")
for e in errors[:30]:
    print(" ", e)
sys.exit(1 if errors else 0)
