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

app.use(session({
  secret: process.env.SESSION_SECRET || "secret123",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Render HTTP/HTTPS kompatibilita
    sameSite: "lax"
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

// protect main app
app.get("/index.html", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/");
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
    username
  };

  res.send("OK");
});

/* ---------------- SUBMIT ---------------- */
app.post("/submit", async (req, res) => {
  console.log("📩 SUBMIT HIT", req.body);

  if (!req.session.user) {
    return res.status(401).send("Not logged in");
  }

  const { name, email, company, score, passed } = req.body;

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
        Firma: ${company}<br>
        Skóre: ${score}
      </div>

      <div class="footer">
        POHAS s.r.o. – školení BOZP a PO
      </div>

      <div class="date-left">
        ${today.toLocaleDateString("cs-CZ")}
      </div>

      <div class="date-right">
        Platnost: ${expiry.toLocaleDateString("cs-CZ")}
      </div>

    </div>
  </body>
  </html>
  `;

  let browser;

  try {
    /* ---------------- PUPPETEER ---------------- */
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ],
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

    /* ---------------- EMAIL ---------------- */
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: [
          process.env.EMAIL_USER,
          email,
          user.companyEmail
        ],
        subject: "BOZP certifikát",
        text: `${name} úspěšně absolvoval test`,
        attachments: [
          {
            filename: "certifikat.pdf",
            content: pdfBuffer
          }
        ]
      });

      console.log("📧 Email odeslán");
    } catch (mailErr) {
      console.error("❌ Email error:", mailErr);
    }

    res.send("OK CERT GENERATED");

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.status(500).send(err.message || "Server error");
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

/* ---------------- START ---------------- */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on " + PORT);
});
