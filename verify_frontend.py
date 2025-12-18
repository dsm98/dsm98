from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the index page
        page.goto("http://localhost:8080/Dungeon_devler/index.html")

        # Take a screenshot of the main menu
        page.screenshot(path="verification_main_menu.png")

        # Click on Daily Challenge
        page.click("button.btn-daily")

        # Wait for game to load
        page.wait_for_selector("canvas#gameCanvas")

        # Take a screenshot of the game
        page.screenshot(path="verification_game.png")

        # Navigate back to index
        page.goto("http://localhost:8080/Dungeon_devler/index.html")

        # Select Warrior
        page.click("#class-warrior")

        # Select Rogue
        page.click("#class-rogue")

        # Take a screenshot of the class selection
        page.screenshot(path="verification_class_selection.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
