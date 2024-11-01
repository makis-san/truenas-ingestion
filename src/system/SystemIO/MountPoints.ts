import { exec } from "child_process";

export interface Mountpoint {
  path: string;
  label: string | null;
}

export class MountPoints {
  private command: string;

  constructor() {
    // Adjusted findmnt command to get TARGET as path and LABEL as label
    this.command = "findmnt --json --output TARGET,LABEL";
  }

  // Method to retrieve all mounted drives in the Mountpoint format
  public async getMountedDrives(): Promise<Mountpoint[]> {
    return new Promise((resolve, reject) => {
      exec(this.command, (error, stdout, stderr) => {
        if (error) {
          reject(`Error executing findmnt: ${error.message}`);
        } else if (stderr) {
          reject(`Error in findmnt output: ${stderr}`);
        } else {
          try {
            const parsedData = JSON.parse(stdout);
            const mountpoints = this.extractMountpoints(parsedData);
            resolve(mountpoints);
          } catch (parseError: any) {
            reject(`Error parsing findmnt output: ${parseError.message}`);
          }
        }
      });
    });
  }

  // Helper method to map parsed data to the Mountpoint format
  private extractMountpoints(data: any): Mountpoint[] {
    if (!data || !data.filesystems) return [];

    return data.filesystems.map((fs: any) => ({
      path: fs.target || "", // Path to the mounted device
      label: fs.label || null, // Label of the mounted device
    }));
  }
}
