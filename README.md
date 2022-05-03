<div align="center">
<table>
<tbody>
<td align="center">
<img width="2000" height="0"><br>

# 🚀 The TGDB

Make Telegram Channels your Database for the next project

<img width="2000" height="0">
</td>
</tbody>
</table>
</div>

### Hey, work in progress!

I'll update the documentation as the work is progressing.

```ts
import { TGDB } from "tgdb-core";

const tgdb = new TGDB({
  stringSession: "...",
  apiId: 123456,
  apiHash: "ABCD",
  channelId: -1001234567890,
  entryPoint: 3,
});

const db = await tgdb.database("session");
await db.insert("key", { name: "name" });
const data = await db.get("key");
await db.modify("key", { ...data, username: "uname" });
await db.delete("key");

const fullData = await db.getAll();
await db.clear();
```

- 🚀 **It's fast** — It's actually faster than I expected it to be!
- 💰 **Free** — If Telegram is free forever, this is too.
- 🗂 **Unlimited** — If Telegram supports unlimited messages in channels, this
  will be unlimited too.
- 🔓 **Secure** — If Telegram is secure, this is too.

> First of all, this is just a concept and a very baseline of the concept. I
> don't know if this is a good concept or not though.

## Installation

Install the package via NPM

```bash
npm install dcdunkan/tgdb#main
```

## How to?

- Create a Telegram channel, private or public. Get the channel ID.
- Send a message to the channel and get the message ID, it's the last part of
  the message link.
- Get `API ID` and `API Hash` from https://my.telegram.org/
- Get a string session from using [GramJS](https://github.com/gram-js/gramjs).

That's what you need to create a TGDB instance.

Then...

Check out the basic usage example above. I'll update the documentation after the
work is done.
