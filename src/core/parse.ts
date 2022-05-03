import { Data, Db, DBIndex, Header, MsgIdTable } from "../types";

function parseNo(str: string): number | null {
  return isNaN(parseInt(str)) ? null : parseInt(str);
}

function parseHeader(str: string): Header {
  const headers = str.split(" ");
  return {
    page_id: headers[0],
    page_index: parseInt(headers[1]),
    prev_msg_id: parseNo(headers[2]),
    next_msg_id: parseNo(headers[3]),
  };
}

function parseTable(tables: string[]): MsgIdTable {
  const list: MsgIdTable = {};
  for (const table of tables) {
    const [tableName, msgId] = table.split(" ");
    const messageId = parseInt(msgId);
    if (!isNaN(messageId)) list[tableName] = messageId;
  }
  return list;
}

export function parseDbsIndex(str: string): DBIndex {
  const lines = str.split("\n");
  return {
    header: parseHeader(lines[0]),
    meta_msg_id: parseInt(lines[1]),
    table: parseTable(lines.slice(2)),
  };
}

export function parseDb(str: string): Db {
  const lines = str.split("\n");
  return {
    header: parseHeader(lines[0]),
    data: parseTable(lines.slice(1)),
  };
}

export function parseData(str: string): Data {
  const lines = str.split("\n");
  return {
    header: parseHeader(lines[0]),
    dbName: lines[1].split(" ")[0],
    dbMsgId: parseInt(lines[1].split(" ")[1]),
    value: lines.slice(2).join("\n"),
  };
}
