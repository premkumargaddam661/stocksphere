from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('warehouse_app', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='products',
            name='category',
            field=models.ForeignKey(
                to='warehouse_app.categories',
                on_delete=django.db.models.deletion.DO_NOTHING,
                default=1,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='products',
            name='supplier',
            field=models.ForeignKey(
                to='warehouse_app.suppliers',
                on_delete=django.db.models.deletion.DO_NOTHING,
                blank=True,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='stockmovements',
            name='product',
            field=models.ForeignKey(
                to='warehouse_app.products',
                on_delete=django.db.models.deletion.DO_NOTHING,
            ),
        ),
    ]