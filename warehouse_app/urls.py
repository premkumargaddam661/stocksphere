
from django.urls import path
from . import views

urlpatterns = [

    # Products
    path(
        "products/",
        views.product_list,
        name="product-list"
    ),

    path(
        "products/add/",
        views.product_create,
        name="product-create"
    ),

    path(
        "products/<int:product_id>/",
        views.product_detail,
        name="product-detail"
    ),

    # Categories
    path(
        "categories/",
        views.category_list,
        name="category-list"
    ),

    # Analytics
    path(
        "analytics/",
        views.analytics_dashboard,
        name="analytics-dashboard"
    ),

    # Stock movements
    path(
        "stock-movements/",
        views.stock_movement_list,
        name="stock-movement-list"
    ),

    path(
        "stock-movements/add/",
        views.stock_movement_create,
        name="stock-movement-create"
    ),

]
