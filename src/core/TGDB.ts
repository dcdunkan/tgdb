import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { LogLevel, MsgIdTable, TGDBConfig } from "../types";
import { parseDbsIndex } from "./parse";
import { Database } from "./Database";
import { isClean } from "./utils";
import { writeFileSync } from "fs";

/** Create a Telegram Database instance. */
export class TGDB {
  public readonly client: TelegramClient;
  private connected = false;

  /**
   * @param config Configuration for TGDB instance.
   */
  constructor(
    public readonly config: TGDBConfig,
  ) {
    const { stringSession, apiHash, apiId } = config;
    const strSession = new StringSession(stringSession);
    this.client = new TelegramClient(
      strSession,
      apiId,
      apiHash,
      config.clientParams ?? {
        connectionRetries: 5,
      },
    );
    this.client.setLogLevel(config.clientLogLevel ?? LogLevel.NONE);
  }

  private debug(log: string) {
    if (!this.config.debug) return;
    console.log(`[${new Date().toISOString()}] [TGDB] - ${log}`);
  }

  /** Connect to Telegram and initialize Database */
  async connect(): Promise<void> {
    await this.client.connect();
    this.connected = true;

    this.debug("Connected to Telegram");

    if (this.config.channelId == null) {
      const result = JSON.parse(JSON.stringify(await this.createDbChannel()))
      this.config.channelId = result.channelId
      const { id } = await this.sendMessage("tgdb:entry")
      this.config.entryPoint = id
      console.warn('Your channelId:' + this.config.channelId + '\nYour tgdb entry:' + this.config.entryPoint)
    }

    const entryPoint = await this.getMessage(this.config.entryPoint);
    if (!entryPoint) {
      throw new Error("Entry point not found!");
    } else if (entryPoint.message.toLowerCase() === "tgdb:entry") {
      this.debug("Initiating new TGDB instance");

      // create metadata
      const { id } = await this.sendMessage(`meta${this.config.channelId}\n${this.config.entryPoint}\n0`);
      this.debug("Created metadata");

      // create entry point
      await entryPoint.edit({ text: `db_0 null null\n${id}` });
      this.debug("Created entry point");
    } else {
      this.debug("Connected to Database");
    }
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
  private async createDbChannel() {

    const result: Api.Updates = await this.client.invoke(
      new Api.channels.CreateChannel({
        title: "Database",
        about: "Your data will be stored here",
        geoPoint: new Api.InputGeoPoint({
          lat: 8.24,
          long: 8.24,
          accuracyRadius: 43,
        }),
        address: "database channel",
      })
    ) as Api.Updates;

    /* 
        const result: Api.Updates = await this.client.invoke(
          new Api.channels.CreateChannel({
            title: "Database",
            about: "Your data will be stored here",
            geoPoint: new Api.InputGeoPoint({
              lat: 8.24,
              long: 8.24,
              accuracyRadius: 43,
            }),
            address: "database channel",
          })
        ) */
    //UpdateNewChannelMessage
    return result.updates[1];
  }

  private async sendMessage(
    text: string,
  ): Promise<Api.Message> {
    if (!this.connected) await this.connect();

    let channelId: number;
    if (this.config.channelId != null) {
      channelId = this.config.channelId
    } else {
      channelId = -1
    }

    return await this.client.sendMessage(
      channelId,
      { message: text },
    );
  }

  /**
   * Get all databases
   * @param dbMessageId Message ID to parse the Database
   * @returns Database - message ID list
   */
  async getDatabases(
    dbMessageId = this.config.entryPoint,
  ): Promise<MsgIdTable> {
    const { text } = await this.getMessage(dbMessageId);
    const { header, table } = parseDbsIndex(text);
    if (header.next_msg_id) {
      const nextTable = await this.getDatabases(header.next_msg_id);
      Object.assign(table, nextTable);
    }
    return table;
  }

  private async getDbIndexes(
    dbMessageId = this.config.entryPoint,
  ) {
    const { text } = await this.getMessage(dbMessageId);
    const data = parseDbsIndex(text);
    const indexes = [data];
    if (data.header.next_msg_id) {
      const nextIndex = await this.getDbIndexes(data.header.next_msg_id);
      indexes.push(...nextIndex);
    }
    return indexes;
  }

  /**
   * Create a database
   * @param name Name of the database
   * @returns A Database instance
   */
  async createDatabase(
    name: string,
  ): Promise<Database> {
    const clean = isClean(name);
    if (!clean) {
      throw new Error(
        `Invalid database name '${name}'. A database name can only contain A-Z, a-z, 0-9, - and _`,
      );
    }

    const databases = await this.getDatabases();
    if (name in databases) {
      this.debug(`Database '${name}' already exists!`);
      throw new Error(`Database '${name}' already exists!`);
    }

    if (this.config.channelId == null) {
      this.config.channelId = 12321312;
    }
    const dbMsg = await this.sendMessage(`${name} 0 null null`);
    const indexes = await this.getDbIndexes();
    const secondLastIndex = indexes.at(-2) ?? indexes[0];
    const messageToEdit = secondLastIndex.header.next_msg_id
      ? secondLastIndex.header.next_msg_id
      : this.config.entryPoint;
    const lastIndexMsg = await this.getMessage(messageToEdit);
    const modifiedText = lastIndexMsg.text + `\n${name} ${dbMsg.id}`;

    if (modifiedText.length > 4000) {
      const newIndex = await this.sendMessage(
        `db ${indexes.length} ${messageToEdit} null
${indexes[0].meta_msg_id}
${name} ${dbMsg.id}`,
      );
      const lines = lastIndexMsg.text.split("\n");
      const headers = lines[0].split(" ");
      headers[3] = `${newIndex.id}`;
      lines[0] = headers.join(" ");
      await lastIndexMsg.edit({ text: lines.join("\n") });
    } else {
      await lastIndexMsg.edit({ text: modifiedText });
    }
    this.debug(`Created Database: '${name}'`);
    return new Database(this, name, dbMsg.id);
  }

  /**
   * Choose a database. If the database does not exists, creates a new one.
   * @param name Database name
   * @returns A Database instance
   */
  async database(
    name: string,
  ): Promise<Database> {
    const clean = isClean(name);
    if (!clean) {
      throw new Error(
        `Invalid database name '${name}'. A database name can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const databases = await this.getDatabases();
    if (!(name in databases)) {
      this.debug(`Database '${name}' does not exists . Creating...`);
      return await this.createDatabase(name);
    }
    return new Database(this, name, databases[name]);
  }
}
