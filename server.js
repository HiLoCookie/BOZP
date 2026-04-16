app.use(express.static("public"));
const express = require("express");
const nodemailer = require("nodemailer");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 📧 EMAIL (Gmail + App Password)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 🧪 TEST SERVERU
app.get("/", (req, res) => {
  res.send("Server běží ✅");
});

// 📩 TEST EMAIL
app.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: "BOZP systém <eliska.vyskocilova.sos@gmail.com>",
      to: "eliska.vyskocilova.sos@gmail.com",
      subject: "Test email",
      text: "Email funguje správně 👍"
    });

    res.send("Email odeslán ✅");
  } catch (err) {
    console.error(err);
    res.send("Chyba při odesílání ❌");
  }
});

// 🏆 GENEROVÁNÍ CERTIFIKÁTU
app.post("/submit", async (req, res) => {
  const { name, email, workId, company, score, passed } = req.body;

  console.log("📩 request received");

  if (!passed) {
    return res.send("Test neprošel");
  }

  const today = new Date();
  const expiry = new Date();
  expiry.setFullYear(today.getFullYear() + 2);

  // 🎨 HTML šablona certifikátu
  const html = `
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f3f4f6;
        margin: 0;
        padding: 0;
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
        letter-spacing: 2px;
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
    // 🚀 Spuštění Puppeteer
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    // 📄 PDF jako buffer
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    // 📧 Odeslání emailu
    await transporter.sendMail({
      from: "BOZP systém <eliska.vyskocilova.sos@gmail.com>",
      to: [
        "eliska.vyskocilova.sos@gmail.com",
        "underanarchys@gmail.com",
        email
      ],
      subject: "BOZP certifikát – úspěšné absolvování",
      text: `${name} (${company}) úspěšně absolvoval test (${score}/6)`,
      attachments: [
        {
          filename: "certifikat.pdf",
          content: pdfBuffer
        }
      ]
    });

    console.log("✅ Email s certifikátem odeslán");
    res.send("Hotovo");

    req.body = null;

  } catch (err) {
    console.error("❌ Chyba:", err);
    res.status(500).send("Chyba serveru");
  }
});

// 🚀 START SERVERU
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
