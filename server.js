const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const session = require("express-session");
const bcrypt = require("bcrypt");

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

/* 🔐 SESSION */
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

/* 👤 USERS (FIRMY) */
const users = {
  soud: {
    username: process.env.COMPANY_SOUD_USERNAME,
    passwordHash: process.env.COMPANY_SOUD_HASH,
    companyName: "Okresní soud v Teplicích",
    companyEmail: process.env.COMPANY_SOUD_EMAIL
  }
};

/* 📧 EMAIL */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* 🧪 TEST */
app.get("/api/test", (req, res) => {
  res.send("Server běží ✅");
});

/* 🏠 FRONTEND */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* 🔐 LOGIN */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = Object.values(users).find(
    u => u.username === username
  );

  if (!user) return res.status(401).send("Špatné přihlášení");

  const ok = await bcrypt.compare(password, user.passwordHash);

  if (!ok) return res.status(401).send("Špatné přihlášení");

  req.session.user = { username };

  res.send("OK");
});

/* 🔒 AUTH MIDDLEWARE */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).send("Nepřihlášen");
  }
  next();
}

/* 📩 SUBMIT (CHRÁNĚNÝ) */
app.post("/submit", requireAuth, async (req, res) => {
  const { name, email, score, passed } = req.body;

  const user = Object.values(users).find(
    u => u.username === req.session.user.username
  );

  const companyDisplay = user.companyName;
  const companyEmail = user.companyEmail;

  console.log("📩 DATA:", req.body);

  if (!passed) {
    return res.send("Test neprošel ❌");
  }

  const today = new Date();
  const expiry = new Date();
  expiry.setFullYear(today.getFullYear() + 2);

  /* 🖼️ LOGO */
  const logoPath = path.join(__dirname, "src", "logo.png");

  let logoBase64 = "";
  try {
    logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
  } catch (err) {
    console.error("❌ Logo error:", err);
  }

  /* 🎨 HTML CERTIFIKÁT */
  const html = `
  <html>
  <head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4; margin: 0; }

    body { margin: 0; font-family: Arial; }

    .page {
      width: 210mm;
      height: 297mm;
      padding: 25mm;
      box-sizing: border-box;
      position: relative;
      border: 12px solid #b30000;
    }

    .title {
      text-align: center;
      font-size: 34px;
      font-weight: bold;
      color: #b30000;
      margin-top: 20mm;
    }

    .name {
      text-align: center;
      font-size: 38px;
      font-weight: bold;
      margin-top: 25px;
      text-decoration: underline;
    }

    .info {
      text-align: center;
      margin-top: 30px;
      font-size: 14px;
    }

    .logo {
      position: absolute;
      bottom: 80mm;
      left: 50%;
      transform: translateX(-50%);
    }

    .logo img {
      width: 120px;
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
      font-size: 12px;
    }

    .date-right {
      position: absolute;
      bottom: 20mm;
      right: 25mm;
      font-size: 12px;
      text-align: right;
    }
  </style>
  </head>

  <body>
    <div class="page">

      <div class="title">CERTIFIKÁT BOZP a PO</div>

      <div class="name">${name}</div>

      <div class="info">
        Firma: ${companyDisplay}<br>
        Skóre: ${score}/8
      </div>

      <div class="logo">
        <img src="data:image/png;base64,${logoBase64}" />
      </div>

      <div class="footer">
        Školení provedeno společností POHAS s.r.o.<br><br>
        PO – Š-221/95<br>
        BOZP – ROVS/1834/PREV/2023
      </div>

      <div class="date-left">
        ${today.toLocaleDateString("cs-CZ")}
      </div>

      <div class="date-right">
        Platnost do: ${expiry.toLocaleDateString("cs-CZ")}
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

    await page.setContent(html, {
      waitUntil: "domcontentloaded"
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    /* 📧 EMAIL */
    await transporter.sendMail({
      from: `BOZP systém <${process.env.EMAIL_USER}>`,
      to: [
        process.env.EMAIL_USER,
        email,
        companyEmail
      ],
      subject: "BOZP certifikát",
      text: `${name} (${companyDisplay})`,
      attachments: [
        {
          filename: "certifikat.pdf",
          content: pdfBuffer
        }
      ]
    });

    res.send("Hotovo ✅");

  } catch (err) {
    console.error(err);
    res.status(500).send("Chyba serveru");
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

/* 🚀 START */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server běží na portu " + PORT);
});
