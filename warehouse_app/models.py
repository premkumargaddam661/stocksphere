
from django.db import models


# ==========================================
# CATEGORIES TABLE
# ==========================================

class Categories(models.Model):
    category_id = models.AutoField(primary_key=True)
    category_name = models.CharField(
        max_length=100,
        unique=True
    )

    class Meta:
        managed = False
        db_table = 'categories'

    def __str__(self):
        return self.category_name


# ==========================================
# SUPPLIERS TABLE
# ==========================================

class Suppliers(models.Model):
    supplier_id = models.AutoField(primary_key=True)
    supplier_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=15, blank=True, null=True)
    email = models.CharField(max_length=100, blank=True, null=True)
    address = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'suppliers'

    def __str__(self):
        return self.supplier_name


# ==========================================
# PRODUCTS TABLE
# ==========================================

class Products(models.Model):
    product_id = models.AutoField(primary_key=True)
    product_name = models.CharField(max_length=100)
    sku = models.CharField(max_length=50, unique=True)

    category = models.ForeignKey(
        Categories,
        on_delete=models.DO_NOTHING
    )

    supplier = models.ForeignKey(
        Suppliers,
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True
    )

    quantity = models.IntegerField()
    reorder_level = models.IntegerField()
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)

    # Product image path stored in MySQL
    image = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    class Meta:
        managed = False
        db_table = 'products'

    def __str__(self):
        return self.product_name


# ==========================================
# STOCK MOVEMENTS TABLE
# ==========================================

class StockMovements(models.Model):
    movement_id = models.AutoField(primary_key=True)

    product = models.ForeignKey(
        Products,
        on_delete=models.DO_NOTHING
    )

    movement_type = models.CharField(max_length=8)
    quantity = models.IntegerField()

    reference_note = models.CharField(
        max_length=200,
        blank=True,
        null=True
    )

    movement_date = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'stock_movements'

    def __str__(self):
        return f"{self.movement_type} - {self.product}"
