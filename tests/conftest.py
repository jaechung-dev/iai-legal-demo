import os

BASE_URL = os.getenv("API_BASE_URL", "https://api.probonoai.com.au")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "demo1234")

# Optional AI judge keys — used by test_integration_judge.py
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
