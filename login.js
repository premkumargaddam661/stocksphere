
"use strict";

const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

const API_BASE = isLocal
    ? `http://${location.hostname}:8000/api`
    : "/api";

const loginForm = document.getElementById("loginForm");
const password = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const loginMessage = document.getElementById("loginMessage");
const forgotPassword = document.getElementById("forgotPassword");

let csrfToken = "";

function showMessage(message, success = false) {
    loginMessage.style.color = success ? "#55d6a2" : "#ff6675";
    loginMessage.textContent = message;
}

async function getCsrfToken() {
    const response = await fetch(`${API_BASE}/auth/csrf/`, {
        method: "GET",
        credentials: "include"
    });

    const data = await response.json();

    if (!response.ok || !data.csrfToken) {
        throw new Error("Unable to establish a secure connection.");
    }

    csrfToken = data.csrfToken;
}

async function apiPost(path, body) {
    if (!csrfToken) {
        await getCsrfToken();
    }

    const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
}

togglePassword.addEventListener("click", () => {
    const showing = password.type === "text";

    password.type = showing ? "password" : "text";
    togglePassword.textContent = showing ? "SHOW" : "HIDE";
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = password.value;
    const remember = document.getElementById("remember").checked;

    if (!email || !pass) {
        showMessage("Please complete all fields.");
        return;
    }

    const button = loginForm.querySelector('button[type="submit"]');
    const originalText = button.innerHTML;

    button.disabled = true;
    button.textContent = "SIGNING IN...";

    try {
        const data = await apiPost("/auth/login/", {
            email: email,
            password: pass,
            remember: remember
        });

        showMessage(data.message, true);

        setTimeout(() => {
            window.location.href = "index.html";
        }, 500);

    } catch (error) {
        showMessage(error.message);
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
});

forgotPassword.addEventListener("click", () => {
    const email = document.getElementById("email").value.trim();

    if (!email) {
        showMessage("Please enter your email address first.");
        return;
    }

    showMessage("Password recovery is not available yet.");
});

getCsrfToken().catch((error) => {
    console.error("StockSphere connection error:", error);
    showMessage("Cannot connect to StockSphere. Check that the server is running.");
});
