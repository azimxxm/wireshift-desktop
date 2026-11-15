import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Pencil, X } from "lucide-react";

const MAX = 40;

/** This Mac's name as other Macs see it; click the pencil to rename */
export const NameEditor: React.FC<{ name: string; onSaved: () => void }> = ({ name, onSaved }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);
  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const save = async () => {
    try {
      await invoke("maclink_set_name", { name: value });
      setEditing(false);
      setError("");
      onSaved();
    } catch (e) {
      setError(String(e));
    }
  };

  if (!editing) {
    return (
      <button
        className="group inline-flex items-center gap-1.5 max-w-full text-[13px] text-white text-left"
        onClick={() => setEditing(true)}
        title="Boshqa Mac'larda ko'rinadigan nomni o'zgartirish"
      >
        <span className="truncate">{name}</span>
        <Pencil className="w-3 h-3 shrink-0 text-[var(--ws-label-3)] group-hover:text-[var(--ws-accent)]" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          ref={input}
          className="ws-mac-name-input"
          value={value}
          maxLength={MAX}
          placeholder="Bo'sh qoldirsangiz — macOS nomi"
          aria-label="Bu Mac'ning nomi"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
        <button className="ws-icon-btn" onClick={save} title="Saqlash (Enter)">
          <Check className="w-3.5 h-3.5 text-[var(--ws-green)]" />
        </button>
        <button className="ws-icon-btn" onClick={() => setEditing(false)} title="Bekor (Esc)">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <span className="text-[11px] text-[var(--ws-orange)]">{error}</span>}
    </div>
  );
};
