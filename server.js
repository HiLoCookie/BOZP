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

// 📧 EMAIL (ENV)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 🧪 TEST
app.get("/api/test", (req, res) => {
  res.send("Server běží ✅");
});

// 🏠 FRONTEND
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 📩 SUBMIT + PDF + EMAIL
app.post("/submit", async (req, res) => {
  const { name, email, workId, company, score, passed } = req.body;

  console.log("📩 DATA:", req.body);

  if (!passed) {
    return res.send("Test neprošel ❌");
  }

  const today = new Date();
  const expiry = new Date();
  expiry.setFullYear(today.getFullYear() + 2);

  // 🎨 HTML CERTIFIKÁT
  const html = `
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: Arial; padding: 40px; }
      .box { border: 10px solid #1e3a8a; padding: 40px; text-align: center; }
      h1 { color: #1e3a8a; }
      .name { font-size: 32px; font-weight: bold; margin: 20px 0; }
      .info { margin-top: 30px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>BOZP CERTIFIKÁT</h1>
      <p>Potvrzujeme, že</p>
      <div class="name">${name}</div>
      <p>úspěšně absolvoval/a školení BOZP</p>

      <div class="info">
        <p>Firma: ${company}</p>
        <p>Skóre: ${score}/6</p>
        <p>ID: ${workId}</p>
        <p>Datum: ${today.toLocaleDateString("cs-CZ")}</p>
        <p>Platnost do: ${expiry.toLocaleDateString("cs-CZ")}</p>
      </div>
    </div>
  </body>
  </html>
  `;

  let browser;

  try {
    // 🚀 PUPPETEER (RENDER SAFE)
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

    // 📧 EMAIL SEND
    await transporter.sendMail({
      from: `BOZP systém <${process.env.EMAIL_USER}>`,
      to: [process.env.EMAIL_USER, email],
      subject: "BOZP certifikát",
      text: `${name} úspěšně absolvoval BOZP test (${score}/6)`,
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

// 🚀 START SERVERU
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
