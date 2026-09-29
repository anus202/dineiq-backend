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

tables = [
    'tbl_auditlog', 'tbl_login', 'customer_favorites', 'tbl_recipe',
    'tbl_stockmovementlog', 'wastage', 'ratings', 'promotions',
    'pricing_history', 'tbl_payment', 'order_items', 'orders',
    'inventory', 'tbl_diningtable', 'tbl_signup', 'menu_items',
    'menu_categories', 'customers', 'restaurants', 'tbl_role',
]

for t in tables:
    cur.execute(f'TRUNCATE TABLE "{t}" CASCADE')
    print(f'Truncated {t}')

conn.close()
print('All tables truncated!')
