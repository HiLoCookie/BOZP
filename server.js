const express = require("express");
const nodemailer = require("nodemailer");
const puppeteer = require("puppeteer");
const cors = require("cors");
const path = require("path");

const app = express();

// middleware
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

// 🧪 API TEST
app.get("/api/test", (req, res) => {
  res.send("Server běží ✅");
});

// 🏠 FRONTEND
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 📩 SUBMIT
app.post("/submit", async (req, res) => {
  const { name, email, workId, company, score, passed } = req.body;

  console.log("📩 request received");

  if (!passed) {
    return res.send("Test neprošel");
  }

  const today = new Date();
  const expiry = new Date();
  expiry.setFullYear(today.getFullYear() + 2);

  // 🎨 HTML CERTIFIKÁT
  const html = `
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f3f4f6;
        margin: 0;
      }

      .container {
        width: 800px;
        height: 1130px;
        margin: auto;
        background: white;
        padding: 60px;
        border: 10px solid #1e3a8a;
        box-sizing: border-box;
        position: relative;
      }

      .header {
        text-align: center;
        font-size: 32px;
        font-weight: bold;
        color: #1e3a8a;
        margin-bottom: 40px;
      }

      .sub {
        text-align: center;
        font-size: 18px;
        margin-bottom: 20px;
      }

      .name {
        text-align: center;
        font-size: 34px;
        font-weight: bold;
        margin: 30px 0;
        text-decoration: underline;
      }

      .info-box {
        margin-top: 60px;
        padding: 20px;
        border: 2px solid #ddd;
        border-radius: 10px;
        font-size: 14px;
      }

      .footer {
        position: absolute;
        bottom: 60px;
        width: 700px;
        text-align: center;
        font-size: 12px;
        color: gray;
      }
    </style>
  </head>

  <body>
    <div class="container">

      <div class="header">
        CERTIFIKÁT BOZP
      </div>

      <div class="sub">
        Potvrzujeme, že
      </div>

      <div class="name">
        ${name}
      </div>

      <div class="sub">
        úspěšně absolvoval/a školení BOZP
      </div>

      <div class="info-box">
        <p><strong>Firma:</strong> ${company}</p>
        <p><strong>Skóre:</strong> ${score}/6</p>
        <p><strong>ID testu:</strong> ${workId}</p>
        <p><strong>Datum:</strong> ${today.toLocaleDateString("cs-CZ")}</p>
        <p><strong>Platnost do:</strong> ${expiry.toLocaleDateString("cs-CZ")}</p>
      </div>

      <div class="footer">
        POHAS s.r.o. – BOZP certifikační systém
      </div>

    </div>
  </body>
  </html>
  `;

  try {
    // 🚀 Puppeteer (Render safe config)
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    // 📧 EMAIL
    await transporter.sendMail({
      from: `BOZP systém <${process.env.EMAIL_USER}>`,
      to: [process.env.EMAIL_USER, email],
      subject: "BOZP certifikát – úspěšné absolvování",
      text: `${name} (${company}) úspěšně absolvoval test (${score}/6)`,
      attachments: [
        {
          filename: "certifikat.pdf",
          content: pdfBuffer
        }
      ]
    });

    res.send("Hotovo ✅");

  } catch (err) {
    console.error("❌ Chyba:", err);
    res.status(500).send("Chyba serveru");
  }

  // 🧹 cleanup
  req.body = null;
});

// 🚀 START (Render používá vlastní PORT)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
