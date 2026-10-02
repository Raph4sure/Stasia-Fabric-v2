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
    // 1. Automatically converts relative paths into full absolute URLs
    metadataBase: new URL("https://stasiafabrics.vercel.app"),

    title: "Stasia Elegant Fabric - Luxury Clothing and Bags",
    description:
        "Discover luxury fabrics, premium textiles, custom clothing, wrappers, bags, and fashion accessories at Stasia Elegant Fabric boutique store.",

    keywords: [
        "fabrics",
        "wrappers",
        "bags",
        "luxury fabric store",
        "textiles",
    ],

    alternates: {
        canonical: "/",
    },

    openGraph: {
        title: "Stasia Elegant Fabric - Luxury Clothing and Bags",
        description:
            "Discover luxury fabrics, premium textiles, custom clothing, wrappers, bags, and fashion accessories at Stasia Elegant Fabric boutique store.",
        url: "/",
        siteName: "Stasia Elegant Fabric",
        images: [
            {
                url: "/stasia_fabrics_home.jpg",
                width: 1200, //
                height: 630, //
                alt: "Stasia Elegant Fabric Showcase",
            },
        ],
        locale: "en_US",
        type: "website",
    },

    
    twitter: {
        card: "summary_large_image", //
        title: "Stasia Elegant Fabric - Luxury Clothing and Bags",
        description:
            "Discover luxury fabrics, premium textiles, custom clothing, wrappers, bags, and fashion accessories.",
        images: ["/stasia_fabrics_home.jpg"],
    },

    robots: {
        index: true,
        follow: true,
    },

    icons: {
        icon: "/stasia_fabrics_home.jpg",
        shortcut: "/stasia_fabrics_home.jpg",
        apple: "/stasia_fabrics_home.jpg",
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
