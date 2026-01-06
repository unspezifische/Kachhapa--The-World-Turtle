#!/bin/bash

# Define the destination (replace with your Raspberry Pi's IP address and destination directory)
DESTINATION="ijohnson@raspberrypi.local"

# Create `requirements.txt` file
# pip freeze > Flask/requirements.txt

# Copy the requirements.txt file
rsync -avz Flask/requirements.txt $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying requirements.txt"

# Copy the import_5etools.py script
rsync -avz Flask/import_5etools.py $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying import_5etools.py"

# # Install Python dependencies on the Raspberry Pi
ssh $DESTINATION "/home/ijohnson/Kachhapa/venv/bin/pip install -r /home/ijohnson/Kachhapa/Flask/requirements.txt"
echo "Finished installing Python dependencies"

# Copy the Flask app
rsync -avz Flask/app.py $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying app.py"

# # Copy GameElement directories
# rsync -avz GameElements/characterBackgrounds $DESTINATION:/home/ijohnson/Kachhapa/Flask/GameElements/
# echo "Finished copying character Backgrounds"

# rsync -avz GameElements/characterSheets $DESTINATION:/home/ijohnson/Kachhapa/Flask/GameElements/
# echo "Finished copying character sheets"

# rsync -avz GameElements/classes $DESTINATION:/home/ijohnson/Kachhapa/Flask/GameElements/
# echo "Finished copying classes"

# rsync -avz GameElements/races $DESTINATION:/home/ijohnson/Kachhapa/Flask/GameElements/
# echo "Finished copying races"

# Copy the templates directory for wiki pages
rsync -avz Flask/templates/ $DESTINATION:/home/ijohnson/Kachhapa/Flask/templates/
echo "Finished copying the templates directory"

# Copy the static directory for the server (libraries for wiki stuff)
rsync -avz Flask/static/ $DESTINATION:/home/ijohnson/Kachhapa/Flask/static/
echo "Finished copying the static directory"

# Now that all files are up to date on the Pi, restart Flask in the background
ssh $DESTINATION "sudo systemctl restart myapp"
echo "Triggered Flask restart"

# Define variables
PI_DB="db"
PI_DUMP_FILE="database_backup.dump"
LOCAL_DB="local_db"

# password for PG db: should be 'admin'. Whatever is in the Flask app in the line `app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://admin:admin@postgres:5432/db'`
# Dump the PostgreSQL database on the Raspberry Pi (non-interactive password)
# NOTE: avoid exposing the password in process lists/logs; PGPASSWORD is scoped to this command.
ssh $DESTINATION "PGPASSWORD='admin' pg_dump -U admin -h localhost -F c $PI_DB > $PI_DUMP_FILE"
echo "Finished dumping the database on the Raspberry Pi"

# Copy the dump file from the Raspberry Pi to the local machine
scp $DESTINATION:$PI_DUMP_FILE .
echo "Finished copying the database dump to the local machine"

# Push updated systemd service file to the Pi
scp myapp.service $DESTINATION:/home/ijohnson/myapp.service
ssh -t $DESTINATION "sudo mv /home/ijohnson/myapp.service /etc/systemd/system/myapp.service && sudo systemctl daemon-reload"
echo "Finished updating myapp.service"

# Push updated Nginx configuration to the Pi & restart Nginx
scp nginx.conf $DESTINATION:/etc/nginx/nginx.conf
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

# Check the status of the Flask service
ssh $DESTINATION "sudo systemctl status myapp"