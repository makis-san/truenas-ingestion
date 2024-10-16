export const log = (level: string, message: string, data?: any): void => {
  const timestamp = new Date().toISOString();
  const formattedLog = `[${timestamp}] [${level}] ${message}`;

  if (data) {
    console.log(formattedLog, JSON.stringify(data, null, 2));
  } else {
    console.log(formattedLog);
  }
};
