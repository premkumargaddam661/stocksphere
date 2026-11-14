import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import redirect


FRONTEND_EXTENSIONS = {".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf"}


def home(request):
    return redirect("/landing.html")


def health(request):
    return JsonResponse({"status": "ok"})


def frontend_file(request, file_path):
    candidate = (settings.BASE_DIR / file_path).resolve()
    try:
        candidate.relative_to(settings.BASE_DIR.resolve())
    except ValueError:
        raise Http404

    if candidate.suffix.lower() not in FRONTEND_EXTENSIONS or not candidate.is_file():
        raise Http404

    content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
    response = FileResponse(candidate.open("rb"), content_type=content_type)
    response["X-Content-Type-Options"] = "nosniff"
    return response
