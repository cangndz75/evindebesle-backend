const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const paymentRoutes = require("./routes/payment"); // initiate + callback burada

dotenv.config();

const app = express();

const allowedOrigins = [
  "http://localhost:3000",
  "https://evindebesle.com",
  "https://sandbox-api.iyzipay.com",     // Sadece fetch için gerekebilir
  "https://sandbox-secure.iyzipay.com", // 3D iframe sunucusu
];

app.use((req, res, next) => {
  console.log(`📥 ${req.method} - ${req.originalUrl}`);
  next();
});

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn("⛔️ CORS reddedildi:", origin);
      callback(new Error("CORS hatası: Erişime izin yok."));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/api/payment", paymentRoutes);

app.get("/", (req, res) => {
  res.send("✅ Iyzico ödeme sunucusu çalışıyor");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});