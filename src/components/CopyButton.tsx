import { useState } from "react";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 shrink-0 border border-stone-300 bg-stone-50 px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800 transition-colors cursor-pointer"
    >
      {copied ? "copied" : `copy ${label}`}
    </button>
  );
}
