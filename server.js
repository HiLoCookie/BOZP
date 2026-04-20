const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();

/* ---------------- MIDDLEWARE ---------------- */
app.use(express.json());

app.use(cors({
  origin: true,
  credentials: true
}));

/* 🔐 SESSION (LEPŠÍ VARIANTA) */
app.use(session({
  secret: process.env.SESSION_SECRET || "super-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Render = HTTP/HTTPS mix
    sameSite: "lax",
    maxAge: 1000 * 60 * 30 // 🔥 30 minut session timeout
  }
}));

app.use(express.static(__dirname));

/* ---------------- USERS ---------------- */
const users = {
  soud: {
    username: process.env.COMPANY_SOUD_USERNAME,
    password: process.env.COMPANY_SOUD_PASS,
    companyName: "Okresní soud v Teplicích",
    companyEmail: process.env.COMPANY_SOUD_EMAIL
  }
};

/* ---------------- EMAIL ---------------- */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ---------------- ROUTES ---------------- */

// login page
app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, "login.html"));
  }
  res.redirect("/index.html");
});

// login page explicit
app.get("/login.html", (req, res) => {
  if (req.session.user) {
    return res.redirect("/index.html");
  }
  res.sendFile(path.join(__dirname, "login.html"));
});

// protected app
app.get("/index.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login.html");
  }
  res.sendFile(path.join(__dirname, "index.html"));
});

/* ---------------- LOGIN ---------------- */
app.post("/login", (req, res) => {
  const username = req.body.username?.trim();
  const password = req.body.password?.trim();

  const user = Object.values(users).find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).send("Špatné přihlášení");
  }

  req.session.user = {
    username: user.username
  };

  res.send("OK");
});

/* ---------------- LOGOUT ---------------- */
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.send("logged out");
  });
});

/* ---------------- SUBMIT ---------------- */
app.post("/submit", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Not logged in");
  }

  const {
    name,
    email,
    company,
    companyDisplay,
    score,
    passed
  } = req.body;

  const user = Object.values(users).find(
    u => u.username === req.session.user.username
  );

  if (!user) {
    return res.status(400).send("User not found");
  }

  if (!passed) {
    return res.send("Test neprošel ❌");
  }

  const today = new Date();
  const expiry = new Date();
  expiry.setFullYear(today.getFullYear() + 2);

  /* ---------------- LOGO ---------------- */
  const logoPath = path.join(__dirname, "src", "logo.png");
  let logoBase64 = "";

  try {
    logoBase64 = fs.readFileSync(logoPath, "base64");
  } catch (e) {
    console.error("Logo error:", e);
  }

  const safeCompany = companyDisplay || company || "Neuvedeno";

  /* ---------------- HTML CERT ---------------- */
  const html = `
  <html>
  <head>
  <meta charset="UTF-8"/>
  <style>
    @page { size: A4; margin: 0; }

    body { margin: 0; font-family: Arial; }

    .page {
      width: 210mm;
      height: 297mm;
      padding: 25mm;
      box-sizing: border-box;
      border: 12px solid #b30000;
      position: relative;
    }

    .title {
      text-align: center;
      font-size: 34px;
      color: #b30000;
      font-weight: bold;
      margin-top: 20mm;
    }

    .name {
      text-align: center;
      font-size: 38px;
      font-weight: bold;
      margin-top: 25px;
      text-decoration: underline;
    }

    .logo-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      opacity: 0.08;
    }

    .logo-center img {
      width: 250px;
    }

    .info {
      text-align: center;
      margin-top: 20px;
    }

    .footer {
      position: absolute;
      bottom: 45mm;
      left: 25mm;
      right: 25mm;
      text-align: center;
      font-size: 12px;
    }

    .date-left {
      position: absolute;
      bottom: 20mm;
      left: 25mm;
    }

    .date-right {
      position: absolute;
      bottom: 20mm;
      right: 25mm;
    }
  </style>
  </head>

  <body>
    <div class="page">

      <div class="title">CERTIFIKÁT BOZP a PO</div>

      <div class="name">${name}</div>

      <div class="info">
        Firma: ${safeCompany}<br>
        Skóre: ${score}
      </div>

      <div class="logo-center">
        <img src="data:image/png;base64,${logoBase64}" />
      </div>

      <div class="footer">
        Školení a testování byly provedeny společností POHAS s.r.o., která zajišťuje BOZP vzdělávání a certifikaci zaměstnanců.<br><br>

        PO – Š-221/95<br>
        BOZP – ROVS/1834/PREV/2023
      </div>

      <div class="date-left">
        Absolvování testu: ${today.toLocaleDateString("cs-CZ")}
      </div>

      <div class="date-right">
        Expirace testu: ${expiry.toLocaleDateString("cs-CZ")}
      </div>

    </div>
  </body>
  </html>
  `;

  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: [process.env.EMAIL_USER, email, user.companyEmail],
      subject: "BOZP certifikát",
      attachments: [{ filename: "certifikat.pdf", content: pdfBuffer }]
    });

    res.send("OK CERT GENERATED");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

/* ---------------- START ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
