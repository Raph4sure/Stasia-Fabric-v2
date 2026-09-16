import { NextRequest, NextResponse } from "next/server";
import { db, initializeDatabase } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/src/server/auth";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Type params as a Promise
) {
    try {
        await initializeDatabase();

        // Auth & Permission check
        const authUser = getAuthUser(req);
        if (!authUser) {
            return NextResponse.json(
                { error: "Unauthorized. Please sign in." },
                { status: 401 }
            );
        }
        if (authUser.role !== "SUPER_ADMIN") {
            return NextResponse.json(
                { error: "Forbidden. Super Admin privileges required." },
                { status: 403 }
            );
        }

        // Await params before reading properties
        const resolvedParams = await params;
        const userId = Number(resolvedParams.id);

        if (isNaN(userId)) {
            return NextResponse.json(
                { error: "Invalid user ID" },
                { status: 400 }
            );
        }

        const body = await req.json();
        const { role } = body;

        if (!role || !["SUPER_ADMIN", "ADMIN", "SALES_STAFF"].includes(role)) {
            return NextResponse.json(
                { error: "Invalid role provided" },
                { status: 400 }
            );
        }

        // Update user role in PostgreSQL
        const updatedUser = await db
            .update(users)
            .set({ role })
            .where(eq(users.id, userId))
            .returning({
                id: users.id,
                email: users.email,
                role: users.role,
            });

        if (!updatedUser.length) {
            return NextResponse.json(
                { error: "User not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            message: "Role updated successfully",
            user: updatedUser[0],
        });
    } catch (err: any) {
        console.error("Error updating user role:", err);
        return NextResponse.json(
            { error: "Failed to update user role" },
            { status: 500 }
        );
    }
}
