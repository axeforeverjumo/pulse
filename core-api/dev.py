#!/usr/bin/env python3
"""
Development server runner for local testing
Run with: python dev.py
"""
import logging
import uvicorn

# Configure logging for our app
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s:     %(name)s - %(message)s'
)

if __name__ == "__main__":
    uvicorn.run(
        "index:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )



