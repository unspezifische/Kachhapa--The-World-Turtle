#!/bin/bash
# This script prepends "http://127.0.0.1:5001" to all "/api/*" occurrences in .js files in the src directory

find ./src -name "*.js" -exec sed -i '' 's|/api/|http://127.0.0.1:5001/api/|g' {} \;