"use strict";

// Use the same hostname for frontend and backend during local development.
const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

const API_HOST = location.hostname;
const API_BASE = isLocal
    ? `http://${API_HOST}:8000/api`
    : "/api";

const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");

let csrfToken = "";

function showMessage(message, success = false) {
    registerMessage.style.color = success ? "#55d6a2" : "#ff6675";
    registerMessage.textContent = message;
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

async function submitRegistration(details) {
    if (!csrfToken) {
        await getCsrfToken();
    }

    const response = await fetch(`${API_BASE}/auth/register/`, {
        method: "POST",
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken
        },
        body: JSON.stringify(details)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "Registration failed.");
    }

    return data;
}

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (!fullName || !email || !password || !confirmPassword) {
        showMessage("Please complete all fields.");
        return;
    }

    if (password !== confirmPassword) {
        showMessage("Passwords do not match.");
        return;
    }

    if (password.length < 8) {
        showMessage("Password must contain at least 8 characters.");
        return;
    }

    const button = registerForm.querySelector(
        'button[type="submit"]'
    );

    const originalText = button.innerHTML;

    button.disabled = true;
    button.textContent = "SUBMITTING...";

    try {
        const data = await submitRegistration({
            full_name: fullName,
            email: email,
            password: password,
            confirm_password: confirmPassword
        });

        showMessage(
            data.message ||
            "Registration submitted. Waiting for administrator approval.",
            true
        );

        registerForm.reset();

    } catch (error) {
        showMessage(error.message);
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
});

// Obtain a CSRF token when the page loads.
getCsrfToken().catch((error) => {
    console.error("StockSphere connection error:", error);
    showMessage(
        "Cannot connect to StockSphere. Check that the server is running."
    );
});