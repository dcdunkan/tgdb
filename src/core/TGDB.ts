import { Database } from "./Database";
import { TGDBConfig } from "../types";
import { parseData, parseIndex, Table } from "./utils/parse";
import { isClean } from "./utils/utils";

import prompts from "prompts";
import { cyan, dim, green } from "chalk";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { LogLevel } from "telegram/extensions/Logger";

/**
 * Create and connect Telegram Database instance. You can create, delete
 * databases in the channel.
 *
 * You can create an instance just with your API ID and API hash. And other
 * essential details will be prompted through the CLI. **You have to store**
 * the `STRING SESSION`, `CHANNEL ID` and `ENTRY POINT` and use them again
 * in your Telegram DB configuration.
 *
 * ```ts
 * const tgdb = new TelegramDB({
 *   apiId: 123456, // API ID from https://my.telegram.org/
 *   apiHash: "12ab34cd56ef78gh90ij", // API hash *
 * });
 * ```
 *
 * Or you could provide more details as shown in the example below. But, still
 * the required missing configuration will be prompted through CLI.
 *
 * ```ts
 * const tgdb = new TelegramDB({
 *   // REQUIRED TO RUN WITHOUT PROMPTS
 *   apiId: 123456,
 *   apiHash: "12ab34cd56ef78gh90ij",
 *   stringSession: "...", // String session
 *   channelId: -1001234567890, // Channel ID of the database
 *   entryPoint: 10, // Entry point message ID
 *
 *   // OPTIONAL
 *   debug: true, // TGDB Debug
 *   clientLogLevel: "info", // GramJS client log level
 *   clientParams: { ... } // GramJS client options
 * });
 * ```
 *
 * Use the `TelegramDB.connect()` method to initialize the database connection.
 *
 * ```ts
 * await tgdb.connect();
 * ```
 *
 * After it's connected, you can create and delete databases with the instance.
 * Example,
 *
 * ```ts
 * const db = await tgdb.database("users"); // Choose or create a database
 * await db.add("12", { name: "User1" }); // Add to database
 * const data = await db.get("12"); // Retrieve from database
 * await db.edit("12", { name: "New name" }); // Modify data
 * await db.delete("12"); // Remove from database
 * await db.clear(); // Clear all the records
 * ```
 *
 * See the documentation for more methods to work with database.
 */
export class TelegramDB {
  /** Internal GramJS client used in the current TGDB instance */
  public client: TelegramClient;
  private connected = false;

  private debug(log: string) {
    if (!this.config.debug) return;
    console.log(`${cyan.dim(`[${new Date().toISOString()}] [TGDB]`)} ${log}`);
  }

  /**
   * @param config TGDB Configuration
   */
  constructor(
    /** TGDB Configuration */
    public readonly config: TGDBConfig,
  ) {
    this.client = new TelegramClient(
      new StringSession(this.config.stringSession ?? ""),
      config.apiId,
      config.apiHash,
      config.clientParams ?? { connectionRetries: 5 },
    );
    this.client.setLogLevel(config.clientLogLevel ?? LogLevel.NONE);
  }

  private async getMessage(
    messageId: number,
  ): Promise<Api.Message> {
    if (!this.connected) await this.connect();
    const messages = await this.client.getMessages(
      this.config.channelId,
      { ids: messageId },
    );
    return messages[0];
  }

  private async sendMessage(
    text: string,
  ): Promise<Api.Message> {
    if (!this.connected) await this.connect();
    return await this.client.sendMessage(
      this.config.channelId!,
      { message: text },
    );
  }

  private async deleteMessage(
    messageId: number,
  ): Promise<Api.messages.AffectedMessages[]> {
    return await this.client.deleteMessages(
      this.config.channelId,
      [messageId],
      { revoke: true },
    );
  }

  private async getDatabaseIndexes(
    dbMessageId = this.config.entryPoint,
  ) {
    const { text } = await this.getMessage(dbMessageId!);
    const data = parseIndex(text);
    const indexes = [data];
    if (data.header.next_msg_id) {
      const nextIndex = await this.getDatabaseIndexes(data.header.next_msg_id);
      indexes.push(...nextIndex);
    }
    return indexes;
  }

  private async getRecordPages(messageId: number) {
    const { text } = await this.getMessage(messageId);
    const data = parseData(text);
    const pages = [data];
    if (data.header.next_msg_id) {
      const next = await this.getRecordPages(data.header.next_msg_id);
      pages.push(...next);
    }
    return pages;
  }

  /** Connect to a TelegramDB instance, or setup one */
  async connect(): Promise<void> {
    let printedSaveInfo = false;
    this.debug("Connecting to Telegram...");

    if (!this.config.stringSession || this.config.stringSession === "") {
      this.debug("Haven't provided 'stringSession'. Logging in to Telegram");

      const { phoneNumber } = await prompts({
        type: "text",
        name: "phoneNumber",
        message: "Phone number",
        validate: (ans) => isNaN(parseInt(ans)) ? false : true,
      });

      if (!phoneNumber) return console.log("Enter your phone number.");

      const { forceSMS, password } = await prompts([{
        type: "password",
        name: "password",
        message: "Password (Optional)",
      }, {
        type: "toggle",
        name: "forceSMS",
        message: "Send code via SMS",
        active: "Yes",
        inactive: "No",
        initial: false,
      }]);

      await this.client.start({
        onError: (err) => console.error(err.message),
        forceSMS: forceSMS,
        phoneNumber: phoneNumber,
        password: password,
        phoneCode: async () => {
          const result = await prompts({
            type: "text",
            name: "phoneCode",
            message: "Code you received from Telegram",
            validate: (ans) => isNaN(parseInt(ans)) ? false : true,
          });
          return result.phoneCode;
        },
      });

      this.connected = true;
      console.log(`${cyan(">")} Save these somewhere:`);
      printedSaveInfo = true;
      console.log(
        `${dim(">")} ${green.bold("STRING SESSION")}${dim(":")} ${
          cyan(this.client.session.save())
        }`,
      );

      this.config.stringSession = `${this.client.session.save()}`;
    }

    if (!this.config.channelId) {
      this.debug("No channel ID provided. Creating channel...");

      const { channelName } = await prompts({
        type: "text",
        name: "channelName",
        message: "Channel name",
        initial: "Database",
        limit: 128,
        min: 1,
      });

      await this.client.disconnect();
      this.connected = false;

      this.client = new TelegramClient(
        new StringSession(this.config.stringSession),
        this.config.apiId,
        this.config.apiHash,
        { connectionRetries: 5 } ?? this.config.clientParams,
      );
      this.client.setLogLevel(LogLevel.NONE ?? this.config.clientLogLevel);
      await this.client.connect();
      this.connected = true;

      const result = await this.client.invoke(
        new Api.channels.CreateChannel({
          title: channelName,
          about: "This channel is generated by a @TheTGDB instance",
          broadcast: true,
        }),
      ) as Api.Updates;

      this.config.channelId = result.chats[0].id.toJSNumber();

      if (!printedSaveInfo) {
        console.log(`${cyan(">")} Save these somewhere:`);
        printedSaveInfo = true;
      }
      console.log(
        `${dim(">")} ${green.bold("CHANNEL ID")}${dim(":")} ${
          cyan(this.config.channelId)
        }`,
      );

      const { id } = await this.sendMessage("TGDB 0 null null");
      this.config.entryPoint = id;
      console.log(
        `${dim(">")} ${green.bold("ENTRY POINT")}${dim(":")} ${cyan(id)}`,
      );
    }

    if (!this.config.entryPoint) {
      this.debug(
        "No entry point message ID provided. Sending message to channel...",
      );

      if (!this.connected) {
        await this.client.connect();
        this.connected = true;
      }
      const { id } = await this.sendMessage("TGDB 0 null null");
      this.config.entryPoint = id;
      if (!printedSaveInfo) console.log(`${cyan(">")} Save these somewhere:`);

      console.log(
        `${dim(">")} ${green.bold("ENTRY POINT")}${dim(":")} ${cyan(id)}`,
      );
    }

    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    this.debug("Connected to Telegram");
  }

  /**
   * Create or connect to a database in the TelegramDB instance.
   *
   * ```ts
   * await tgdb.database("users");
   * ```
   * @param name Database name to create or connect to
   * @returns A new `Database` instance, to work more with that
   */
  async database(
    name: string,
  ) {
    const clean = isClean(name);
    if (!clean) {
      throw new Error(
        `Invalid database name '${name}'. A database name can only contain A-Z, a-z, 0-9, - and _`,
      );
    }

    const indexes = await this.getDatabaseIndexes();
    const databases: Table = {};
    for (const index of indexes) {
      Object.assign(databases, index.table);
    }

    if (name in databases) {
      return new Database(this, name, databases[name]);
    }

    const dbEntryPoint = await this.sendMessage(`${name} 0 null null`);
    const secondLastIndex = indexes.at(-2) ?? indexes[0];
    const msgToEditId = secondLastIndex.header.next_msg_id
      ? secondLastIndex.header.next_msg_id
      : this.config.entryPoint;
    const lastIndexMsg = await this.getMessage(msgToEditId!);
    const modifiedText = lastIndexMsg.text + `\n${name} ${dbEntryPoint.id}`;

    if (modifiedText.length > 3072) {
      const newDbIndex = await this.sendMessage(
        `TGDB ${indexes.length} ${msgToEditId} null
${name} ${dbEntryPoint.id}`,
      );
      const lines = lastIndexMsg.text.split("\n");
      const headers = lines[0].split(" ");
      headers[3] = `${newDbIndex.id}`;
      lines[0] = headers.join(" ");
      await lastIndexMsg.edit({ text: lines.join("\n") });
    } else {
      await lastIndexMsg.edit({ text: modifiedText });
    }

    this.debug(`Created Database: '${name}'`);
    return new Database(this, name, dbEntryPoint.id);
  }

  /**
   * Deletes a database from the channel. Throws an error if the database
   * does not exists.
   * @param name Name of the database to delete
   * @returns Returns `true` if when the database has been deleted successfully
   */
  async deleteDatabase(
    name: string,
  ) {
    const clean = isClean(name);
    if (!clean) {
      throw new Error(
        `Invalid database name '${name}'. A database name can only contain A-Z, a-z, 0-9, - and _`,
      );
    }

    const indexes = await this.getDatabaseIndexes();
    const databases: Table = {};
    for (const index of indexes) {
      Object.assign(databases, index.table);
    }

    if (!(name in databases)) {
      this.debug(`Database '${name}' does not exists!`);
      throw new Error(`Database '${name}' does not exists!`);
    }

    const dbEntryPoint = databases[name];
    const database = new Database(this, name, dbEntryPoint);
    const records = await database.getRecordIds();
    const msgIds = Object.values(records);

    // delete records
    for (const msgId of msgIds) {
      const pages = await this.getRecordPages(msgId);
      pages.map(async ({ header }) => {
        if (!header.next_msg_id) return;
        await this.deleteMessage(header.next_msg_id);
      });
      await this.deleteMessage(msgId);
    }

    await this.deleteMessage(dbEntryPoint);

    // clear from index
    for (let i = 0; i < indexes.length; i++) {
      const { header, table } = indexes[i];
      const indexMsgId = indexes[i - 1]?.header.next_msg_id ??
        this.config.entryPoint;
      if (name in table) {
        const keyIndex = Object.keys(table).indexOf(name);
        const recordsArray = Object.entries(table);
        recordsArray.splice(keyIndex, 1);
        let _databases = "";
        for (const item of recordsArray) {
          _databases += `${item[0]} ${item[1]}\n`;
        }

        const msg = await this.getMessage(indexMsgId!);
        const text =
          `TGDB ${header.page_index} ${header.prev_msg_id} ${header.next_msg_id}\n${_databases}`;
        await msg.edit({ text });
        break;
      }
    }

    this.debug(`Deleted Database: '${name}'`);
    return true;
  }
}
