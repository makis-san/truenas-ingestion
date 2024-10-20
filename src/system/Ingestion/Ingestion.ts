import { Systeminformation } from "systeminformation";
import { SystemIO } from "../SystemIO/SystemIO";
import { log } from "../logger";
import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { DBTables } from "../../db/constants";
import { db } from "../../db/db";
import { IngestionAction } from "../../routes/ingestion";
import * as crypto from "crypto";

const pipelineAsync = promisify(pipeline);

export interface IngestionDevice {
  id: string;
  serial: string;
  deviceDetails: Systeminformation.DiskLayoutData;
  copyOnAttach?: boolean;
  allowedExtensions?: string[];
  copyTo: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionHandler {
  // Exposed interface
  ingest: (device: IngestionDevice) => void;
}

class Queue {
  private queue: string[] = [];
  private currentProcessing: string | undefined;
  private isProcessing: boolean = false;

  constructor(private ingestion: Ingestion) {}

  /**
   * Adds a serial to the queue if not already present and starts processing
   */
  public push(serial: string) {
    if (this.queue.includes(serial)) {
      return;
    }

    this.queue.push(serial);
    this.processNext();
  }

  /**
   * Removes a serial from the queue
   */
  public remove(serial: string) {
    this.queue = this.queue.filter((where) => where !== serial);
  }

  /**
   * Starts processing the next serial in the queue, if available
   */
  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.currentProcessing = this.queue.shift();
    if (this.currentProcessing) {
      this.isProcessing = true;
      console.log(`Started processing: ${this.currentProcessing}`);

      try {
        await this.ingestion.run(this.currentProcessing);
      } catch (error) {
        console.error(`Error processing ${this.currentProcessing}:`, error);
      } finally {
        console.log(`Finished processing: ${this.currentProcessing}`);
        this.isProcessing = false;
        this.processNext();
      }
    }
  }

  /**
   * Removes the current serial after it finishes processing
   */
  public finish(serial: string) {
    if (this.currentProcessing === serial) {
      this.currentProcessing = undefined;
      this.processNext();
    }
  }
}

export class Ingestion {
  private queue: Queue;

  constructor(private systemIO: SystemIO) {
    this.queue = new Queue(this);

    // Listen for attached devices from SystemIO
    this.systemIO.on("deviceAttached", (devices: string[]) => {
      this.bulkIngest(devices);
    });
  }

  /**
   * Adds a single device to the queue for ingestion
   */
  public ingest(device: IngestionDevice) {
    this.queue.push(device.serial);
  }

  /**
   * Adds multiple devices to the queue for ingestion (bulk ingest)
   */
  public bulkIngest(deviceSerials: string[]) {
    deviceSerials.forEach((serial) => {
      this.queue.push(serial);
    });
  }

  /**
   * Runs the ingestion process for a given serial
   */
  public async run(serial: string): Promise<void> {
    log("INFO", `Running ingestion for device: ${serial}`);

    const drive = await this.systemIO.getDriveBySerial(serial);

    if (!drive?.mountpoints) {
      log("INFO", `Ingestion failed for device: ${serial}`);
      return;
    }

    const srcDir = drive?.mountpoints.filter(
      (where) => where.label !== "EFI"
    )[0]?.path;
    const destDir = "./dest";
    const archiveDir = "./_archive";

    // Helper function to calculate the checksum (hash) of a file
    const calculateChecksum = async (filePath: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);
        stream.on("data", (data) => hash.update(data));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
      });
    };

    // Function to recursively copy files with logging and versioning
    const copyWithVersioning = async (
      src: string,
      dest: string,
      archive: string
    ) => {
      const files = await fs.promises.readdir(src, { withFileTypes: true });

      for (const file of files) {
        const srcFile = path.join(src, file.name);
        const destFile = path.join(dest, file.name);
        const archiveFile = path.join(archive, file.name);

        if (file.isDirectory()) {
          await fs.promises.mkdir(destFile, { recursive: true });
          await fs.promises.mkdir(archiveFile, { recursive: true });
          await copyWithVersioning(srcFile, destFile, archiveFile); // Recursively handle subdirectories
        } else {
          log("INFO", `Processing file: ${srcFile}`);

          // Check if file exists in destination
          const destExists = await fs.promises.stat(destFile).catch(() => null);
          const srcChecksum = await calculateChecksum(srcFile);

          if (destExists) {
            const destChecksum = await calculateChecksum(destFile);

            if (srcChecksum === destChecksum) {
              log("INFO", `File ${file.name} already copied with no changes.`);
              continue; // Skip if no changes
            } else {
              log(
                "INFO",
                `File ${file.name} has changed, moving old version to archive.`
              );
              await fs.promises.mkdir(path.dirname(archiveFile), {
                recursive: true,
              });
              await fs.promises.rename(destFile, archiveFile); // Move old file to archive
            }
          }

          log("INFO", `Copying file: ${srcFile}`);
          const totalSize = (await fs.promises.stat(srcFile)).size;
          let copiedSize = 0;

          const readStream = fs.createReadStream(srcFile);
          const writeStream = fs.createWriteStream(destFile);

          readStream.on("data", (chunk) => {
            copiedSize += chunk.length;
            const progress = ((copiedSize / totalSize) * 100).toFixed(2);
            log("INFO", `Progress: ${progress}% for file: ${srcFile}`);
          });

          await pipelineAsync(readStream, writeStream);

          log("INFO", `Copy complete for file: ${srcFile}`);

          // Create and save the IngestionAction object
          const ingestionAction: IngestionAction = {
            deviceSerial: serial,
            filename: srcFile,
            fileSize: `${totalSize}`,
            checksum: srcChecksum,
          };
          db.push(`${DBTables.ingestionAction}[]`, ingestionAction, true);
        }
      }
    };

    await copyWithVersioning(srcDir, destDir, archiveDir);

    log("INFO", `Ingestion complete for device: ${serial}`);
  }
}
