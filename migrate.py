import sqlite3
import sys

def migrate():
    try:
        db = sqlite3.connect('storage/ayurveda.db')
        try:
            db.execute('ALTER TABLE users ADD COLUMN admin_notes TEXT DEFAULT ""')
            print("Added admin_notes column.")
        except sqlite3.OperationalError:
            print("admin_notes already exists.")
            
        try:
            db.execute('ALTER TABLE users ADD COLUMN manual_dosha TEXT DEFAULT ""')
            print("Added manual_dosha column.")
        except sqlite3.OperationalError:
            print("manual_dosha already exists.")
            
        db.commit()
        db.close()
    except Exception as e:
        print(f"Migration error: {e}")

if __name__ == "__main__":
    migrate()
