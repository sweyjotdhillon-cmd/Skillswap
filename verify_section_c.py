import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    # Navigate to Explore Swaps
    page.goto("http://localhost:5173/explore")
    page.wait_for_timeout(1000)

    # Capture Explore page screenshot
    page.screenshot(path="verification/screenshots/explore_swaps.png")
    page.wait_for_timeout(1000)

    # Navigate to Create Swap
    page.goto("http://localhost:5173/create-swap")
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/screenshots/create_swap.png")
    page.wait_for_timeout(1000)

    # Navigate to Active Swaps
    page.goto("http://localhost:5173/active-swaps")
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/screenshots/active_swaps.png")
    page.wait_for_timeout(1000)

    # Navigate to Profile
    page.goto("http://localhost:5173/profile")
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/screenshots/profile.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()

    print("Playwright script completed successfully!")
