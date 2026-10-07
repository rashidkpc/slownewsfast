import { useEffect, useState } from "react";

interface Presets {
  presets: { label: string; cron: string }[];
  timezones: string[];
}

const FALLBACK: Presets = {
  presets: [
    { label: "Daily at midnight", cron: "0 0 * * *" },
    { label: "Daily at 6:00", cron: "0 6 * * *" },
    { label: "Daily at 8:00", cron: "0 8 * * *" },
    { label: "Twice daily (midnight & noon)", cron: "0 0,12 * * *" },
    { label: "Weekly (Sunday midnight)", cron: "0 0 * * 0" },
  ],
  timezones: ["UTC"],
};

export default function ScheduleFields({
  cron,
  tz,
  onCronChange,
  onTzChange,
}: {
  cron: string;
  tz: string;
  onCronChange: (v: string) => void;
  onTzChange: (v: string) => void;
}) {
  const [data, setData] = useState<Presets>(FALLBACK);

  useEffect(() => {
    fetch("/api/presets")
      .then((r) => r.json() as unknown as Presets)
      .then((d) => {
        if (d?.presets?.length) setData(d);
      })
      .catch(() => {});
  }, []);

  const matched = data.presets.find((p) => p.cron === cron);
  const selectValue = matched ? matched.cron : "__custom";

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-bold text-stone-700 mb-1">Schedule</label>
        <select
          value={selectValue}
          onChange={(e) => {
            if (e.target.value !== "__custom") onCronChange(e.target.value);
            else onCronChange(matched ? "" : cron || "0 0 * * *");
          }}
          className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 focus:border-stone-500 focus:outline-none"
        >
          {data.presets.map((p) => (
            <option key={p.cron} value={p.cron}>
              {p.label}
            </option>
          ))}
          <option value="__custom">Custom cron…</option>
        </select>
      </div>

      {(selectValue === "__custom" || !matched) && (
        <div>
          <label className="block text-sm font-bold text-stone-700 mb-1">Cron expression</label>
          <input
            type="text"
            value={cron}
            onChange={(e) => onCronChange(e.target.value)}
            placeholder="0 0 * * *"
            className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 font-mono text-sm text-stone-800 focus:border-stone-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-stone-500">
            Standard 5-field cron, interpreted in the timezone below.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-stone-700 mb-1">Timezone</label>
        <input
          type="text"
          list="slownews-timezones"
          value={tz}
          onChange={(e) => onTzChange(e.target.value)}
          className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 focus:border-stone-500 focus:outline-none"
        />
        <datalist id="slownews-timezones">
          {data.timezones.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
