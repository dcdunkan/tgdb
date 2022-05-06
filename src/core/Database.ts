import { TGDB } from "./TGDB";
import { parseData, parseDb } from "./parse";
import { Api } from "telegram";
import { isClean } from "./utils";

const VALUE_LENGTH_PER_PAGE = 3072;

export class Database {
  constructor(
    private tgdb: TGDB,
    public readonly name: string,
    private readonly dbEntryPoint: number,
  ) { }

  private debug(log: string) {
    if (!this.tgdb.config.debug) return;
    console.log(`[${new Date().toISOString()}] [db:${this.name}] - ${log}`);
  }

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
    let channelId: number;
    if (this.tgdb.config.channelId != null) {
      channelId = this.tgdb.config.channelId
    } else {
      channelId = -1
    }
    return await this.tgdb.client.sendMessage(
      channelId,
      { message: text },
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

  // get record
  async get<T = any>(key: string): Promise<T> {
    const clean = isClean(key);
    if (!clean) {
      throw new Error(
        `Invalid key '${key}'. A key can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const records = await this.getAll();
    const recordEntryPoint = records[key];
    if (!recordEntryPoint) throw new Error(`'${key}' does not exists!`);
    const value = await this.getRecordValueRecursive(recordEntryPoint);
    return JSON.parse(value) as T;
  }

  async getAll() {
    const databases = await this.tgdb.getDatabases();
    if (!(this.name in databases)) {
      throw new Error("Database does not exists!");
    }

    return await this.getDbRecursive(databases[this.name]);
  }

  private async getRecordIndexes(
    recordIndexMsgId = this.dbEntryPoint,
  ) {
    const { text } = await this.getMessage(recordIndexMsgId);
    const data = parseDb(text);
    const indexes = [data];
    if (data.header.next_msg_id) {
      const nextIndex = await this.getRecordIndexes(data.header.next_msg_id);
      indexes.push(...nextIndex);
    }
    return indexes;
  }

  private async getRecordValueRecursive(messageId: number): Promise<string> {
    const { text } = await this.getMessage(messageId);
    const { header, value } = parseData(text);
    let recordValue = value;
    if (header.next_msg_id) {
      recordValue += await this.getRecordValueRecursive(header.next_msg_id);
    }
    return recordValue;
  }

  private async getDbRecursive(
    messageId: number,
  ) {
    const { text } = await this.getMessage(messageId);
    const { header, data } = parseDb(text);
    if (header.next_msg_id) {
      const nextData = await this.getDbRecursive(header.next_msg_id);
      Object.assign(data, nextData);
    }
    return data;
  }

  private async getRecordPagesRecursive(messageId: number) {
    const { text } = await this.getMessage(messageId);
    const data = parseData(text);
    const pages = [data];
    if (data.header.next_msg_id) {
      const nextPages = await this.getRecordPagesRecursive(
        data.header.next_msg_id,
      );
      pages.push(...nextPages);
    }
    return pages;
  }

  async insert<T = any>(key: string, value: T) {
    const clean = isClean(key);
    if (!clean) {
      throw new Error(
        `Invalid key '${key}'. A key can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const records = await this.getAll();
    if (records[key] !== undefined) {
      return this.debug(`key '${key}' already exists. Cannot be re-added`);
    }

    const values: string[] = [];
    const valueText = JSON.stringify(value);
    const totalPages = Math.ceil(valueText.length / VALUE_LENGTH_PER_PAGE);

    for (let i = 0; i < totalPages; i++) {
      values.push(
        valueText.slice(
          i * VALUE_LENGTH_PER_PAGE,
          (i + 1) * VALUE_LENGTH_PER_PAGE,
        ),
      );
    }

    const sentMsgs: Api.Message[] = [];

    const recordEntryPointMsg = await this.sendMessage(
      `${key} 0 null null
${this.name} ${this.dbEntryPoint}
${values[0]}`,
    );
    sentMsgs.push(recordEntryPointMsg);

    // update records index
    const recordIndexes = await this.getRecordIndexes();
    const secondLastIndex = recordIndexes.at(-2) ?? recordIndexes[0];
    const messageToEdit = secondLastIndex.header.next_msg_id
      ? secondLastIndex.header.next_msg_id
      : this.dbEntryPoint;
    const lastIndexMsg = await this.getMessage(messageToEdit);
    const modifiedText = lastIndexMsg.text +
      `\n${key} ${recordEntryPointMsg.id}`;

    if (modifiedText.length > VALUE_LENGTH_PER_PAGE) {
      const newIndex = await this.sendMessage(
        `${this.name} ${recordIndexes.length} ${messageToEdit} null
${key} ${recordEntryPointMsg.id}`,
      );

      const lines = lastIndexMsg.text.split("\n");
      const headers = lines[0].split(" ");
      headers[3] = `${newIndex.id}`;
      lines[0] = headers.join(" ");
      await lastIndexMsg.edit({ text: lines.join("\n") });
    } else {
      await lastIndexMsg.edit({ text: modifiedText });
    }

    // if it's more than 1 msg
    if (values.length > 1) {
      for (let i = 1; i <= values.length; i++) {
        const value = values[i];
        if (!value) continue;

        const prevMsg = await this.sendMessage(
          `${key} ${i} ${sentMsgs.at(-1)!.id} null
${this.name} ${this.dbEntryPoint}
${value}`,
        );

        // update the previous msg's next_msg_id part.
        const lastSentMsgHeaders = sentMsgs.at(-1)!.text
          .split("\n")[0].split(" ");
        lastSentMsgHeaders[3] = prevMsg.id.toString();
        const modifiedText = `${lastSentMsgHeaders.join(" ")}
${sentMsgs.at(-1)!.text.split("\n").slice(1).join("\n")}`;
        const msg = await this.getMessage(sentMsgs.at(-1)!.id);
        await msg.edit({ text: modifiedText });
        sentMsgs.push(prevMsg);
      }
    }

    this.debug(
      `New record added: '${key}' ${(new TextEncoder().encode(valueText)).length
      } bytes`,
    );
  }

  async modify<T>(key: string, value: T) {
    const clean = isClean(key);
    if (!clean) {
      throw new Error(
        `Invalid key '${key}'. A key can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const records = await this.getAll();
    const recordEntryPoint = records[key];
    // does not exist.
    if (recordEntryPoint === undefined) {
      throw new Error(`key '${key}' does not exists! Add the record first`);
    }

    const valueText = JSON.stringify(value);
    const newPagesCount = Math.ceil(
      valueText.length / VALUE_LENGTH_PER_PAGE,
    );

    const oldPages = await this.getRecordPagesRecursive(recordEntryPoint);
    const oldPagesCount = oldPages.length; // just for convenience

    // Get message ids
    const existingMsgIds = oldPages.map((data) => data.header.next_msg_id);
    existingMsgIds.unshift(recordEntryPoint); // add the very first one.
    existingMsgIds.pop(); // remove the last 'null'

    const newValues: string[] = []; // new values for each page
    for (let i = 0; i < newPagesCount; i++) {
      newValues.push(
        valueText.slice(
          i * VALUE_LENGTH_PER_PAGE,
          (i + 1) * VALUE_LENGTH_PER_PAGE,
        ),
      );
    }

    if (newPagesCount > oldPagesCount) {
      const pagesToAdd = newPagesCount - oldPagesCount; // need to send these boys
      for (let i = 0; i < pagesToAdd; i++) {
        const { id } = await this.sendMessage(
          `${key} ${oldPagesCount + i} ${existingMsgIds.at(-1)!} null
${this.name} ${this.dbEntryPoint}
${newValues[oldPagesCount + i]}`,
        );
        const prevMsg = await this.getMessage(existingMsgIds.at(-1)!);
        const headers = prevMsg.text.split("\n")[0].split(" ");
        headers[3] = id.toString();

        await prevMsg.edit({
          text: `${headers.join(" ")}\n${prevMsg.text.split("\n").slice(1).join("\n")
            }`,
        });
        existingMsgIds.push(id);
      }

      for (let i = 0; i < oldPagesCount; i++) {
        const msg = await this.getMessage(existingMsgIds[i]!);
        const notToChange = msg.text.split("\n").slice(0, 2).join("\n");
        const newText = `${notToChange}\n${newValues[i]}`;
        if (msg.text !== newText) {
          await msg.edit({ text: newText });
        }
      }
    } else if (newPagesCount === oldPagesCount) {
      for (let i = 0; i < existingMsgIds.length; i++) {
        const msg = await this.getMessage(existingMsgIds[i]!);
        const notToChange = msg.text.split("\n").slice(0, 2).join("\n");
        const newText = `${notToChange}\n${newValues[i]}`;
        if (msg.text !== newText) {
          await msg.edit({ text: newText });
        }
      }
    } else {
      // delete and updating stuff: TODO
      const deleteCount = oldPagesCount - newPagesCount;
      const toDelete = existingMsgIds.slice(
        existingMsgIds.length - deleteCount,
      );
      for (const msgId of toDelete) await this.deleteMessage(msgId!);
      const toUpdate = existingMsgIds.slice(
        0,
        existingMsgIds.length - deleteCount,
      );

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

    this.debug(
      `Record modified: '${key}' ${(new TextEncoder().encode(valueText)).length
      } bytes`,
    );
    return true;
  }

  async delete(key: string) {
    const clean = isClean(key);
    if (!clean) {
      throw new Error(
        `Invalid key '${key}'. A key can only contain A-Z, a-z, 0-9, - and _`,
      );
    }
    const records = await this.getAll();
    const recordEntryPoint = records[key];

    if (recordEntryPoint === undefined) {
      throw new Error(`key '${key}' does not exists! Add the record first`);
    }

    const oldPages = await this.getRecordPagesRecursive(recordEntryPoint);

    const msgIds = oldPages.map((data) => data.header.next_msg_id); // Get message ids
    msgIds.unshift(recordEntryPoint); // add the very first one.
    msgIds.pop(); // remove the last 'null'

    // delete the data
    for await (const msgId of msgIds) await this.deleteMessage(msgId!);

    // clear from record index (db)
    const recordIndexes = await this.getRecordIndexes();
    for (let i = 0; i < recordIndexes.length; i++) {
      const { header, data } = recordIndexes[i];
      const indexMsgId = recordIndexes[i - 1]?.header.next_msg_id ??
        this.dbEntryPoint;
      if (key in data) {
        const i = Object.keys(data).indexOf(key);
        const itemsArr = Object.entries(data);
        itemsArr.splice(i, 1);
        let records = "";
        for (const item of itemsArr) {
          records += `${item[0]} ${item[1]}`;
        }

        const msg = await this.getMessage(indexMsgId);
        const text =
          `${this.name} ${header.page_index} ${header.prev_msg_id} ${header.next_msg_id}\n${records}`;
        await msg.edit({ text });
        break;
      }
    }

    this.debug(`Deleted '${key}'`);
  }

  async clear() {
    const records = await this.getAll();
    const msgIds = Object.values(records);
    for await (const msgId of msgIds) {
      await this.deleteMessage(msgId);
    }

    // clear from record index (db)
    const recordIndexes = await this.getRecordIndexes();

    const msg = await this.getMessage(this.dbEntryPoint);
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
