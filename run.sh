#!/bin/bash
# Loreweaver Startup Helper Script

echo "========================================="
echo "   Starting Loreweaver Campaign Manager  "
echo "========================================="

# Change to the script's directory
cd "$(dirname "$0")"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: Node.js and npm are required but not found in your PATH."
    exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
    echo "node_modules not found. Installing node packages..."
    npm install
fi

# Check for Rust/Cargo
if ! command -v cargo &> /dev/null; then
    echo "========================================="
    echo "Warning: Rust/Cargo is not installed or not in PATH."
    echo "Tauri requires Rust to build the desktop shell."
    echo "Please install Rust by running:"
    echo "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "========================================="
    exit 1
fi

echo "Initializing local-first campaign desktop server..."
npm run tauri dev
