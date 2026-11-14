
from django.http import JsonResponse


class InventoryAuthenticationMiddleware:
    """
    Require an authenticated Django session for inventory API endpoints.
    Authentication endpoints remain publicly accessible.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path

        is_inventory_api = (
            path.startswith("/api/")
            and not path.startswith("/api/auth/")
        )

        if is_inventory_api and not request.user.is_authenticated:
            return JsonResponse({
                "success": False,
                "authenticated": False,
                "message": "Please log in to access StockSphere.",
            }, status=401)

        return self.get_response(request)
