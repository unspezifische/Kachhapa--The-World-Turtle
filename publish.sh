#!/bin/bash

# Define the destination (replace with your Raspberry Pi's IP address and destination directory)
DESTINATION="ijohnson@raspberrypi.local"

# Remove "http://127.0.0.1:5001" from all "/api/*" occurrences in .js files in the src directory
find ./webapp/src -name "*.js" -exec sed -i '' 's|http://127.0.0.1:5001||g' {} \;
echo "Finished removing 'http://127.0.0.1:5001' from .js files in the src directory"

# Copy the Flask app
rsync -avz app.py $DESTINATION:/home/ijohnson/myapp/backend
echo "Finished copying app.py"

# Copy the templates directory
rsync -avz templates/ $DESTINATION:/home/ijohnson/myapp/backend/templates
echo "Finished copying the templates directory"

# Copy the static directory
rsync -avz static/ $DESTINATION:/home/ijohnson/myapp/backend/static
echo "Finished copying the static directory"

# # Copy the PostgreSQL database
# pg_dump -U admin -W -F c db > database_backup.dump
# scp database_backup.dump $DESTINATION
# echo "Finished copying the database"

# # Restore the database on the Raspberry Pi
# ssh $DESTINATION "pg_restore -U admin -d db -1 database_backup.dump"
# # ssh $DESTINATION "pg_restore --clean -U admin -d db -1 database_backup.dump"
# echo "Finished restoring the database on the Raspberry Pi"

# Restart Flask on the Pi
ssh $DESTINATION "sudo supervisorctl restart myapp"

# Push updated Nginx configuration to the Pi
scp nginx.conf $DESTINATION:/etc/nginx
echo "Finished updating Nginx configuration"

ssh $DESTINATION "sudo systemctl restart nginx"
echo "Finished restarting Nginx"

# Run npm build
cd webapp && npm run build && cd ..
echo "Finished running npm build"

# Copy the built web app
rsync -avz webapp/build/ $DESTINATION:/home/ijohnson/my-app/build/
echo "Finished copying the built web app"

# Copy the src directory
rsync -avz webapp/src/ $DESTINATION:/home/ijohnson/my-app/src/
echo "Finished copying the src directory"

# Copy the public directory
rsync -avz webapp/public/ $DESTINATION:/home/ijohnson/my-app/public/
echo "Finished copying the public directory"

# Switch everything back over to the development version of the files
find ./webapp/src -name "*.js" -exec sed -i '' 's|/api/|http://127.0.0.1:5001/api/|g' {} \;
echo "Finished switching back to the development version of the files"
