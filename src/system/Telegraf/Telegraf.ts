import * as dotenv from "dotenv";
import { Telegraf } from "telegraf";

dotenv.config();

export class TelegrafModule {
  public bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(process.env?.BOT_TOKEN as string);
  }

  async sendMessage(message: string) {
    await this.bot.telegram.sendMessage(
      process.env?.TELEGRAM_CHAT_ID as string,
      message
    );
  }
}
