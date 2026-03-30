import { useRef, useState, useCallback, useLayoutEffect, useMemo } from "react";
import { prepare, layout } from "@chenglou/pretext";

interface UsePretextOptions {
  /** CSS font string, e.g. "14px Inter" */
  font?: string;
  /** Line height in px */
  lineHeight?: number;
  /** Max lines before truncation (0 = unlimited) */
  maxLines?: number;
  /** Disable measurement (pass true to skip) */
  disabled?: boolean;
}

interface UsePretextResult {
  /** Ref to attach to the text container */
  containerRef: React.RefCallback<HTMLElement>;
  /** Computed height in px (0 if not yet measured) */
  height: number;
  /** Number of lines the text occupies */
  lineCount: number;
  /** Whether text is truncated by maxLines */
  isTruncated: boolean;
  /** Style object to apply for smooth reflow */
  style: React.CSSProperties;
}

/**
 * Measures text height without DOM reflow using Pretext.
 * Attach `containerRef` to the text element and spread `style` onto it.
 */
export function usePretext(
  text: string,
  options: UsePretextOptions = {},
): UsePretextResult {
  const {
    font = "14px Inter, system-ui, sans-serif",
    lineHeight = 20,
    maxLines = 0,
    disabled = false,
  } = options;

  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const containerRef = useCallback((node: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    elementRef.current = node;
    if (node) {
      const ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          setWidth(entry.contentRect.width);
        }
      });
      ro.observe(node);
      observerRef.current = ro;
      // Initial measurement
      setWidth(node.getBoundingClientRect().width);
    }
  }, []);

  // prepare() is expensive — memoize on text + font
  const prepared = useMemo(() => {
    if (disabled || !text) return null;
    return prepare(text, font);
  }, [text, font, disabled]);

  // layout() is ~0.0002ms — safe to call on every width change
  const result = useMemo(() => {
    if (!prepared || width <= 0) {
      return { height: 0, lineCount: 0 };
    }
    return layout(prepared, width, lineHeight);
  }, [prepared, width, lineHeight]);

  const isTruncated = maxLines > 0 && result.lineCount > maxLines;
  const effectiveLines = maxLines > 0 ? Math.min(result.lineCount, maxLines) : result.lineCount;
  const height = effectiveLines * lineHeight;

  const style: React.CSSProperties = useMemo(() => {
    if (disabled || height <= 0) return {};
    return {
      height,
      overflow: "hidden" as const,
      transition: "height 150ms ease",
    };
  }, [disabled, height]);

  // Cleanup observer on unmount
  useLayoutEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return {
    containerRef,
    height,
    lineCount: effectiveLines,
    isTruncated,
    style,
  };
}
