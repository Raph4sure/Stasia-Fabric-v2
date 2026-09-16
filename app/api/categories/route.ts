import { NextRequest, NextResponse } from 'next/server';
import { db, initializeDatabase } from '@/src/db';
import { categorySettings } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthUser } from '@/src/server/auth';
import { serverCache } from '@/src/server/cache';

export async function GET(req: NextRequest) {
  try {
    const cached = serverCache.get<any[]>('categories');
    const clientEtag = req.headers.get('if-none-match');

    if (cached) {
      if (clientEtag && clientEtag === cached.etag) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'ETag': cached.etag,
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        });
      }
      return NextResponse.json(cached.data, {
        headers: {
          'ETag': cached.etag,
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          'X-Cache': 'HIT',
        },
      });
    }

    await initializeDatabase();
    const cats = await db.select().from(categorySettings);
    const result = cats.map((c) => ({
      category: c.category,
      isAvailable: Boolean(c.isAvailable),
    }));

    const etag = serverCache.set('categories', result, 0, ['categories']);

    return NextResponse.json(result, {
      headers: {
        'ETag': etag,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=86400',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: any) {
    console.error('Error fetching category settings:', err);
    return NextResponse.json({ error: 'Failed to retrieve categories' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initializeDatabase();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const { category, isAvailable } = await req.json();
    if (!category || typeof category !== 'string') {
      return NextResponse.json({ error: 'Category name is required' }, { status: 400 });
    }

    const normCat = category.trim();
    const res = await db
      .insert(categorySettings)
      .values({
        category: normCat,
        isAvailable: Boolean(isAvailable),
      })
      .onConflictDoUpdate({
        target: categorySettings.category,
        set: { isAvailable: Boolean(isAvailable) },
      })
      .returning();

    serverCache.invalidateTags(['categories']);

    const record = res[0];
    return NextResponse.json({
      category: record.category,
      isAvailable: Boolean(record.isAvailable),
    });
  } catch (err: any) {
    console.error('Error updating category settings:', err);
    return NextResponse.json({ error: 'Failed to update category setting' }, { status: 500 });
  }
}
