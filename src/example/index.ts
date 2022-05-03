import env from "./env";
import { TGDB } from "..";

const tgdb = new TGDB({
  stringSession: env.STRING_SESSION,
  apiId: env.API_ID,
  apiHash: env.API_HASH,
  channelId: env.CHANNEL_ID,
  entryPoint: env.ENTRY_POINT,
  debug: true,
});

(async function () {
  await tgdb.connect();
  const session = await tgdb.database("session");
  const data = await session.getAll();
  console.log(data);
})();

// function sleep(ms: number) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }
