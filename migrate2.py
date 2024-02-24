import sqlite3
import psycopg2
import logging

# Set up logging
logging.basicConfig(filename='database_migration.log', level=logging.INFO, format='%(asctime)s %(message)s')

# Connect to the SQLite database
sqlite_conn = sqlite3.connect('wiki/instance/wiki.db')
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

# Get all tables in the SQLite database
sqlite_cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [table[0] for table in sqlite_cur.fetchall()]
print(tables)

for table in tables:
    logging.info(f"Processing table: {table}")

    # Get all columns for the table in SQLite
    sqlite_cur.execute(f"PRAGMA table_info({table});")
    sqlite_columns = [column[1] for column in sqlite_cur.fetchall()]
    common_columns_str = ', '.join(sqlite_columns)

    # Fetch data from the SQLite database
    sqlite_cur.execute(f"SELECT {common_columns_str} FROM {table}")
    rows = sqlite_cur.fetchall()

    # Insert data into the PostgreSQL database
    for row in rows:
        try:
            pg_cur.execute(f"""
                INSERT INTO \"{table}\"({common_columns_str}) 
                VALUES ({', '.join(['%s'] * len(row))})
                ON CONFLICT DO NOTHING
            """, tuple(row))
        except psycopg2.Error as e:
            logging.error(f"Error inserting row into {table}: {e}")
            pg_conn.rollback()  # rollback the transaction

    pg_conn.commit()  # commit the changes