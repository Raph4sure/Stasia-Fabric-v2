import { NextRequest, NextResponse } from "next/server";
import { db, initializeDatabase } from "@/src/db";
import { sales, products, savedCarts } from "@/src/db/schema";
import { eq, gte, lte, lt, and, desc, asc, inArray, SQL } from "drizzle-orm";
import { getAuthUser } from "@/src/server/auth";
import { serverCache } from "@/src/server/cache";

export async function POST(req: NextRequest) {
    try {
        await initializeDatabase();

        const user = getAuthUser(req);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized. Please sign in." },
                { status: 401 }
            );
        }

        const body = await req.json();
        const items = body.items;
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: "Sale must contain at least one item." },
                { status: 400 }
            );
        }

        // Validate items and collect IDs
        const parsedItems: { productId: number; quantity: number }[] = [];
        for (const item of items) {
            const pId = Number(item.productId);
            const qty = Number(item.quantity);
            if (pId > 0 && qty > 0) {
                parsedItems.push({ productId: pId, quantity: qty });
            }
        }

        if (parsedItems.length === 0) {
            return NextResponse.json(
                {
                    error: "Sale must contain valid items with positive quantities.",
                },
                { status: 400 }
            );
        }

        const productIds = Array.from(
            new Set(parsedItems.map((i) => i.productId))
        );

        // Batch fetch all required products in ONE query
        const existingProducts = await db
            .select()
            .from(products)
            .where(inArray(products.id, productIds));

        const productMap = new Map<number, (typeof existingProducts)[0]>();
        for (const p of existingProducts) {
            productMap.set(p.id, p);
        }

        // Verify all exist and have sufficient stock before making any mutations
        for (const item of parsedItems) {
            const product = productMap.get(item.productId);
            if (!product) {
                return NextResponse.json(
                    { error: `Product ID ${item.productId} not found.` },
                    { status: 400 }
                );
            }
            if (product.quantityInStock < item.quantity) {
                return NextResponse.json(
                    {
                        error: `Insufficient stock for "${product.title}". Requested: ${item.quantity}, Available: ${product.quantityInStock}`,
                    },
                    { status: 400 }
                );
            }
        }

        const now = new Date().toISOString();
        const salesToInsert = parsedItems.map((item) => {
            const product = productMap.get(item.productId)!;
            const totalAmount = product.pricePerUnit * item.quantity;
            return {
                productId: product.id,
                productTitle: product.title,
                productCode: product.codeNo,
                quantitySold: item.quantity,
                unitPrice: product.pricePerUnit,
                totalAmount,
                soldByUserId: user.id,
                createdAt: now,
            };
        });

        // Batch insert sales
        const createdSales = await db
            .insert(sales)
            .values(salesToInsert)
            .returning();

        // Update product stocks
        for (const item of parsedItems) {
            const product = productMap.get(item.productId)!;
            await db
                .update(products)
                .set({
                    quantityInStock: product.quantityInStock - item.quantity,
                })
                .where(eq(products.id, product.id));
        }

        // If this sale was generated from a customer saved cart / order code, mark it as PROCESSED
        if (body.orderCode && typeof body.orderCode === "string") {
            try {
                const normCode = body.orderCode.trim().toUpperCase();
                await db
                    .update(savedCarts)
                    .set({
                        status: "PROCESSED",
                        processedAt: now,
                        processedByUserId: user.id,
                    })
                    .where(eq(savedCarts.code, normCode));
            } catch (cartErr) {
                console.warn("Could not update saved cart status:", cartErr);
            }
        }

        // Invalidate products and sales caches
        serverCache.invalidateTags(["products", "sales"]);

        return NextResponse.json(
            { success: true, sales: createdSales },
            { status: 201 }
        );
    } catch (err: any) {
        console.error("Error logging sale:", err);
        return NextResponse.json(
            { error: "Failed to record sales transaction" },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        await initializeDatabase();
        const user = getAuthUser(req);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized. Please sign in." },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const timeframe = (
            searchParams.get("timeframe") || "all"
        ).toLowerCase();
        const staffIdParam = searchParams.get("staffId");
        const customStartDate = searchParams.get("startDate");
        const customEndDate = searchParams.get("endDate");
        const sortBy = searchParams.get("sortBy") || "timestamp";
        const sortOrder = searchParams.get("sortOrder") || "desc";

        let effectiveTimeframe = timeframe;
        if (customStartDate && customEndDate) {
            effectiveTimeframe = "custom";
        }

        const now = new Date();
        let startBoundary = new Date(0);
        let endBoundary = new Date(now.getFullYear() + 10, 11, 31, 23, 59, 59);

        if (effectiveTimeframe === "today" || effectiveTimeframe === "daily") {
            startBoundary = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                0,
                0,
                0
            );
            endBoundary = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                23,
                59,
                59,
                999
            );
        } else if (
            effectiveTimeframe === "week" ||
            effectiveTimeframe === "weekly"
        ) {
            const dayOfWeek = now.getDay();
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            startBoundary = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() - diffToMonday,
                0,
                0,
                0
            );
            endBoundary = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() + (6 - diffToMonday),
                23,
                59,
                59,
                999
            );
        } else if (
            effectiveTimeframe === "month" ||
            effectiveTimeframe === "monthly"
        ) {
            startBoundary = new Date(
                now.getFullYear(),
                now.getMonth(),
                1,
                0,
                0,
                0
            );
            endBoundary = new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0,
                23,
                59,
                59,
                999
            );
        } else if (
            effectiveTimeframe === "year" ||
            effectiveTimeframe === "annually"
        ) {
            startBoundary = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
            endBoundary = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        } else if (
            effectiveTimeframe === "custom" &&
            customStartDate &&
            customEndDate
        ) {
            startBoundary = new Date(customStartDate);
            startBoundary.setHours(0, 0, 0, 0);
            endBoundary = new Date(customEndDate);
            endBoundary.setHours(23, 59, 59, 999);
        }

        // Build SQL conditions
        const conditions: (SQL<unknown> | undefined)[] = [];

        // Role restriction
        if (user.role !== "SUPER_ADMIN") {
            conditions.push(eq(sales.soldByUserId, user.id));
        } else if (staffIdParam && !isNaN(Number(staffIdParam))) {
            conditions.push(eq(sales.soldByUserId, Number(staffIdParam)));
        }

        // Date range conditions (only apply if not "all")
        if (effectiveTimeframe !== "all") {
            conditions.push(gte(sales.createdAt, startBoundary.toISOString()));
            conditions.push(lte(sales.createdAt, endBoundary.toISOString()));
        }

        // Determine SQL order by
        let orderExpr =
            sortOrder === "asc" ? asc(sales.createdAt) : desc(sales.createdAt);
        if (sortBy === "quantity") {
            orderExpr =
                sortOrder === "asc"
                    ? asc(sales.quantitySold)
                    : desc(sales.quantitySold);
        } else if (sortBy === "price") {
            orderExpr =
                sortOrder === "asc"
                    ? asc(sales.totalAmount)
                    : desc(sales.totalAmount);
        }

        const cursor = searchParams.get("cursor");
        const limitParam = searchParams.get("limit");
        const isPaginated =
            searchParams.has("limit") || searchParams.has("cursor");

        if (isPaginated) {
            const limit = Math.min(
                Math.max(1, parseInt(limitParam || "20", 10)),
                100
            );
            const cacheKey = `sales:${user.id}:${
                user.role
            }:${effectiveTimeframe}:${
                staffIdParam || "all"
            }:${sortBy}:${sortOrder}:${cursor || "first"}:${limit}`;

            const cached = serverCache.get<any>(cacheKey);
            if (cached) {
                return NextResponse.json(cached.data, {
                    headers: {
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        Pragma: "no-cache",
                        Expires: "0",
                        "X-Cache": cached ? "HIT" : "MISS",
                    },
                });
            }

            const paginatedConditions = [...conditions];
            if (cursor) {
                if (sortOrder === "asc") {
                    paginatedConditions.push(gte(sales.createdAt, cursor));
                } else {
                    paginatedConditions.push(lt(sales.createdAt, cursor));
                }
            }

            const queryLimit = limit + 1;
            const fetchedSales = await db
                .select()
                .from(sales)
                .where(
                    paginatedConditions.length > 0
                        ? and(...paginatedConditions)
                        : undefined
                )
                .orderBy(orderExpr)
                .limit(queryLimit);

            const hasMore = fetchedSales.length > limit;
            const pageSales = hasMore
                ? fetchedSales.slice(0, limit)
                : fetchedSales;
            const nextCursor =
                hasMore && pageSales.length > 0
                    ? pageSales[pageSales.length - 1].createdAt
                    : null;

            // Also compute overall summary for the filtered timeframe conditions (without cursor boundary)
            // or we can aggregate the summary query efficiently
            let totalRevenue = 0;
            let totalUnitsSold = 0;
            let transactionsCount = 0;

            // Fast aggregate of full conditions for the summary bar
            const allMatchingSales = await db
                .select({
                    totalAmount: sales.totalAmount,
                    quantitySold: sales.quantitySold,
                })
                .from(sales)
                .where(conditions.length > 0 ? and(...conditions) : undefined);

            for (const s of allMatchingSales) {
                totalRevenue += s.totalAmount;
                totalUnitsSold += s.quantitySold;
            }
            transactionsCount = allMatchingSales.length;

            const result = {
                timeframe: effectiveTimeframe,
                sales: pageSales,
                nextCursor,
                hasMore,
                summary: {
                    totalRevenue,
                    totalUnitsSold,
                    transactionsCount,
                },
            };

            serverCache.set(cacheKey, result, 0, ["sales", cacheKey]);

            return NextResponse.json(result, {
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    Pragma: "no-cache",
                    Expires: "0",
                    "X-Cache": cached ? "HIT" : "MISS",
                },
            });
        }

        // Execute unpaginated query for backwards compatibility
        const filteredSales = await db
            .select()
            .from(sales)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(orderExpr);

        // Aggregate summary directly
        let totalRevenue = 0;
        let totalUnitsSold = 0;
        for (const s of filteredSales) {
            totalRevenue += s.totalAmount;
            totalUnitsSold += s.quantitySold;
        }
        const transactionsCount = filteredSales.length;

        return NextResponse.json(
            {
                timeframe: effectiveTimeframe,
                sales: filteredSales,
                summary: {
                    totalRevenue,
                    totalUnitsSold,
                    transactionsCount,
                },
            },
            {
                headers: {
                    "Cache-Control": "private, no-cache",
                },
            }
        );
    } catch (err: any) {
        console.error("Error fetching sales:", err);
        return NextResponse.json(
            { error: "Failed to retrieve sales logs" },
            { status: 500 }
        );
    }
}
