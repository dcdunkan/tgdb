import { cleanEnv, num, str } from "envalid";
import { config } from "dotenv";

config();

export default cleanEnv(process.env, {
  API_ID: num(),
  API_HASH: str(),
  STRING_SESSION: str(),
  CHANNEL_ID: num(),
  ENTRY_POINT: num(),
});
