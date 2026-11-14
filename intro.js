
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");

let particles = [];
let width, height;

function resize() {
  width = canvas.width = window.innerWidth;
  height = canvas.height = window.innerHeight;

  particles = [];

  for (let i = 0; i < 110; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.5 + 0.15,
      opacity: Math.random() * 0.6 + 0.2
    });
  }
}

function animate() {
  ctx.clearRect(0, 0, width, height);

  particles.forEach(p => {
    p.y -= p.speed;

    if (p.y < 0) {
      p.y = height;
      p.x = Math.random() * width;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

    ctx.fillStyle = `rgba(235, 65, 83, ${p.opacity})`;
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#ed4054";
    ctx.fill();
  });

  requestAnimationFrame(animate);
}

resize();
animate();

window.addEventListener("resize", resize);

// Automatically move to the landing page
setTimeout(() => {
  window.location.href = "landing.html";
}, 6500);
