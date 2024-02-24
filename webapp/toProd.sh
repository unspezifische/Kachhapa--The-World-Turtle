#!/bin/bash
# This script removes "http://127.0.0.1:5001" from all "/api/*" occurrences in .js files in the src directory

find ./src -name "*.js" -exec sed -i '' 's|http://127.0.0.1:5001||g' {} \;