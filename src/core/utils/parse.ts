export type Table = Record<string, number>;

interface Header {
  page_id: string;
  page_index: number;
  next_msg_id: number | null;
  prev_msg_id: number | null;
}

interface Index {
  header: Header;
  table: Table;
}

interface Data {
  header: Header;
  dbName: string;
  dbMsgId: number;
  value: string;
}

export function parseIndex(str: string): Index {
  const lines = str.split("\n");
  return {
    header: parseHeader(lines[0]),
    table: parseTable(lines.slice(1)),
  };
}

export function parseTable(tables: string[]): Table {
  const list: Table = {};
  for (const table of tables) {
    const [tableName, msgId] = table.split(" ");
    const messageId = parseInt(msgId);
    if (!isNaN(messageId)) list[tableName] = messageId;
  }
  return list;
}

export function parseData(str: string): Data {
  const lines = str.split("\n");
  if (lines.length > 1) lines.pop();
  return {
    header: parseHeader(lines[0]),
    dbName: lines[1].split(" ")[0],
    dbMsgId: parseInt(lines[1].split(" ")[1]),
    value: lines.slice(2).join("\n"),
  };
}

function parseNumber(str: string): number | null {
  return isNaN(parseInt(str)) ? null : parseInt(str);
}

function parseHeader(str: string): Header {
  const headers = str.split(" ");
  return {
    page_id: headers[0],
    page_index: parseInt(headers[1]),
    prev_msg_id: parseNumber(headers[2]),
    next_msg_id: parseNumber(headers[3]),
  };
}
