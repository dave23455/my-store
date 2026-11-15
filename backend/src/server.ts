import "dotenv/config";
import { createApp } from "./app.js";
import { startOtpCleanup } from "./modules/otp/otp.service.js";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}

const port = Number(process.env.PORT || 4000);
const app = createApp();
startOtpCleanup();

app.listen(port, () => {
  console.log(`New Modular API Server running on port ${port}`);
});
