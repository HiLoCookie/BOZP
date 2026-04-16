const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// 🧪 TEST SERVERU
app.get("/api/test", (req, res) => {
  res.send("Server běží ✅");
});

// 🏠 FRONTEND
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// 📩 DEBUG SUBMIT (PUPPETEER + EMAIL VYPNUTO)
app.post("/submit", (req, res) => {
  try {
    console.log("📩 DATA RECEIVED:", req.body);

    // 👉 simulace úspěchu
    return res.send("BACKEND OK");

  } catch (err) {
    console.error("❌ ERROR:", err);
    return res.status(500).send(err.toString());
  }
});

// 🚀 START SERVERU
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server běží na portu ${PORT}`);
});
