import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/src/db';
import { products, productImages } from '@/src/db/schema';
import { eq, desc, inArray, lt, and } from 'drizzle-orm';
import { getAuthUser } from '@/src/server/auth';
import { serverCache } from '@/src/server/cache';
import { isCloudinaryConfigured, uploadToCloudinary } from '@/src/lib/cloudinary';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const publicOnly = searchParams.get('public') === 'true';
    const cursor = searchParams.get('cursor'); // ISO createdAt string
    const limitParam = searchParams.get('limit');
    const isPaginated = searchParams.has('limit') || searchParams.has('cursor');

    // If paginated, compute limit and cache key based on params
    if (isPaginated) {
      const limit = Math.min(Math.max(1, parseInt(limitParam || '20', 10)), 100);
      const cacheKey = `products:${publicOnly ? 'pub' : 'all'}:${cursor || 'first'}:${limit}`;

      const cached = serverCache.get<{ products: any[]; nextCursor: string | null; hasMore: boolean }>(cacheKey);
      const clientEtag = req.headers.get('if-none-match');

      if (cached) {
        if (clientEtag && clientEtag === cached.etag) {
          return new NextResponse(null, {
            status: 304,
            headers: {
              'ETag': cached.etag,
              'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
            },
          });
        }
        return NextResponse.json(cached.data, {
          headers: {
            'ETag': cached.etag,
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
            'X-Cache': 'HIT',
          },
        });
      }

      await initializeDatabase();

      // Query limit + 1 items to determine hasMore
      const queryLimit = limit + 1;
      let fetchedProducts;

      if (publicOnly) {
        if (cursor) {
          fetchedProducts = await db
            .select()
            .from(products)
            .where(and(eq(products.isAvailable, true), lt(products.createdAt, cursor)))
            .orderBy(desc(products.createdAt))
            .limit(queryLimit);
        } else {
          fetchedProducts = await db
            .select()
            .from(products)
            .where(eq(products.isAvailable, true))
            .orderBy(desc(products.createdAt))
            .limit(queryLimit);
        }
      } else {
        if (cursor) {
          fetchedProducts = await db
            .select()
            .from(products)
            .where(lt(products.createdAt, cursor))
            .orderBy(desc(products.createdAt))
            .limit(queryLimit);
        } else {
          fetchedProducts = await db
            .select()
            .from(products)
            .orderBy(desc(products.createdAt))
            .limit(queryLimit);
        }
      }

      const hasMore = fetchedProducts.length > limit;
      const pageProducts = hasMore ? fetchedProducts.slice(0, limit) : fetchedProducts;
      const nextCursor = hasMore && pageProducts.length > 0 ? pageProducts[pageProducts.length - 1].createdAt : null;

      const imageMap = new Map<number, string[]>();
      if (pageProducts.length > 0) {
        const productIds = pageProducts.map((p) => p.id);
        const relevantImages = await db
          .select()
          .from(productImages)
          .where(inArray(productImages.productId, productIds));

        for (const img of relevantImages) {
          const list = imageMap.get(img.productId) || [];
          list.push(img.imageUrl);
          imageMap.set(img.productId, list);
        }
      }

      const result = {
        products: pageProducts.map((p) => ({
          ...p,
          isAvailable: Boolean(p.isAvailable),
          images: imageMap.get(p.id) || [],
        })),
        nextCursor,
        hasMore,
      };

      const etag = serverCache.set(cacheKey, result, 0, ['products', cacheKey]);

      return NextResponse.json(result, {
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
          'X-Cache': 'MISS',
        },
      });
    }

    // Default unpaginated full fetch (backwards compatibility)
    const cacheKey = publicOnly ? 'products:public' : 'products:all';

    // 1. Check Server-side memory cache
    const cached = serverCache.get<any[]>(cacheKey);
    const clientEtag = req.headers.get('if-none-match');

    if (cached) {
      if (clientEtag && clientEtag === cached.etag) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'ETag': cached.etag,
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
          },
        });
      }
      return NextResponse.json(cached.data, {
        headers: {
          'ETag': cached.etag,
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
          'X-Cache': 'HIT',
        },
      });
    }

    // 2. Cache miss -> query database with index-optimized queries
    await initializeDatabase();

    let allProducts;
    if (publicOnly) {
      allProducts = await db
        .select()
        .from(products)
        .where(eq(products.isAvailable, true))
        .orderBy(desc(products.createdAt));
    } else {
      allProducts = await db
        .select()
        .from(products)
        .orderBy(desc(products.createdAt));
    }

    const imageMap = new Map<number, string[]>();
    if (allProducts.length > 0) {
      const productIds = allProducts.map((p) => p.id);
      // Targeted query for only relevant product images instead of full table scan
      const relevantImages = await db
        .select()
        .from(productImages)
        .where(inArray(productImages.productId, productIds));

      for (const img of relevantImages) {
        const list = imageMap.get(img.productId) || [];
        list.push(img.imageUrl);
        imageMap.set(img.productId, list);
      }
    }

    const result = allProducts.map((p) => ({
      ...p,
      isAvailable: Boolean(p.isAvailable),
      images: imageMap.get(p.id) || [],
    }));

    // Cache indefinitely (0 = persistent until database mutation invalidates tag)
    const etag = serverCache.set(cacheKey, result, 0, ['products', cacheKey]);

    return NextResponse.json(result, {
      headers: {
        'ETag': etag,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    console.error('Error fetching products:', err);
    return NextResponse.json({ error: 'Failed to retrieve products' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initializeDatabase();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

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

    if (!title || !codeNo || !category || pricePerUnit == null) {
      return NextResponse.json(
        { error: 'Title, item code, category, and price are required' },
        { status: 400 }
      );
    }

    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.codeNo, codeNo.trim()))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: `Item code "${codeNo}" already exists in the inventory.` },
        { status: 400 }
      );
    }

    const inserted = await db
      .insert(products)
      .values({
        title: title.trim(),
        codeNo: codeNo.trim(),
        category: category.trim(),
        pricePerUnit: Number(pricePerUnit),
        quantityInStock: Number(quantityInStock || 0),
        weightPerUnit: Number(weightPerUnit || 0.0),
        isAvailable: isAvailable !== false,
        createdAt: new Date().toISOString(),
      })
      .returning();

    const newProduct = inserted[0];

    // Process and save product images to Cloudinary and store the URLs in the database
    if (Array.isArray(images) && images.length > 0) {
      const finalImageUrls: string[] = [];

      for (const img of images) {
        if (typeof img !== 'string') continue;
        const trimmed = img.trim();
        if (!trimmed) continue;

        // If it's a base64 Data URI, upload to Cloudinary so the URL is stored in the database
        if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:application/')) {
          if (isCloudinaryConfigured()) {
            try {
              const uploaded = await uploadToCloudinary(trimmed, 'stasia_boutique/products');
              finalImageUrls.push(uploaded.url);
            } catch (uploadErr: any) {
              console.error('Failed to upload image to Cloudinary:', uploadErr);
              throw new Error(`Cloudinary upload failed: ${uploadErr?.message || 'Unknown error'}`);
            }
          } else {
            // If Cloudinary keys are not yet provided in environment, retain the image
            finalImageUrls.push(trimmed);
          }
        } else {
          // Already a hosted URL (Cloudinary CDN URL or remote image URL)
          finalImageUrls.push(trimmed);
        }
      }

      if (finalImageUrls.length > 0) {
        const rowsToInsert = finalImageUrls.map((url) => ({
          productId: newProduct.id,
          imageUrl: url,
        }));
        await db.insert(productImages).values(rowsToInsert);
      }
    }

    const savedImages = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, newProduct.id));

    // Invalidate product caches immediately
    serverCache.invalidateTags(['products']);

    return NextResponse.json(
      {
        ...newProduct,
        isAvailable: Boolean(newProduct.isAvailable),
        images: savedImages.map((i) => i.imageUrl),
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('Error creating product:', err);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
