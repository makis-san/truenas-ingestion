import { Router, Response, Request } from "express";
import { db, DBTables } from "../../db/db";
import { v4 } from "uuid";

export const ingestion = Router();

interface IngestionRegisterBody {
  serial: string;
  copyOnAttach?: boolean;
  allowedExtensions?: string[];
  copyTo: string;
}

export interface IngestionAction {
  deviceSerial: string;
  filename: string;
  fileSize: string;
  checksum?: string;
}

ingestion.get("/", async (req: Request, res: Response) => {
  const devices = await db.getData(DBTables.ingestionDevices);
  res.json(devices);
});

ingestion.post("/register", async (req: Request, res: Response) => {
  try {
    if (!req.IOHandler) {
      res.status(500).json({ message: "IOHandler not available" });
      return;
    }

    const body = req.body as IngestionRegisterBody;
    const currentISO = new Date().toISOString();

    const devices = await req.IOHandler.getConnectedDrives();

    console.log("REGISTER:", devices);
    const deviceDetails = devices.find(
      (where) => (where.serialNum = body.serial)
    );

    if (!deviceDetails) {
      res.status(400).json({ message: "Device not found" });
      return;
    }

    const tableExists = await db.exists(DBTables.ingestionDevices);

    const deviceExists = tableExists
      ? await db.find(DBTables.ingestionDevices, (cb) => {
          if (Array.isArray(cb)) {
            return cb.some((where) => where.serial === body.serial);
          }
          return cb.serial === body.serial;
        })
      : false;

    if (deviceExists) {
      res.status(400).json({ message: "Device already registered" });
      return;
    }

    const ingestionData = {
      id: v4(),
      ...body,
      deviceDetails,
      createdAt: currentISO,
      updatedAt: currentISO,
    };

    db.push(`${DBTables.ingestionDevices}[]`, ingestionData, true);

    res.json({
      message: `Succesfully registered ingestion for device ${body.serial}`,
      data: ingestionData,
    });
  } catch (er) {
    console.log(er);
  }
});
