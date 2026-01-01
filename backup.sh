#!/bin/bash

# Define the destination (replace with your Raspberry Pi's IP address and destination directory)
DESTINATION="ijohnson@raspberrypi.local"

# Define variables
PI_DB="db"
PI_DUMP_FILE="database_backup.dump"
LOCAL_DB="local_db"

# Dump the PostgreSQL database on the Raspberry Pi
ssh $DESTINATION "pg_dump -U admin -W -F c $PI_DB > $PI_DUMP_FILE"
echo "Finished dumping the database on the Raspberry Pi"

# Copy the dump file from the Raspberry Pi to the local machine
scp $DESTINATION:$PI_DUMP_FILE .
echo "Finished copying the database dump to the local machine"