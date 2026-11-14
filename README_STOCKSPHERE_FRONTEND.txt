STOCKSPHERE FRONTEND - COMPLETE PROJECT

START HERE
1. Extract the ZIP file.
2. Open the stocksphere folder in VS Code.
3. Run landing.html using VS Code Live Server.
4. Continue through the landing/login flow to open index.html.

FRONTEND FILES
- intro.html / intro.js: intro screen
- landing.html / landing.js: landing page
- login.html / login.js: frontend demo login
- index.html: complete inventory dashboard
- dashboard.css: dashboard styling
- dashboard.js: product, inventory, stock, sales and analytics logic
- style.css: shared intro/landing/login styling
- assets/: existing assets folder
- legacy-style-backup.css: backup of the old stylesheet that was previously misnamed script.js

SAMPLE INVENTORY
The dashboard starts with 25 sample products. Product data is saved in browser localStorage under stocksphere_products.

HOW INVENTORY WORKS
- Products shows available stock quantity and stock status.
- Stock button records stock IN or stock OUT movements.
- Sell button records a sale, subtracts the sold quantity from available stock, and stores the transaction.
- Analytics shows product count, stock value, recorded units sold and recorded sales revenue.
- Monthly Analytics lets you select any product and year to see monthly quantity and revenue.
- If no sale has been recorded for the selected product/year, the monthly chart shows clearly labelled sample/demo figures. Once you record sales, it displays those recorded transactions instead.

DATA NOTE
This is a frontend demo. Data is stored in the browser's localStorage, not MySQL. Different browsers/devices will not share data. The sample monthly sales figures are illustrative, not real business transactions. Django/MySQL integration can replace localStorage later.

CHARTS
Chart.js is loaded from its public CDN. Internet access is needed for the chart; the sales table and figures remain available if the chart library cannot load.
