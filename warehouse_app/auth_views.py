
import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST


def read_json(request):
    try:
        return json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    return JsonResponse({
        "success": True,
        "csrfToken": get_token(request),
    })


@require_POST
def register(request):
    data = read_json(request)

    if data is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid request data.",
        }, status=400)

    full_name = str(data.get("full_name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    confirm_password = data.get("confirm_password", "")

    if not full_name or not email or not password:
        return JsonResponse({
            "success": False,
            "message": "Please complete all required fields.",
        }, status=400)

    if len(full_name) > 150 or len(email) > 254:
        return JsonResponse({
            "success": False,
            "message": "One or more fields are too long.",
        }, status=400)

    if "@" not in email:
        return JsonResponse({
            "success": False,
            "message": "Enter a valid email address.",
        }, status=400)

    if password != confirm_password:
        return JsonResponse({
            "success": False,
            "message": "Passwords do not match.",
        }, status=400)

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({
            "success": False,
            "message": "An account with this email already exists.",
        }, status=409)

    first_name = full_name.split()[0]
    last_name = " ".join(full_name.split()[1:])

    candidate = User(
        username=email,
        email=email,
        first_name=first_name,
        last_name=last_name,
        is_active=False,
    )

    try:
        validate_password(password, user=candidate)
    except ValidationError as error:
        return JsonResponse({
            "success": False,
            "message": " ".join(error.messages),
        }, status=400)

    try:
        with transaction.atomic():
            User.objects.create_user(
                username=email,
                email=email,
                first_name=first_name,
                last_name=last_name,
                password=password,
                is_active=False,
            )
    except IntegrityError:
        return JsonResponse({
            "success": False,
            "message": "An account with this email already exists.",
        }, status=409)

    return JsonResponse({
        "success": True,
        "message": "Registration submitted. Your account is waiting for administrator approval.",
    }, status=201)


@require_POST
def user_login(request):
    data = read_json(request)

    if data is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid request data.",
        }, status=400)

    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    remember = bool(data.get("remember", False))

    if not email or not password:
        return JsonResponse({
            "success": False,
            "message": "Enter your email and password.",
        }, status=400)

    user_record = User.objects.filter(email__iexact=email).first()

    if user_record and user_record.check_password(password):
        if not user_record.is_active:
            return JsonResponse({
                "success": False,
                "message": "Your registration is waiting for administrator approval.",
                "pending": True,
            }, status=403)

    user = authenticate(
        request,
        username=user_record.username if user_record else email,
        password=password,
    )

    if user is None:
        return JsonResponse({
            "success": False,
            "message": "Invalid email or password.",
        }, status=401)

    login(request, user)

    if remember:
        request.session.set_expiry(60 * 60 * 24 * 14)
    else:
        request.session.set_expiry(0)

    return JsonResponse({
        "success": True,
        "message": "Login successful.",
        "user": {
            "email": user.email,
            "name": user.get_full_name() or user.username,
        },
    })


@require_POST
def user_logout(request):
    logout(request)
    return JsonResponse({
        "success": True,
        "message": "Logged out successfully.",
    })


@require_GET
def current_user(request):
    if not request.user.is_authenticated:
        return JsonResponse({
            "success": False,
            "authenticated": False,
            "message": "Please log in.",
        }, status=401)

    return JsonResponse({
        "success": True,
        "authenticated": True,
        "user": {
            "email": request.user.email,
            "name": request.user.get_full_name() or request.user.username,
        },
    })
