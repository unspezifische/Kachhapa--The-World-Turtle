#!/bin/bash

# Define the destination (replace with your Raspberry Pi's IP address and destination directory)
DESTINATION="ijohnson@raspberrypi.local"

set -euo pipefail   ## Exit on error, treat unset variables as errors, and fail on pipeline errors

## STEP 1. Copy backend files

# Create `requirements.txt` file
# pip freeze > Flask/requirements.txt

# Copy the requirements.txt file
rsync -avz Flask/requirements.txt $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying requirements.txt"

# Copy the import_5etools.py script
rsync -avz Flask/import_5etools.py $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying import_5etools.py"

# Copy the Flask app
rsync -avz Flask/app.py $DESTINATION:/home/ijohnson/Kachhapa/Flask/
echo "Finished copying app.py"

# Copy the templates directory for wiki pages
rsync -avz Flask/templates/ $DESTINATION:/home/ijohnson/Kachhapa/Flask/templates/
echo "Finished copying the templates directory"

# Copy the static directory for the server (libraries for wiki stuff)
rsync -avz Flask/static/ $DESTINATION:/home/ijohnson/Kachhapa/Flask/static/
echo "Finished copying the static directory"

## STEP 2. Copy migrations
# Copy the migrations directory for database migrations
rsync -avz Flask/migrations/ "$DESTINATION:/home/ijohnson/Kachhapa/Flask/migrations/"


# ## STEP 3. Install Python deps
# ssh $DESTINATION "/home/ijohnson/Kachhapa/venv/bin/pip install -r /home/ijohnson/Kachhapa/Flask/requirements.txt"
# echo "Finished installing Python dependencies"

## STEP 4. Create DB backup
# Define variables
PI_DB="db"
PI_DUMP_FILE="database_backup.dump"
PI_TMP_DUMP_FILE="database_backup.dump.tmp"

echo "Creating PostgreSQL dump on the Raspberry Pi..."
ssh "$DESTINATION" "bash -lc '
set -e
PGPASSWORD=\"admin\" pg_dump -U admin -h localhost -F c \"$PI_DB\" -f \"$PI_TMP_DUMP_FILE\"
mv \"$PI_TMP_DUMP_FILE\" \"$PI_DUMP_FILE\"
ls -lh \"$PI_DUMP_FILE\"
file \"$PI_DUMP_FILE\"
'"
echo "Finished dumping the database on the Raspberry Pi"

LOCAL_TMP_DUMP_FILE="database_backup.dump.tmp"

echo "Copying dump file from Raspberry Pi to local temp file..."
scp "$DESTINATION:$PI_DUMP_FILE" "$LOCAL_TMP_DUMP_FILE"

if [ ! -s "$LOCAL_TMP_DUMP_FILE" ]; then
  echo "Error: copied dump is empty. Keeping existing local backup."
  rm -f "$LOCAL_TMP_DUMP_FILE"
  exit 1
fi

if ! file "$LOCAL_TMP_DUMP_FILE" | grep -q "PostgreSQL custom database dump"; then
  echo "Error: copied file is not a valid PostgreSQL custom dump. Keeping existing local backup."
  rm -f "$LOCAL_TMP_DUMP_FILE"
  exit 1
fi

mv "$LOCAL_TMP_DUMP_FILE" "$PI_DUMP_FILE"

echo "Finished copying valid database dump to local machine"
ls -lh "$PI_DUMP_FILE"
file "$PI_DUMP_FILE"

## STEP 5. Run flask db upgrade
# Run database migrations on the Raspberry Pi
ssh "$DESTINATION" "bash -lc '
cd /home/ijohnson/Kachhapa/Flask
source /home/ijohnson/Kachhapa/venv/bin/activate
flask db upgrade
'"

## STEP 6. Copy/update myapp.service
# Push updated systemd service file to the Pi
scp myapp.service $DESTINATION:/home/ijohnson/myapp.service
ssh -t $DESTINATION "sudo mv /home/ijohnson/myapp.service /etc/systemd/system/myapp.service"
echo "Finished updating myapp.service"


## STEP 7. Reload systemd
ssh $DESTINATION "sudo systemctl daemon-reload"
echo "Finished reloading systemd"


## STEP 8. Build/copy frontend
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

## STEP 9. Copy nginx config
# Push updated Nginx configuration to the Pi & restart Nginx
scp nginx.conf $DESTINATION:/home/ijohnson/nginx.conf
ssh -t $DESTINATION "sudo mv /home/ijohnson/nginx.conf /etc/nginx/nginx.conf && sudo nginx -t"

## STEP 10. Reload nginx
ssh $DESTINATION "sudo systemctl reload nginx"
echo "Nginx configuration reloaded"

## STEP 11. Restart myapp once at the end
# Now that all files are up to date on the Pi, restart Flask in the background
ssh $DESTINATION "sudo systemctl restart myapp"
echo "Triggered Flask restart"

# Check the status of the Flask service
ssh "$DESTINATION" "bash -lc '
set -e
sudo systemctl is-active --quiet myapp
sudo systemctl status myapp --no-pager -l | head -n 40
'"