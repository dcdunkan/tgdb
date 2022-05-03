import { TelegramClientParams } from "telegram/client/telegramBaseClient";

/** Configuration for TGDB instance */
export interface TGDBConfig {
  /** GramJS string session */
  stringSession: string;
  /** Telegram API ID https://my.telegram.org */
  apiId: number;
  /** Telegram API hash https://my.telegram.org */
  apiHash: string;
  /** Public or private channel ID to setup TGDB instance */
  channelId: number;
  /** First message with the text "tgdb:entry" */
  entryPoint: number;
  /** Minimal logging */
  debug?: boolean;
  /** GramJS log level. Defaults to `none` */
  clientLogLevel?: LogLevel;
  /** GramJS Client Configuration */
  clientParams?: TelegramClientParams;
}

export enum LogLevel {
  NONE = "none",
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

export type MsgIdTable = Record<string, number>;

export interface Header {
  page_id: string;
  page_index: number;
  next_msg_id: number | null;
  prev_msg_id: number | null;
}

export interface DBIndex {
  header: Header;
  meta_msg_id: number | null;
  table: MsgIdTable;
}

export interface Db {
  header: Header;
  data: MsgIdTable;
}

export interface Data {
  header: Header;
  dbName: string;
  dbMsgId: number;
  value: string;
}
