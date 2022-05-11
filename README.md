> **WARNING: unstable**. This is a concept and the **work is still in
> progress**. You should expect breaking changes.

<div align="center">

---
  
<img width="250px" src="https://user-images.githubusercontent.com/70066170/167955253-22b0f766-c1ab-446f-b2f3-b67a08e6c8e2.png">

# Project TGDB

**Telegram channels as databases!**

---

</div>

Using this library you can use your private or public Telegram channels as
minimal database service. It is fast, free, secure and unlimited. A channel can
contain multiple databases, and it is possible to retrieve, insert, modify, and
delete records. You may also want to look at
["Is this a good choice for my projects?"](#is-this-a-good-choice-for-my-projects).

## Installation

Install the package using NPM (via GitHub)

```bash
npm install dcdunkan/tgdb#main
```

## Usage

Here's a minimal example on using this library. But to initialize a TGDB
instance, you have to go to https://my.telegram.org/ and login with your
account. You'll get a API ID and API hash from there. Store it somewhere secure.

<details>
  <summary>Optional steps (Will be prompted anyway)</summary><hr>

Get string session by running
[this](https://painor.gitbook.io/gramjs/#installation) installation example of
[GramJS](https://github.com/gram-js/gramjs) and save it somewhere. You can use
the API ID and API hash you got earlier from https://my.telegram.org.

> Installation example: https://painor.gitbook.io/gramjs/#installation

Create a private or public Telegram channel.

- Send a message to the channel with the text: "_tgdb:entry_".
- Get the channel **chat_id** and **message_id** of that message you just sent.

> You may use [@jsoonbot](https://telegram.me/jsoonbot),
> [@ForwardInfoBot](https://telegram.me/ForwardInfoBot) or bots like that to get
> the **chat_id** and **message_id**, by forwarding that message you just sent
> in the channel.

<hr>
</details>

### Create a TelegramDB instance

Import the `TelegramDB` class from the library.

```ts
import { TelegramDB } from "tgdb-core";
```

Create an instance:

```ts
const tgdb = new TelegramDB({
  apiId: 123456, // API ID from https://my.telegram.org/
  apiHash: "ABCD", // API hash from https://my.telegram.org/

  stringSession: "...", // String session you got from GramJS
  channelId: -100071801131325, // Channel `chat_id`
  entryPoint: 4, // `message_id` of the message "tgdb:entry"
});
```

All of the above parameters are required to initialize a `TelegramDB` instance.
However, it is possible to start the program by only providing your `apiId` and
`apiHash`. When you call the `TelegramDB.connect()` as shown below, the program
will prompt you to enter some details to generate the rest of the parameters.
You have to store them in a safe place and use them when you're running the
program again to avoid further unnecessary logins and channel creations. Now
connect to the instance call:

```ts
await tgdb.connect(); // connect to the instance
```

### Working with a database

Currently you have two operations related with the instance and four basic
operations related to records.

#### Creating and deleting databases

To create a new database or to choose an existing one:

```ts
const db = await tgdb.database("employees");
```

To delete a database:

```ts
await tgdb.deleteDatabase("employees");
```

#### Working with records

At the moment, you are only allowed to pass an JavaScript object as the value.
You can expect this to change in any future update.

```ts
// Add a record to the database
await db.add("12345678", { first_name: "Linus" });

// Get a record data using
const data = await db.get("12345678");
console.log(data);

// Modify an existing record data
await db.edit("12345678", { ...data, second_name: "Torvalds" });

// Delete a record
await db.delete("12345678");

// Clear the whole database
await db.clear();
```

- Querying the data is still in the TODO list.
- While modifying (`Database.edit(key: string, value: any)`) the data, you have
  to pass a full value. You cannot yet update a particular key-value pair in the
  JSON object.
- Clearing the database using `Database.clear()` will not delete the database.
  It will only delete all of the records, and the database name will still be in
  the `entryPoint` message of the channel.

### TODO

- Method to query data
- Allow storing not only as JSON objects
- Schema and Types
- Allow modifying a single key-value in the JSON object

---

## FAQ

(Or at least I expect these questions will be asked)

### How this works?

Actually the concept is pretty simple. We store the data in a particular format
as Telegram messages. For reading, the data is retrieved and parsed back in to
the JSON object. Internally, we use [GramJS](https://github.com/gram-js/gramjs)
to work with the User account.

### Why User accounts? Not bots?

Telegram bots cannot read the past messages. Ironically, in order to do that,
they need another database. You can cross-check with the
[Official Bot API documentation](https://core.telegram.org/bots/api) if you want
to. Since this library need to read and edit and delete the old messages, it is
necessary to use an User account for this project.

> #### Can my account get banned or suspended?
>
> Hopefully, **no**. At least, I used my main account for testing while
> developing this, and nothing happened yet :) I have hit the API limits
> multiple times, and still nothing happened.

### Why channels, not group or private chats?

It's called spamming, if you sent a lot of messages in a short period of time :)
And as I believe, sending messages in channels like that, is not restricted as
sending in groups and private chats.

### Is this a good choice for my projects?

That is something I am not totally sure about. For small projects, believe me,
it won't be a problem at all. But for a large-scale thingy, I am not sure. Sure,
this library can handle it, but Telegram rate limits are the only thing that
could be an issue. And sending a lot of messages (storing data) in a small time
period can also be considered as spamming - and for that your account might get
banned or suspended.

This project is still in it's early stage. Maybe, we can have proper answer for
this after testing in large scale. After the first stable release though.

## Related repositories

### Under development

- Web UI for manage the database

### Ideas

- HTTP API server
- Backups (A normal bot, maybe?)
- Data migration

---

<p align="center">
  <samp><a href="LICENSE">MIT License (C) 2022, Dunkan</a></samp><br>
  <samp><b>&lt; ♥️ & ☕ &gt;</b></samp>
</p>
