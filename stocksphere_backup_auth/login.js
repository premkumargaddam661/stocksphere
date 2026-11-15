
const loginForm = document.getElementById("loginForm");
const password = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const loginMessage = document.getElementById("loginMessage");
const forgotPassword = document.getElementById("forgotPassword");

// Local development uses Django on port 8000.
// Railway uses the same domain for frontend and backend.
const API_BASE =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
        ? `http://${location.hostname}:8000/api`
        : "/api";

function showMessage(message, success = false) {
    loginMessage.style.color = success ? "#55d6a2" : "#ff6675";
    loginMessage.textContent = message;
}

async function getCsrfToken() {
    const response = await fetch(`${API_BASE}/auth/csrf/`, {
        method: "GET",
        credentials: "include",
        cache: "no-store"
    });

    const data = await response.json();

    if (!response.ok || !data.csrfToken) {
        throw new Error("Unable to initialize secure login. Please refresh.");
    }

    return data.csrfToken;
}

// Show / hide password
if (togglePassword && password) {
    togglePassword.addEventListener("click", () => {
        if (password.type === "password") {
            password.type = "text";
            togglePassword.textContent = "HIDE";
        } else {
            password.type = "password";
            togglePassword.textContent = "SHOW";
        }
    });
}

// Django session login
if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const pass = password.value;
        const remember = document.getElementById("remember").checked;

        if (!email || !pass) {
            showMessage("Please enter your email and password.");
            return;
        }

        const submitButton = loginForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        if (submitButton) {
            submitButton.disabled = true;
        }

        showMessage("Connecting securely to StockSphere...", true);

        try {
            const csrfToken = await getCsrfToken();

            const response = await fetch(`${API_BASE}/auth/login/`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken
                },
                body: JSON.stringify({
                    email: email,
                    password: pass,
                    remember: remember
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                showMessage(
                    data.message || "Login failed. Please try again."
                );
                return;
            }

            showMessage("Login successful! Opening dashboard...", true);

            window.location.href = "index.html";

        } catch (error) {
            console.error("StockSphere login error:", error);

            showMessage(
                error instanceof TypeError
                    ? "Cannot connect to the server. Please check your connection."
                    : error.message || "Something went wrong. Please try again."
            );

        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
}

// Forgot password
if (forgotPassword) {
    forgotPassword.addEventListener("click", (event) => {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();

        showMessage(
            email
                ? "Password recovery is not available yet. Contact your administrator."
                : "Please enter your email address first."
        );
    });
}
