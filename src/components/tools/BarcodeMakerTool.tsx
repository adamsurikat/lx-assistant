"use client";

import { useEffect, useRef } from "react";
import bwipjs from "bwip-js/browser";
import { CodeField } from "./fields/CodeField";
import { SelectField } from "./fields/SelectField";
import { useLocalStorageState } from "./useLocalStorageState";
import barcodeMakerConfig from "./configs/barcodeMakerConfig.json";

const BARCODE_TYPES = Array.from(
  new Set([...barcodeMakerConfig.selectBarcodeTypes, ...barcodeMakerConfig.barcodeTypes])
);
const BARCODE_TYPES_2D = new Set(barcodeMakerConfig.barcodeTypes2d);
const BARCODE_TYPES_STACKED = new Set(barcodeMakerConfig.barcodeTypesStacked);

interface BarcodeState {
  text: string;
  barcodeType: string;
}

const DEFAULT_STATE: BarcodeState = { text: "123456789012", barcodeType: "code128" };

function getBarcodeRatio(barcodeType: string): number {
  if (BARCODE_TYPES_2D.has(barcodeType)) return 1;
  if (BARCODE_TYPES_STACKED.has(barcodeType)) return 0.5;
  return 0.3;
}

export function BarcodeMakerTool() {
  const [state, setState] = useLocalStorageState<BarcodeState>("tools.barcode", DEFAULT_STATE);
  const { text, barcodeType } = state;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);

  // Draws directly to the canvas (an external system outside React's
  // render) and toggles the adjacent error text/canvas visibility
  // imperatively alongside it, rather than mirroring the same info into
  // React state purely to re-render on every keystroke.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = canvasWrapperRef.current;
    const errorEl = errorRef.current;
    if (!canvas || !wrapper || !errorEl || !barcodeType) return;

    try {
      bwipjs.toCanvas(canvas, {
        backgroundcolor: "#ffffff",
        bordercolor: "#999999",
        text,
        bcid: barcodeType,
        scale: 1,
        includetext: false,
        textxalign: "center",
        textyoffset: -10,
        textsize: 20,
        width: 120,
        height: 120 * getBarcodeRatio(barcodeType),
      });
      wrapper.classList.remove("hidden");
      errorEl.classList.add("hidden");
    } catch (err) {
      console.warn(err);
      const message = err instanceof Error ? (err.message.split(":")[1] ?? err.message) : "Invalid input";
      wrapper.classList.add("hidden");
      errorEl.textContent = message;
      errorEl.classList.remove("hidden");
    }
  }, [text, barcodeType]);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="nb-display text-base">Barcode maker</h2>
      <div>
        <label className="mb-1 block text-sm font-semibold text-nb-ink">Text</label>
        <CodeField value={text} onChange={(text) => setState({ ...state, text })} height="100px" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-nb-ink">Barcode type</span>
        <SelectField
          value={barcodeType}
          options={BARCODE_TYPES}
          onChange={(barcodeType) => setState({ ...state, barcodeType })}
        />
      </div>
      <p ref={errorRef} className="hidden text-sm font-semibold text-nb-pink" />
      <div ref={canvasWrapperRef} className="hidden flex justify-center rounded-[10px] border border-nb-ink/10 bg-white p-4">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
