const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const paymentRoutes = require("./routes/payment");

dotenv.config();

const app = express();

// ✅ Middleware'ler
app.use(cors({
  origin: "http://localhost:3000", // Local frontend adresi
  methods: ["GET", "POST"],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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