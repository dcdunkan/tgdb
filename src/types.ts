import { LogLevel } from "telegram/extensions/Logger";
import { TelegramClientParams } from "telegram/client/telegramBaseClient";

/** Configuration for TGDB instance */
export interface TGDBConfig {
  /** GramJS string session */
  stringSession?: string;
  /** Telegram API ID https://my.telegram.org */
  apiId: number;
  /** Telegram API hash https://my.telegram.org */
  apiHash: string;
  /** Public or private channel ID to setup TGDB instance */
  channelId?: number;
  /** First message with the text "tgdb:entry" */
  entryPoint?: number;
  /** Minimal logging */
  debug?: boolean;
  /** GramJS log level. Defaults to `none` */
  clientLogLevel?: LogLevel;
  /** GramJS Client Configuration */
  clientParams?: TelegramClientParams;
}
