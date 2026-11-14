
import json
import uuid
from decimal import Decimal, InvalidOperation

from PIL import Image, UnidentifiedImageError

from django.core.files.storage import default_storage
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone

from .models import Products, Categories, Suppliers, StockMovements


MAX_IMAGE_SIZE = 5 * 1024 * 1024

ALLOWED_IMAGE_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}


# ==========================================
# IMAGE HELPERS
# ==========================================

def validate_and_save_image(uploaded_image):
    if not uploaded_image:
        return None

    if uploaded_image.size > MAX_IMAGE_SIZE:
        raise ValueError("Image size must not exceed 5 MB")

    try:
        uploaded_image.seek(0)
        image = Image.open(uploaded_image)
        image.verify()

        image_format = image.format

        if image_format not in ALLOWED_IMAGE_FORMATS:
            raise ValueError(
                "Only JPG, JPEG, PNG and WEBP images are allowed"
            )

        uploaded_image.seek(0)
        extension = ALLOWED_IMAGE_FORMATS[image_format]
        filename = f"{uuid.uuid4().hex}{extension}"

        return default_storage.save(
            f"products/{filename}",
            uploaded_image
        )

    except ValueError:
        raise

    except (UnidentifiedImageError, OSError):
        raise ValueError("Uploaded file is not a valid image")

    finally:
        uploaded_image.seek(0)


def delete_product_image(image_path):
    if image_path:
        try:
            if default_storage.exists(image_path):
                default_storage.delete(image_path)
        except Exception:
            pass


def get_product_image_url(request, product):
    if not product.image:
        return None

    try:
        return request.build_absolute_uri(
            default_storage.url(product.image)
        )
    except Exception:
        return None


def get_product_request_data(request):
    content_type = request.content_type or ""

    if (
        content_type.startswith("multipart/form-data")
        or content_type.startswith(
            "application/x-www-form-urlencoded"
        )
    ):
        data = request.POST.dict()
        uploaded_image = request.FILES.get("image")
    else:
        try:
            data = json.loads(request.body or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("Invalid JSON data")

        uploaded_image = None

    if not isinstance(data, dict):
        raise ValueError("Request data must be an object")

    return data, uploaded_image


# ==========================================
# PRODUCT LIST
# ==========================================

def product_list(request):
    if request.method != "GET":
        return JsonResponse({
            "success": False,
            "message": "Method not allowed"
        }, status=405)

    products = Products.objects.select_related(
        "supplier"
    ).all().order_by("product_name")

    data = []

    for product in products:
        data.append({
            "product_id": product.product_id,
            "product_name": product.product_name,
            "sku": product.sku,
            "supplier_id": product.supplier_id,
            "supplier_name": (
                product.supplier.supplier_name
                if product.supplier else None
            ),
            "quantity": product.quantity,
            "reorder_level": product.reorder_level,
            "cost_price": str(product.cost_price),
            "selling_price": str(product.selling_price),
            "image": product.image,
            "image_url": get_product_image_url(request, product)
        })

    return JsonResponse({
        "success": True,
        "count": len(data),
        "products": data
    })


# ==========================================
# PRODUCT VALIDATION
# ==========================================

def validate_product_data(data, existing=None):
    required_fields = [
        "product_name",
        "sku",
        "quantity",
        "reorder_level",
        "cost_price",
        "selling_price"
    ]

    if existing is None:
        for field in required_fields:
            if field not in data:
                raise ValueError(f"{field} is required")

    allowed_fields = required_fields + ["supplier_id"]
    cleaned = {}

    for field in allowed_fields:
        if field not in data:
            continue

        value = data[field]

        if field in ["product_name", "sku"]:
            value = str(value).strip()

            if not value:
                raise ValueError(f"{field} cannot be empty")

            if field == "product_name" and len(value) > 100:
                raise ValueError("Product name cannot exceed 100 characters")

            if field == "sku" and len(value) > 50:
                raise ValueError("SKU cannot exceed 50 characters")

        elif field in ["quantity", "reorder_level"]:
            try:
                number = Decimal(str(value))

                if number != number.to_integral_value():
                    raise ValueError()

                value = int(number)

            except (InvalidOperation, TypeError, ValueError):
                raise ValueError(
                    f"{field} must be a whole number"
                )

            if value < 0:
                raise ValueError(
                    f"{field} cannot be negative"
                )

        elif field in ["cost_price", "selling_price"]:
            try:
                value = Decimal(str(value))
            except (InvalidOperation, TypeError, ValueError):
                raise ValueError(
                    f"{field} must be a valid amount"
                )

            if not value.is_finite() or value < 0:
                raise ValueError(
                    f"{field} must be a valid non-negative amount"
                )

        elif field == "supplier_id":
            if value in [None, ""]:
                value = None
            else:
                try:
                    number = Decimal(str(value))

                    if number != number.to_integral_value():
                        raise ValueError()

                    value = int(number)

                except (InvalidOperation, TypeError, ValueError):
                    raise ValueError(
                        "supplier_id must be a whole number"
                    )

        cleaned[field] = value

    if (
        cleaned.get("supplier_id") is not None
        and not Suppliers.objects.filter(
            supplier_id=cleaned["supplier_id"]
        ).exists()
    ):
        raise ValueError("Selected supplier does not exist")

    if existing is not None:
        merged = {
            "product_name": existing.product_name,
            "sku": existing.sku,
            "category_id": existing.category_id,
            "supplier_id": existing.supplier_id,
            "quantity": existing.quantity,
            "reorder_level": existing.reorder_level,
            "cost_price": existing.cost_price,
            "selling_price": existing.selling_price
        }

        merged.update(cleaned)
        cleaned = merged

    return cleaned


# ==========================================
# CREATE PRODUCT
# ==========================================

def product_create(request):
    if request.method != "POST":
        return JsonResponse({
            "success": False,
            "message": "Method not allowed"
        }, status=405)

    saved_image = None

    try:
        data, uploaded_image = get_product_request_data(request)
        cleaned = validate_product_data(data)

        # Categories remain in the database for existing products.
        # New products receive an internal default category.
        default_category = Categories.objects.order_by(
            "category_id"
        ).first()

        if default_category is None:
            return JsonResponse({
                "success": False,
                "message": (
                    "No existing default category is available. "
                    "Please contact the administrator."
                )
            }, status=500)

        if uploaded_image:
            saved_image = validate_and_save_image(uploaded_image)

        product = Products(
            product_name=cleaned["product_name"],
            sku=cleaned["sku"],
            category_id=default_category.category_id,
            supplier_id=cleaned.get("supplier_id"),
            quantity=cleaned["quantity"],
            reorder_level=cleaned["reorder_level"],
            cost_price=cleaned["cost_price"],
            selling_price=cleaned["selling_price"],
            image=saved_image
        )

        product.save(force_insert=True)

        return JsonResponse({
            "success": True,
            "message": "Product added successfully",
            "product_id": product.product_id,
            "image_url": get_product_image_url(request, product)
        }, status=201)

    except (ValueError, TypeError) as error:
        delete_product_image(saved_image)

        return JsonResponse({
            "success": False,
            "message": str(error)
        }, status=400)

    except IntegrityError:
        delete_product_image(saved_image)

        return JsonResponse({
            "success": False,
            "message": (
                "SKU already exists or database constraint failed"
            )
        }, status=400)

    except Exception:
        delete_product_image(saved_image)

        return JsonResponse({
            "success": False,
            "message": "Unable to save product"
        }, status=500)


# ==========================================
# UPDATE / DELETE PRODUCT
# ==========================================

def product_detail(request, product_id):
    try:
        product = Products.objects.get(product_id=product_id)
    except Products.DoesNotExist:
        return JsonResponse({
            "success": False,
            "message": "Product not found"
        }, status=404)

    if request.method in ["PUT", "PATCH"]:
        saved_image = None
        old_image = product.image

        try:
            data, uploaded_image = get_product_request_data(request)

            cleaned = validate_product_data(
                data,
                existing=product
            )

            if uploaded_image:
                saved_image = validate_and_save_image(uploaded_image)
                product.image = saved_image

            elif str(data.get("remove_image", "")).lower() in [
                "true", "1", "yes"
            ]:
                product.image = None

            product.product_name = cleaned["product_name"]
            product.sku = cleaned["sku"]

            # Keep the existing category unchanged internally.
            product.category_id = cleaned["category_id"]

            product.supplier_id = cleaned["supplier_id"]
            product.quantity = cleaned["quantity"]
            product.reorder_level = cleaned["reorder_level"]
            product.cost_price = cleaned["cost_price"]
            product.selling_price = cleaned["selling_price"]

            product.save()

            if old_image and old_image != product.image:
                delete_product_image(old_image)

            return JsonResponse({
                "success": True,
                "message": "Product updated successfully",
                "image_url": get_product_image_url(request, product)
            })

        except (ValueError, TypeError) as error:
            delete_product_image(saved_image)

            return JsonResponse({
                "success": False,
                "message": str(error)
            }, status=400)

        except IntegrityError:
            delete_product_image(saved_image)

            return JsonResponse({
                "success": False,
                "message": (
                    "SKU already exists or database constraint failed"
                )
            }, status=400)

        except Exception:
            delete_product_image(saved_image)

            return JsonResponse({
                "success": False,
                "message": "Unable to update product"
            }, status=500)

    elif request.method == "DELETE":
        if StockMovements.objects.filter(
            product_id=product_id
        ).exists():
            return JsonResponse({
                "success": False,
                "message": (
                    "Cannot delete product because stock movements exist"
                )
            }, status=400)

        old_image = product.image
        product.delete()
        delete_product_image(old_image)

        return JsonResponse({
            "success": True,
            "message": "Product deleted successfully"
        })

    return JsonResponse({
        "success": False,
        "message": "Method not allowed"
    }, status=405)


# ==========================================
# STOCK MOVEMENT LIST
# ==========================================

def stock_movement_list(request):
    if request.method != "GET":
        return JsonResponse({
            "success": False,
            "message": "Method not allowed"
        }, status=405)

    movements = StockMovements.objects.select_related(
        "product"
    ).all().order_by("-movement_date", "-movement_id")

    data = []

    for movement in movements:
        data.append({
            "movement_id": movement.movement_id,
            "product_id": movement.product_id,
            "product_name": movement.product.product_name,
            "sku": movement.product.sku,
            "movement_type": movement.movement_type,
            "quantity": movement.quantity,
            "reference_note": movement.reference_note,
            "movement_date": movement.movement_date.isoformat()
        })

    return JsonResponse({
        "success": True,
        "count": len(data),
        "movements": data
    })


# ==========================================
# CREATE STOCK MOVEMENT
# ==========================================

def stock_movement_create(request):
    if request.method != "POST":
        return JsonResponse({
            "success": False,
            "message": "Method not allowed"
        }, status=405)

    try:
        data = json.loads(request.body or b"{}")

        if not isinstance(data, dict):
            raise ValueError("Request data must be a JSON object")

        try:
            product_id = int(data.get("product_id"))
        except (TypeError, ValueError):
            raise ValueError("A valid product_id is required")

        try:
            quantity_value = Decimal(str(data.get("quantity")))

            if quantity_value != quantity_value.to_integral_value():
                raise ValueError()

            quantity = int(quantity_value)

        except (InvalidOperation, TypeError, ValueError):
            raise ValueError("Quantity must be a whole number")

        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero")

        requested_type = str(
            data.get("movement_type", "")
        ).strip().upper()

        movement_type_map = {
            "IN": "Purchase",
            "OUT": "Issue"
        }

        if requested_type not in movement_type_map:
            raise ValueError("Movement type must be IN or OUT")

        database_type = movement_type_map[requested_type]

        reference_note = str(
            data.get("reference_note") or ""
        ).strip()

        if len(reference_note) > 200:
            raise ValueError(
                "Reference note cannot exceed 200 characters"
            )

        with transaction.atomic():
            try:
                product = Products.objects.select_for_update().get(
                    product_id=product_id
                )
            except Products.DoesNotExist:
                return JsonResponse({
                    "success": False,
                    "message": "Selected product does not exist"
                }, status=404)

            if requested_type == "IN":
                product.quantity += quantity
            else:
                if quantity > product.quantity:
                    raise ValueError(
                        f"Insufficient stock. Available quantity: "
                        f"{product.quantity}"
                    )

                product.quantity -= quantity

            product.save(update_fields=["quantity"])

            movement = StockMovements.objects.create(
                product_id=product.product_id,
                movement_type=database_type,
                quantity=quantity,
                reference_note=reference_note or None,
                movement_date=timezone.now()
            )

        return JsonResponse({
            "success": True,
            "message": "Stock movement recorded successfully",
            "movement": {
                "movement_id": movement.movement_id,
                "product_id": product.product_id,
                "product_name": product.product_name,
                "movement_type": movement.movement_type,
                "quantity": movement.quantity,
                "new_stock_quantity": product.quantity,
                "movement_date": movement.movement_date.isoformat()
            }
        }, status=201)

    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({
            "success": False,
            "message": "Invalid JSON data"
        }, status=400)

    except ValueError as error:
        return JsonResponse({
            "success": False,
            "message": str(error)
        }, status=400)


# ==========================================
# ANALYTICS
# ==========================================

def analytics_dashboard(request):
    if request.method != "GET":
        return JsonResponse({
            "success": False,
            "message": "Method not allowed"
        }, status=405)

    products = Products.objects.all()

    total_products = products.count()
    total_stock = 0

    low_stock_products = []
    out_of_stock_products = []

    inventory_cost_value = Decimal("0.00")
    inventory_selling_value = Decimal("0.00")

    for product in products:
        total_stock += product.quantity

        inventory_cost_value += (
            Decimal(product.quantity) * product.cost_price
        )

        inventory_selling_value += (
            Decimal(product.quantity) * product.selling_price
        )

        if 0 < product.quantity <= product.reorder_level:
            low_stock_products.append({
                "product_id": product.product_id,
                "product_name": product.product_name,
                "quantity": product.quantity,
                "reorder_level": product.reorder_level
            })

        if product.quantity == 0:
            out_of_stock_products.append({
                "product_id": product.product_id,
                "product_name": product.product_name
            })

    total_movements = StockMovements.objects.count()

    purchase_movements = StockMovements.objects.filter(
        movement_type="Purchase"
    ).count()

    sales_movements = StockMovements.objects.filter(
        movement_type="Sale"
    ).count()

    issue_movements = StockMovements.objects.filter(
        movement_type="Issue"
    ).count()

    return JsonResponse({
        "success": True,

        "overview": {
            "total_products": total_products,
            "total_stock": total_stock,
            "low_stock_count": len(low_stock_products),
            "out_of_stock_count": len(out_of_stock_products)
        },

        "inventory": {
            "inventory_cost_value": str(inventory_cost_value),
            "inventory_selling_value": str(inventory_selling_value)
        },

        "stock_movements": {
            "total_movements": total_movements,
            "purchase_movements": purchase_movements,
            "sales_movements": sales_movements,
            "issue_movements": issue_movements
        },

        "low_stock_products": low_stock_products,
        "out_of_stock_products": out_of_stock_products
    })
