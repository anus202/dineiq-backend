import psycopg2

conn = psycopg2.connect(
    host='aws-0-ap-northeast-1.pooler.supabase.com',
    port=5432,
    dbname='postgres',
    user='postgres.djbfgmugbcxgskzidwtl',
    password='Anus24680@12',
    sslmode='require',
)
conn.autocommit = True
cur = conn.cursor()

with open(r'C:\Projects\dineiq-backend\worker\supabase_schema.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

cur.execute(sql)

cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
tables = [r[0] for r in cur.fetchall()]
print(f'Tables created: {len(tables)}')
for t in tables:
    print(f'  - {t}')

cur.execute("SELECT COUNT(*) FROM tbl_Role")
print(f'Roles: {cur.fetchone()[0]}')

conn.close()
print('Schema applied successfully!')
