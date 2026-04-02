import os from "os";

export const getLanUrls = (port: number) => {
  const networkInterfaces = os.networkInterfaces();
  const urls: string[] = [];

  for (const entries of Object.values(networkInterfaces)) {
    if (!entries) {
      continue;
    }

    for (const entry of entries) {
      const isIPv4 = entry.family === "IPv4";
      if (!isIPv4 || entry.internal) {
        continue;
      }

      urls.push(`http://${entry.address}:${port}`);
    }
  }

  return Array.from(new Set(urls));
};
