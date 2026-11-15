import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Finder drops onto the window. Mount it only on a visible page, so it never steals ImportView's drops. */
export const useFileDrop = (onPaths: (paths: string[]) => void) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const handler = useRef(onPaths);
  handler.current = onPaths;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const t = event.payload.type;
        if (t === "enter" || t === "over") setIsDragOver(true);
        else if (t === "leave") setIsDragOver(false);
        else if (t === "drop") {
          setIsDragOver(false);
          handler.current(event.payload.paths);
        }
      })
      .then((fn) => (alive ? (unlisten = fn) : fn()))
      .catch((e) => console.error("drag-drop listener failed:", e));
    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);
  return isDragOver;
};
