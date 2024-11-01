import { usb as usbDetect } from "usb";
import * as si from "systeminformation";
import { db, DBTables } from "../../db/db";
import { IngestionDevice } from "../Ingestion/Ingestion";
import EventEmitter from "events";
import { log } from "../logger";
import * as driveList from "drivelist";
import { MountPoints } from "./MountPoints";

export type DiskType = si.Systeminformation.DiskLayoutData;

export class SystemIO extends EventEmitter {
  private connectedDrives: DiskType[] = [];
  private mountPointsHandler = new MountPoints();
  private readonly timeout = 5000;

  constructor(connectedDrivesCb: (drives: DiskType[]) => void) {
    super();
    usbDetect.on("attach", this.handleAttach);
    usbDetect.on("detach", this.handleDetach);
    process.on("SIGINT", this.handleExit);
    process.on("exit", this.handleExit);
    process.on("SIGTERM", this.handleExit);
    this.updateConnectedDrives();
    this.registerFetchConnectedDrives(connectedDrivesCb);
  }

  private async updateConnectedDrives(): Promise<DiskType[]> {
    try {
      this.connectedDrives = await si.diskLayout();
      log("INFO", "Drives updated", this.connectedDrives);
    } catch (error) {
      log("ERROR", "Failed to update drives", error);
    }
    return this.connectedDrives;
  }

  private registerFetchConnectedDrives(
    cb: (driveData: DiskType[]) => void
  ): void {
    setTimeout(() => {
      this.updateConnectedDrives().then((drives) => {
        cb(drives);
        this.registerFetchConnectedDrives(cb);
      });
    }, this.timeout);
  }

  private handleAttach = async (device: usbDetect.Device): Promise<void> => {
    const previousSerials = this.connectedDrives.map(
      (drive) => drive.serialNum
    );

    const newSerials = await this.getConnectedDrives(true).then((drives) =>
      drives.map((drive) => drive.serialNum)
    );

    const addedSerials = newSerials.filter(
      (serial) => !previousSerials.includes(serial)
    );

    if (addedSerials.length > 0) {
      const ingestionDevices = (await db.getData(
        DBTables.ingestionDevices
      )) as IngestionDevice[];

      const detectedIngestionDevices = addedSerials.filter((serial) =>
        ingestionDevices.find((where) => where.serial === serial)
      );

      if (detectedIngestionDevices.length > 0) {
        log(
          "INFO",
          "Detected ingestion devices",
          detectedIngestionDevices.join(", ")
        );
        // Emit event for bulk ingestion
        this.emit("deviceAttached", detectedIngestionDevices);
      } else {
        log("INFO", "No new ingestion devices detected.");
      }
    }
  };

  private handleDetach = async (device: usbDetect.Device): Promise<void> => {
    await this.getConnectedDrives(true);
    this.emit("deviceDetached", device);
  };

  private handleExit = (): void => {
    usbDetect.removeAllListeners("attach");
    usbDetect.removeAllListeners("detach");
    log("INFO", "All USB listeners have been cleared.");
    process.exit();
  };

  public async getConnectedDrives(
    forceUpdate: boolean = false
  ): Promise<DiskType[]> {
    if (forceUpdate) {
      await this.updateConnectedDrives(); // Force drive update if requested
    }
    return this.connectedDrives;
  }

  public async getDriveBySerial(
    serial: string
  ): Promise<
    (DiskType & { mountpoints?: driveList.Mountpoint[] }) | undefined
  > {
    const disks = await this.getConnectedDrives(true);
    const drive = disks.find((where) => where.serialNum === serial);

    if (!drive) {
      log("WARN", `No drive found with serial number: ${serial}`);
      return;
    }

    const mountpoints = await this.mountPointsHandler.getMountedDrives();

    return {
      ...drive,
      mountpoints,
    };
  }
}
