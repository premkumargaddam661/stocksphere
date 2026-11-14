from django.contrib import admin
from django.urls import include, path, re_path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("health/", views.health, name="health"),
    path("admin/", admin.site.urls),
    path("api/", include("warehouse_app.urls")),
    re_path(
        r"^(?P<file_path>.+\.(?:html|css|js|png|jpe?g|webp|gif|svg|ico|woff2?|ttf))$",
        views.frontend_file,
        name="frontend-file",
    ),
]
