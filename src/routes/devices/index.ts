import { Router, Response, Request } from "express";
import * as fs from "fs/promises";

export const devices = Router();

devices.get("/", async (req: Request, res: Response) => {
  const IOHandler = req.IOHandler;

  if (!IOHandler) {
    res.status(500).json({ message: "IOHandler not available" });
    return;
  }

  res.json(await req.IOHandler.getConnectedDrives());
});

devices.get("/:serial", async (req: Request, res: Response) => {
  const IOHandler = req.IOHandler;
  const serial = req.params.serial;

  if (!IOHandler) {
    res.status(500).json({ message: "IOHandler not available" });
    return;
  }

  const drive = await IOHandler.getDriveBySerial(serial);

  if (!drive) {
    res.status(404).json({ message: "Drive not found" });
    return;
  }

  res.json(drive);
});

devices.get("/:serial/browse", async (req: Request, res: Response) => {
  const IOHandler = req.IOHandler;
  const { serial, mountPoint } = req.params;

  if (!IOHandler) {
    res.status(500).json({ message: "IOHandler not available" });
    return;
  }

  const drive = await IOHandler.getDriveBySerial(serial);

  if (!drive) {
    res.status(404).json({ message: "Drive not found" });
    return;
  }

  if (!drive.mountpoints) {
    res.status(404).json({ message: "No mountpoints for this drive" });
    return;
  }

  const dir = await fs.readdir(drive.mountpoints[0].path, {
    withFileTypes: true,
  });

  res.json(dir);
});
