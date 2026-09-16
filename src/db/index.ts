import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";

// Determine database connection URL (Neon PostgreSQL preferred)
const neonUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

let drizzleInstance: any = null;
let rawExecuteFn: ((sqlQuery: string, params?: any[]) => Promise<{ rows: any[] }>) | null = null;
let pgliteInstance: PGlite | null = null;

// Initialize driver based on environment
if (neonUrl && neonUrl.startsWith("postgres")) {
    const sql = neon(neonUrl);
    drizzleInstance = drizzleNeon(sql, { schema });
    rawExecuteFn = async (sqlQuery: string, params: any[] = []) => {
        // Convert ? placeholders to $1, $2 for Postgres if needed
        let pIndex = 1;
        const pgSql = sqlQuery.replace(/\?/g, () => `$${pIndex++}`);
        const res: any = await (sql as any).query(pgSql, params);
        const rows = Array.isArray(res) ? res : (res?.rows || []);
        return { rows };
    };
} else {
    // Local embedded PostgreSQL fallback (PGlite) so preview runs instantly without crashing
    const dataDir = path.resolve(process.cwd(), ".pgdata");
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    } catch {
        // ignore dir creation error
    }
    pgliteInstance = new PGlite(dataDir);
    drizzleInstance = drizzlePglite(pgliteInstance, { schema });
    rawExecuteFn = async (sqlQuery: string, params: any[] = []) => {
        let pIndex = 1;
        const pgSql = sqlQuery.replace(/\?/g, () => `$${pIndex++}`);
        const result = await pgliteInstance!.query(pgSql, params);
        return { rows: (result && result.rows) ? (result.rows as any[]) : [] };
    };
}

export const db = drizzleInstance;

export const client = {
    execute: async (input: string | { sql: string; args?: any[] }) => {
        const query = typeof input === "string" ? input : input.sql;
        const params = typeof input === "string" ? [] : (input.args || []);
        if (!rawExecuteFn) {
            throw new Error("Database client not initialized");
        }
        return await rawExecuteFn(query, params);
    },
};

let initPromise: Promise<void> | null = null;

export async function initializeDatabase(): Promise<void> {
    if (!initPromise) {
        initPromise = runDatabaseInitialization().catch((err) => {
            initPromise = null;
            throw err;
        });
    }
    return initPromise;
}

// Auto-initialize PostgreSQL tables, performance indexes, and default seed data
async function runDatabaseInitialization() {
    try {
        // Create tables with standard PostgreSQL types
        await client.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'ADMIN',
                created_at TEXT NOT NULL
            );
        `);

        await client.execute(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                code_no TEXT NOT NULL UNIQUE,
                category TEXT NOT NULL,
                price_per_unit INTEGER NOT NULL,
                quantity_in_stock INTEGER NOT NULL DEFAULT 0,
                weight_per_unit DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                is_available BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TEXT NOT NULL
            );
        `);

        await client.execute(`
            CREATE TABLE IF NOT EXISTS product_images (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                image_url TEXT NOT NULL
            );
        `);

        await client.execute(`
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id),
                product_title TEXT NOT NULL,
                product_code TEXT NOT NULL,
                quantity_sold INTEGER NOT NULL,
                unit_price INTEGER NOT NULL,
                total_amount INTEGER NOT NULL,
                sold_by_user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
        `);

        await client.execute(`
            CREATE TABLE IF NOT EXISTS category_settings (
                category TEXT PRIMARY KEY,
                is_available BOOLEAN NOT NULL DEFAULT TRUE
            );
        `);

        await client.execute(`
            CREATE TABLE IF NOT EXISTS saved_carts (
                id SERIAL PRIMARY KEY,
                code TEXT NOT NULL UNIQUE,
                items TEXT NOT NULL,
                total_amount INTEGER NOT NULL,
                customer_name TEXT,
                customer_phone TEXT,
                customer_note TEXT,
                status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT NOT NULL,
                processed_at TEXT,
                processed_by_user_id INTEGER
            );
        `);

        // High performance indexes for fast catalog searches, filtering, and sales aggregations
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_products_is_avail ON products(is_available);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_products_code_no ON products(code_no);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_products_avail_cat ON products(is_available, category);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_prod_images_prod_id ON product_images(product_id);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_sales_sold_by ON sales(sold_by_user_id);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_sales_prod_id ON sales(product_id);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_saved_carts_code ON saved_carts(code);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_saved_carts_status ON saved_carts(status);`);
        await client.execute(`CREATE INDEX IF NOT EXISTS idx_saved_carts_created_at ON saved_carts(created_at DESC);`);

        // Check if super admin account exists
        const existingUsers = await client.execute(`SELECT COUNT(*) as count FROM users;`);
        const userCount = Number(existingUsers.rows[0]?.count || 0);

        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || "raph4sure007@gmail.com";
        const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || "MA45goes@";
        const salesStaffEmail = process.env.SALES_STAFF_EMAIL;
        const salesStaffPassword = process.env.SALES_STAFF_PASSWORD;

        if (userCount === 0) {
            const now = new Date().toISOString();
            const superHash = await bcrypt.hash(superAdminPassword, 10);
            await client.execute({
                sql: `INSERT INTO users (email, password_hash, role, created_at) VALUES ($1, $2, 'SUPER_ADMIN', $3);`,
                args: [superAdminEmail.trim().toLowerCase(), superHash, now],
            });

            if (salesStaffEmail && salesStaffPassword) {
                const staffHash = await bcrypt.hash(salesStaffPassword, 10);
                await client.execute({
                    sql: `INSERT INTO users (email, password_hash, role, created_at) VALUES ($1, $2, 'ADMIN', $3);`,
                    args: [salesStaffEmail.trim().toLowerCase(), staffHash, now],
                });
            }
            console.log("Initial admin accounts seeded in PostgreSQL.");
        }

        // Check if sample boutique catalog products need initial seeding
        const existingProducts = await client.execute(`SELECT COUNT(*) as count FROM products;`);
        const productCount = Number(existingProducts.rows[0]?.count || 0);

        // if (productCount === 0) {
        //     const seedProducts = [
        //         {
        //             title: "Royal Ankara Silk Kimono Robe",
        //             codeNo: "CLT-101",
        //             category: "Clothes",
        //             pricePerUnit: 14500,
        //             quantityInStock: 18,
        //             weightPerUnit: 0.65,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=900&auto=format&fit=crop&q=80",
        //                 "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Handcrafted Monogram Leather Tote",
        //             codeNo: "BAG-202",
        //             category: "Bags",
        //             pricePerUnit: 22000,
        //             quantityInStock: 8,
        //             weightPerUnit: 1.20,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=900&auto=format&fit=crop&q=80",
        //                 "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Aso-Oke Heritage Woven Wrapper (6 Yards)",
        //             codeNo: "WRP-303",
        //             category: "Wrappers",
        //             pricePerUnit: 18500,
        //             quantityInStock: 4,
        //             weightPerUnit: 1.80,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=900&auto=format&fit=crop&q=80",
        //                 "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Swiss Voile Gold Embroidered Lace Fabric",
        //             codeNo: "FAB-404",
        //             category: "Fabrics",
        //             pricePerUnit: 16000,
        //             quantityInStock: 12,
        //             weightPerUnit: 0.90,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=900&auto=format&fit=crop&q=80",
        //                 "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Pleated Linen Safari Blazer",
        //             codeNo: "CLT-105",
        //             category: "Clothes",
        //             pricePerUnit: 19500,
        //             quantityInStock: 3,
        //             weightPerUnit: 0.80,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Woven Raffia Shoulder Bag",
        //             codeNo: "BAG-206",
        //             category: "Bags",
        //             pricePerUnit: 11000,
        //             quantityInStock: 15,
        //             weightPerUnit: 0.45,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1544816155-12df9643f363?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Hand-Dyed Indigo Adire Cotton Fabric (5 Yards)",
        //             codeNo: "FAB-407",
        //             category: "Fabrics",
        //             pricePerUnit: 12500,
        //             quantityInStock: 20,
        //             weightPerUnit: 0.70,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Lustrous Silk Satin Ombré Wrapper",
        //             codeNo: "WRP-308",
        //             category: "Wrappers",
        //             pricePerUnit: 17000,
        //             quantityInStock: 9,
        //             weightPerUnit: 1.40,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Embroidered Silk Caftan with Gold Filigree",
        //             codeNo: "CLT-109",
        //             category: "Clothes",
        //             pricePerUnit: 17500,
        //             quantityInStock: 11,
        //             weightPerUnit: 0.75,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=900&auto=format&fit=crop&q=80",
        //                 "https://images.unsplash.com/photo-1550614000-4895a10e1bfd?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Structured Calfskin Saddle Crossbody",
        //             codeNo: "BAG-210",
        //             category: "Bags",
        //             pricePerUnit: 26000,
        //             quantityInStock: 6,
        //             weightPerUnit: 0.85,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Heritage Hand-Dyed Adire Silk Wrapper",
        //             codeNo: "WRP-311",
        //             category: "Wrappers",
        //             pricePerUnit: 19500,
        //             quantityInStock: 5,
        //             weightPerUnit: 1.10,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //         {
        //             title: "Duchess Satin Rose Gold Brocade (Yard)",
        //             codeNo: "FAB-412",
        //             category: "Fabrics",
        //             pricePerUnit: 9200,
        //             quantityInStock: 14,
        //             weightPerUnit: 0.60,
        //             isAvailable: true,
        //             images: [
        //                 "https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=900&auto=format&fit=crop&q=80",
        //             ],
        //         },
        //     ];

        //     for (const item of seedProducts) {
        //         const check = await client.execute({
        //             sql: `SELECT id FROM products WHERE code_no = $1;`,
        //             args: [item.codeNo],
        //         });
        //         if (check.rows.length === 0) {
        //             const insertRes = await client.execute({
        //                 sql: `INSERT INTO products (title, code_no, category, price_per_unit, quantity_in_stock, weight_per_unit, is_available, created_at)
        //                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;`,
        //                 args: [
        //                     item.title,
        //                     item.codeNo,
        //                     item.category,
        //                     item.pricePerUnit,
        //                     item.quantityInStock,
        //                     item.weightPerUnit,
        //                     item.isAvailable,
        //                     new Date().toISOString(),
        //                 ],
        //             });
        //             const newProductId = Number(insertRes.rows[0]?.id);
        //             for (const img of item.images) {
        //                 await client.execute({
        //                     sql: `INSERT INTO product_images (product_id, image_url) VALUES ($1, $2);`,
        //                     args: [newProductId, img],
        //                 });
        //             }
        //         }
        //     }
        //     console.log("Seeded initial boutique catalog in PostgreSQL.");
        // }
    } catch (err) {
        console.error("PostgreSQL database initialization error:", err);
        throw err;
    }
}
