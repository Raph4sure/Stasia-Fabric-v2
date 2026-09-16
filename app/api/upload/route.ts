import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/src/server/auth';
import {
  isCloudinaryConfigured,
  getCloudinaryStatus,
  uploadToCloudinary,
} from '@/src/lib/cloudinary';

/**
 * GET /api/upload - Returns Cloudinary integration status
 */
export async function GET() {
  const status = getCloudinaryStatus();
  return NextResponse.json(status);
}

/**
 * POST /api/upload - Upload an image to Cloudinary and return the CDN URL
 * Accepts either:
 * - multipart/form-data with field "file" or "image"
 * - application/json with field "image" (base64 data URI or remote image URL)
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json(
        { error: 'Unauthorized. Staff login is required to upload images.' },
        { status: 401 }
      );
    }

    if (!isCloudinaryConfigured()) {
      return NextResponse.json(
        {
          error:
            'Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your project environment settings.',
          requiresConfig: true,
        },
        { status: 400 }
      );
    }

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = (formData.get('file') || formData.get('image')) as File | null;
      const folder = (formData.get('folder') as string) || 'stasia_boutique/products';

      if (!file) {
        return NextResponse.json(
          { error: 'No image file was provided in the upload request.' },
          { status: 400 }
        );
      }

      if (!file.type.startsWith('image/')) {
        return NextResponse.json(
          { error: 'Only valid image files (JPEG, PNG, WebP, GIF) are allowed.' },
          { status: 400 }
        );
      }

      // 10MB file limit for Cloudinary
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Image file size exceeds the 10 MB limit.' },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await uploadToCloudinary(buffer, folder);

      return NextResponse.json({
        success: true,
        url: result.url,
        publicId: result.publicId,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      });
    } else {
      // JSON payload
      const body = await req.json();
      const imageInput = body.image || body.file || body.url;
      const folder = body.folder || 'stasia_boutique/products';

      if (!imageInput || typeof imageInput !== 'string') {
        return NextResponse.json(
          { error: 'Missing image data (base64 Data URI or image URL).' },
          { status: 400 }
        );
      }

      const result = await uploadToCloudinary(imageInput, folder);

      return NextResponse.json({
        success: true,
        url: result.url,
        publicId: result.publicId,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
      });
    }
  } catch (err: any) {
    console.error('Cloudinary upload route error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to upload image to Cloudinary' },
      { status: 500 }
    );
  }
}
