"use client";

import { type ComponentType } from "react";
import { useLocalStorageState } from "./useLocalStorageState";
import { JwtTool } from "./JwtTool";
import { Base64Tool } from "./Base64Tool";
import { UriTool } from "./UriTool";
import { WhitespaceTool } from "./WhitespaceTool";
import { JsonTool } from "./JsonTool";
import { EpochTool } from "./EpochTool";
import { BarcodeMakerTool } from "./BarcodeMakerTool";

const TOOLS: { key: string; name: string; Component: ComponentType }[] = [
  { key: "jwt", name: "JWT", Component: JwtTool },
  { key: "base64", name: "Base64", Component: Base64Tool },
  { key: "uri", name: "URI encoding", Component: UriTool },
  { key: "whitespace", name: "Whitespace removal", Component: WhitespaceTool },
  { key: "json", name: "JSON", Component: JsonTool },
  { key: "epoch", name: "Time conversion", Component: EpochTool },
  { key: "barcodeMaker", name: "Barcode maker", Component: BarcodeMakerTool },
];

/**
 * Small collection of standalone developer utilities (JWT, Base64, URI,
 * whitespace, JSON, epoch/time, barcode), ported from
 * github.com/missivaeak/mie-tools and restyled to match this app's design
 * system. Each tool remembers its own inputs in localStorage.
 */
export function ToolsApp() {
  const [selectedKey, setSelectedKey] = useLocalStorageState<string>("tools.selectedTool", TOOLS[0].key);

  const selected = TOOLS.find((tool) => tool.key === selectedKey) ?? TOOLS[0];
  const SelectedComponent = selected.Component;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-nb-ink/10 bg-white px-4 py-3">
        {TOOLS.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => setSelectedKey(tool.key)}
            className={`nb-btn px-3 py-1.5 text-sm ${selectedKey === tool.key ? "nb-btn-green" : ""}`}
          >
            {tool.name}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="nb-panel mx-auto max-w-3xl bg-white p-6">
          <SelectedComponent />
        </div>
      </div>
    </div>
  );
}
