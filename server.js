const express = require("express");
const cors = require("cors");
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

app.set("trust proxy", 1);

/* SESSION */
app.use(session({
  secret: process.env.SESSION_SECRET || "super-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,        // Render HTTPS
    sameSite: "none",    // cross-site cookies
    maxAge: 1000 * 60 * 30 // 30 min
  }
}));

/* ---------------- USERS ---------------- */
const users = {
  soud: {
    username: process.env.COMPANY_SOUD_USERNAME,
    password: process.env.COMPANY_SOUD_PASS,
    companyName: "Okresní soud v Teplicích",
    companyEmail: process.env.COMPANY_SOUD_EMAIL
  },

  admin: {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASS,
    companyName: "ADMIN",
    companyEmail: process.env.EMAIL_USER
  },

  ostatni: {
    username: process.env.COMPANY_OSTATNI_USERNAME,
    password: process.env.COMPANY_OSTATNI_PASS,
    companyName: "Ostatní",
    companyEmail: process.env.COMPANY_OSTATNI_EMAIL
  }
};

/* ---------------- EMAIL ----------------
   Render (free) blokuje SMTP porty 25/465/587, proto Gmail přes nodemailer
   nefunguje. E-maily se posílají přes HTTPS API služby Brevo.
   Env proměnné: BREVO_API_KEY, EMAIL_USER (ověřený odesílatel v Brevo)
---------------------------------------- */
async function sendCertificate({ recipients, pdfBuffer, name }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_USER, name: "POHAS s.r.o. – BOZP" },
      to: recipients.map(email => ({ email })),
      subject: "BOZP certifikát",
      htmlContent: `<p>Dobrý den,</p><p>v příloze zasíláme certifikát BOZP a PO pro: <strong>${name}</strong>.</p><p>POHAS s.r.o.</p>`,
      attachment: [
        { name: "certifikat.pdf", content: Buffer.from(pdfBuffer).toString("base64") }
      ]
    }),
    signal: AbortSignal.timeout(20000)
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Brevo ${res.status}: ${body}`);
  }
  console.log("EMAIL OK:", recipients.join(", "), body);
}

/* ---------------- ROUTES ---------------- */

// root redirect
app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, "login.html"));
  }
  res.redirect("/index.html");
});

// login page
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

  const userEntry = Object.values(users).find(
    u => u.username === username && u.password === password
  );

  if (!userEntry) {
    return res.status(401).send("Špatné přihlášení");
  }

  req.session.user = {
    username
  };

  res.send("OK");
});

/* ---------------- LOGOUT ---------------- */
app.get("/force-logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/login.html");
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

  /* 🔥 správné mapování firmy */
  const user = users[company];

  if (!user) {
    return res.status(400).send("Neznámá firma");
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
  } catch (err) {
    console.error("Logo error:", err);
  }

  const safeCompany = companyDisplay || user.companyName || "Neuvedeno";

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

let browser;

  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox"],
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

    browser = null;

    // odstraní prázdné (chybějící env) a duplicitní adresy
    const recipients = [...new Set(
      [process.env.EMAIL_USER, email, user.companyEmail].filter(Boolean)
    )];

    await sendCertificate({ recipients, pdfBuffer, name });

    res.send("✅ Certifikát odeslán");

  } catch (err) {
    console.error("ERROR:", err);
    if (browser) await browser.close().catch(() => {});
    res.status(500).send("Chyba při odesílání: " + err.message);
  }
});

/* STATIC – až za chráněnými routami, jinak by index.html šel otevřít bez přihlášení */
app.use(express.static(__dirname, { index: false }));

/* ---------------- START ---------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server běží na portu " + PORT));
