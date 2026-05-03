#!/bin/bash

# Install system dependencies if needed
# apt-get update && apt-get install -y ffmpeg

# Install Python dependencies
pip install -r requirements.txt

# Start the FastAPI server
python main.py