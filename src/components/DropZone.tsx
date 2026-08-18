"use client";

import { useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";

type Props = {
  accept: string;
  onFiles: (files: FileList) => void;
  locale: Locale;
};

export function DropZone({ accept, onFiles, locale }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragover, setDragover] = useState(false);
  const depth = useRef(0);

  return (
    <div
      className={`drop-zone${dragover ? " dragover" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragover(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragover(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragover(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="drop-title">{t("dropTitle", undefined, locale)}</p>
      <p className="drop-hint">{t("dropHint", undefined, locale)}</p>
    </div>
  );
}
