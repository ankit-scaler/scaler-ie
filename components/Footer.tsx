export default function Footer() {
  return (
    <footer className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
      <div className="rounded-2xl border border-acad/40 bg-acad/10 px-4 py-3 text-center text-sm text-text">
        <span className="font-semibold">Beta version</span>: To raise issues or queries, check here on how to raise Tickets:{" "}
        <a
          href="https://www.loom.com/share/9b779dbbd07f4d068076fa0ca1d99b19"
          target="_blank" rel="noopener noreferrer"
          className="font-semibold text-acad underline underline-offset-2 hover:opacity-80"
        >
          Loom walkthrough
        </a>
      </div>
    </footer>
  );
}
