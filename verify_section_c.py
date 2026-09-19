#!/usr/bin/env python3
"""
SkillSwap Browser & CUJ Verification Compatibility Wrapper.
Runs Playwright E2E verification test suite and outputs diagnostic reports.
"""

import subprocess
import sys
import os

def run_playwright_suite():
    print("==================================================")
    print("  Running SkillSwap Playwright E2E CUJ Suite      ")
    print("==================================================")

    cmd = ["npx", "playwright", "test"]
    result = subprocess.run(cmd, env=os.environ.copy())

    if result.returncode == 0:
        print("\n✓ Playwright E2E Suite completed successfully!")
    else:
        print(f"\n❌ Playwright E2E Suite failed with exit code {result.returncode}")

    sys.exit(result.returncode)

if __name__ == "__main__":
    run_playwright_suite()
