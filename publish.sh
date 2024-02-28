#!/bin/bash

# Define the destination (replace with your Raspberry Pi's IP address and destination directory)
DESTINATION="ijohnson@raspberrypi.local:/home/ijohnson"

# Remove "http://127.0.0.1:5001" from all "/api/*" occurrences in .js files in the src directory
find ./webapp/src -name "*.js" -exec sed -i '' 's|http://127.0.0.1:5001||g' {} \;
echo "Finished removing 'http://127.0.0.1:5001' from .js files in the src directory"

# Run npm build
cd webapp && npm run build && cd ..
echo "Finished running npm build"

# Copy the Flask app
rsync -avz app.py $DESTINATION/myapp/backend
echo "Finished copying app.py"

# Copy the built web app
rsync -avz webapp/build/ $DESTINATION/my-app/build/
echo "Finished copying the built web app"

# Copy the src directory
rsync -avz webapp/src/ $DESTINATION/my-app/src/
echo "Finished copying the src directory"

# Switch everything back over to the development version of the files
find ./webapp/src -name "*.js" -exec sed -i '' 's|/api/|http://127.0.0.1:5001/api/|g' {} \;
echo "Finished switching back to the development version of the files"
