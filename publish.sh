#!/bin/bash

# Define the destination (replace with your Raspberry Pi's IP address and destination directory)
DESTINATION="ijohnson@raspberrypi.local"

# # Remove "http://127.0.0.1:5001" from all "/api/*" occurrences in .js files in the src directory
# find ./webapp/src -name "*.js" -exec sed -i '' 's|http://127.0.0.1:5001||g' {} \;
# echo "Finished removing 'http://127.0.0.1:5001' from .js files in the src directory"

# Create `requirements.txt` file
# pip freeze > Flask/requirements.txt

# Copy the requirements.txt file
rsync -avz Flask/requirements.txt $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying requirements.txt"

# Install Python dependencies on the Raspberry Pi
# ssh $DESTINATION "pip install -r /home/ijohnson/Kachhapa/Flask/requirements.txt"
echo "Finished installing Python dependencies"

# Copy the Flask app
rsync -avz Flask/app.py $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying app.py"

# Restart Flask
ssh $DESTINATION "sudo systemctl restart myapp"
echo "Finished restarting Flask"

# Copy the templates directory for wiki pages
rsync -avz Flask/templates/ $DESTINATION:/home/ijohnson/Kachhapa/Flask/templates
echo "Finished copying the templates directory"

# Copy the static directory for the server (libraries for wiki stuff)
rsync -avz Flask/static/ $DESTINATION:/home/ijohnson/Kachhapa/Flask/static
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
scp myapp.service $DESTINATION:/home/ijohnson/Kachhapa/Flask

# Push updated Nginx configuration to the Pi & restart Nginx
scp nginx/nginx.conf $DESTINATION:/etc/nginx/nginx.conf
ssh $DESTINATION "sudo nginx -t"
# echo "Finished updating Nginx configuration"

ssh $DESTINATION "sudo systemctl reload nginx"
ssh $DESTINATION "sudo systemctl restart nginx"
echo "Finished restarting Nginx"

# Run npm build
cd webapp && npm run build && cd ..
echo "Finished running npm build"

# Copy the built web app to the Pi
rsync -avz webapp/build/ $DESTINATION:/home/ijohnson/Kachhapa/webapp/build
echo "Finished copying the built web app"

# Copy the src directory
rsync -avz webapp/src/ $DESTINATION:/home/ijohnson/Kachhapa/webapp/src
echo "Finished copying the src directory"

# Copy the public directory
rsync -avz webapp/public/ $DESTINATION:/home/ijohnson/Kachhapa/webapp/public
echo "Finished copying the public directory"

# Switch everything back over to the development version of the files
# find ./webapp/src -name "*.js" -exec sed -i '' 's|/api/|http://127.0.0.1:5001/api/|g' {} \;
# echo "Finished switching back to the development version of the files"
