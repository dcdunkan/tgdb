> It's a **work in progress**!

# The TGDB

Use Telegram channel as a minimal databases! 🚀 It's **fast**, faster than I
expected it to be, and like Telegram, it's **free**, **unlimited** and 🔓
**secure**, because you know, it is using Telegram's storage 😬. You may want to
look at
["Why this might not be a good idea/choice?"](#why-this-might-not-be-a-good-ideachoice)
also.

## What is this?

With this library, you can use your **private** or **public**
[Telegram](https://telegram.org) channel as minimal databases for your projects.
Create multiple databases, add, edit and delete records. It's still a small
concept and pretty bad code.

## Installation

**Install** the package using NPM via GitHub:

```bash
npm install dcdunkan/tgdb#main
```

## Usage

Here's a minimal example on how to use this library. But, initialize the TGDB
instance follow these steps first:

1. Create a **private** or **public** Telegram channel.
   - Send a message to the channel with the text: "**tgdb:entry**".
   - Get the channel **chat_id** and **message_id** of that message you just
     sent.

> You may use [@jsoonbot](https://telegram.me/jsoonbot),
> [@ForwardInfoBot](https://telegram.me/ForwardInfoBot) or bots like that to get
> the **chat_id** and **message_id**, by forwarding that message you just sent
> in the channel.

2. Go to https://my.telegram.org/ and login with your account.
   - Get the **API ID** and **API Hash**.
   - Get string session by running
     [this](https://painor.gitbook.io/gramjs/#installation) installation example
     of [GramJS](https://github.com/gram-js/gramjs) and save it somewhere.

> Installation example: https://painor.gitbook.io/gramjs/#installation

#### Create a TGDB instance

```ts
import { TGDB } from "tgdb-core";

const tgdb = new TGDB({
  apiId: 123456, // API ID from https://my.telegram.org/
  apiHash: "ABCD", // API hash from https://my.telegram.org/
  stringSession: "...", // String session you got from GramJS
  channelId: -100071801131325, // Channel `chat_id`
  entryPoint: 4, // `message_id` of the message "tgdb:entry"
});

await tgdb.connect(); // connect to the database
```

#### Work with the database

```ts
// Create a database
const db = await tgdb.createDatabase("employees");
// Or you could use
const db = await tgdb.database("employees");
// ^ it chooses an existing database, OR
// creates one if it does not exists.

// Insert record to the database
await db.insert("12345678", { first_name: "Linus" });

// Get the record data using
const data = await db.get("12345678");

// Modify the existing record data
await db.modify("12345678", {
  ...data,
  second_name: "Torvalds",
});

// Delete the record
await db.delete("12345678");

// Clear the whole database
await db.clear();
```

---

### Why this might not be a good idea/choice?

You see, this library works just by reading and sending messages in a particular
format using [MTProto API](https://core.telegram.org/tdlib). And
[GramJS](https://github.com/gram-js/gramjs) is used as the client library for
it. There are **rate limits**. That's the only issue I'm seeing with this library.
But, I don't think rate limits will be an issue for small scale applications,
though. Hey, I am not really sure about this, but I think: if the API calls are
hitting the limits frequently, your account may even get suspended.

> **"I am not as smart as the Telegram devs, but I'd put something in place that
> prevents such projects from succeeding at any meaningful scale :D"** ~ (Not me)

---

<p align="center">
  <samp><a href="LICENSE">MIT License</a> (C) 2022, Dunkan</samp><br>
  <samp><b>&lt; ♥️ & ☕ &gt;</b></samp>
</p>
