# Railway deployment

This repository contains a Django API backed by MySQL and a static HTML/CSS/JS frontend served by the same web service. The checked-in `railway.json` runs Django static collection, migrations, Gunicorn, and an HTTP health check.

## Configure Railway

1. Create a Railway project and deploy this repository as a service from GitHub.
2. Add a Railway **MySQL** service. Add references to its `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, and `MYSQLPASSWORD` variables in the Django service (or set equivalent `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` values).
3. Set `DJANGO_SECRET_KEY` to a long, unique secret. Do not commit it. `DEBUG` defaults to `False`.
4. Generate a public domain for the web service. The app allows Railway domains and reads `RAILWAY_PUBLIC_DOMAIN` for CSRF trust.
5. Deploy. The health endpoint is `/health/`; the app homepage redirects to the StockSphere landing page.

Optional comma-separated settings: `DJANGO_ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, and `CORS_ALLOWED_ORIGINS`. CSRF origins may be given with or without `https://`.

## Important database prerequisite

The inventory models (`warehouse_app/models.py`) have `managed = False`, so Django migrations intentionally do **not** create the inventory tables. Before using the inventory API, create/import the MySQL schema expected by the app (`categories`, `suppliers`, `products`, and `stock_movements`) into the Railway database. Standard Django authentication/admin tables are migrated automatically at startup. Railway's ephemeral filesystem is not persistent; uploaded product images should use durable object storage if they must survive redeployments.

## Local verification

Install `requirements.txt`, set `DJANGO_SECRET_KEY` and the MySQL `DB_*` values, then run:

```sh
python manage.py check
python manage.py collectstatic --noinput
python manage.py migrate --noinput
```
