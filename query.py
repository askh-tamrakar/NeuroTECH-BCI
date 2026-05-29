import sqlite3
conn = sqlite3.connect(r'E:\WebSite\NeuroTECH-BCI\data\EMG\processed\emg_data.db')
cur = conn.cursor()
cur.execute('SELECT name, sql FROM sqlite_master WHERE type="table"')
for row in cur.fetchall():
    print(row)
