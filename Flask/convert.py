import sqlite3
import psycopg2
import logging

# Set up logging
logging.basicConfig(filename='database_migration.log', level=logging.INFO, format='%(asctime)s %(message)s')

# Connect to the SQLite database
sqlite_conn = sqlite3.connect('instance/db.sqlite')
sqlite_cur = sqlite_conn.cursor()
logging.info("Connected to the SQLite database")

# Connect to the PostgreSQL database
pg_conn = psycopg2.connect(
    dbname='db',
    user='admin',
    password='admin',
    host='localhost'
)
pg_cur = pg_conn.cursor()
logging.info("Connected to the PostgreSQL database")


## ** Migrate the User table from SQLite to PostgreSQL **
# Get all columns for the User table in SQLite
sqlite_cur.execute("PRAGMA table_info(User);")
sqlite_columns = [column[1] for column in sqlite_cur.fetchall()]

# Get all columns for the User table in PostgreSQL
pg_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'user';")
pg_columns = [column[0] for column in pg_cur.fetchall()]

# Find the intersection of the column names
common_columns = list(set(sqlite_columns) & set(pg_columns))
common_columns_str = ', '.join(common_columns)

# Fetch data from the SQLite User table
sqlite_cur.execute(f"SELECT {common_columns_str} FROM User")
rows = sqlite_cur.fetchall()

# Insert data into the PostgreSQL User table
for row in rows:
    # Convert the is_online value to a boolean
    row = list(row)
    for i, column in enumerate(common_columns):
        if column == 'is_online':
            row[i] = bool(row[i])

    try:
        pg_cur.execute(f"""
            INSERT INTO \"user\"({common_columns_str}) 
            VALUES ({', '.join(['%s'] * len(row))})
            ON CONFLICT DO NOTHING
        """, tuple(row))
    except psycopg2.Error as e:
        logging.error(f"Error inserting row into User: {e}")
        continue

pg_conn.commit()  # commit the changes


## ** Migrate the Character table from SQLite to PostgreSQL **
# Get all columns for the Character table in SQLite
sqlite_cur.execute("PRAGMA table_info(Character);")
sqlite_columns = [column[1] for column in sqlite_cur.fetchall()]

# Get all columns for the Character table in PostgreSQL
pg_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'character';")
pg_columns = [column[0] for column in pg_cur.fetchall()]

# Find the intersection of the column names
common_columns = list(set(sqlite_columns) & set(pg_columns))
# print("Character:", common_columns)
common_columns_str = ', '.join([f'"{column}"' for column in common_columns])  # quote column names

# Fetch data from the SQLite Character table
sqlite_cur.execute(f"SELECT {common_columns_str} FROM Character")
rows = sqlite_cur.fetchall()

# Insert data into the PostgreSQL Character table
for row in rows:
    try:
        pg_cur.execute(f"""
            INSERT INTO \"character\"({common_columns_str}) 
            VALUES ({', '.join(['%s'] * len(row))})
            ON CONFLICT DO NOTHING
        """, tuple(row))
    except psycopg2.Error as e:
        logging.error(f"Error inserting row into Character: {e}")
        continue

pg_conn.commit()  # commit the changes

## ** Create a mapping of the userIDs from SQLite to PostgreSQL **
# Create a mapping from user_id to character_id
user_to_character_map = {}
pg_cur.execute("SELECT \"userID\", id FROM character")
for row in pg_cur.fetchall():
    user_id, character_id = row
    user_to_character_map[user_id] = character_id

pg_conn.commit()  # commit the changes


## ** Migrate the rest of the tables from SQLite to PostgreSQL **
# Get all tables in the SQLite database
sqlite_cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = sqlite_cur.fetchall()
logging.info(f"Tables: {tables}")

# Define the tables to ignore
ignore_tables = ['user', 'character', 'item']

# Manually migrate the Item table
logging.info("Processing table: item")

# Get all columns for the Item table in SQLite
sqlite_cur.execute("PRAGMA table_info(Item);")
sqlite_columns = [column[1] for column in sqlite_cur.fetchall()]

# Get all columns for the Item table in PostgreSQL
pg_cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'item';")
pg_columns = [column[0] for column in pg_cur.fetchall()]

# Find the intersection of the column names
common_columns = list(set(sqlite_columns) & set(pg_columns))
common_columns_str = ', '.join(common_columns)

# Fetch data from the SQLite Item table
sqlite_cur.execute(f"SELECT {common_columns_str} FROM Item")
rows = sqlite_cur.fetchall()

# Insert data into the PostgreSQL Item table
for row in rows:
    # Replace any empty strings with None and remove commas from integers
    row = [value.replace(',', '') if isinstance(value, str) else value for value in row]
    row = [value if value != '' else 0 for value in row]

    try:
        pg_cur.execute(f"""
            INSERT INTO \"item\"({common_columns_str}) 
            VALUES ({', '.join(['%s'] * len(row))})
            ON CONFLICT DO NOTHING
        """, tuple(row))
    except psycopg2.Error as e:
        logging.error(f"Error inserting row into Item: {e}")
        logging.error(f"Offending row: {row}")
        continue

pg_conn.commit()  # commit the changes

# Insert data into the PostgreSQL database
for table in tables:
    table = table[0]

    # Skip the tables to ignore
    if table in ignore_tables:
        continue

    logging.info(f"Processing table: {table}")

    # Get all columns for the table in SQLite
    sqlite_cur.execute(f"PRAGMA table_info({table});")
    sqlite_columns = [column[1] for column in sqlite_cur.fetchall()]

    # Get all columns for the table in PostgreSQL
    pg_cur.execute(f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table}';")
    pg_columns = [column[0] for column in pg_cur.fetchall()]

    # Find the intersection of the column names
    common_columns = list(set(sqlite_columns) & set(pg_columns))

    # If 'user_id' is in the SQLite columns and 'character_id' is in the PostgreSQL columns, handle the mapping
    if 'user_id' in sqlite_columns and 'character_id' in pg_columns:
        common_columns.append('character_id')

    common_columns_str = ', '.join(common_columns)

    # Fetch data from the SQLite database
    sqlite_cur.execute(f"SELECT {common_columns_str.replace('character_id', 'user_id')} FROM {table}")
    rows = sqlite_cur.fetchall()

    for row in rows:
        row = list(row)
        if 'character_id' in common_columns:
            character_id_index = common_columns.index('character_id')
            user_id_index = row.index(row[character_id_index])
            if row[user_id_index] in user_to_character_map:
                row[character_id_index] = user_to_character_map[row[user_id_index]]
            else:
                logging.error(f"Skipping row in {table} due to missing character_id for user_id {row[user_id_index]}")
                continue

        if table in ['inventory', 'journal'] and 'character_id' in common_columns and row[character_id_index] is None:
            row[character_id_index] = 0  # insert a default value for character_id
            logging.warning(f"Inserting default value for character_id in {table}")

        if table == 'armor' and 'stealth_disadvantage' in common_columns:
            stealth_disadvantage_index = common_columns.index('stealth_disadvantage')
            row[stealth_disadvantage_index] = bool(row[stealth_disadvantage_index])

        # If the table is 'inventory' and 'equipped' is in the columns, convert the value to boolean
        if table == 'inventory' and 'equipped' in common_columns:
            equipped_index = common_columns.index('equipped')
            row[equipped_index] = bool(row[equipped_index])

        # If the table is 'weapon' and 'weapon_range' is in the columns, replace None with 0
        if table == 'weapon' and 'weapon_range' in common_columns:
            row = [value if value != '' else 0 for value in row]
            print(row)

        # Check for empty strings in integer columns
        for i, value in enumerate(row):
            if value == '' and isinstance(value, str):
                try:
                    pg_cur.execute(f"SELECT data_type FROM information_schema.columns WHERE table_name = '{table}' AND column_name = '{common_columns[i]}';")
                    data_type = pg_cur.fetchone()[0]
                    if data_type in ['integer', 'bigint', 'smallint']:
                        row[i] = None  # replace with None for integer columns
                except psycopg2.Error as e:
                    logging.error(f"Error checking data type of column {common_columns[i]} in {table}: {e}")
                    pg_conn.rollback()  # rollback the transaction

        try:
            pg_cur.execute(f"INSERT INTO \"{table}\"({common_columns_str}) VALUES ({', '.join(['%s'] * len(row))}) ON CONFLICT DO NOTHING", tuple(row))
        except psycopg2.Error as e:
            logging.error(f"Error inserting row into {table}: {e}")
            pg_conn.rollback()  # rollback the transaction

    pg_conn.commit()  # commit the changes