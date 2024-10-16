import express, { Request, Response, NextFunction } from "express";
import { DiskType, SystemIO } from "./system/SystemIO/SystemIO";
import { existsSync } from "fs";
import { Ingestion } from "./system/Ingestion/Ingestion";
import router from "./routes/router";
import { DBTables } from "./db/constants";
import { db } from "./db/db";

declare global {
  namespace Express {
    export interface Request {
      IOHandler: SystemIO;
      ingestion: Ingestion;
      drives: DiskType[];
    }
  }
}

const app = express();
const port = 3000;
const systemIO = new SystemIO((data) => {
  app.set("drives", data);
});
const ingestionService = new Ingestion(systemIO);

const injectIOHandler = (req: Request, res: Response, next: NextFunction) => {
  req.IOHandler = systemIO;
  next();
};

const injectIngestionHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  req.ingestion = ingestionService;
  next();
};

const inJectDrives = (req: Request, res: Response, next: NextFunction) => {
  req.drives = app.get("drives") as unknown as DiskType[];
  next();
};

app.use(injectIOHandler);
app.use(injectIngestionHandler);
app.use(inJectDrives);
app.use(express.json());

// Router
app.use(router);

app.listen(port, async () => {
  if (!existsSync("./appDb.json")) {
    db.push(DBTables.ingestionAction, [], true);
    db.push(DBTables.ingestionDevices, [], true);
  }

  console.log(`USB device app listening at http://localhost:${port}`);
});
