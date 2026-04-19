const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const path = require("path");

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

/* 🔐 MAPA FIREM (ENV) */
const companyEmails = {
  "Okresní soud v Teplicích": process.env.COMPANY_SOUD,
  // "ABC": process.env.COMPANY_ABC,
  // "XYZ": process.env.COMPANY_XYZ
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
  const { name, email, company, score, passed } = req.body;

  console.log("📩 DATA:", req.body);

  // 🔒 validace firmy
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

    .footer {
      position: absolute;
      bottom: 40mm;
      left: 25mm;
      right: 25mm;
      text-align: center;
      font-size: 13px;
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
        Firma: ${company}<br>
        Skóre: ${score}/8
      </div>

      <div class="date-left">
        Datum absolvování:<br>
        <strong>${today.toLocaleDateString("cs-CZ")}</strong>
      </div>

      <div class="date-right">
        Platnost do:<br>
        <strong>${expiry.toLocaleDateString("cs-CZ")}</strong>
      </div>

      <div class="footer">
        Školení bylo provedeno společností POHAS s.r.o.
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
    if (browser) await browser.close().catch(() => {});
  }
});

/* 🚀 START */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server běží na portu " + PORT);
});
