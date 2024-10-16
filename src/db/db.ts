import { JsonDB, Config } from "node-json-db";

export const db = new JsonDB(new Config("appDb", true, false, "/"));

export * from "./constants";
