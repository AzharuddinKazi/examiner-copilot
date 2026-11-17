import multer from "multer";
import type { Request, Response } from "express";

/** Runs a single-file multipart parser in memory. Returns false (after replying) on failure. */
export async function receiveFile(req: Request, res: Response, maxBytes: number, what: string): Promise<boolean> {
  const handler = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 5 } }).single("file");
  return new Promise((resolve) => {
    handler(req, res, (err: unknown) => {
      if (!err) {
        if (!req.file) {
          res.status(400).json({ error: `No file received. Attach the ${what} as "file".` });
          resolve(false);
          return;
        }
        resolve(true);
        return;
      }
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` });
      } else {
        res.status(400).json({ error: `The upload could not be read. Attach one ${what} as "file".` });
      }
      resolve(false);
    });
  });
}
