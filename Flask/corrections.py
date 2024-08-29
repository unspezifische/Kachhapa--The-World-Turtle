from sqlalchemy import create_engine, MetaData, Table, select, and_, delete

# Create a connection to the PostgreSQL database
engine = create_engine('postgresql://admin:admin@localhost/db')
metadata = MetaData()

# Reflect the tables
inventory = Table('inventory', metadata, autoload_with=engine)
character = Table('character', metadata, autoload_with=engine)
campaign_members = Table('campaign_members', metadata, autoload_with=engine)

# Reflect the tables
message = Table('message', metadata, autoload_with=engine)
journal = Table('journal', metadata, autoload_with=engine)

# Create a connection
with engine.connect() as connection:
    # Fetch all the User ID and Sender ID pairs
    s = select(message.c.id, message.c.sender_id)
    results = connection.execute(s)

    for result in results:
        print("Processing result:", result)

        # Look up the User ID from the Character table
        s = select(character.c.userID).where(character.c.id == result.sender_id)
        user_id = connection.execute(s).scalar()
        print("User ID:", user_id)

        # Get the correct Character ID from campaign_members table
        s = select(campaign_members.c.character_id).where(and_(campaign_members.c.user_id == user_id, campaign_members.c.campaign_id == 1))
        correct_character_id = connection.execute(s).scalar()
        print("Correct Character ID:", correct_character_id)

        # Update the Messages table only if correct_character_id is not None
        if correct_character_id is not None:
            stmt = message.update().where(message.c.id == result.id).values(sender_id=correct_character_id)
            connection.execute(stmt)
            print("Updated Messages for ID:", result.id)
        else:
            print("Skipped Messages for ID:", result.id, "due to None correct_character_id")

    # Commit the changes
    connection.commit()

    print("Finished updating Messages table")

    # Fetch all the User ID and Character ID pairs
    s = select(journal.c.id, journal.c.character_id)
    results = connection.execute(s)

    for result in results:
        print("Processing result:", result)

        # Look up the User ID from the Character table
        s = select(character.c.userID).where(character.c.id == result.character_id)
        user_id = connection.execute(s).scalar()
        print("User ID:", user_id)

        # Get the correct Character ID from campaign_members table
        s = select(campaign_members.c.character_id).where(and_(campaign_members.c.user_id == user_id, campaign_members.c.campaign_id == 1))
        correct_character_id = connection.execute(s).scalar()
        print("Correct Character ID:", correct_character_id)

        # Update the Journal table only if correct_character_id is not None
        if correct_character_id is not None:
            stmt = journal.update().where(journal.c.id == result.id).values(character_id=correct_character_id)
            connection.execute(stmt)
            print("Updated Journal for ID:", result.id)
        else:
            print("Skipped Journal for ID:", result.id, "due to None correct_character_id")

    # Commit the changes
    connection.commit()

    print("Finished updating Journal table")

    # Remove all but the first result from the Character table for each User ID/Campaign ID pair
    s = select(character.c.userID).distinct()
    user_ids = [row.userID for row in connection.execute(s)]

    for user_id in user_ids:
        print("Processing User ID:", user_id)

        # Get the first Character ID for this User ID
        s = select(character.c.id).where(character.c.userID == user_id).order_by(character.c.id)
        first_character_id = connection.execute(s).scalar()
        print("First Character ID:", first_character_id)

        # Get all Character IDs for this User ID
        s = select(character.c.id).where(character.c.userID == user_id)
        all_character_ids = [row.id for row in connection.execute(s)]
        print("All Character IDs:", all_character_ids)

        # Delete all Character IDs except the first one
        for character_id in all_character_ids:
            if character_id != first_character_id:
                stmt = delete(character).where(character.c.id == character_id)
                connection.execute(stmt)
                print("Deleted Character ID:", character_id)

    # Commit the changes
    connection.commit()