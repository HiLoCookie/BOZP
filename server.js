const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();

/* middleware */
app.use(express.json());

app.use(cors({
  origin: true,
  credentials: true
}));

app.set("trust proxy", 1);

app.use(session({
  secret: process.env.SESSION_SECRET || "secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 30
  }
}));

app.use(express.static(__dirname));

/* USERS */
const users = {
  soud: {
    username: process.env.COMPANY_SOUD_USERNAME,
    password: process.env.COMPANY_SOUD_PASS,
    companyName: "Okresní soud v Teplicích",
    companyEmail: process.env.COMPANY_SOUD_EMAIL
  },
  ostatni: {
    username: process.env.COMPANY_OSTATNI_USERNAME,
    password: process.env.COMPANY_OSTATNI_PASS,
    companyName: "Ostatní",
    companyEmail: process.env.COMPANY_OSTATNI_EMAIL
  }
};

/* EMAIL */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ROUTES */

app.get("/", (req, res) => {
  if (!req.session.user) return res.sendFile(path.join(__dirname, "login.html"));
  res.redirect("/index.html");
});

app.get("/index.html", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "index.html"));
});

/* LOGIN */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = Object.values(users).find(
    u => u.username === username && u.password === password
  );

  if (!user) return res.status(401).send("Špatné přihlášení");

  req.session.user = { username };
  res.send("OK");
});

/* SUBMIT */
app.post("/submit", async (req, res) => {
  if (!req.session.user) return res.status(401).send("Not logged in");

  const { name, email, company, companyDisplay, score, passed } = req.body;

  const selectedCompany = users[company];

  if (!selectedCompany) {
    console.log("UNKNOWN:", company);
    return res.status(400).send("Neznámá firma");
  }

  if (!passed) return res.send("Test neprošel ❌");

  const today = new Date();
  const expiry = new Date();
  expiry.setFullYear(today.getFullYear() + 2);

  const logoBase64 = fs.readFileSync(path.join(__dirname, "src/logo.png"), "base64");

  const safeCompany = companyDisplay || selectedCompany.companyName;

/* 📄 CERT HTML */
  const html = `
<html>
<head>
<meta charset="UTF-8"/>
<style>
  @page { size: A4; margin: 0; }

  body {
    margin: 0;
    font-family: Arial, sans-serif;
  }

  .page {
    width: 210mm;
    height: 297mm;
    padding: 25mm;
    box-sizing: border-box;
    border: 10px solid #c40000; /* 🔴 červený okraj */
    position: relative;
  }

  .title {
    text-align: center;
    font-size: 36px;
    font-weight: bold;
    color: #c40000; /* 🔴 červený název */
    margin-top: 20mm;
    letter-spacing: 1px;
  }

  .subtitle {
    text-align: center;
    font-size: 18px;
    margin-top: 20px;
  }

  .name {
    text-align: center;
    font-size: 42px;
    font-weight: bold;
    margin-top: 20px;
  }

  .info {
    text-align: center;
    font-size: 16px;
    margin-top: 25px;
    line-height: 1.6;
  }

  .logo {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    opacity: 0.08;
  }

  .logo img {
    width: 260px;
  }

  .footer {
    position: absolute;
    bottom: 45mm;
    left: 25mm;
    right: 25mm;
    text-align: center;
    font-size: 13px;
    line-height: 1.6;
  }

  .date-left {
    position: absolute;
    bottom: 20mm;
    left: 25mm;
    font-size: 13px;
  }

  .date-right {
    position: absolute;
    bottom: 20mm;
    right: 25mm;
    font-size: 13px;
    text-align: right;
  }

</style>
</head>

<body>
  <div class="page">

    <div class="title">CERTIFIKÁT BOZP a PO</div>

    <div class="subtitle">Potvrzujeme, že</div>

    <div class="name">${name}</div>

    <div class="subtitle">
      úspěšně absolvoval/a školení a test BOZP a PO
    </div>

    <div class="info">
      Firma: <strong>${safeCompany}</strong><br>
      Skóre: <strong>${score}/8</strong>
    </div>

    <!-- LOGO -->
    <div class="logo">
      <img src="data:image/png;base64,${logoBase64}" />
    </div>

    <!-- TEXT -->
    <div class="footer">
      Školení a testování byly provedeny společností POHAS s.r.o.<br>
      PO – Osvědčení dle §11 zák. č. 133/1985 Sb. — Š-221/95<br>
      BOZP – evidenční číslo: ROVS/1834/PREV/2023
    </div>

    <!-- DATA -->
    <div class="date-left">
      Datum absolvování:<br>
      <strong>${today.toLocaleDateString("cs-CZ")}</strong>
    </div>

    <div class="date-right">
      Platnost do:<br>
      <strong>${expiry.toLocaleDateString("cs-CZ")}</strong>
    </div>

  </div>
</body>
</html>
`;

  const browser = await puppeteer.launch({
    args: [...chromium.args, "--no-sandbox"],
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  });

  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ format: "A4" });
  await browser.close();

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: [process.env.EMAIL_USER, email, selectedCompany.companyEmail],
    subject: "BOZP certifikát",
    attachments: [{ filename: "certifikat.pdf", content: pdf }]
  });

  res.send("Certifikát odeslán");
});

/* START */
app.listen(process.env.PORT || 3000);
