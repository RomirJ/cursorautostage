#!/usr/bin/env bash

set -e

# Install FFmpeg if not available
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Installing FFmpeg..."
  sudo apt-get update && sudo apt-get install -y ffmpeg
fi

# Install Playwright browsers and deps if playwright is installed
if [ -f package.json ] && grep -q "playwright" package.json; then
  echo "Installing Playwright browsers and dependencies..."
  npx playwright install --with-deps
fi

# Install common Canvas dependencies
if ! dpkg -s libcairo2-dev >/dev/null 2>&1; then
  echo "Installing Canvas build dependencies..."
  sudo apt-get update && sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
fi

echo "Binary setup complete."
