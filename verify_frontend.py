
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 375, 'height': 667}) # Mobile viewport

        # Go to forest.html
        cwd = os.getcwd()
        path = os.path.join(cwd, 'Dungeon_devler', 'forest.html')
        print(f"Navigating to {path}")
        page.goto(f'file://{path}')

        # Inject script to show buttons (force them to display for visual check)
        # Note: In real game they show based on upgrades/class.
        page.evaluate("document.getElementById('dash-btn').style.display = 'flex'")
        page.evaluate("document.getElementById('ranged-btn').style.display = 'flex'")

        page.screenshot(path='verification_forest.png')
        print("Screenshot saved to verification_forest.png")
        browser.close()

if __name__ == '__main__':
    run()
