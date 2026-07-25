"""
Smoke-test configuration for the ProBono AI production API.

Override defaults with environment variables:
  API_BASE_URL   — default: https://api.probonoai.com.au
  DEMO_PASSWORD  — default: demo1234
"""
import os

BASE_URL = os.environ.get("API_BASE_URL", "https://api.probonoai.com.au").rstrip("/")
DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "demo1234")
