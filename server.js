const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

/* 🔐 MAPA FIREM (ENV) */
const companyEmails = {
  "Okresní soud v Teplicích": process.env.COMPANY_SOUD
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

/* 📩 SUBMIT */
app.post("/submit", async (req, res) => {
  const { name, email, company, companyDisplay, score, passed } = req.body;

  console.log("📩 DATA:", req.body);

  const companyEmail = companyEmails[company];

  if (!companyEmail) {
    console.warn("❌ Neznámá firma:", company);
    return res.status(400).send("Neplatná společnost");
  }

  if (!passed) {
    return res.send("Test neprošel ❌");
  }

  const today = new Date();
  const expiry = new Date();
  expiry.setFullYear(today.getFullYear() + 2);

  /* 🖼️ LOGO → BASE64 (ZE /src/logo.png) */
  const logoPath = path.join(__dirname, "src", "logo.png");

  let logoBase64 = "";

  try {
    logoBase64 = fs.readFileSync(logoPath, { encoding: "base64" });
  } catch (err) {
    console.error("❌ Logo se nepodařilo načíst:", err);
  }

  /* 🎨 HTML CERTIFIKÁT */
  const html = `
  <html>
  <head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4; margin: 0; }

    body {
      margin: 0;
      font-family: Arial;
    }

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

    .subtitle {
      text-align: center;
      font-size: 18px;
      margin-top: 20px;
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
      line-height: 1.5;
    }

    .cert-info {
      margin-top: 10px;
      font-size: 11px;
      color: #444;
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

      <div class="subtitle">Potvrzujeme, že</div>

      <div class="name">${name}</div>

      <div class="subtitle">
        úspěšně absolvoval/a školení a test BOZP a PO
      </div>

      <div class="info">
        Firma: ${companyDisplay || company}<br>
        Skóre: ${score}/8
      </div>

      <!-- LOGO -->
      ${
        logoBase64
          ? `<div class="logo">
               <img src="data:image/png;base64,${logoBase64}" />
             </div>`
          : ""
      }

      <!-- TEXT -->
      <div class="footer">
        Školení a testování byly provedeny společností POHAS s.r.o., která zajišťuje BOZP vzdělávání a certifikaci zaměstnanců.

        <div class="cert-info">
          <br>
          PO – Osvědčení o odborné způsobilosti dle § 11 zák. ČNR č. 133/1985 Sb., pod číslem Š-221/95
          <br><br>
          BOZP – evidenční číslo ověření ROVS/1834/PREV/2023
        </div>
      </div>

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
    /* 🚀 PUPPETEER */
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
      subject: "BOZP a PO certifikát",
      text: `${name} úspěšně absolvoval test (${score}/8)`,
      attachments: [
        {
          filename: "certifikat.pdf",
          content: pdfBuffer
        }
      ]
    });

    res.send("Hotovo ✅ certifikát odeslán");

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send(err.message || "Chyba serveru");
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

/* 🚀 START */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server běží na portu " + PORT);
});
