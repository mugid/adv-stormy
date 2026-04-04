import ImageKit from "@imagekit/nodejs";

let client: ImageKit | null = null;

export function getImageKitServer(): ImageKit {
  if (!client) {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("IMAGEKIT_PRIVATE_KEY is not set");
    }
    client = new ImageKit({ privateKey });
  }
  return client;
}
