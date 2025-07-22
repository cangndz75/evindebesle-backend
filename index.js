const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const paymentRoutes = require("./routes/payment");

dotenv.config();

const app = express();

// ✅ Middleware'ler
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Burada sadece "false" kullan

// ✅ Route tanımları
app.use("/api/payment", paymentRoutes);

app.get("/", (req, res) => {
  res.send("✅ Iyzico ödeme sunucusu çalışıyor");
});

// ✅ Server başlat
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
