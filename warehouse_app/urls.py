
from django.urls import path

from . import views
from . import auth_views


urlpatterns = [
    # Authentication
    path("auth/csrf/", auth_views.csrf_token, name="auth-csrf"),
    path("auth/register/", auth_views.register, name="auth-register"),
    path("auth/login/", auth_views.user_login, name="auth-login"),
    path("auth/logout/", auth_views.user_logout, name="auth-logout"),
    path("auth/me/", auth_views.current_user, name="auth-current-user"),

    # Products
    path("products/", views.product_list, name="product-list"),
    path("products/add/", views.product_create, name="product-create"),
    path("products/<int:product_id>/", views.product_detail, name="product-detail"),

    # Analytics
    path("analytics/", views.analytics_dashboard, name="analytics-dashboard"),

    # Stock movements
    path("stock-movements/", views.stock_movement_list, name="stock-movement-list"),
    path("stock-movements/add/", views.stock_movement_create, name="stock-movement-create"),
]
