import type { Metadata } from "next";
import "./globals.css";

// export const metadata: Metadata = {
//     title: "Stasia Elegant Fabric - Luxury Fabrics & Fashion Wears",
//     description:
//         "Luxury fabrics, clothing, wrappers bags, and accessories boutique store.",
//     keywords: ["fabrics", "textiles", "fashion design", "luxury fabric store"],
//     alternates: {
//         canonical: "https://stasiafabrics.vercel.app",
//     },
//     openGraph: {
//         title: "Stasia Elegant Fabric - Luxury Fabrics & Fashion Wears",
//         description:
//             "Luxury fabrics, clothing, wrappers bags, and accessories boutique store.",
//         url: "https://stasiafabrics.vercel.app",
//         siteName: "Stasia Elegant Fabric",
//         images: [
//             {
//                 url: "https://stasiafabrics.vercel.app/stasia_logo.png",
//                 width: 600,
//                 height: 600,
//             },
//         ],
//         locale: "en_US",
//         type: "website",
//     },
//     icons: {
//         icon: "https://stasiafabrics.vercel.app/stasia_logo.png",
//         shortcut: "/stasia_logo.png",
//         apple: "https://stasiafabrics.vercel.app/stasia_logo.png",
//     },
// };

export const metadata: Metadata = {
    // 1. Automatically converts relative paths like "/stasia_logo.png" into full absolute URLs
    metadataBase: new URL("https://stasiafabrics.vercel.app"),

    title: "Stasia Elegant Fabric - Luxury Clothing and Bags",
    description:
        "Luxury fabrics, wrappers, bags, and other clothing boutique store.",
    keywords: ["fabrics", "wrappers", "bags", "luxury fabric store"],

    alternates: {
        canonical: "/", // Automatically becomes https://stasiafabrics.vercel.app
    },

    openGraph: {
        title: "Stasia Elegant Fabric - Luxury Clothing and Bags",
        description:
            "Luxury fabrics, wrappers, bags, and other clothing boutique store.",
        url: "/",
        siteName: "Stasia Elegant Fabric",
        images: [
            {
                url: "/stasia_fabrics_home.png", // Uses metadataBase
                width: 600,
                height: 600,
                alt: "Stasia Elegant Fabric Logo",
            },
        ],
        locale: "en_US",
        type: "website",
    },

    // 2. Added Twitter Card configuration for full social platform coverage
    twitter: {
        card: "summary", // Square image thumbnail format (perfect for 600x600 logos)
        title: "Stasia Elegant Fabric - Luxury Clothing and Bags",
        description:
            "Luxury fabrics, wrappers, bags, and other clothing boutique store.",
        images: ["/stasia_fabrics_home.png"],
    },

    // 3. Search Engine Indexing rules
    robots: {
        index: true,
        follow: true,
    },

    icons: {
        icon: "/stasia_fabrics_home.png",
        shortcut: "/stasia_fabrics_home.png",
        apple: "/stasia_fabrics_home.png",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="antialiased min-h-screen bg-[#faf8f5] dark:bg-[#0c0c0e] text-stone-900 dark:text-stone-100 font-sans transition-colors duration-200">
                {children}
            </body>
        </html>
    );
}
