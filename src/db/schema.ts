import {
    pgTable,
    text,
    integer,
    doublePrecision,
    boolean,
    serial,
    index,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
    'users',
    {
        id: serial('id').primaryKey(),
        email: text('email').notNull().unique(),
        passwordHash: text('password_hash').notNull(),
        role: text('role').notNull().default('ADMIN'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [
        index('idx_users_email').on(t.email),
    ]
);

export const products = pgTable(
    'products',
    {
        id: serial('id').primaryKey(),
        title: text('title').notNull(),
        codeNo: text('code_no').notNull().unique(),
        category: text('category').notNull(),
        pricePerUnit: integer('price_per_unit').notNull(), // stored in cents/kobo
        quantityInStock: integer('quantity_in_stock').notNull().default(0),
        weightPerUnit: doublePrecision('weight_per_unit').notNull().default(0.0), // weight per unit in kg
        isAvailable: boolean('is_available').notNull().default(true),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [
        index('idx_products_is_avail').on(t.isAvailable),
        index('idx_products_category').on(t.category),
        index('idx_products_code_no').on(t.codeNo),
        index('idx_products_created_at').on(t.createdAt),
    ]
);

export const productImages = pgTable(
    'product_images',
    {
        id: serial('id').primaryKey(),
        productId: integer('product_id')
            .notNull()
            .references(() => products.id, { onDelete: 'cascade' }),
        imageUrl: text('image_url').notNull(),
    },
    (t) => [
        index('idx_prod_images_prod_id').on(t.productId),
    ]
);

export const sales = pgTable(
    'sales',
    {
        id: serial('id').primaryKey(),
        productId: integer('product_id')
            .notNull()
            .references(() => products.id),
        productTitle: text('product_title').notNull(),
        productCode: text('product_code').notNull(),
        quantitySold: integer('quantity_sold').notNull(),
        unitPrice: integer('unit_price').notNull(),
        totalAmount: integer('total_amount').notNull(),
        soldByUserId: integer('sold_by_user_id').notNull(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (t) => [
        index('idx_sales_created_at').on(t.createdAt),
        index('idx_sales_sold_by').on(t.soldByUserId),
        index('idx_sales_prod_id').on(t.productId),
    ]
);

export const categorySettings = pgTable('category_settings', {
    category: text('category').primaryKey(),
    isAvailable: boolean('is_available').notNull().default(true),
});

export const savedCarts = pgTable(
    'saved_carts',
    {
        id: serial('id').primaryKey(),
        code: text('code').notNull().unique(),
        items: text('items').notNull(), // JSON string of SavedCartItem[]
        totalAmount: integer('total_amount').notNull(),
        customerName: text('customer_name'),
        customerPhone: text('customer_phone'),
        customerNote: text('customer_note'),
        status: text('status').notNull().default('PENDING'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        processedAt: text('processed_at'),
        processedByUserId: integer('processed_by_user_id'),
    },
    (t) => [
        index('idx_saved_carts_code').on(t.code),
        index('idx_saved_carts_status').on(t.status),
        index('idx_saved_carts_created_at').on(t.createdAt),
    ]
);

