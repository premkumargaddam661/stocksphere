
const loginForm = document.getElementById("loginForm");
const password = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const loginMessage = document.getElementById("loginMessage");
const forgotPassword = document.getElementById("forgotPassword");

// Check that required elements exist
if (!loginForm || !password || !togglePassword || !loginMessage) {
    console.error("StockSphere login elements are missing.");
}

// Show / hide password
togglePassword.addEventListener("click", () => {
    if (password.type === "password") {
        password.type = "text";
        togglePassword.textContent = "HIDE";
    } else {
        password.type = "password";
        togglePassword.textContent = "SHOW";
    }
});

// Login
loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = password.value;
    const remember = document.getElementById("remember").checked;

    loginMessage.style.color = "#ff6675";

    if (!email || !pass) {
        loginMessage.textContent = "Please complete all fields.";
        return;
    }

    if (pass.length < 6) {
        loginMessage.textContent =
            "Password must contain at least 6 characters.";
        return;
    }

    // DEMO LOGIN ONLY - Django authentication will replace this.
    const user = {
        email: email,
        loggedIn: true
    };

    try {
        localStorage.removeItem("stocksphere_user");
        sessionStorage.removeItem("stocksphere_user");

        if (remember) {
            localStorage.setItem(
                "stocksphere_user",
                JSON.stringify(user)
            );
        } else {
            sessionStorage.setItem(
                "stocksphere_user",
                JSON.stringify(user)
            );
        }

        loginMessage.style.color = "#55d6a2";
        loginMessage.textContent = "Login successful! Opening dashboard...";

        // Redirect to dashboard
        setTimeout(() => {
            window.location.href = "index.html";
        }, 700);

    } catch (error) {
        loginMessage.textContent =
            "Login failed. Browser storage is unavailable.";
    }
});

// Forgot password
forgotPassword.addEventListener("click", () => {
    const email = document.getElementById("email").value.trim();

    if (!email) {
        loginMessage.style.color = "#ff6675";
        loginMessage.textContent =
            "Please enter your email address first.";
        return;
    }

    loginMessage.style.color = "#ff6675";
    loginMessage.textContent =
        "Password recovery will be available with Django.";
});
