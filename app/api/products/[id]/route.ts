import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/src/db';
import { products, productImages } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '@/src/server/auth';
import { serverCache } from '@/src/server/cache';
import {
  isCloudinaryConfigured,
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicIdFromCloudinaryUrl,
} from '@/src/lib/cloudinary';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prodId = Number(id);

    const cacheKey = `product:${prodId}`;
    const cached = serverCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
          'X-Cache': 'HIT',
        },
      });
    }

    await initializeDatabase();

    const found = await db
      .select()
      .from(products)
      .where(eq(products.id, prodId))
      .limit(1);

    if (found.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const imgs = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, prodId));

    const result = {
      ...found[0],
      isAvailable: Boolean(found[0].isAvailable),
      images: imgs.map((i) => i.imageUrl),
    };

    serverCache.set(cacheKey, result, 60, ['products', `product:${prodId}`]);

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to retrieve product' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDatabase();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const { id } = await params;
    const prodId = Number(id);

    const body = await req.json();
    const {
      title,
      codeNo,
      category,
      pricePerUnit,
      quantityInStock,
      weightPerUnit,
      isAvailable,
      images,
    } = body;

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title.trim();
    if (codeNo !== undefined) updates.codeNo = codeNo.trim();
    if (category !== undefined) updates.category = category.trim();
    if (pricePerUnit !== undefined) updates.pricePerUnit = Number(pricePerUnit);
    if (quantityInStock !== undefined) updates.quantityInStock = Number(quantityInStock);
    if (weightPerUnit !== undefined) updates.weightPerUnit = Number(weightPerUnit);
    if (isAvailable !== undefined) updates.isAvailable = Boolean(isAvailable);

    let updatedRow: any = null;

    if (Object.keys(updates).length > 0) {
      const updated = await db
        .update(products)
        .set(updates)
        .where(eq(products.id, prodId))
        .returning();

      if (updated.length === 0) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      updatedRow = updated[0];
    } else {
      const existing = await db
        .select()
        .from(products)
        .where(eq(products.id, prodId))
        .limit(1);
      if (existing.length === 0) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      updatedRow = existing[0];
    }

    let finalImages: string[] = [];
    if (Array.isArray(images)) {
      // Process images: upload any base64 data to Cloudinary first
      const processedUrls: string[] = [];
      for (const img of images) {
        if (typeof img !== 'string') continue;
        const trimmed = img.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:application/')) {
          if (isCloudinaryConfigured()) {
            try {
              const uploaded = await uploadToCloudinary(trimmed, 'stasia_boutique/products');
              processedUrls.push(uploaded.url);
            } catch (uploadErr: any) {
              console.error('Failed to upload image to Cloudinary:', uploadErr);
              throw new Error(`Cloudinary upload failed: ${uploadErr?.message || 'Unknown error'}`);
            }
          } else {
            processedUrls.push(trimmed);
          }
        } else {
          // Already a hosted URL
          processedUrls.push(trimmed);
        }
      }

      await db.delete(productImages).where(eq(productImages.productId, prodId));
      if (processedUrls.length > 0) {
        const rowsToInsert = processedUrls.map((url) => ({
          productId: prodId,
          imageUrl: url,
        }));
        await db.insert(productImages).values(rowsToInsert);
      }
      finalImages = processedUrls;
    } else {
      // Fetch existing images only if needed
      const currentImgs = await db
        .select({ imageUrl: productImages.imageUrl })
        .from(productImages)
        .where(eq(productImages.productId, prodId));
      finalImages = currentImgs.map((i) => i.imageUrl);
    }

    // Bust caches on mutation
  serverCache.invalidateTags(["products", `product:${prodId}`]);
  serverCache.invalidatePrefix("products:");

    return NextResponse.json({
      ...updatedRow,
      isAvailable: Boolean(updatedRow.isAvailable),
      images: finalImages,
    });
  } catch (err: any) {
    console.error('Error updating product:', err);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

// Fallback alias for clients that call PUT
export const PUT = PATCH;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDatabase();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const { id } = await params;
    const prodId = Number(id);

    // Fetch existing images to clean up Cloudinary assets if any
    const existingImages = await db
      .select({ imageUrl: productImages.imageUrl })
      .from(productImages)
      .where(eq(productImages.productId, prodId));

    for (const img of existingImages) {
      const pubId = extractPublicIdFromCloudinaryUrl(img.imageUrl);
      if (pubId) {
        deleteFromCloudinary(pubId).catch((err) => {
          console.warn('Could not delete Cloudinary asset:', pubId, err);
        });
      }
    }

    await db.delete(productImages).where(eq(productImages.productId, prodId));
    await db.delete(products).where(eq(products.id, prodId));

    // Bust caches
  serverCache.invalidateTags(["products", `product:${prodId}`]);
  serverCache.invalidatePrefix("products:");

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting product:', err);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
