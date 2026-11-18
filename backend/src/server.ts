import "dotenv/config";
import { createApp } from "./app.js";

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "development";
}

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production.");
}

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`New Modular API Server running on port ${port}`);
});
