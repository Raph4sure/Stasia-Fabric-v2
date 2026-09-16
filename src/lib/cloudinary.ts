import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

/**
 * Checks if Cloudinary credentials are provided in the environment.
 * Accepts either CLOUDINARY_URL or individual credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).
 */
export function isCloudinaryConfigured(): boolean {
  if (process.env.CLOUDINARY_URL && process.env.CLOUDINARY_URL.trim().length > 0) {
    return true;
  }
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Returns safe status information for frontend display (never leaks API secrets).
 */
export function getCloudinaryStatus(): { configured: boolean; cloudName: string | null } {
  const configured = isCloudinaryConfigured();
  let cloudName: string | null = process.env.CLOUDINARY_CLOUD_NAME || null;
  if (!cloudName && process.env.CLOUDINARY_URL) {
    try {
      const parsed = new URL(process.env.CLOUDINARY_URL.replace('cloudinary://', 'http://'));
      cloudName = parsed.hostname || null;
    } catch {
      cloudName = null;
    }
  }
  return {
    configured,
    cloudName,
  };
}

let isConfigured = false;

/**
 * Lazy initialization of the Cloudinary client to ensure the app never crashes
 * on boot if credentials are empty or being configured by the user.
 */
export function getCloudinaryClient() {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Please define CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (or CLOUDINARY_URL) in environment variables.'
    );
  }

  if (!isConfigured) {
    if (
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    ) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
    } else if (process.env.CLOUDINARY_URL) {
      cloudinary.config({
        secure: true,
      });
    }
    isConfigured = true;
  }

  return cloudinary;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

/**
 * Uploads an image (base64 Data URI, remote URL, or raw Buffer) to Cloudinary.
 * Applies optimal compression and delivers a secure CDN HTTPS URL.
 */
export async function uploadToCloudinary(
  fileInput: string | Buffer,
  folder = 'stasia_boutique/products',
  tags: string[] = ['stasia-boutique']
): Promise<CloudinaryUploadResult> {
  const client = getCloudinaryClient();

  if (typeof fileInput === 'string') {
    // If it is a string: base64 data URI or remote URL
    const uploadResult: UploadApiResponse = await client.uploader.upload(fileInput, {
      folder,
      tags,
      resource_type: 'image',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ],
    });

    return {
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      bytes: uploadResult.bytes,
    };
  } else {
    // Buffer input
    return new Promise((resolve, reject) => {
      const uploadStream = client.uploader.upload_stream(
        {
          folder,
          tags,
          resource_type: 'image',
          transformation: [
            { quality: 'auto', fetch_format: 'auto' }
          ],
        },
        (error, result) => {
          if (error || !result) {
            return reject(error || new Error('Failed to upload image buffer to Cloudinary'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
          });
        }
      );
      uploadStream.end(fileInput);
    });
  }
}

/**
 * Deletes an asset from Cloudinary using its public ID.
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  if (!isCloudinaryConfigured()) return false;
  try {
    const client = getCloudinaryClient();
    const res = await client.uploader.destroy(publicId, { resource_type: 'image' });
    return res.result === 'ok';
  } catch (err) {
    console.warn('Failed to delete image from Cloudinary:', err);
    return false;
  }
}

/**
 * Extracts the public ID from a Cloudinary URL if possible.
 */
export function extractPublicIdFromCloudinaryUrl(url: string): string | null {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) {
    return null;
  }
  try {
    // URL pattern: https://res.cloudinary.com/<cloud>/image/upload/(v<version>/)?<public_id>.<ext>
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
