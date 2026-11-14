
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import User


class StockSphereUserAdmin(UserAdmin):
    list_display = (
        "username",
        "email",
        "first_name",
        "last_name",
        "is_active",
        "is_staff",
        "date_joined",
    )

    list_filter = (
        "is_active",
        "is_staff",
        "date_joined",
    )

    search_fields = (
        "username",
        "email",
        "first_name",
        "last_name",
    )

    actions = (
        "approve_selected_users",
        "deactivate_selected_users",
    )

    @admin.action(description="Approve selected registrations")
    def approve_selected_users(self, request, queryset):
        updated = queryset.filter(
            is_active=False,
            is_staff=False,
            is_superuser=False,
        ).update(is_active=True)

        self.message_user(
            request,
            f"{updated} account(s) approved successfully.",
        )

    @admin.action(description="Deactivate selected accounts")
    def deactivate_selected_users(self, request, queryset):
        updated = queryset.filter(
            is_staff=False,
            is_superuser=False,
        ).update(is_active=False)

        self.message_user(
            request,
            f"{updated} account(s) deactivated.",
        )


admin.site.unregister(User)
admin.site.register(User, StockSphereUserAdmin)
