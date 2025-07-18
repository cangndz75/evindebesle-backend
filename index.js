const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const paymentRoutes = require("./routes/payment");
const callbackRoute = require("./routes/callback");
const bodyParser = require("body-parser"); // 💡 eklendi

dotenv.config();

const app = express();
app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.text()); 
app.use(express.json());

app.use("/api/payment", paymentRoutes);
app.use("/api/payment/callback", callbackRoute);

app.get("/", (req, res) => {
  res.send("✅ Iyzico ödeme sunucusu çalışıyor");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
