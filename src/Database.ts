import { Api } from "telegram";
import { blue, dim, green } from "chalk";

import { TelegramDB } from "./TelegramDB";
import { parseData, parseIndex, Table } from "./utils/parse";
import { isClean } from "./utils/utils";

/** Value length per page */
const VLPP = 3072;

export class Database {
  private debug(log: string) {
    if (!this.tgdb.config.debug) return;
    console.log(
      `${dim.cyan(`[${new Date().toISOString()}]`)} \
[${blue("TGDB")}@${green(this.name)}] ${log}`,
    );
  }

  constructor(
    private tgdb: TelegramDB,
    private readonly name: string,
    private readonly entryPoint: number,
  ) {}

  private async getMessage(
    messageId: number,
  ): Promise<Api.Message> {
    const messages = await this.tgdb.client.getMessages(
      this.tgdb.config.channelId,
      { ids: messageId },
    );
    return messages[0];
  }

  private async sendMessage(
    text: string,
  ): Promise<Api.Message> {
    return await this.tgdb.client.sendMessage(
      this.tgdb.config.channelId!,
      { message: text },
    );
  }

  private async editMessage(
    messageId: number,
    text: string,
  ): Promise<Api.Message> {
    return await this.tgdb.client.editMessage(
      this.tgdb.config.channelId!,
      { message: messageId, text: text },
    );
  }

  private async deleteMessage(
    messageId: number,
  ): Promise<Api.messages.AffectedMessages[]> {
    return await this.tgdb.client.deleteMessages(
      this.tgdb.config.channelId,
      [messageId],
      { revoke: true },
    );
  }

  private async getRecordsIndexes(
    firstIndexId = this.entryPoint,
  ) {
    const { text } = await this.getMessage(firstIndexId);
    const data = parseIndex(text);
    const indexes = [data];
    if (data.header.next_msg_id) {
      const nextIndex = await this.getRecordsIndexes(data.header.next_msg_id);
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

  private async getRecordValue(messageId: number) {
    const { text } = await this.getMessage(messageId);
    const { header, value } = parseData(text);
    let record = value;
    if (header.next_msg_id) {
      record += await this.getRecordValue(header.next_msg_id);
    }
    return record;
  }

  /**
   * Get message IDs of all of the records in the database
   * @returns `{ key: message_id, ... }` object.
   */
  async getRecordIds() {
    const indexes = await this.getRecordsIndexes();
    const table: Table = {};
    for (const index of indexes) {
      Object.assign(table, index.table);
    }
    return table;
  }

  /**
   * Check whether a key exists or not.
   *
   * @param key Key to search for
   * @returns Returns `true` if the key exists. And `false` if not.
   */
  async exists(key: string) {
    const records = await this.getRecordIds();
    return records[key] ? true : false;
  }

  /**
   * Gets the value of a record by it's key. Throws an error if the record
   * does not exist in the database.
   *
   * ```ts
   * const value = await db.get("key");
   * console.log(value);
   * ```
   *
   * @param key Key of the value to get
   * @returns Value of the record
   */
  async get<T = any>(key: string): Promise<T> {
    const records = await this.getRecordIds();
    const recordEntryPoint = records[key];
    if (!recordEntryPoint) throw new Error(`'${key}' does not exists!`);
    const value = await this.getRecordValue(recordEntryPoint);
    return JSON.parse(value) as T;
  }

  /**
   * Adds a new record to the database. Throws an error if the record already
   * exist in the database.
   *
   * ```ts
   * await db.add("key", { "value": "value" });
   * ```
   *
   * - Key name can only contain `A-Z`, `a-z`, `0-9`, `-` and `_`.
   * - Value should be a JavaScript object.
   * @param key Key of the record
   * @param value Value of the record
   * @returns Returns `true` if the record was successfully added to the database
   */
  async add<T = any>(key: string, value: T) {
    const clean = isClean(key);
    if (!clean) {
      throw new Error(
        `Invalid key '${key}'. A key can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const indexes = await this.getRecordsIndexes();
    const records: Table = {};
    for (const index of indexes) {
      Object.assign(records, index.table);
    }
    if (records[key]) {
      this.debug(`key '${key}' already exists. Cannot be re-added`);
      throw new Error(`key '${key}' already exists. Cannot be re-added`);
    }

    const values: string[] = [];
    const valueText = JSON.stringify(value);
    const totalPages = Math.ceil(valueText.length / VLPP);

    for (let i = 0; i < totalPages; i++) {
      const part = valueText.slice(i * VLPP, (i + 1) * VLPP);
      values.push(part + "\nMOO");
    }

    const entryPointMsg = await this.sendMessage(
      `${key} 0 null null\n${this.name} ${this.entryPoint}\n${values[0]}`,
    );
    const sentMsgs = [entryPointMsg];

    // update record indexes
    const secondLastIndex = indexes.at(-2) ?? indexes[0];
    const msgToEditId = secondLastIndex.header.next_msg_id
      ? secondLastIndex.header.next_msg_id
      : this.entryPoint;
    const lastIndexMsg = await this.getMessage(msgToEditId);
    const modifiedText = lastIndexMsg.text +
      `\n${key} ${entryPointMsg.id}`;

    if (modifiedText.length > VLPP) {
      const newIndex = await this.sendMessage(
        `${this.name} ${indexes.length} ${msgToEditId} null\n${key} ${entryPointMsg.id}`,
      );
      const lines = lastIndexMsg.text.split("\n");
      const headers = lines[0].split(" ");
      headers[3] = `${newIndex.id}`;
      lines[0] = headers.join(" ");
      await lastIndexMsg.edit({ text: lines.join("\n") });
    } else {
      await lastIndexMsg.edit({ text: modifiedText });
    }

    if (values.length > 1) {
      for (let i = 1; i <= values.length; i++) {
        const value = values[i];
        if (!value) continue;

        const prevMsg = await this.sendMessage(
          `${key} ${i} ${sentMsgs.at(-1)?.id} null
${this.name} ${this.entryPoint}\n${value}`,
        );
        const lastSentMsgHeaders = sentMsgs.at(-1)!.text
          .split("\n")[0].split(" ");
        lastSentMsgHeaders[3] = prevMsg.id.toString();
        const modifiedText = `${lastSentMsgHeaders.join(" ")}
${sentMsgs.at(-1)?.text.split("\n").slice(1).join("\n")}`;

        await this.editMessage(sentMsgs.at(-1)?.id!, modifiedText);
        sentMsgs.push(prevMsg);
      }
    }

    this.debug(`Record added: '${key}'`);
    return true;
  }

  /**
   * Modifies an existing record in the database. Throws an error if the record
   * does not exist in the database.
   *
   * ```ts
   * await db.edit("key", { "value": "new value" });
   * ```
   *
   * @param key Key of the record to modify
   * @param value Should be a full new value.
   */
  async edit<T = any>(key: string, value: T) {
    const clean = isClean(key);
    if (!clean) {
      throw new Error(
        `Invalid key '${key}'. A key can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const records = await this.getRecordIds();
    const entryPoint = records[key];
    if (!entryPoint) {
      this.debug(`key '${key}' does not exists! Add the record first`);
      throw new Error(`key '${key}' does not exists! Add the record first`);
    }

    const valueText = JSON.stringify(value);
    const newPageCount = Math.ceil(valueText.length / VLPP);

    const oldPages = await this.getRecordPages(entryPoint);
    const oldPageCount = oldPages.length; // just for convenience

    const oldMsgIds = oldPages.map((data) => data.header.next_msg_id);
    oldMsgIds.unshift(entryPoint); // add the very first one.
    oldMsgIds.pop(); // remove the last 'null'

    const newValues: string[] = []; // new values for each page
    for (let i = 0; i < newPageCount; i++) {
      const part = valueText.slice(i * VLPP, (i + 1) * VLPP);
      newValues.push(part + "\nMOO");
    }

    if (newPageCount > oldPageCount) {
      const pagesToAdd = newPageCount - oldPageCount; // need to send these boys
      for (let i = 0; i < pagesToAdd; i++) {
        const { id } = await this.sendMessage(
          `${key} ${oldPageCount + i} ${oldMsgIds.at(-1)!} null
${this.name} ${this.entryPoint}\n${newValues[oldPageCount + i]}`,
        );
        const prevMsg = await this.getMessage(oldMsgIds.at(-1)!);
        const headers = prevMsg.text.split("\n")[0].split(" ");
        headers[3] = id.toString();
        await prevMsg.edit({
          text: `${headers.join(" ")}\n${
            prevMsg.text.split("\n").slice(1).join("\n")
          }`,
        });
        oldMsgIds.push(id);
      }

      for (let i = 0; i < oldPageCount; i++) {
        const msg = await this.getMessage(oldMsgIds[i]!);
        const notToChange = msg.text.split("\n").slice(0, 2).join("\n");
        const newText = `${notToChange}\n${newValues[i]}`;
        if (msg.text !== newText) {
          await msg.edit({ text: newText });
        }
      }
    } else if (newPageCount === oldPageCount) {
      for (let i = 0; i < oldMsgIds.length; i++) {
        const msg = await this.getMessage(oldMsgIds[i]!);
        const notToChange = msg.text.split("\n").slice(0, 2).join("\n");
        const newText = `${notToChange}\n${newValues[i]}`;
        if (msg.text !== newText) {
          await msg.edit({ text: newText });
        }
      }
    } else {
      const deleteCount = oldPageCount - newPageCount;
      const toDelete = oldMsgIds.slice(oldMsgIds.length - deleteCount);
      for (const msgId of toDelete) {
        await this.deleteMessage(msgId!);
      }
      const toUpdate = oldMsgIds.slice(0, oldMsgIds.length - deleteCount);

      for (let i = 0; i < toUpdate.length; i++) {
        const msg = await this.getMessage(toUpdate[i]!);
        let notToChange = msg.text.split("\n").slice(0, 2).join("\n");
        if (i === toUpdate.length - 1) {
          const header = notToChange.split("\n")[0].split(" ");
          header[3] = "null";
          notToChange = `${header.join(" ")}\n${notToChange.split("\n")[1]}`;
        }
        const newText = `${notToChange}\n${newValues[i]}`;
        if (msg.text !== newText) {
          await msg.edit({ text: newText });
        }
      }
    }

    this.debug(`Record modified: '${key}'`);
  }

  /**
   * Removes the specified record from the database. Throws an error if the
   * record does not exist in the database.
   * @param key Key of the record to delete
   */
  async delete(key: string) {
    const clean = isClean(key);
    if (!clean) {
      throw new Error(
        `Invalid key '${key}'. A key can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const records = await this.getRecordIds();
    const recordEntryPoint = records[key];

    if (recordEntryPoint === undefined) {
      this.debug(`key '${key}' does not exists! Add the record first`);
      throw new Error(`key '${key}' does not exists! Add the record first`);
    }

    const oldPages = await this.getRecordPages(recordEntryPoint);

    const msgIds = oldPages.map((data) => data.header.next_msg_id); // Get message ids
    msgIds.unshift(recordEntryPoint); // add the very first one.
    msgIds.pop(); // remove the last 'null'

    // delete the data
    for await (const msgId of msgIds) {
      await this.deleteMessage(msgId!);
    }

    // clear from record index (db)
    const recordIndexes = await this.getRecordsIndexes();
    for (let i = 0; i < recordIndexes.length; i++) {
      const { header, table } = recordIndexes[i];
      const indexMsgId = recordIndexes[i - 1]?.header.next_msg_id ??
        this.entryPoint;
      if (key in table) {
        const keyIndex = Object.keys(table).indexOf(key);
        const recordsArray = Object.entries(table);
        recordsArray.splice(keyIndex, 1);
        let records = "";
        for (const item of recordsArray) {
          records += `${item[0]} ${item[1]}\n`;
        }

        const msg = await this.getMessage(indexMsgId);
        const text =
          `${this.name} ${header.page_index} ${header.prev_msg_id} ${header.next_msg_id}\n${records}`;
        await msg.edit({ text });
        break;
      }
    }

    this.debug(`Record deleted: '${key}'`);
  }

  /** Clears all records from the database */
  async clear() {
    const records = await this.getRecordIds();
    const msgIds = Object.values(records);
    for await (const msgId of msgIds) {
      const pages = await this.getRecordPages(msgId);
      pages.map(async ({ header }) => {
        if (!header.next_msg_id) return;
        await this.deleteMessage(header.next_msg_id);
      });
      await this.deleteMessage(msgId);
    }

    // clear from record index (db)
    const recordIndexes = await this.getRecordsIndexes();

    const msg = await this.getMessage(this.entryPoint);
    const header = msg.text.split("\n")[0].split(" ");
    header[3] = "null";
    const modifiedText = header.join(" ");
    if (modifiedText !== msg.text) {
      await msg.edit({ text: modifiedText });
    }

    const recordIdxMsgIds = recordIndexes.map((db) => db.header.next_msg_id);
    recordIdxMsgIds.pop();
    if (!recordIdxMsgIds.length) return;

    for (const msgId of recordIdxMsgIds) {
      await this.deleteMessage(msgId!);
    }
  }
}
