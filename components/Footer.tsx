export default function Footer() {
  return (
    <footer className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
      <div className="rounded-2xl border border-acad/40 bg-acad/10 px-4 py-3 text-center text-sm text-text">
        <span className="font-semibold">Beta version</span> — for any issues in access and questions, please reach out to{" "}
        <a href="mailto:ankit.mishra@scaler.com" className="font-semibold text-acad underline underline-offset-2 hover:opacity-80">
          ankit.mishra@scaler.com
        </a>
      </div>
    </footer>
  );
}
