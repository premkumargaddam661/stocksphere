/* StockSphere dashboard: Django API + MySQL + product image uploads */
"use strict";

const API_BASE = "http://127.0.0.1:8000/api";
const LOW_STOCK_LIMIT = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const FALLBACK_IMAGE = "https://placehold.co/100x100/202e44/f5f7fc?text=Product";

let CATEGORIES = [];
let products = [];
let movements = [];
let analyticsData = null;
let chartInstances = {};
let isLoading = false;
let toastTimer = null;
let previewObjectUrl = null;

async function apiRequest(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    // FormData must NOT receive a manually assigned Content-Type.
    // The browser adds the required multipart boundary automatically.
    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`Server returned an invalid response (${response.status}).`); }
    if (!response.ok || data.success === false) {
        throw new Error(data.message || `Request failed (${response.status}).`);
    }
    return data;
}

function money(value) {
    return "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[c]);
}
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}
function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function normalizeProduct(item) {
    return {
        id: Number(item.product_id),
        name: item.product_name || "Unnamed product",
        sku: item.sku || "",
        category: item.category_name || "Uncategorized",
        categoryId: Number(item.category_id),
        supplier: item.supplier_name || "—",
        supplierId: item.supplier_id == null ? null : Number(item.supplier_id),
        quantity: Number(item.quantity || 0),
        reorderLevel: Number(item.reorder_level ?? LOW_STOCK_LIMIT),
        costPrice: Number(item.cost_price || 0),
        price: Number(item.selling_price || 0),
        image: item.image || "",
        imageUrl: item.image_url || ""
    };
}
function productImage(product) {
    const src = product.imageUrl || FALLBACK_IMAGE;
    return `<img src="${escapeHTML(src)}" alt="${escapeHTML(product.name)}"
        style="width:42px;height:42px;object-fit:cover;border-radius:8px;flex-shrink:0"
        onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">`;
}
function formatMovementDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHTML(value) :
        date.toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function getMovementKind(item) {
    const type = String(item.movement_type || "").toLowerCase();
    if (type === "purchase" || type === "in") return "in";
    if (type === "issue" || type === "sale" || type === "out") return "out";
    return "other";
}

/* Navigation */
function openView(viewName) {
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === viewName));
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === viewName));
    const titles = { overview:"Overview", products:"Products", stock:"Stock Movements", analytics:"Analytics" };
    setText("pageTitle", titles[viewName] || "Overview");
    renderAll();
}
document.querySelectorAll("[data-view]").forEach(button =>
    button.addEventListener("click", () => openView(button.dataset.view)));
document.querySelectorAll("[data-view-link]").forEach(button =>
    button.addEventListener("click", () => openView(button.dataset.viewLink)));

/* Database loading */
function setupCategories() {
    const productCategory = document.getElementById("productCategory");
    const categoryFilter = document.getElementById("categoryFilter");
    if (productCategory) {
        productCategory.innerHTML = CATEGORIES.map(c =>
            `<option value="${Number(c.category_id)}">${escapeHTML(c.category_name)}</option>`
        ).join("");
    }
    if (categoryFilter) {
        const selected = categoryFilter.value || "all";
        categoryFilter.innerHTML = '<option value="all">All Categories</option>' +
            CATEGORIES.map(c => `<option value="${escapeHTML(c.category_name)}">${escapeHTML(c.category_name)}</option>`).join("");
        if ([...categoryFilter.options].some(o => o.value === selected)) categoryFilter.value = selected;
    }
}
async function loadCategories() {
    const data = await apiRequest("/categories/");
    CATEGORIES = Array.isArray(data.categories) ? data.categories : [];
    setupCategories();
}
async function loadProducts() {
    const data = await apiRequest("/products/");
    products = (data.products || []).map(normalizeProduct);
}
async function loadAnalytics() { analyticsData = await apiRequest("/analytics/"); }
async function loadMovements() {
    const data = await apiRequest("/stock-movements/");
    movements = Array.isArray(data.movements) ? data.movements : [];
}
async function refreshDatabaseData() {
    if (isLoading) return;
    isLoading = true;
    try {
        await Promise.all([loadCategories(), loadProducts(), loadAnalytics(), loadMovements()]);
        renderAll();
    } catch (error) {
        console.error("StockSphere API error:", error);
        showToast(`Could not load Django data: ${error.message}`);
        renderAll();
    } finally { isLoading = false; }
}

/* Product image preview */
const productImageInput = document.getElementById("productImage");
const productImagePreview = document.getElementById("productImagePreview");
const productImagePlaceholder = document.getElementById("productImagePlaceholder");
const removeProductImage = document.getElementById("removeProductImage");

function clearImagePreview() {
    if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
    }
    if (productImageInput) productImageInput.value = "";
    if (productImagePreview) {
        productImagePreview.removeAttribute("src");
        productImagePreview.hidden = true;
    }
    if (productImagePlaceholder) productImagePlaceholder.hidden = false;
}
function showImagePreview(src) {
    if (!productImagePreview || !productImagePlaceholder) return;
    productImagePreview.src = src;
    productImagePreview.hidden = false;
    productImagePlaceholder.hidden = true;
}
productImageInput?.addEventListener("change", () => {
    const file = productImageInput.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        productImageInput.value = "";
        showToast("Choose a JPG, PNG or WebP image.");
        return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
        productImageInput.value = "";
        showToast("Image is too large. Maximum allowed size is 5 MB.");
        return;
    }

    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    if (removeProductImage) removeProductImage.checked = false;
    showImagePreview(previewObjectUrl);
});
removeProductImage?.addEventListener("change", () => {
    if (removeProductImage.checked) {
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
        if (productImageInput) productImageInput.value = "";
        if (productImagePreview) productImagePreview.hidden = true;
        if (productImagePlaceholder) productImagePlaceholder.hidden = false;
        if (productImagePlaceholder) productImagePlaceholder.textContent = "Current image will be removed when you save";
    } else {
        const id = Number(document.getElementById("productId")?.value);
        const existing = products.find(p => p.id === id);
        if (existing?.imageUrl) showImagePreview(existing.imageUrl);
        else if (productImagePlaceholder) productImagePlaceholder.textContent = "Image preview will appear here";
    }
});

/* Product create/edit */
function openProductModal(product = null) {
    const form = document.getElementById("productForm");
    if (!form) return;
    form.reset();
    clearImagePreview();
    if (productImagePlaceholder) productImagePlaceholder.textContent = "Image preview will appear here";

    setText("modalTitle", product ? "Edit Product" : "Add Product");
    document.getElementById("productId").value = product?.id || "";
    document.getElementById("productName").value = product?.name || "";
    document.getElementById("productSKU").value = product?.sku || "";
    document.getElementById("productCategory").value = product ?
        String(product.categoryId) : String(CATEGORIES[0]?.category_id || "");
    document.getElementById("productQuantity").value = product?.quantity ?? 0;
    document.getElementById("productReorderLevel").value = product?.reorderLevel ?? LOW_STOCK_LIMIT;
    document.getElementById("productCostPrice").value = product?.costPrice ?? 0;
    document.getElementById("productPrice").value = product?.price ?? 0;

    if (product?.imageUrl) showImagePreview(product.imageUrl);
    document.getElementById("productModal").classList.add("open");
}
document.querySelectorAll('[data-action="add"]').forEach(b =>
    b.addEventListener("click", () => openProductModal()));

const productForm = document.getElementById("productForm");
productForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const idRaw = document.getElementById("productId").value.trim();
    const id = idRaw ? Number(idRaw) : null;
    const name = document.getElementById("productName").value.trim();
    const sku = document.getElementById("productSKU").value.trim();
    const categoryId = Number(document.getElementById("productCategory").value);
    const quantity = Number(document.getElementById("productQuantity").value);
    const reorderLevel = Number(document.getElementById("productReorderLevel").value);
    const costPrice = Number(document.getElementById("productCostPrice").value);
    const sellingPrice = Number(document.getElementById("productPrice").value);
    const category = CATEGORIES.find(c => Number(c.category_id) === categoryId);
    const existing = id ? products.find(p => p.id === id) : null;
    const imageFile = productImageInput?.files?.[0] || null;

    if (!name || !sku || sku.length > 50 || !category ||
        !Number.isInteger(quantity) || quantity < 0 ||
        !Number.isInteger(reorderLevel) || reorderLevel < 0 ||
        !Number.isFinite(costPrice) || costPrice < 0 ||
        !Number.isFinite(sellingPrice) || sellingPrice < 0) {
        showToast("Check all fields. SKU, category and valid non-negative numbers are required.");
        return;
    }
    if (id && !existing) { showToast("Product not found. Refresh and try again."); return; }
    if (imageFile && (!ALLOWED_IMAGE_TYPES.includes(imageFile.type) || imageFile.size > MAX_IMAGE_SIZE)) {
        showToast("Choose a JPG, PNG or WebP image up to 5 MB.");
        return;
    }

    const formData = new FormData();
    formData.append("product_name", name);
    formData.append("sku", sku);
    formData.append("category_id", String(categoryId));
    formData.append("supplier_id", existing?.supplierId == null ? "" : String(existing.supplierId));
    formData.append("quantity", String(quantity));
    formData.append("reorder_level", String(reorderLevel));
    formData.append("cost_price", String(costPrice));
    formData.append("selling_price", String(sellingPrice));
    if (imageFile) formData.append("image", imageFile);
    if (removeProductImage?.checked && !imageFile) formData.append("remove_image", "true");

    const button = productForm.querySelector('button[type="submit"]');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";
    try {
        await apiRequest(id ? `/products/${id}/` : "/products/add/", {
            method: id ? "PATCH" : "POST",
            body: formData
        });
        closeModal("productModal");
        await refreshDatabaseData();
        showToast(id ? "Product updated successfully." : "Product added successfully.");
    } catch (error) {
        console.error("Product save error:", error);
        showToast(`Product save failed: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = oldLabel;
    }
});

/* Stock movement: remains JSON */
function openStockModal(product) {
    if (!product) return;
    document.getElementById("stockForm").reset();
    document.getElementById("movementProductId").value = product.id;
    document.getElementById("movementType").value = "IN";
    document.getElementById("stockModal").classList.add("open");
}
document.getElementById("stockForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const productId = Number(document.getElementById("movementProductId").value);
    const type = document.getElementById("movementType").value;
    const quantity = Number(document.getElementById("movementQuantity").value);
    const product = products.find(p => p.id === productId);
    if (!product || !["IN","OUT"].includes(type) || !Number.isInteger(quantity) || quantity <= 0) {
        showToast("Enter a valid movement and a positive whole-number quantity."); return;
    }
    if (type === "OUT" && quantity > product.quantity) {
        showToast(`Insufficient stock. Available quantity: ${product.quantity}`); return;
    }
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const oldLabel = button.textContent;
    button.disabled = true;
    button.textContent = "Processing...";
    try {
        const result = await apiRequest("/stock-movements/add/", {
            method:"POST",
            body:JSON.stringify({ product_id:productId, movement_type:type, quantity })
        });
        closeModal("stockModal");
        await refreshDatabaseData();
        const newQty = result.movement?.new_stock_quantity ?? result.new_quantity ?? result.quantity;
        showToast(`${type === "IN" ? "Stock IN" : "Stock OUT"} recorded.${newQty !== undefined ? ` New stock: ${newQty}` : ""}`);
    } catch (error) {
        showToast(`Movement failed: ${error.message}`);
    } finally {
        button.disabled = false;
        button.textContent = oldLabel;
    }
});

/* Modal controls */
function closeModal(id) {
    document.getElementById(id)?.classList.remove("open");
    if (id === "productModal") {
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
    }
}
document.querySelectorAll("[data-close]").forEach(b =>
    b.addEventListener("click", () => closeModal(b.dataset.close)));
document.querySelectorAll(".modal-overlay").forEach(o => o.addEventListener("click", e => {
    if (e.target === o) closeModal(o.id);
}));
document.addEventListener("keydown", e => {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("open"));
});

/* Product table actions */
document.getElementById("productTable")?.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = Number(button.dataset.id);
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (button.dataset.action === "edit") openProductModal(product);
    if (button.dataset.action === "stock") openStockModal(product);
    if (button.dataset.action === "sale") showToast("Sales recording is not connected. No sale or stock change was made.");
    if (button.dataset.action === "delete") {
        if (!confirm(`Delete "${product.name}" from the database?`)) return;
        try {
            await apiRequest(`/products/${id}/`, { method:"DELETE" });
            await refreshDatabaseData();
            showToast("Product deleted successfully.");
        } catch (error) {
            showToast(`Delete failed: ${error.message}`);
        }
    }
});

/* Search and filters */
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
searchInput?.addEventListener("input", renderProducts);
categoryFilter?.addEventListener("change", renderProducts);
function getFilteredProducts() {
    const query = (searchInput?.value || "").toLowerCase();
    const category = categoryFilter?.value || "all";
    return products.filter(p =>
        (p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query) || p.supplier.toLowerCase().includes(query)) &&
        (category === "all" || p.category === category)
    );
}
function stockStatus(product) {
    if (product.quantity <= 0) return { label:"Out of Stock", css:"low" };
    if (product.quantity <= product.reorderLevel) return { label:"Low Stock", css:"low" };
    return { label:"In Stock", css:"good" };
}
function renderProducts() {
    const table = document.getElementById("productTable");
    if (!table) return;
    const filtered = getFilteredProducts();
    table.innerHTML = filtered.map(p => {
        const status = stockStatus(p);
        return `<tr>
            <td><div class="product-cell">${productImage(p)}<div><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.sku)} · ${escapeHTML(p.supplier)}</small></div></div></td>
            <td>${escapeHTML(p.category)}</td><td>${money(p.price)}</td><td>${p.quantity}</td>
            <td><span class="status ${status.css}">${status.label}</span></td>
            <td><div class="action-group">
                <button class="action-btn" data-action="stock" data-id="${p.id}">Stock</button>
                <button class="action-btn" data-action="sale" data-id="${p.id}">Sell</button>
                <button class="action-btn" data-action="edit" data-id="${p.id}">Edit</button>
                <button class="action-btn delete" data-action="delete" data-id="${p.id}">Delete</button>
            </div></td></tr>`;
    }).join("");
    document.getElementById("emptyState").hidden = filtered.length !== 0;
    setText("resultCount", `Showing ${filtered.length} of ${products.length} products`);
}

/* Dashboard overview */
function renderDashboard() {
    const overview = analyticsData?.overview || {};
    const inventory = analyticsData?.inventory || {};
    const totalProducts = Number(overview.total_products ?? products.length);
    const totalUnits = Number(overview.total_stock ?? products.reduce((s,p) => s+p.quantity,0));
    const low = Number(overview.low_stock_count ?? products.filter(p => p.quantity > 0 && p.quantity <= p.reorderLevel).length);
    const value = inventory.inventory_selling_value ?? products.reduce((s,p) => s+p.quantity*p.price,0);
    setText("totalProducts", totalProducts.toLocaleString("en-IN"));
    setText("totalUnits", totalUnits.toLocaleString("en-IN"));
    setText("inventoryValue", money(value));
    setText("lowStock", low.toLocaleString("en-IN"));
    setHTML("recentProducts", products.slice(0,5).map(p => `<tr>
        <td><div class="product-cell">${productImage(p)}<strong>${escapeHTML(p.name)}</strong></div></td>
        <td>${escapeHTML(p.category)}</td><td>${p.quantity}</td><td>${money(p.price)}</td></tr>`).join("") ||
        '<tr><td colspan="4" class="empty-state">No products available.</td></tr>');
    const out = Number(overview.out_of_stock_count ?? products.filter(p => p.quantity === 0).length);
    const healthy = Math.max(0,totalProducts-low-out);
    const pct = n => totalProducts ? Math.max(0,Math.min(100,n/totalProducts*100)) : 0;
    setHTML("healthSummary", `
        <div><div class="health-item"><span>Healthy stock</span><strong>${healthy}</strong></div><div class="health-bar"><div style="width:${pct(healthy)}%;background:#4dd6a0"></div></div></div>
        <div><div class="health-item"><span>Low stock</span><strong>${low}</strong></div><div class="health-bar"><div style="width:${pct(low)}%"></div></div></div>
        <div><div class="health-item"><span>Out of stock</span><strong>${out}</strong></div><div class="health-bar"><div style="width:${pct(out)}%;background:#ff7180"></div></div></div>
        <p style="color:#94a2b8;font-size:10px;line-height:1.7">Stock health uses each product's database reorder level.</p>`);
}

/* Stock movements */
function renderMovements() {
    const totalIn = movements.filter(m => getMovementKind(m)==="in").reduce((s,m)=>s+Number(m.quantity||0),0);
    const totalOut = movements.filter(m => getMovementKind(m)==="out").reduce((s,m)=>s+Number(m.quantity||0),0);
    setText("totalMovements", movements.length.toLocaleString("en-IN"));
    setText("totalIn", totalIn.toLocaleString("en-IN"));
    setText("totalOut", totalOut.toLocaleString("en-IN"));
    const rows = movements.map(m => {
        const kind = getMovementKind(m);
        const label = kind === "in" ? "STOCK IN" : kind === "out" ? (String(m.movement_type).toLowerCase()==="sale" ? "SALE" : "STOCK OUT") : escapeHTML(m.movement_type || "OTHER");
        return `<tr><td>${formatMovementDate(m.movement_date)}</td><td><strong>${escapeHTML(m.product_name || "Unknown product")}</strong><small style="display:block;color:#94a2b8">${escapeHTML(m.sku || "")}</small></td><td><span class="status ${kind==="in"?"good":kind==="out"?"low":""}">${label}</span></td><td>${Number(m.quantity||0).toLocaleString("en-IN")}</td></tr>`;
    }).join("");
    setHTML("movementTable", rows || '<tr><td colspan="4" class="empty-state">No stock movements recorded yet.</td></tr>');
}

/* Chart helpers */
function destroyChart(key) {
    if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; }
}
function chartTheme() {
    return {
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:"#dce3ef", usePointStyle:true, padding:18 } } },
        scales:{
            x:{ ticks:{color:"#94a2b8"}, grid:{color:"rgba(255,255,255,.045)"} },
            y:{ beginAtZero:true, ticks:{color:"#94a2b8", precision:0}, grid:{color:"rgba(255,255,255,.07)"} }
        }
    };
}
function drawBarChart(key, canvasId, labels, values, label, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;
    destroyChart(key);
    chartInstances[key] = new Chart(canvas, {
        type:"bar",
        data:{labels, datasets:[{label, data:values, backgroundColor:color, borderRadius:6, maxBarThickness:48}]},
        options:chartTheme()
    });
}
function drawAnalyticsCharts(summary) {
    if (typeof Chart === "undefined") {
        showToast("Chart.js could not load. Check your internet connection.");
        return;
    }
    const labels = summary.map(x => x.category_name || "Uncategorized");
    drawBarChart("categoryProducts","categoryProductsChart",labels,summary.map(x=>Number(x.product_count||0)),"Products","#ed4054");
    drawBarChart("categoryStock","categoryStockChart",labels,summary.map(x=>Number(x.total_quantity||0)),"Stock units","#4dd6a0");
    const inQty = movements.filter(m=>getMovementKind(m)==="in").reduce((s,m)=>s+Number(m.quantity||0),0);
    const outQty = movements.filter(m=>getMovementKind(m)==="out").reduce((s,m)=>s+Number(m.quantity||0),0);
    drawBarChart("movement","movementChart",["Stock IN","Stock OUT"],[inQty,outQty],"Units",["#4dd6a0","#ed4054"]);
    const inv = analyticsData?.inventory || {};
    const cost = Number(inv.inventory_cost_value ?? products.reduce((s,p)=>s+p.quantity*p.costPrice,0));
    const selling = Number(inv.inventory_selling_value ?? products.reduce((s,p)=>s+p.quantity*p.price,0));
    drawBarChart("valuation","valuationChart",["Cost value","Selling value"],[cost,selling],"Value (₹)",["#94a2b8","#ed4054"]);
}
function renderAnalytics() {
    const o = analyticsData?.overview || {};
    const inv = analyticsData?.inventory || {};
    const count = Number(o.total_products ?? products.length);
    const units = Number(o.total_stock ?? products.reduce((s,p)=>s+p.quantity,0));
    const low = Number(o.low_stock_count ?? products.filter(p=>p.quantity>0&&p.quantity<=p.reorderLevel).length);
    const out = Number(o.out_of_stock_count ?? products.filter(p=>p.quantity===0).length);
    const cost = inv.inventory_cost_value ?? products.reduce((s,p)=>s+p.quantity*p.costPrice,0);
    const selling = inv.inventory_selling_value ?? products.reduce((s,p)=>s+p.quantity*p.price,0);
    setText("analyticsProducts",count.toLocaleString("en-IN"));
    setText("analyticsUnits",units.toLocaleString("en-IN"));
    setText("analyticsCostValue",money(cost));
    setText("analyticsValue",money(selling));
    setText("analyticsLowStock",low.toLocaleString("en-IN"));
    setText("analyticsOutOfStock",out.toLocaleString("en-IN"));

    const lowProducts = products.filter(p=>p.quantity>0&&p.quantity<=p.reorderLevel)
        .sort((a,b)=>(a.quantity-a.reorderLevel)-(b.quantity-b.reorderLevel));
    const outProducts = products.filter(p=>p.quantity===0);
    setHTML("lowStockTable", lowProducts.map(p=>`<tr><td><strong>${escapeHTML(p.name)}</strong><small style="display:block;color:#94a2b8">${escapeHTML(p.sku)}</small></td><td>${p.quantity}</td><td>${p.reorderLevel}</td><td><span class="status low">${Math.max(0,p.reorderLevel-p.quantity)} units</span></td></tr>`).join("") ||
        '<tr><td colspan="4" class="empty-state">No low-stock products. Inventory levels look good.</td></tr>');
    setHTML("outOfStockTable", outProducts.map(p=>`<tr><td><strong>${escapeHTML(p.name)}</strong><small style="display:block;color:#94a2b8">${escapeHTML(p.sku)}</small></td><td>${escapeHTML(p.category)}</td><td>${p.reorderLevel}</td><td><span class="status low">Out of Stock</span></td></tr>`).join("") ||
        '<tr><td colspan="4" class="empty-state">No out-of-stock products.</td></tr>');
    drawAnalyticsCharts(analyticsData?.category_summary || []);
}

/* Monthly sales remains intentionally unavailable until there is a real sales API. */
function updateMonthlySalesProductOptions() {
    const select = document.getElementById("productSelect");
    if (!select) return;
    const old = select.value;
    select.innerHTML = products.map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join("") ||
        '<option value="">No products available</option>';
    if (products.some(p=>String(p.id)===old)) select.value = old;
    setText("totalQuantity","—");
    setText("totalRevenue","—");
    const canvas = document.getElementById("salesChart");
    const fallback = document.getElementById("salesChartFallback");
    if (typeof Chart === "undefined") { if(fallback) fallback.hidden=false; return; }
    if (fallback) fallback.hidden=true;
    if (!canvas) return;
    destroyChart("sales");
    chartInstances.sales = new Chart(canvas, {
        type:"bar",
        data:{labels:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],datasets:[{label:"Sales data not connected",data:Array(12).fill(null),backgroundColor:"rgba(237,64,84,.5)"}]},
        options:{...chartTheme(),plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{ticks:{color:"#94a2b8"},grid:{display:false}},y:{display:false}}}
    });
    setHTML("salesTable",'<tr><td colspan="4" class="empty-state">No actual sales records available yet.</td></tr>');
}

/* CSV export */
document.getElementById("exportBtn")?.addEventListener("click", () => {
    const headers = ["ID","SKU","Product","Category","Supplier","Quantity","Reorder Level","Cost Price","Selling Price"];
    const rows = products.map(p=>[p.id,p.sku,p.name,p.category,p.supplier,p.quantity,p.reorderLevel,p.costPrice,p.price]);
    const csv = [headers,...rows].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href=url;
    link.download="stocksphere-products.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Database products exported to CSV.");
});

/* Logout */
document.getElementById("logoutBtn")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem("stocksphere_user");
        sessionStorage.removeItem("stocksphere_user");
        window.location.href = "login.html";
    }
});
document.getElementById("refreshAnalyticsBtn")?.addEventListener("click", refreshDatabaseData);

function renderAll() {
    renderDashboard();
    renderProducts();
    renderMovements();
    renderAnalytics();
    updateMonthlySalesProductOptions();
}

/* Start */
setupCategories();
renderAll();
refreshDatabaseData();
