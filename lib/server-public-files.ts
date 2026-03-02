import { createWriteStream } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getOriginFromRequest(request: Request) {
  return new URL(request.url).origin;
}

export async function readTextFromPublicFile(options: {
  request: Request;
  localPath: string;
  publicUrlPath: string;
}) {
  try {
    return await fs.readFile(options.localPath, "utf-8");
  } catch {
    const origin = getOriginFromRequest(options.request);
    const res = await fetch(`${origin}${options.publicUrlPath}`, { cache: "force-cache" });
    if (!res.ok) {
      throw new Error(
        `Falha ao carregar o arquivo público (${options.publicUrlPath}). Status: ${res.status}`,
      );
    }
    return await res.text();
  }
}

export async function ensureLocalFileFromPublicUrl(options: {
  request: Request;
  localPath: string;
  publicUrlPath: string;
  tmpFileName: string;
}) {
  if (await fileExists(options.localPath)) return options.localPath;

  const tmpPath = path.join(os.tmpdir(), options.tmpFileName);
  if (await fileExists(tmpPath)) return tmpPath;

  const origin = getOriginFromRequest(options.request);
  const res = await fetch(`${origin}${options.publicUrlPath}`, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(
      `Falha ao baixar o arquivo público (${options.publicUrlPath}). Status: ${res.status}`,
    );
  }

  if (res.body) {
    const nodeStream = Readable.fromWeb(res.body as never);
    await pipeline(nodeStream, createWriteStream(tmpPath));
    return tmpPath;
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(tmpPath, buffer);
  return tmpPath;
}
