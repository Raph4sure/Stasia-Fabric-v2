"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#faf8f5] text-stone-900 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold mb-2">Application Error</h2>
        <p className="text-sm text-stone-600 mb-6">
          A server error occurred. Please reload the application.
        </p>
        <button
          onClick={() => reset()}
          className="px-5 py-2 bg-amber-500 text-stone-950 font-bold text-xs rounded-xl"
        >
          Reload
        </button>
      </body>
    </html>
  );
}
